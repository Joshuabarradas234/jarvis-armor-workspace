import fs from 'node:fs';
import path from 'node:path';
import {briefOf, briefGaps} from '../tower/productivity.js';
import {copyUnique} from '../tower/store.js';

/**
 * What other apps on this computer (Floorboard first) can see and start through the control deck: Tower runs, the
 * attention list, and the suits with their clients. Starting work takes a second call with confirm:true and stays inside
 * each floor's spend caps, like pressing Start in the Tower. Agents never send or post; that still waits for you in JARVIS.
 */
const LIVE = ['queued', 'planning', 'working', 'reviewing'];
const RECENT = 48 * 3600e3, MAX_FILE = 20 * 1024 * 1024;
const IMAGE = /\.(png|jpe?g|gif|webp)$/i;   // what Claude Code's Read tool can look at
const FILLER = new Set(['from', 'this', 'that', 'these', 'those', 'with', 'into', 'make', 'have', 'will', 'them', 'they', 'some', 'what', 'when', 'please', 'their', 'your', 'about', 'using']);
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const usd = n => '$' + Math.max(0, n).toFixed(2);
const cents = n => Math.round(Math.max(0, n) * 100) / 100;
const and = list => list.join(', ').replace(/, ([^,]*)$/, ' and $1');
const same = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();

/** A short line on what a run is doing now. */
export function stepLine(r) {
  const steps = r.steps || [], done = steps.filter(s => s.status === 'done').length, of = steps.length ? ` (${done} of ${steps.length} steps done)` : '';
  switch (r.status) {
    case 'queued': return 'Waiting to start.';
    case 'planning': return 'The lead is planning the work.';
    case 'working': { const w = steps.filter(s => s.status === 'working'); return clip(w.length ? w.map(s => `${s.agentName}: ${s.title}`).join('; ') + of : `Working${of}.`, 160); }
    case 'reviewing': return 'The reviewer is checking the work.';
    case 'done': return r.rehearsal ? 'Finished. Rehearsal only: placeholder work.' : r.handedTo ? `Finished and handed on to ${r.handedTo.floorName}.` : 'Finished. Ready for your review in JARVIS.';
    case 'needs_brief': return clip(r.questions?.[0] || 'The brief needs more detail before agents start.', 160);
    case 'needs_changes': return 'Failed review after a correction. Revise the brief in JARVIS and run it again.';
    case 'budget': return 'Stopped at its budget cap. Raise the cap in JARVIS, then continue.';
    case 'stopped': return clip(r.note || 'Stopped.', 160);
    case 'failed': return clip(`Hit a problem: ${r.error || 'no reason given'}`, 160);
  }
  return clip(r.note || r.status, 160);
}

/** One run as other apps see it. */
export function runRow(r) {
  const times = [r.startedAt, r.endedAt, ...(r.steps || []).flatMap(s => [s.started, s.ended, s.log?.at(-1)?.t]), r.desk?.lead?.at(-1)?.t, r.desk?.reviewer?.at(-1)?.t].map(Number).filter(Number.isFinite);
  return {id: r.id, tower: r.theme, floor: r.floorId, floorName: r.floorName, title: r.title, status: r.status, progress: r.status === 'done' ? 100 : r.progress || 0, step: stepLine(r),
    updatedAt: Math.max(0, ...times), startedAt: r.startedAt || null, finishedAt: LIVE.includes(r.status) ? null : r.endedAt || null, error: r.error || null};
}

