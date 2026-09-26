/**
 * JARVIS Core — Optimize: the overnight audit of JARVIS and every AI agent.
 *
 * It reads everything JARVIS and the agents "believe": the standing orders (facts about your business, what may be
 * done without asking), JARVIS's own notes, and every tower head, floor and agent's instructions. It looks for
 * stale facts ("launching next week", written a month ago) and conflicts (two sources that disagree, or an agent with
 * a rule that contradicts another's). It traces each one to its source, prepares an exact correction, fixes only the
 * safe ones itself (its own notes and housekeeping), and asks you about anything involving your business or permissions.
 */
import {ask} from './llm.js';
import {extractJson, clip, oneLine} from './util.js';

const esc = s => String(s ?? '');
export async function runAudit(core, {trigger = 'schedule'} = {}) {
  const {store, orders, approvals, deps} = core;
  const started = Date.now();
  const o = orders.parse(true);
  const sources = [];   // {ref, label, target, text}
  const addSrc = (label, target, text) => { if (!String(text || '').trim()) return; sources.push({ref: `S${sources.length + 1}`, label, target, text: String(text)}); };
  addSrc('Standing orders (Documents\\JARVIS\\Standing orders.md)', 'orders', o.text);
  addSrc("JARVIS's own notes (Documents\\JARVIS\\Notes.md)", 'notes', store.notes());
  const towers = deps.tower?.data?.towers || {};
  let floorsN = 0, agentsN = 0;
  for (const [theme, t] of Object.entries(towers)) {
    if (t.head?.prompt) addSrc(`${t.name} — head of the tower, ${t.head.name || ''} ${t.head.title ? `(${t.head.title})` : ''}`, `head:${theme}:prompt`, t.head.prompt);
    for (const f of t.floors || []) {
      floorsN++;
      addSrc(`${t.name} / Floor ${f.number} “${f.name}” — purpose`, `floor:${theme}:${f.id}:purpose`, f.purpose);
      if (f.lessons) addSrc(`${t.name} / Floor ${f.number} “${f.name}” — lessons learned`, `floor:${theme}:${f.id}:lessons`, f.lessons);
      for (const a of f.agents || []) { agentsN++; addSrc(`${t.name} / Floor ${f.number} “${f.name}” / ${a.name} (${a.role}${a.title ? ', ' + a.title : ''})`, `agent:${theme}:${f.id}:${a.id}:prompt`, a.prompt); }
    }
  }
  const findings = [];
  const push = f => findings.push({id: findings.length + 1, severity: 'medium', sources: [], ...f});

  /* ---------- 1. checks that need no AI ---------- */
  for (const p of o.problems) push({type: 'unclear', severity: 'medium', title: `A standing order I cannot follow (line ${p.line})`, explanation: `“${clip(p.text, 140)}”: ${p.why}`, sources: [{label: 'Standing orders', quote: p.text}], fix: null});
  for (const [theme, t] of Object.entries(towers)) for (const f of t.floors || []) {
    if (f.budget && f.budget.perRun > f.budget.perDay) push({type: 'conflict', severity: 'low', title: `${f.name}: one job may cost more than the whole day's budget`, explanation: `Per-job cap $${f.budget.perRun} is above the daily cap $${f.budget.perDay}, so the daily cap would stop the job halfway.`,
      sources: [{label: `${t.name} / ${f.name} — budget`}], fix: {kind: 'floor-budget', theme, floorId: f.id, perRun: f.budget.perDay}, safe: true});
    if (f.handoff && !(t.floors || []).some(x => x.id === f.handoff)) push({type: 'stale', severity: 'low', title: `${f.name} hands its work to a floor that no longer exists`, explanation: 'Finished jobs would be passed to nothing.', sources: [{label: `${t.name} / ${f.name} — hand-off`}], fix: {kind: 'floor-handoff', theme, floorId: f.id}, safe: true});
    if (f.schedule?.on && !deps.getKey() ) push({type: 'health', severity: 'medium', title: `${f.name} has a night shift but no engine`, explanation: 'Its scheduled job will be skipped until a Claude API key is added (or Claude Code is installed).', sources: [{label: `${t.name} / ${f.name} — schedule`}], fix: null});
  }
  const staleWaiting = approvals.waiting().filter(a => Date.now() - a.createdAt > 3 * 864e5);
  if (staleWaiting.length) push({type: 'stale', severity: 'low', title: `${staleWaiting.length} request${staleWaiting.length === 1 ? '' : 's'} waiting for more than three days`, explanation: staleWaiting.map(a => `#${a.id} ${a.title}`).join('; '), fix: null});
  let health = {};
  try { health = await core.health(); } catch {}
  for (const e of (health.errors || []).filter(x => x.count >= 3).slice(0, 5)) push({type: 'health', severity: e.count >= 10 ? 'high' : 'medium', title: `A repeating fault: ${clip(e.kind, 30)}`, explanation: `${e.count}× in the last week: “${clip(e.sample, 180)}”`, sources: [{label: 'JARVIS log'}], fix: null, improve: true});
  try { const hs = await deps.health(); for (const s of hs || []) if (s.level !== 'ok') push({type: 'health', severity: s.level === 'bad' ? 'high' : 'low', title: `Suit bay ${s.name || s.id}: ${s.reasons.join('; ')}`, explanation: 'Found by the bay health check.', fix: null}); } catch {}

  /* ---------- 2. what the model can see that rules can't: stale beliefs and contradictions ---------- */
  let cost = 0, aiNote = '';
  const key = deps.getKey();
  if (key && store.budgetLeft() > 0.05 && sources.length) {
    const today = new Date().toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'});
    const listing = sources.map(s => `[${s.ref}] ${s.label}\n${s.target === 'orders' ? s.text.split('\n').map((l, i) => `${String(i + 1).padStart(3)}: ${l}`).join('\n') : s.text}`).join('\n\n').slice(0, 90000);
    try {
      const r = await ask({key, model: store.get().models.brain, maxTokens: 5000,
        system: `You audit what an AI assistant (JARVIS) and its AI agents believe about their owner's business and what they are allowed to do. Today is ${today}. The standing orders file was last saved ${new Date(o.mtime || Date.now()).toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'})}.
Find, and only report real problems:
- stale: a statement that is out of date or will mislead (e.g. "launching next week" written weeks ago; a past date described as upcoming; "added" dates that make a time-relative phrase wrong).
- conflict: two sources that disagree about a fact (prices, dates, names, offers), or rules that contradict each other — especially about what an agent may do without asking (sending, posting, spending, contacting people) versus the standing orders' "Always ask me first".
- duplicate: the same rule or fact repeated in a way that could drift apart.
For each, trace it to the exact source text and propose an exact correction when you can. Never invent facts: if the right value is unknown, the fix should make the text honest (e.g. remove "next week", or add "[confirm date]").
Mark "safe": true only when the fix changes nothing but JARVIS's own notes (the source whose label starts "JARVIS's own notes") — never for business facts, rules or permissions.
Answer with JSON only.`,
        prompt: `SOURCES\n\n${listing}\n\nReturn a JSON array (empty if nothing is wrong), at most 12 items:\n[{"type":"stale|conflict|duplicate","severity":"high|medium|low","title":"short","explanation":"one or two sentences","sources":[{"ref":"S3","quote":"exact words from that source"}],"fix":{"ref":"S3","find":"exact text copied from that source","replace":"corrected text"} or null,"safe":false}]`});
      cost = r.cost; store.addSpend(r.cost, 'audit');
      const list = extractJson(r.text);
      if (Array.isArray(list)) for (const f of list.slice(0, 12)) {
        if (!f || !f.title) continue;
        const srcs = (Array.isArray(f.sources) ? f.sources : []).map(s => { const src = sources.find(x => x.ref === s.ref); return src ? {label: src.label, quote: clip(esc(s.quote), 300)} : null; }).filter(Boolean);
        let fix = null;
        if (f.fix && f.fix.ref && typeof f.fix.find === 'string' && typeof f.fix.replace === 'string') {
          const src = sources.find(x => x.ref === f.fix.ref);
          if (src) {
            const n = src.text.split(f.fix.find).length - 1;
            if (f.fix.find && n === 1 && f.fix.find !== f.fix.replace) fix = {kind: 'text', target: src.target, label: src.label, find: f.fix.find, replace: f.fix.replace};
          }
        }
        push({type: ['stale', 'conflict', 'duplicate'].includes(f.type) ? f.type : 'conflict', severity: ['high', 'medium', 'low'].includes(f.severity) ? f.severity : 'medium', title: clip(oneLine(f.title), 160), explanation: clip(esc(f.explanation), 800), sources: srcs, fix,
          safe: !!(f.safe && fix && fix.target === 'notes')});
      }
    } catch (e) { aiNote = `The AI part of the audit did not run: ${e.message}`; core.deps.log('audit', e.message); }
  } else aiNote = key ? 'The AI part of the audit was skipped: today\'s budget is used up.' : 'The AI part of the audit needs a Claude API key.';

  /* ---------- 3. fix what is safe, ask about the rest ---------- */
  const fixed = [], waiting = [];
  for (const f of findings) {
    if (!f.fix) continue;
    if (f.safe) {
      try { await core.applyFix(f.fix); f.outcome = 'fixed'; fixed.push(f); store.act('audit', `Fixed: ${f.title}`, {auto: true}); }
      catch (e) { f.outcome = `could not fix: ${e.message}`; }
    } else {
      const a = approvals.create({kind: 'audit', title: `Audit fix: ${f.title}`, detail: `${f.explanation}\n\n${f.fix.label || f.fix.target}\n- ${f.fix.find || ''}\n+ ${f.fix.replace || ''}`.trim(), payload: {fix: f.fix}, risk: 'normal', group: 'audit', ref: `audit:${f.fix.target}:${f.fix.find || f.fix.kind}`, expiresHours: 7 * 24});
      f.outcome = `waiting for you (#${a.id})`; f.approvalId = a.id; waiting.push(f);
    }
  }

  /* ---------- 4. the report ---------- */
  const count = t => findings.filter(f => f.type === t).length;
  const d = new Date();
  const lines = [`**${d.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long'})}, ${d.toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'})}** · checked the standing orders, my notes, ${Object.keys(towers).length} towers, ${floorsN} floors and ${agentsN} agents.`, '',
    '## Summary',
    findings.length ? `- ${count('conflict')} conflict${count('conflict') === 1 ? '' : 's'}, ${count('stale')} stale, ${count('duplicate')} duplicate, ${count('unclear')} unclear, ${count('health')} health.` : '- Nothing wrong found. Everything agrees with everything else.',
    `- Fixed on my own (safe changes only): ${fixed.length}.`,
    `- Waiting for your approval: ${waiting.length ? waiting.map(f => `#${f.approvalId}`).join(', ') : 'nothing'}.`,
    ...(aiNote ? [`- ${aiNote}`] : []), ''];
  if (findings.length) {
    lines.push('## Findings');
    findings.forEach((f, i) => {
      lines.push(`### ${i + 1}. ${f.title}`, `_${f.type} · ${f.severity}${f.outcome ? ' · ' + f.outcome : ''}_`, '', f.explanation);
      for (const s of f.sources || []) lines.push(`- Source: ${s.label}${s.quote ? ` — “${s.quote}”` : ''}`);
      if (f.fix?.kind === 'text') lines.push(`- Correction: “${clip(f.fix.find, 200)}” → “${clip(f.fix.replace, 200)}”`);
      lines.push('');
    });
  }
  const text = lines.join('\n');
  const summary = findings.length ? `Optimize: ${findings.length} finding${findings.length === 1 ? '' : 's'} (${count('conflict')} conflicts, ${count('stale')} stale). ${fixed.length} fixed; ${waiting.length} waiting for your approval${waiting.length ? ` (${waiting.map(f => '#' + f.approvalId).join(', ')})` : ''}.` : 'Optimize: checked everything; nothing to fix.';
  const report = store.addReport({kind: 'audit', title: 'Optimize — overnight audit', text, spoken: summary, data: {findings: findings.length, fixed: fixed.length, waiting: waiting.map(f => f.approvalId), cost, ms: Date.now() - started, trigger}});
  store.setState({lastAudit: {at: Date.now(), report: report.id, summary, findings: findings.length, fixed: fixed.length, waiting: waiting.map(f => f.approvalId)}});
  store.act('audit', summary, {auto: trigger === 'schedule'});
  return {report, summary, findings, fixed, waiting, cost, improve: findings.filter(f => f.improve)};
}
