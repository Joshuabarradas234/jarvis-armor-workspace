import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {writeJson} from '../brain/util.js';
import {briefOf, briefGaps} from '../tower/productivity.js';

const text = (v, n = 300) => String(v ?? '').trim().slice(0, n);
const blocked = new Set(['blocked', 'needs_brief', 'needs_changes', 'error', 'failed', 'budget', 'stopped']);
export const PAGE_MODES = {summarise: 'Summarise', research: 'Research', compare: 'Compare', task: 'Turn into a task'};
export function pageOf(p) {
  const u = new URL(text(p?.url, 2048));
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password) throw Error('Choose an HTTP or HTTPS page without credentials.');
  return {url: u.href, title: text(p.title, 160) || u.hostname, text: text(p.text, 12000)};
}
export function attentionItems({approvals = [], runs = [], missions = [], drafts = [], meetings = [], meetingWork = [], seen = {}}) {
  const items = approvals.filter(a => a.status === 'waiting').map(a => ({id: `core:${a.id}`, kind: 'approval', title: text(a.title || a.summary || a.kind), detail: 'JARVIS Core is waiting for your decision.', action: 'Review request', source: 'core', at: a.createdAt || a.at || 0}));
  for (const r of runs) {
    const base = {title: text(r.title), theme: r.theme, floorId: r.floorId, runId: r.id, source: 'tower', at: r.endedAt || r.startedAt || 0};
    const waiting = (r.approvals || []).filter(a => a.status === 'waiting').length;
    if (waiting) items.push({...base, id: `approval:${r.id}`, kind: 'approval', detail: `${r.floorName}: ${waiting} decision${waiting === 1 ? '' : 's'} waiting.`, action: 'Review requests'});
    if (blocked.has(r.status) || r.feedback?.good === false) items.push({...base, id: `run:${r.id}`, kind: 'blocked', detail: text(r.error || r.notes || r.questions?.join(' ') || r.note || 'Review the brief and decide how to continue.', 500), action: 'Review and correct'});
    else if (r.status === 'done' && !r.feedback) items.push({...base, id: `run:${r.id}`, kind: 'finished', detail: `${r.floorName}${r.rehearsal ? ' · rehearsal only' : ''}: ready for your review.`, action: 'Read and review'});
  }
  for (const m of missions) {
    if (!['done', 'blocked'].includes(m.status)) continue;
    const id = `mission:${m.theme}:${m.id}`, revision = JSON.stringify([m.status, m.objective, m.startedAt, m.endedAt, m.tasks]);
    if (m.status === 'done' && seen[id] === revision) continue;
    items.push({id, revision, source: 'mission', theme: m.theme, suitId: m.id, kind: m.status === 'done' ? 'finished' : 'blocked', title: text(m.objective || m.name), detail: `${m.name}: ${m.status === 'done' ? 'agent reports finished; inspect its output.' : 'needs help to continue.'}`, action: 'Open suit task', at: m.endedAt || m.startedAt || 0});
  }
  for(const m of meetings.filter(m=>m.status==='sending'))items.push({id:'meeting-sent:'+m.id,source:'meeting',kind:'blocked',title:'Check Sent mail: '+text(m.suit),detail:'A meeting email was interrupted after it went out. Check Sent mail, then say whether it arrived.',action:'Review meeting email',theme:m.theme,at:m.at});
  for(const m of meetings.filter(m=>m.status==='draft'&&!m.approval))items.push({id:'meeting:'+m.id,source:'meeting',kind:'finished',title:'Meeting follow-up: '+text(m.suit),detail:'Actions are in your to-dos. Review the draft before requesting permission to send.',action:'Review meeting email',theme:m.theme,at:m.at});
  for(const m of meetingWork)for(const p of m.tasks.filter(p=>!p.runId&&p.kind!=='idea'&&p.status!=='dismissed'))items.push({id:'meeting-work:'+m.id+':'+p.id,source:'meeting-work',kind:p.status==='ready'?'draft':'blocked',title:text(p.title),detail:text(p.error||p.questions.join(' ')||'Review the proposed suit, floor and brief.'),action:'Review meeting work',at:m.at});
  for (const d of drafts) items.push({id: `draft:${d.id}`, draftId: d.id, source: 'draft', kind: 'draft', title: text(d.outcome || d.pages?.[0]?.title), detail: `${d.suitName} · ${PAGE_MODES[d.mode] || 'Page brief'} · saved locally, not started.`, action: 'Finish brief', theme: d.theme, at: d.updatedAt});
  const rank = {approval: 0, blocked: 1, finished: 2, draft: 3};
  return items.sort((a, b) => rank[a.kind] - rank[b.kind] || b.at - a.at);
}

