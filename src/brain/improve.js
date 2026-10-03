/**
 * JARVIS Core — self-improvement.
 *
 * Nightly (or when you ask), JARVIS looks at the evidence of what is not working or could work better —
 * faults in its log, voice commands it did not understand, features you asked for, what it has already
 * tried — and picks at most a couple of improvements. Each one is prepared in a workshop copy, checked,
 * and sent to you as a request with a plain-English summary. Nothing is installed until you say YES.
 */
import fs from 'node:fs';
import {ask} from './llm.js';
import {makeChange} from './coder.js';
import {extractJson, clip, oneLine} from './util.js';

/** Faults from jarvis.log over the last `days`, grouped. */
export function logFaults(file, days = 7) {
  const since = Date.now() - days * 864e5; const groups = new Map();
  for (const f of [file + '.previous', file]) {
    let text = ''; try { text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    for (const l of text.split('\n')) {
      let r; try { r = JSON.parse(l); } catch { continue; }
      if (!r || Date.parse(r.time) < since) continue;
      if (['approvals', 'self-update', 'tunnel', 'calls', 'brain'].includes(r.kind) && !/error|fail|could not|refused/i.test(r.message)) continue;
      const norm = String(r.message).replace(/\d+/g, '#').replace(/"[^"]*"|“[^”]*”/g, '"…"').slice(0, 120);
      const k = `${r.kind}|${norm}`; const g = groups.get(k) || {kind: r.kind, count: 0, sample: r.message, last: 0};
      g.count++; g.last = Math.max(g.last, Date.parse(r.time)); g.sample = r.message; groups.set(k, g);
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, 15);
}

/** Look for improvements and prepare them. Returns {summary, proposals:[…]} */
export async function selfReview(core, {trigger = 'schedule', max} = {}) {
  const {store, deps, updater} = core;
  const cfg = store.get();
  const limit = max ?? cfg.selfImprove.maxPerNight;
  const key = deps.getKey();
  if (!key) return {summary: 'Self-review needs a Claude API key.', proposals: []};
  if (store.budgetLeft() < 1) return {summary: 'Self-review skipped: today\'s budget is nearly used up.', proposals: []};
  if (!limit) return {summary: 'Self-review is set to prepare nothing.', proposals: []};
  const health = await core.health();
  const past = updater.updates().slice(-25).map(u => `- ${new Date(u.createdAt).toLocaleDateString('en-GB')} ${u.status}: ${u.title}`).join('\n') || '(none yet)';
  const requests = (store.state.requests || []).filter(r => !r.done).slice(-10);
  const evidence = {
    faults: health.errors, voiceMisses: health.voiceMisses, requests: requests.map(r => r.text), failedTowerJobs: health.towerFailures,
    version: health.version, settings: health.settings, callsAndMessages: health.delivery,
  };
  const r = await ask({key, model: cfg.models.brain, maxTokens: 3000,
    system: `You are JARVIS, reviewing yourself: an Electron desktop assistant (JARVIS Armor Workspace) for ${cfg.owner.name || 'its owner'}.
Decide what, if anything, is worth improving now. Only propose things the evidence supports: repeated faults, commands he says that you do not understand, features he asked for, things that failed. Never propose something already tried (see history) unless the evidence shows it is still broken. Prefer small, safe, clearly useful changes. Settings changes are cheaper than code.
Answer with JSON only: an array (possibly empty), best first, at most ${limit} items:
[{"title":"short name of the improvement","why":"the evidence, in one or two sentences he will understand","kind":"settings|code","settings":{…only for kind settings: keys of settings.json to change…},"task":"only for kind code: precise instructions for a programmer — what to change and how to tell it works","risk":"low|normal|high"}]`,
    prompt: `EVIDENCE (last 7 days)\n${JSON.stringify(evidence, null, 1).slice(0, 30000)}\n\nUPDATE HISTORY\n${past}`});
  store.addSpend(r.cost, 'self-review');
  const raw = extractJson(r.text);
  const list = (Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : []).filter(p => p && p.title && ['settings', 'code'].includes(p.kind)).slice(0, limit);
  const proposals = [];
  for (const p of list) {
    try {
      if (p.kind === 'settings') proposals.push(await proposeSettings(core, p));
      else if (store.budgetLeft() < 1) proposals.push({title: p.title, error: 'Not built: today\'s budget is used up.'});
      else proposals.push(await prepareCode(core, {title: p.title, why: p.why, task: p.task, source: trigger === 'asked' ? 'you asked for a self-review' : 'nightly self-review'}));
    } catch (e) { proposals.push({title: p.title, error: e.message}); deps.log('self-update', `${p.title}: ${e.message}`); }
  }
  const ok = proposals.filter(p => p.approvalId);
  const summary = !list.length ? 'Self-review: nothing worth changing right now.' : `Self-review: ${ok.length} improvement${ok.length === 1 ? '' : 's'} ready for your approval${ok.length ? ` (${ok.map(p => `#${p.approvalId} ${p.title}`).join('; ')})` : ''}${proposals.length > ok.length ? `; ${proposals.length - ok.length} could not be prepared` : ''}.`;
  store.act('self-update', summary, {auto: trigger !== 'asked'});
  store.setState({lastReview: {at: Date.now(), summary}});
  return {summary, proposals};
}

async function proposeSettings(core, p) {
  const patch = p.settings && typeof p.settings === 'object' ? p.settings : null;
  if (!patch || !Object.keys(patch).length) throw Error('No settings given.');
  core.deps.settings.validate(patch);
  const a = core.approvals.create({kind: 'settings', title: `Change settings: ${clip(p.title, 120)}`, detail: `${p.why || ''}\n\n${JSON.stringify(patch, null, 1)}`, payload: {tool: 'settings_change', input: {patch, why: p.why}}, risk: 'normal', source: 'self-review', ref: `settings:${JSON.stringify(patch)}`});
  return {title: p.title, kind: 'settings', approvalId: a.id};
}

/** Build one code change in the workshop, check it, and ask you. */
/**
 * Build one code change in the workshop, check it, and ask you.
 * `asked`: you asked for it yourself, so it may go past the daily budget for work JARVIS does on his own
 * (each build is still capped at $3); otherwise it has to fit inside what is left of today's budget.
 */
export async function prepareCode(core, {title, why = '', task, source = 'jarvis', request = '', asked = false}) {
  const {store, deps, updater, approvals} = core;
  const cfg = store.get();
  const cap = asked ? 3 : Math.min(3, store.budgetLeft());
  if (cap < 0.3) throw Error('Today\'s budget for work on my own is used up. Ask me directly, or raise the budget in Settings.');
  const {id, dir} = updater.stage({title, why, request: request || task, source});
  store.act('self-update', `Preparing: ${title}`, {auto: true});
  core.push();
  try {
    const codeModel = /opus/.test(cfg.models.code) ? 'opus' : /haiku/.test(cfg.models.code) ? 'haiku' : 'sonnet';
    const change = await makeChange({dir, task: `${title}\n\n${task || request}`, context: why, engine: cfg.codeEngine, key: deps.getKey(), model: cfg.models.code, codeModel, budget: cap, log: deps.log});
    store.addSpend(change.cost, 'self-update');
    let check = await updater.validate(id);
    if (!check.ok && check.changes.length && deps.getKey() && (asked || store.budgetLeft() > 0.5)) {
      // one go at fixing its own mistakes
      const fix = await makeChange({dir, task: `Your change to JARVIS has problems that must be fixed before it can be installed:\n${check.problems.join('\n')}\n\nFix them (keep the change itself).`, engine: cfg.codeEngine === 'claude-code' ? 'claude-code' : 'api', key: deps.getKey(), model: cfg.models.code, codeModel, budget: 1, log: deps.log});
      store.addSpend(fix.cost, 'self-update'); check = await updater.validate(id);
    }
    if (!check.ok) { updater.failed(id, check.problems.join('\n')); store.act('self-update', `Could not prepare “${title}”: ${clip(check.problems[0], 160)}`, {auto: true}); core.push(); throw Error(check.problems.join(' ')); }
    const summary = clip(String(change.summary || '').trim(), 3000);
    const files = check.changes.map(c => `${c.status === 'added' ? '+' : c.status === 'deleted' ? '−' : '~'} ${c.path}`).join('\n');
    const a = approvals.create({kind: 'update', title: `Update myself: ${clip(title, 120)}`, risk: 'high', source, ref: `update:${id}`, expiresHours: 7 * 24,
      detail: `${why ? `Why: ${why}\n\n` : ''}${summary}\n\nFiles (+${check.added} −${check.removed} lines):\n${files}${check.warnings?.length ? `\n\n⚠ ${check.warnings.join('\n⚠ ')}` : ''}`, payload: {updateId: id, fingerprint: check.fingerprint, task: String(task || request).slice(0, 4000), title, why}});
    updater.ready(id, {summary, cost: change.cost, approvalId: a.id});
    store.act('self-update', `Ready for your approval (#${a.id}): ${title}`, {auto: true});
    core.push();
    return {title, kind: 'code', updateId: id, approvalId: a.id, summary};
  } catch (e) {
    const u = updater.update(id); if (u && u.status === 'drafting') updater.failed(id, e.message);
    throw e;
  }
}
export {oneLine};