/** The immediate subfolders of a folder, by name. A slow or missing drive gives an empty list rather than a hang. */
export async function subfolders(folder, ms = 4000) {
  if (typeof folder !== 'string' || !path.isAbsolute(folder)) return [];
  const read = fs.promises.readdir(folder, {withFileTypes: true}).then(d => d.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base', numeric: true}))).catch(() => []);
  let timer; const late = new Promise(r => { timer = setTimeout(() => r([]), ms); });
  try { return await Promise.race([read, late]); } finally { clearTimeout(timer); }
}

/** Words that say what a client's numbered folder holds, so dropped artwork lands next to the work it is for. */
const GROUPS = {social: ['social', 'post', 'instagram', 'insta', 'facebook', 'tiktok', 'linkedin', 'caption', 'story', 'stories', 'reel', 'feed', 'carousel'],
  campaign: ['campaign', 'event', 'seasonal', 'season', 'christmas', 'easter', 'festive', 'launch', 'promo', 'promotion', 'sale', 'offer', 'competition', 'giveaway'],
  web: ['website', 'web', 'site', 'google', 'seo', 'page', 'landing', 'listing'], plan: ['plan', 'planning', 'calendar', 'schedule', 'monthly'],
  report: ['report', 'result', 'analytics', 'insight'], brand: ['brand', 'branding', 'brief', 'logo', 'identity', 'guideline'],
  art: ['artwork', 'art', 'design', 'creative', 'graphic', 'image', 'asset', 'media', 'visual', 'poster', 'flyer', 'banner']};
const WORD = new Map(Object.entries(GROUPS).flatMap(([g, words]) => words.map(w => [w, g])));
const groupsOf = s => new Set(String(s).toLowerCase().split(/[^a-z]+/).map(w => WORD.get(w) || WORD.get(w.replace(/e?s$/, '')) || WORD.get(w.replace(/s$/, ''))).filter(Boolean));
/**
 * Where artwork for a job goes in a client's folder: a dated "Artwork YYYY-MM-DD" folder inside the numbered folder that best
 * fits the job (social posts, campaigns, website…), else inside the brand or artwork folder, else in the client folder itself.
 */
export async function artworkFolder(clientDir, task, day = new Date()) {
  const stamp = `Artwork ${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  const want = groupsOf(task);
  const score = name => { const g = groupsOf(name.replace(/^\d+[\s._-]+/, '')); return [...g].filter(x => want.has(x)).length * 4 + (g.has('art') ? 2 : 0) + (g.has('brand') ? 1 : 0); };
  const best = (await subfolders(clientDir)).filter(n => /^\d{1,3}[\s._-]+\S/.test(n)).map(n => [n, score(n)]).sort((a, b) => b[1] - a[1])[0];
  const into = best?.[1] > 0 ? best[0] : '';
  return {dir: path.join(clientDir, into, stamp), parts: [into, stamp].filter(Boolean)};
}

/** Can this floor's team open images? Only agents working in Claude Code can. */
export function seesImages(runner, floor, eng) {
  return !!eng.claudeCode.ready && floor.agents.some(a => a.role === 'specialist' && runner.pick(floor, a, eng) === 'claude-code');
}

export class DeckApi {
  /** Each source is a function, because the deck starts before the Tower and the work shelf do. */
  constructor({tower, runner, workstations, attention, log}) {
    this.src = {tower, runner, workstations, attention}; this.log = log || (() => {});
    this.statuses = new Map(); this.count = null;
  }
  need(k) { const v = this.src[k]?.(); if (!v) throw Error('JARVIS is still starting. Try again in a moment.'); return v; }
  /** Learn the runs already in the history, so approving or rating an old one does not look like it just finished. */
  seed() { for (const r of this.need('tower').runs) this.statuses.set(r.id, r.status); }

  async tower(now = Date.now()) {
    const store = this.need('tower'), runner = this.need('runner'), eng = await runner.engines();
    const live = new Map(runner.active().map(r => [r.id, r])), all = new Map(store.runs.map(r => [r.id, r]));
    for (const [id, r] of live) all.set(id, r);
    const rows = [...all.values()].filter(r => r.status !== 'restarted' && (live.has(r.id) || (r.endedAt || r.startedAt || 0) >= now - RECENT)).map(runRow);
    const newest = (a, b) => (b.startedAt || 0) - (a.startedAt || 0);
    rows.sort(newest);
    const runs = [...rows.filter(r => LIVE.includes(r.status)), ...rows.filter(r => !LIVE.includes(r.status))].slice(0, 30).sort(newest);   // a running job is never pushed off the list
    const floors = Object.entries(store.data.towers).flatMap(([id, t]) => (t.floors || []).map(f => ({tower: id, floor: f.id, name: f.name, towerName: t.name, number: f.number, images: seesImages(runner, f, eng)})));
    return {runs, floors};
  }

  attention() {
    const a = this.need('attention');
    return {items: a.items.map(i => ({kind: i.kind, title: i.title, detail: i.detail, at: i.at || 0, id: i.id, action: i.action || ''})), ...(a.error ? {error: a.error} : {})};
  }

  async suits() {
    const ws = this.need('workstations');
    const list = ws.themes.flatMap(t => ws.modules(t.id).filter(s => !s.isVehicle).map(s => ({id: s.id, name: s.name, hall: t.id, hallName: t.name, folder: s.folder || ''})));
    return {suits: await Promise.all(list.map(async s => ({...s, clients: await subfolders(s.folder)})))};
  }

  /** Check a job and work out what it would do. Throws on anything malformed; `blocked` says why a good job cannot start yet. */
  async plan(b) {
    const store = this.need('tower'), runner = this.need('runner'), ws = this.need('workstations');
    if (!b || typeof b !== 'object' || Array.isArray(b)) throw Error('Send the job as JSON.');
    const task = typeof b.task === 'string' ? b.task.trim() : '';
    if (!task) throw Error('Say what the job is.');
    if (task.length > 3000) throw Error('Keep the job under 3,000 characters.');
    const halls = ws.themes.filter(t => !b.tower || t.id === b.tower).concat(ws.themes);
    const suit = halls.flatMap(t => ws.modules(t.id)).find(s => !s.isVehicle && (s.id === b.suit || (typeof b.suit === 'string' && same(s.name, b.suit))));
    if (!suit) throw Error('Choose a suit from the list.');
    if (!suit.folder) throw Error(`${suit.name} has no folder yet. Give it one in JARVIS settings.`);
    const clients = await subfolders(suit.folder);
    if (!clients.length) throw Error(`${suit.name}'s folder has no client folders, or JARVIS cannot open it.`);
    const client = clients.find(c => c === b.client) || clients.find(c => same(c, b.client));
    if (!client) throw Error(`Choose one of ${suit.name}'s clients.`);

    if (!Array.isArray(b.files) || !b.files.length) throw Error('Drop in at least one file.');
    if (b.files.length > 20) throw Error('Up to 20 files at a time.');
    if (b.files.some(f => typeof f !== 'string' || !path.isAbsolute(f) || /^[\\/]{2}/.test(f))) throw Error('Send full paths to files on this computer.');
    const files = [...new Set(b.files.map(f => path.resolve(f)))];
    for (const f of files) {
      const st = await fs.promises.stat(f).catch(() => null);
      if (!st) throw Error(`${path.basename(f)} is not there any more.`);
      if (!st.isFile()) throw Error(`${path.basename(f)} is not a file.`);
      if (st.size > MAX_FILE) throw Error(`${path.basename(f)} is over 20 MB.`);
    }

    const theme = b.tower ? Object.keys(store.data.towers).find(id => id === b.tower || same(store.data.towers[id].name, b.tower)) : suit.theme;
    if (!theme) throw Error('Choose a tower from the list.');
    const tw = store.tower(theme), eng = await runner.engines(), images = files.filter(f => IMAGE.test(f));
    let floor;
    if (b.floor !== undefined && b.floor !== '') {
      floor = tw.floors.find(f => f.id === b.floor) || tw.floors.find(f => same(f.name, b.floor) || String(f.number) === String(b.floor));
      if (!floor) throw Error(`Choose a floor in ${tw.name}.`);
    } else {   // no floor given: the one whose brief matches the job best, and that can open the images
      const words = task.toLowerCase().split(/\W+/).filter(w => w.length > 3 && !FILLER.has(w));
      const fit = f => words.filter(w => `${f.name} ${f.purpose} ${f.skills.join(' ')}`.toLowerCase().includes(w)).length + (images.length && seesImages(runner, f, eng) ? 3 : 0);
      floor = tw.floors.slice().sort((x, y) => fit(y) - fit(x))[0];
      if (!floor) throw Error(`${tw.name} has no floors yet.`);
    }

    const given = b.brief && typeof b.brief === 'object' && !Array.isArray(b.brief) ? b.brief : {};
    const pick = Object.fromEntries(['outcome', 'audience', 'constraints', 'finished'].filter(k => typeof given[k] === 'string' && given[k].trim()).map(k => [k, given[k]]));
    const target = await artworkFolder(path.join(suit.folder, client), task);
    const where = [client, ...target.parts].join(' › ');
    const brief = briefOf({...floor.taskBrief, ...pick, outcome: pick.outcome || task, files: `${files.map(f => path.basename(f)).join(', ')}, in the floor's knowledge folder (also filed in ${where}).`});
    const missing = briefGaps(brief);

    const sees = seesImages(runner, floor, eng), busy = runner.active(theme).some(r => r.floorId === floor.id);
    const left = floor.budget.perDay - runner.spentToday(theme, floor.id), upTo = Math.min(floor.budget.perRun, left), rehearsal = floor.engine === 'rehearsal';
    const blocked = !eng.api.ready && !eng.claudeCode.ready ? 'Connect the Claude API key or Claude Code in JARVIS first.'
      : busy ? `${floor.name} is already working on something. Wait for it to finish, or choose another floor.`
      : left < 0.05 ? `${floor.name} has used its daily budget. Raise it in JARVIS, or try again tomorrow.`
      : missing.length ? `Add ${and(missing)}.` : '';
    const other = images.length && !sees ? tw.floors.find(f => f.id !== floor.id && seesImages(runner, f, eng)) : null;
    const next = floor.handoff && tw.floors.find(f => f.id === floor.handoff);
    const n = files.length, names = files.map(f => path.basename(f));
    const summary = [
      `${tw.name}, floor ${floor.number} ${floor.name}, will work on “${clip(task, 120)}” for ${client} (${suit.name}).`,
      `${n === 1 ? 'The file' : `The ${n} files`} (${clip(names.join(', '), 200)}) ${n === 1 ? 'goes' : 'go'} into ${where} and the floor's knowledge.`,
      !images.length ? '' : sees ? 'Its agents can open the images.'
        : `${rehearsal ? 'Its agents only rehearse, so they' : eng.claudeCode.ready ? 'Its agents work through the Claude API, so they' : 'Claude Code is not set up on this computer, so its agents'} cannot open images: they will go on the file names and your brief.${other ? ` ${other.name} can open them.` : ''}`,
      rehearsal ? 'This floor only rehearses: placeholder work, no AI and no cost.' : `Up to about ${usd(upTo)} for this run, with ${usd(left)} of today's ${usd(floor.budget.perDay)} left on this floor.`,
      next ? `When it is done, ${next.name} takes it on, within its own caps.` : '',
      blocked ? `Before it can start: ${blocked}` : 'Nothing is sent or posted: anything to send waits for your OK in JARVIS.',
    ].filter(Boolean).join(' ');
    return {store, runner, theme, tw, suit, client, floor, files, images, sees, brief, missing, blocked, target, where, summary, estimate: {upToUsd: rehearsal ? 0 : cents(upTo), leftTodayUsd: cents(left)}};
  }

  /** Floorboard's "start this": first a summary to confirm, then (confirm:true) the files are filed and the run starts. */
  async run(b) {
    const p = await this.plan(b);
    if (b.confirm !== true) return {needsConfirm: true, summary: p.summary, estimate: p.estimate, canStart: !p.blocked, missing: p.missing, floor: {tower: p.theme, floor: p.floor.id, name: p.floor.name}, folder: p.target.dir};
    if (p.blocked) throw Error(p.blocked);
    await fs.promises.mkdir(p.target.dir, {recursive: true});
    for (const f of p.files) await copyUnique(f, p.target.dir);
    const names = await p.store.importKnowledge(p.theme, p.floor.id, p.files);
    const brief = {...p.brief, files: `${names.join(', ')}, in the floor's knowledge folder (also filed in ${p.where}).`};
    const look = p.sees ? ' Agents working in Claude Code: open each one with the Read tool before you start.' : p.images.length ? ' These agents cannot open images: work from the file names and the brief, and say what you could not check.' : '';
    const task = `${b.task.trim()}\n\nClient: ${p.client} (${p.suit.name}).\nArtwork from the owner, in the floor's knowledge folder: ${names.map(n => './knowledge/' + n).join(', ')}.${look}`;
    const run = await p.runner.start(p.theme, p.floor.id, task, {brief, title: `${p.client} · ${b.task.trim().split(/\r?\n/)[0]}`});   // a run title loses any colon (it names the run's folder)
    this.log('control', `Another app started "${run.title}" on ${p.floor.name}.`);
    return {ok: true, runId: run.id, status: run.status, filedIn: p.target.dir};
  }

  /** The Tower's "Continue where it stopped". */
  async continue(b) {
    const run = await this.need('runner').continue(String(b?.runId || ''));
    return {ok: true, runId: run.id, status: run.status};
  }

  /** A run's status changed: the event for the stream, or null when it has not. */
  towerEvent(run) {
    if (!run?.id || this.statuses.get(run.id) === run.status) return null;
    this.statuses.set(run.id, run.status);
    if (this.statuses.size > 400) this.statuses.delete(this.statuses.keys().next().value);
    return {type: 'tower', run: runRow(run)};
  }
  /** The attention list's size, when it changed (or always, for a new listener). */
  attentionEvent(always = false) {
    const count = this.need('attention').items.length;
    if (!always && count === this.count) return null;
    this.count = count; return {type: 'attention', count};
  }
}