/** Local drafts only. Starting a paid run is a separate, explicit user action. */
export class Workbench {
  constructor({dir, workstations, tower, runner, tabs, missions, core}) {
    Object.assign(this, {workstations, tower, runner, tabs, missions, core});
    this.file = path.join(dir, 'workbench.json'); this.busy = new Set();
    this.state = {drafts: [], teams: {}, seen: {}};
    try {
      const s = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!s || !Array.isArray(s.drafts) || s.drafts.length > 40 || !s.teams || typeof s.teams !== 'object' || Array.isArray(s.teams) || !s.seen || typeof s.seen !== 'object' || Array.isArray(s.seen)) throw Error('Invalid saved briefs.');
      for (const d of s.drafts) {
        if (!d || typeof d.id !== 'string' || !Object.hasOwn(PAGE_MODES,d.mode) || !Array.isArray(d.pages) || d.pages.length !== (d.mode === 'compare' ? 2 : 1) || !d.brief) throw Error('Invalid saved brief.');
        d.pages = d.pages.map(pageOf); d.brief = briefOf(d.brief);
      }
      this.state = s;
    } catch (e) { if (e.code !== 'ENOENT') this.loadError = 'Saved page briefs could not be read. Restore workbench.json from your backup before saving new briefs.'; }
  }
  save() { if (this.loadError) throw Error(this.loadError); writeJson(this.file, this.state); }
  options() {
    return {themes: this.workstations.themes.map(t => ({id: t.id, name: t.name, suits: this.workstations.modules(t.id).filter(s => !s.isVehicle).map(s => ({id: s.id, name: s.name})), teams: this.tower.tower(t.id).floors.map(f => ({id: f.id, name: f.name, budget: f.budget, engine: f.engine}))})), teams: this.state.teams, tabs: this.tabs.list(), activeTheme: this.workstations.activeTheme};
  }
  attention() {
    return {items: attentionItems({approvals: this.core()?.approvals.list({status: 'waiting'}) || [], runs: this.tower.runs, missions: this.workstations.themes.flatMap(t => this.missions.board(t.id, this.workstations.modules(t.id)).map(m => ({...m, theme: t.id}))), drafts: this.state.drafts, meetingWork:this.core()?.meetingWork?.items||[], meetings:this.core()?.deps?.meetingFollowups?.list()||[], seen: this.state.seen}), error: this.loadError || ''};
  }
  acknowledge(id) {
    const item = this.attention().items.find(i => i.id === id && i.source === 'mission' && i.kind === 'finished');
    if (!item) throw Error('That task is no longer waiting for review.');
    this.state.seen[id] = item.revision; this.save(); return true;
  }
  draft(id) { const d = this.state.drafts.find(d => d.id === id); if (!d) throw Error('That brief is no longer saved.'); return d; }
  put(p) {
    if (this.loadError) throw Error(this.loadError);
    const suit = this.workstations.suit(p.suitId, p.theme), floor = this.tower.floor(p.theme, p.floorId);
    if (suit.isVehicle || !Object.hasOwn(PAGE_MODES, p.mode)) throw Error('Choose a suit and a page action.');
    if (!Array.isArray(p.pages) || p.pages.length !== (p.mode === 'compare' ? 2 : 1)) throw Error('Compare needs two different pages; other actions need one.');
    const pages = p.pages.map(pageOf);
    if (pages.length === 2 && pages[0].url === pages[1].url) throw Error('Choose a different page to compare.');
    if (p.id && this.busy.has(p.id)) throw Error('This brief is already starting.');
    if (p.id) this.draft(p.id);
    else if (this.state.drafts.length >= 40) throw Error('You have 40 saved page briefs. Finish or remove one first.');
    const d = {id: p.id || crypto.randomUUID(), theme: p.theme, suitId: suit.id, suitName: suit.name, floorId: floor.id, mode: p.mode, pages, brief: briefOf(p.brief), outcome: text(p.brief?.outcome, 2000), updatedAt: Date.now()};
    const old = this.state.drafts.findIndex(x => x.id === d.id);
    if (old < 0) this.state.drafts.push(d); else this.state.drafts[old] = d;
    this.state.teams[`${d.theme}:${d.suitId}`] = d.floorId; this.save(); return d;
  }
  remove(id) { if (this.busy.has(id)) throw Error('This brief is starting.'); this.draft(id); this.state.drafts = this.state.drafts.filter(d => d.id !== id); this.save(); return true; }
  async start(id) {
    if (this.busy.has(id)) throw Error('This brief is already starting.');
    const d = this.draft(id), gaps = briefGaps(d.brief);
    if (gaps.length) throw Error('Complete ' + gaps.join(', ') + ' before starting.');
    if (!d.brief.budget) throw Error('Set a spend cap before starting.');
    const floor = this.tower.floor(d.theme, d.floorId);
    if (floor.handoff) throw Error('This team automatically hands work to another floor. Turn that off in its Brief tab, or choose a team without an automatic handoff.');
    this.busy.add(id);
    try {
      const instructions = {summarise: 'Summarise the supplied page, including key facts, limitations and useful next steps.', research: 'Research the question using the supplied page as a starting point. Cite sources and distinguish verified facts from assumptions.', compare: 'Compare both supplied pages against the owner’s criteria. Include a comparison table, evidence gaps and a recommendation.', task: 'Turn the supplied page into an actionable task plan with a clear outcome, steps, dependencies and acceptance checklist. Do not execute that plan.'}[d.mode];
      const r = await this.runner.start(d.theme, d.floorId, `${instructions}\n\nOWNER OUTCOME: ${d.outcome}`, {title: `${d.suitName}: ${PAGE_MODES[d.mode]}`, brief: d.brief, input: JSON.stringify({kind: 'untrusted-page-excerpts', workspace: d.suitName, pages: d.pages}), from: {floorName: 'owner-selected web pages'}});
      this.state.drafts = this.state.drafts.filter(x => x.id !== id); this.save(); return r;
    } finally { this.busy.delete(id); }
  }
}
