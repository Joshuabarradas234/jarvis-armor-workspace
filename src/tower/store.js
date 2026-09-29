import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {writeJson} from '../brain/util.js';
import {SEED} from './seed.js';
import {briefOf, usefulness} from './productivity.js';
import {captureSkill,matchSkills,skillPage,setSkillEnabled} from './skills.js';

const ROLES = ['lead', 'specialist', 'reviewer'];
const ENGINES = ['auto', 'api', 'claude-code', 'rehearsal'];
const RANKS = [[0, 'Intern'], [2, 'Staff'], [5, 'Senior'], [10, 'Chief']];
export const rankFor = xp => RANKS.filter(([n]) => (xp || 0) >= n).pop()[1];
const str = (v, max) => String(v ?? '').slice(0, max);
const safeName = s => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Floor';

/** Towers, floors, their teams and their run history. Kept in tower.json; work goes to Documents/JARVIS Tower. */
export class TowerStore {
  constructor({dir, docs}) {
    this.dir = dir;
    this.file = path.join(dir, 'tower.json');
    this.runsFile = path.join(dir, 'tower-runs.json');
    this.root = path.join(docs, 'JARVIS Tower');
    try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.data = null; }
    if (!this.data || typeof this.data !== 'object' || !this.data.towers) this.data = {towers: {}, settings: {}};
    for (const [id, t] of Object.entries(SEED)) if (!this.data.towers[id]) this.data.towers[id] = structuredClone(t);
    for (const [id, t] of Object.entries(this.data.towers)) { if (t.owner === undefined) t.owner = SEED[id]?.owner || ''; if (t.org === undefined) t.org = SEED[id]?.org || ''; }
    for (const t of Object.values(this.data.towers)) { for (const f of t.floors || []) this.cleanFloor(f); (t.floors || []).sort((a, b) => b.number - a.number); }
    this.data.settings = {plannerModel: 'claude-sonnet-5', workerModel: 'claude-sonnet-5', codeModel: 'sonnet', maxSteps: 5, skillPolicy: 'owner', ...this.data.settings};
    try { this.runs = JSON.parse(fs.readFileSync(this.runsFile, 'utf8')); } catch { this.runs = []; }
    if (!Array.isArray(this.runs)) this.runs = [];
    // a run that was going when the app closed did not finish
    for (const r of this.runs) if (['queued', 'planning', 'working', 'reviewing'].includes(r.status)) { r.status = 'stopped'; r.note = 'JARVIS was closed while this ran.'; }
    for(const r of this.runs)if(r.status==='done'&&r.verdict==='CHANGES'){r.status=r.phase='needs_changes';r.progress=Math.min(r.progress||0,96);r.final=null;r.approvals=[];r.note='This older run failed review. Correct it before using its result.';}
    if(!['owner','review'].includes(this.data.settings.skillPolicy))this.data.settings.skillPolicy='owner';
    if(!Array.isArray(this.data.taskSkills))this.data.taskSkills=[];
    for(const r of this.runs)captureSkill(this.data,r);
    this.flush();
  }
  cleanFloor(f) {
    f.id = str(f.id || crypto.randomUUID(), 64);
    f.number = Math.max(1, Math.min(200, Math.round(Number(f.number) || 1)));
    f.name = str(f.name || 'New floor', 60);
    f.purpose = str(f.purpose, 6000);
    f.skills = (Array.isArray(f.skills) ? f.skills : []).map(s => str(s, 40)).filter(Boolean).slice(0, 12);
    f.tools = {web: !!f.tools?.web, files: f.tools?.files !== false};
    f.engine = ENGINES.includes(f.engine) ? f.engine : 'auto';
    f.lessons = str(f.lessons, 6000);
    f.example = str(f.example, 1000);
    f.taskBrief=briefOf(f.taskBrief);
    f.handoff = typeof f.handoff === 'string' && f.handoff !== f.id ? f.handoff.slice(0, 64) : '';
    const sc = f.schedule || {};
    f.schedule = {on: !!sc.on, time: /^([01]\d|2[0-3]):[0-5]\d$/.test(sc.time || '') ? sc.time : '07:30', days: (Array.isArray(sc.days) ? sc.days : [1, 2, 3, 4, 5]).map(Number).filter(d => d >= 0 && d <= 6), task: str(sc.task, 2000), last: str(sc.last, 20)};
    const bu = f.budget || {};
    f.budget = {perRun: Math.max(0.05, Math.min(100, Number(bu.perRun) || 2)), perDay: Math.max(0.1, Math.min(500, Number(bu.perDay) || 10))};
    f.ideaId = str(f.ideaId, 64);
    f.agents = (Array.isArray(f.agents) ? f.agents : []).slice(0, 8).map(a => ({
      id: str(a.id || crypto.randomUUID(), 64), name: str(a.name || 'Agent', 40), title: str(a.title, 60),
      role: ROLES.includes(a.role) ? a.role : 'specialist', prompt: str(a.prompt, 4000), web: !!a.web,
      engine: ENGINES.includes(a.engine) ? a.engine : 'auto', xp: Math.max(0, Math.round(Number(a.xp) || 0)),
    }));
    if (!f.agents.some(a => a.role === 'lead')) f.agents.unshift({id: crypto.randomUUID(), name: 'Lead', title: 'Floor Lead', role: 'lead', prompt: 'You plan the work.', web: false, engine: 'auto', xp: 0});
    if (!f.agents.some(a => a.role === 'reviewer')) f.agents.push({id: crypto.randomUUID(), name: 'Reviewer', title: 'Final Review', role: 'reviewer', prompt: 'You check and finish the work.', web: false, engine: 'auto', xp: 0});
    return f;
  }
  flush() {
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    writeJson(this.file, this.data, 2);
    this.runs = this.runs.slice(-80);
    writeJson(this.runsFile, this.runs, 1);
  }
  tower(theme) { const t = this.data.towers[theme]; if (!t) throw Error('No tower for this hall.'); return t; }
  floor(theme, id) { const f = this.tower(theme).floors.find(x => x.id === id); if (!f) throw Error('That floor no longer exists.'); return f; }
  folder(theme, floor) {
    const t = this.tower(theme);
    const dir = path.join(this.root, safeName(t.name), `${String(floor.number).padStart(2, '0')} ${safeName(floor.name)}`);
    fs.mkdirSync(path.join(dir, 'knowledge'), {recursive: true}); fs.mkdirSync(path.join(dir, 'runs'), {recursive: true});
    return dir;
  }
  knowledge(theme, floor) {
    const dir = path.join(this.folder(theme, floor), 'knowledge');
    return fs.readdirSync(dir, {withFileTypes: true}).filter(d => d.isFile()).map(d => {
      const p = path.join(dir, d.name); const st = fs.statSync(p); return {name: d.name, path: p, size: st.size};
    });
  }
  addKnowledge(theme, floorId, files) {
    const floor = this.floor(theme, floorId); const dir = path.join(this.folder(theme, floor), 'knowledge');
    for (const f of files) {
      const st = fs.statSync(f); if (!st.isFile()) continue; if (st.size > 20 * 1024 * 1024) throw Error(`${path.basename(f)} is over 20 MB.`);
      fs.copyFileSync(f, path.join(dir, path.basename(f)));
    }
    return this.knowledge(theme, floor);
  }
  removeKnowledge(theme, floorId, name) {
    const floor = this.floor(theme, floorId); const dir = path.join(this.folder(theme, floor), 'knowledge');
    const p = path.join(dir, path.basename(String(name))); if (p.startsWith(dir + path.sep) && fs.existsSync(p)) fs.unlinkSync(p);
    return this.knowledge(theme, floor);
  }
  saveFloor(theme, patch) {
    const t = this.tower(theme);
    const i = t.floors.findIndex(f => f.id === patch.id);
    const next = this.cleanFloor({...(i >= 0 ? t.floors[i] : {}), ...patch});
    if (i >= 0) t.floors[i] = next; else t.floors.push(next);
    t.floors.sort((a, b) => b.number - a.number);
    this.flush(); return next;
  }
  addFloor(theme) {
    const t = this.tower(theme);
    const n = Math.max(0, ...t.floors.map(f => f.number)) + 1;
    return this.saveFloor(theme, {id: crypto.randomUUID(), number: n, name: `Floor ${n}`, purpose: 'Describe what this floor is for, what it produces, and the standard you expect.', skills: [], tools: {web: false, files: true},
      agents: [{name: 'Lead', title: 'Floor Lead', role: 'lead', prompt: 'You plan the work and brief your team.'}, {name: 'Specialist', title: 'Specialist', role: 'specialist', prompt: 'You do the work.'}, {name: 'Reviewer', title: 'Final Review', role: 'reviewer', prompt: 'You check and finish the work.'}]});
  }
  removeFloor(theme, id) { const t = this.tower(theme); t.floors = t.floors.filter(f => f.id !== id); this.flush(); return true; }
  resetExamples(theme) { if (!SEED[theme]) return false; const keep = this.tower(theme).floors.filter(f => !SEED[theme].floors.some(s => s.id === f.id)); this.data.towers[theme] = {...structuredClone(SEED[theme]), floors: [...structuredClone(SEED[theme].floors), ...keep]}; for (const f of this.data.towers[theme].floors) this.cleanFloor(f); this.flush(); return true; }
  addLesson(theme, floorId, line) {
    const f = this.floor(theme, floorId);
    const stamp = new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
    f.lessons = (f.lessons ? f.lessons.trimEnd() + '\n' : '') + `- (${stamp}) ${String(line).replace(/\s+/g, ' ').trim().slice(0, 400)}`;
    if (f.lessons.length > 6000) f.lessons = f.lessons.slice(-6000).replace(/^[^\n]*\n/, '');
    this.flush();
  }
  saveTower(theme, p) { const t = this.tower(theme); for (const k of ['name', 'owner', 'org']) if (typeof p[k] === 'string') t[k] = p[k].slice(0, 60); if (p.head && typeof p.head === 'object') t.head = {...t.head, ...Object.fromEntries(['name', 'title', 'prompt'].filter(k => typeof p.head[k] === 'string').map(k => [k, p.head[k].slice(0, k === 'prompt' ? 3000 : 60)]))}; this.flush(); return t; }
  workflows(theme) { return (this.data.workflows || []).filter(w=>w.theme===theme); }
  saveWorkflow(runId, patch={}) {
    const r=this.runs.find(r=>r.id===runId);
    if(!r || r.rehearsal || r.status!=='done' || r.verdict!=='APPROVED' || r.feedback?.good!==true) throw Error('Accept a reviewed result before saving it as a workflow.');
    const all=this.data.workflows ||= [], existing=all.find(w=>w.runId===runId);
    if(!existing && all.length>=30)throw Error('Up to 30 workflows. Remove one first.');
    const w={id:existing?.id||crypto.randomUUID(),runId,theme:r.theme,floorId:r.floorId,name:str(patch.name||r.title,80),brief:briefOf({...r.brief,preferences:patch.preferences??r.brief?.preferences,checklist:patch.checklist??r.brief?.checklist}),task:r.task,example:fs.readFileSync(r.final,'utf8').slice(0,12000)};
    if(existing)all[all.indexOf(existing)]=w;else all.push(w);this.flush();return w;
  }
  learn(r) { const s=captureSkill(this.data,r); if(s)this.flush(); return s; }
  matchSkills(theme,floorId,task,brief) { return matchSkills(this.data,theme,floorId,task,brief); }
  skillPage(theme,floorId,query,page) { this.floor(theme,floorId); return skillPage(this.data,theme,floorId,query,page); }
  enableSkill(theme,id,enabled) { const s=setSkillEnabled(this.data,theme,id,enabled);this.flush();return s; }
  recordSkillUse(r) {
    if(r.skillUseRecorded)return;r.skillUseRecorded=true;
    for(const id of r.learnedSkills||[]){const s=this.data.taskSkills.find(s=>s.id===id&&s.theme===r.theme&&s.floorId===r.floorId);if(s)s.uses=(s.uses||0)+1;}
  }
  recordSkillOutcome(r,good) {
    if(r.skillOutcomeRecorded)return;r.skillOutcomeRecorded=true;
    for(const id of r.learnedSkills||[]){const s=this.data.taskSkills.find(s=>s.id===id&&s.theme===r.theme&&s.floorId===r.floorId);if(s){const k=good?'acceptedUses':'reworkUses';s[k]=(s[k]||0)+1;}}
  }
  metrics(theme) {
    const runs=this.runs.filter(r=>r.theme===theme);
    return {total:usefulness(runs),floors:this.tower(theme).floors.map(f=>({id:f.id,name:f.name,...usefulness(runs.filter(r=>r.floorId===f.id))}))};
  }
  settings() { return this.data.settings; }
  saveSettings(p) {
    const s = this.data.settings;
    for (const k of ['plannerModel', 'workerModel']) if (typeof p[k] === 'string' && /^[\w.-]{3,60}$/.test(p[k])) s[k] = p[k];
    if (['sonnet', 'opus', 'haiku'].includes(p.codeModel)) s.codeModel = p.codeModel;
    if(p.skillPolicy!==undefined){if(!['owner','review'].includes(p.skillPolicy))throw Error('Choose when learned skills may be used.');s.skillPolicy=p.skillPolicy;}
    if (Number.isFinite(p.maxSteps)) s.maxSteps = Math.max(1, Math.min(8, Math.round(p.maxSteps)));
    this.flush(); return s;
  }
}
