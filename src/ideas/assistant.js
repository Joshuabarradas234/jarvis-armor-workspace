import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {callApi, callClaudeCode, detectClaudeCode} from '../tower/engines.js';

/**
 * Ideas that get worked on. Each idea can be for a suit in a hall, or for the JARVIS app itself.
 *   Assist:   JARVIS thinks it through and proposes a plan            -> waiting (your first OK)
 *   Approve:  a suit idea goes to one of that hall's tower floors     -> working -> done
 *             an app idea is built by Claude Code in a separate copy  -> working -> review (your second OK)
 *   Merge:    the reviewed change is merged into your JARVIS source   -> done
 * Nothing runs, and nothing in the code changes, without a yes. Overnight it drafts plans for
 * ideas that have gone quiet, and those wait for you too.
 */
const WAITING = ['waiting', 'review'], BUSY = ['thinking', 'working'];
const DAY = 86400000;

function git(cwd, args, timeout = 120000) {
  return new Promise((resolve, reject) => execFile('git', args, {cwd, windowsHide: true, timeout, maxBuffer: 50e6}, (e, out, err) => {
    if (!e) return resolve(out);
    const why = String(err || e.message).trim().split(/\r?\n/).filter(Boolean).slice(-3).join(' ');
    reject(Error(e.code === 'ENOENT' ? 'Git is not installed on this PC.' : why || 'git failed'));
  }));
}
function parseJson(text) {
  const t = String(text || ''), a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}
const short = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

export class IdeaAssistant {
  /** Everything comes in as a getter: the stores can be swapped (a backup restore replaces the ideas store). */
  constructor(d) { Object.assign(this, {api: callApi, code: callClaudeCode, detect: detectClaudeCode}, d); this.building = null; this.thinking = new Set(); }   // engines can be swapped for tests

  /* ---------------- state ---------------- */
  list() { return this.ideas().list(); }
  pending() { return this.list().filter(i => WAITING.includes(i.assist?.status)); }
  changed() { this.broadcast('ideas', {type: 'changed', list: this.list(), pending: this.pending().length}); }
  set(id, patch) { const a = this.ideas().setAssist(id, patch); this.changed(); return a; }
  get(id) { const i = this.ideas().get(id); if (!i) throw Error('That idea no longer exists.'); return i; }
  config() { const c = this.settings().ideas || {}; return {sourceRepo: this.sourceRepo(), nightly: c.nightly !== false}; }
  static isRepo(p) { return !!p && fs.existsSync(path.join(p, '.git')) && fs.existsSync(path.join(p, 'src', 'main', 'main.js')); }
  /** Your JARVIS source folder (a git checkout): the one chosen in the Ideas room, else the usual places. */
  sourceRepo() {
    const chosen = (this.settings().ideas || {}).sourceRepo;
    if (chosen) return IdeaAssistant.isRepo(chosen) ? chosen : '';
    for (const p of [this.appRoot, path.join(this.desktop, 'JARVIS-source-1.70.0'), path.join(this.desktop, 'jarvis-armor-workspace')]) if (IdeaAssistant.isRepo(p)) return p;
    return '';
  }
  describeTarget(idea) {
    const t = idea.target;
    if (t?.kind === 'app') return 'the JARVIS app itself';
    if (t?.kind === 'suit') { try { const s = this.workstations().suit(t.id, t.theme); return `${s.name} (${this.workstations().theme(t.theme).name})`; } catch { return t.name || 'a suit'; } }
    return '';
  }

  /* ---------------- 1. think it through ---------------- */
  /** Ask Claude for text (the API key, else Claude Code). What it costs is added to JARVIS's spend for the day. */
  async ask(system, prompt, {maxTokens = 2500, kind = 'ideas'} = {}) {
    const key = this.readKey(), paid = r => { try { if (r.cost > 0) this.spent?.(r.cost, kind); } catch {} return r.text; };
    if (key) return paid(await this.api({key, model: this.tower().settings().plannerModel, system, prompt, maxTokens}));
    const code = await this.detect();
    if (code.ready) { fs.mkdirSync(this.tower().root, {recursive: true}); return paid(await this.code({settingsDir: this.dir, cwd: this.tower().root, prompt: `${system}\n\n${prompt}`, model: 'sonnet', maxTurns: 2,
      fence: {name: 'ideas-thinking.json', allow: [], deny: ['Read', 'Edit', 'Write', 'Bash', 'Glob', 'Grep', 'NotebookEdit', 'WebSearch', 'WebFetch']}})); }   // thinking needs no tools
    throw Error('Connect Claude first: add an API key in the tower (Engines), or install Claude Code.');
  }
  context(idea) {
    const t = idea.target, lines = [];
    if (t?.kind === 'suit') {
      try {
        const s = this.workstations().suit(t.id, t.theme), hall = this.workstations().theme(t.theme);
        lines.push(`It is for the "${s.name}" workstation in ${hall.name}${s.subtitle ? ` (${s.subtitle})` : ''}.`);
        if (s.links?.length) lines.push('Its links: ' + s.links.slice(0, 8).map(l => `${l.label} <${l.url}>`).join(', '));
        const bay = this.board(t.theme).find(b => b.id === t.id);
        if (bay?.objective) lines.push(`Its objective: ${bay.objective}`);
        if (bay?.tasks?.length) lines.push('Its task list: ' + bay.tasks.map(x => (x.done ? '[x] ' : '[ ] ') + x.text).join('; '));
      } catch { lines.push(`It is for the suit "${t.name}".`); }
      const floors = this.tower().tower(t.theme).floors;
      lines.push('', 'AI agent floors in this hall\'s tower (pick one to do the work):', ...floors.map(f => `- ${f.id}: "${f.name}". ${short(f.purpose, 220)} Skills: ${f.skills.join(', ') || 'general'}`));
    } else if (t?.kind === 'app') {
      lines.push('It is a change to the JARVIS desktop app itself: an Electron app for Windows. Main process in src/ (Node ES modules), a prebuilt renderer in dist/ that is patched by hand, PowerShell helpers in scripts/windows. Features include halls and suits (workstations), voice and hand control, a control deck, the tower of AI agents, meeting mode, the ideas room.');
      lines.push('The build will be done by Claude Code, which can read and edit files in the source folder but cannot run commands. The owner approves the finished change before it is merged.');
    } else lines.push('It is not linked to a suit or to the app: help think it through and plan the next steps.');
    return lines.join('\n');
  }
  async think(id, {feedback = '', source = 'you'} = {}) {
    const idea = this.get(id);
    if (this.thinking.has(id) || BUSY.includes(idea.assist?.status) || idea.assist?.status === 'review') throw Error('JARVIS is already working on this idea.');
    const kind = idea.target?.kind || 'general';
    this.thinking.add(id);
    const previous = idea.assist?.plan && feedback ? `\n\nYOUR PREVIOUS PLAN:\n${idea.assist.plan}\n\nTHE OWNER'S FEEDBACK ON IT:\n${feedback}` : '';
    this.set(id, {status: 'thinking', kind, source, error: null, feedback: feedback || null, startedAt: Date.now()});
    try {
      const system = 'You are JARVIS, a personal assistant who turns ideas into concrete plans the owner can approve with one tap. Be specific and practical, say what you can do now yourself and what needs the owner. Never invent facts. British English.';
      const prompt = `IDEA: ${idea.title}\nSTAGE: ${idea.stage}, ${idea.progress}% along\nNOTES: ${idea.notes || '(none)'}\n\n${this.context(idea)}${previous}\n\n` +
        'Reply with JSON only, in this shape:\n{"summary":"one sentence: what you propose to do","plan":"Markdown: the steps, what you will produce, what you need from the owner",' +
        (kind === 'suit' ? '"floor":"<the id of the tower floor best suited to do it>","task":"the full brief for that floor\'s agents: what to produce, for whom, to what standard",' : '') +
        (kind === 'app' ? '"task":"the full build brief for Claude Code: what to change in the app, where it should appear, how the owner will use it, what not to break",' : '') +
        '"stage":"the stage the idea moves to when you start (designing, building or testing)"}';
      const j = parseJson(await this.ask(system, prompt));
      if (!j || !j.plan) throw Error('Claude did not return a usable plan. Try again.');
      const patch = {status: 'waiting', summary: short(j.summary, 300), plan: String(j.plan).slice(0, 8000), task: String(j.task || '').slice(0, 6000),
        nextStage: ['designing', 'building', 'testing'].includes(j.stage) ? j.stage : 'building', proposedAt: Date.now(), result: null};
      if (kind === 'suit') {
        const floors = this.tower().tower(idea.target.theme).floors, f = floors.find(x => x.id === j.floor) || floors[0];
        if (!f) throw Error('That hall\'s tower has no floors yet. Add one in the tower first.');
        Object.assign(patch, {floorId: f.id, floorName: f.name, theme: idea.target.theme});
      }
      this.set(id, patch);
      if (source === 'you') { this.say(`I've got a plan for "${short(idea.title, 60)}", ${this.addr()}. It needs your OK in the Ideas room.`); this.notify('Idea plan ready', `${idea.title}: ${patch.summary}`); }
    } catch (e) {
      this.set(id, {status: 'failed', error: e.message});
      if (source === 'you') this.say(`I couldn't plan that one, ${this.addr()}. ${short(e.message, 120)}`);
    } finally { this.thinking.delete(id); }
  }

  /* ---------------- 2. approve ---------------- */
  async approve(id) {
    const idea = this.get(id), a = idea.assist || {};
    if (a.status === 'review') return this.merge(id);
    if (a.status !== 'waiting') throw Error('Nothing on this idea is waiting for your approval.');
    if (a.kind === 'suit') {
      const run = await this.runner().start(a.theme, a.floorId, a.task || idea.title, {ideaId: id, title: idea.title});
      if(run.status==='needs_brief'){this.set(id,{status:'failed',runId:run.id,error:'Open the Tower and complete this task’s brief before work starts.'});return this.get(id);}
      this.set(id, {status: 'working', runId: run.id, phase: `${a.floorName} is working on it`, approvedAt: Date.now()});
      this.bump(id, a.nextStage);
      this.say(`${a.floorName} is on it, ${this.addr()}.`);
    } else if (a.kind === 'app') {
      if (this.building) throw Error(`JARVIS is already building "${this.building}". Approve this one when that finishes.`);
      if (!this.sourceRepo()) throw Error('Choose your JARVIS source folder first (the ⚙ in the Ideas room).');
      const code = await this.detect(true);
      if (!code.ready) throw Error('Claude Code is not installed yet. Install it (see ⚙ in the Ideas room), then restart JARVIS.');
      this.set(id, {status: 'working', phase: 'Making a separate copy of the source…', approvedAt: Date.now()});
      this.bump(id, a.nextStage);
      this.say(`Building it now, ${this.addr()}. I'll show you the change before anything is merged.`);
      this.buildApp(id).catch(e => { this.log('ideas', e.message); this.set(id, {status: 'failed', error: e.message}); this.say(`The build for "${short(idea.title, 60)}" hit a problem, ${this.addr()}.`); });
    } else {
      const stamp = new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});
      this.ideas().save({...idea, notes: `${idea.notes ? idea.notes + '\n\n' : ''}JARVIS plan (${stamp}):\n${a.plan}`.slice(-4000), stage: idea.stage === 'spark' ? a.nextStage : idea.stage});
      this.set(id, {status: 'done', result: 'The plan was added to the notes.'});
    }
    return this.list();
  }
  bump(id, stage) { const i = this.get(id); const order = ['spark', 'designing', 'building', 'testing', 'done']; if (order.indexOf(stage) > order.indexOf(i.stage)) this.ideas().save({...i, stage}); }
  async decline(id) {
    const a = this.get(id).assist || {};
    if (a.status === 'review') await this.cleanup(a).catch(e => this.log('ideas', e.message));
    else if (a.status !== 'waiting' && a.status !== 'failed') throw Error('Nothing on this idea is waiting for you.');
    this.set(id, {status: 'declined', declinedAt: Date.now()});
    return this.list();
  }

  /* ---------------- 3. building an app idea ---------------- */
  async buildApp(id) {
    const idea = this.get(id), a = idea.assist, repo = this.sourceRepo();
    this.building = idea.title;
    const wt = path.join(this.dir, 'idea-builds', id), branch = `jarvis/idea-${id.slice(0, 8)}-${Date.now().toString(36)}`;
    try {
      const base = (await git(repo, ['rev-parse', 'HEAD'])).trim();
      await this.cleanup({worktree: wt, repo}).catch(() => {});
      fs.mkdirSync(path.dirname(wt), {recursive: true});
      await git(repo, ['worktree', 'add', '-b', branch, wt, base]);
      this.set(id, {phase: 'Claude Code is building it…', branch, base, worktree: wt, repo});
      let last = 0;
      const onLine = l => { if (Date.now() - last > 4000) { last = Date.now(); this.set(id, {phase: 'Claude Code: ' + short(l, 120)}); } };
      const brief = [
        'You are improving the JARVIS Armor Workspace app in this folder (a git checkout). Read README.md and docs/REVIEW-1.70.md first.',
        'How the app is put together: the main process is src/ (Node ES modules). The renderer is prebuilt and patched by hand in dist/assets: the index-*.js bundle is minified, so change it only with small exact edits, and prefer adding a new module file in dist/assets loaded by a <script type="module"> tag in dist/index.html (as meeting.js does). Renderer calls reach the main process through the api() switch in src/main/main.js, and any new broadcast channel must be added to the list in src/main/preload.cjs.',
        'Rules: keep the change focused on this task and match the surrounding code style. Never put personal data (phone numbers, email addresses), API keys or passwords in the code: anything like that belongs in settings the owner fills in. Do not change the version in package.json. Do not delete features. Under a heading "## Pending (built by JARVIS)" at the end of docs/REVIEW-1.70.md, add a short entry saying what you changed and how to test it.',
        'You cannot run commands, so read carefully and double-check syntax. Finish with a short plain-English summary of what you changed, for the owner.',
        '', `IDEA: ${idea.title}`, `NOTES: ${idea.notes || '(none)'}`, '', 'APPROVED PLAN:', a.plan, '', 'BUILD BRIEF:', a.task || idea.title].join('\n');
      const codeModel = this.tower().settings().codeModel;
      let out = await this.code({settingsDir: this.dir, cwd: wt, prompt: brief, model: codeModel, maxTurns: 45, onLine});
      if (!(await git(wt, ['status', '--porcelain'])).trim()) throw Error('Claude Code finished without changing anything. ' + short(out.text, 300));
      await git(wt, ['add', '-A']); await git(wt, ['commit', '-m', `JARVIS: ${short(idea.title, 70)}`, '-m', `Built from the idea "${idea.title}" after approval.`]);
      // a syntax check on every changed script; one repair pass if it fails
      let errors = await this.checkSyntax(wt, base);
      if (errors.length) {
        this.set(id, {phase: 'Fixing a syntax error Claude Code left…'});
        await this.code({settingsDir: this.dir, cwd: wt, model: codeModel, maxTurns: 20, onLine,
          prompt: `The change you just made to this app has syntax errors. Fix only these, without changing anything else:\n\n${errors.join('\n\n')}`});
        if ((await git(wt, ['status', '--porcelain'])).trim()) { await git(wt, ['add', '-A']); await git(wt, ['commit', '-m', 'JARVIS: fix syntax']); }
        errors = await this.checkSyntax(wt, base);
        if (errors.length) throw Error('The change still has syntax errors, so it was not kept: ' + short(errors[0], 300));
      }
      const files = (await git(wt, ['diff', '--name-status', base, 'HEAD'])).trim().split(/\r?\n/).filter(Boolean).slice(0, 60);
      const stat = (await git(wt, ['diff', '--shortstat', base, 'HEAD'])).trim();
      const diff = await git(wt, ['diff', base, 'HEAD']);
      const diffFile = path.join(this.dir, 'idea-builds', `${id}.diff`); fs.writeFileSync(diffFile, diff);
      // anything that looks private in the added lines is flagged before you merge
      const added = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++')).join('\n');
      const warnings = [];
      if (/\+\d{9,14}\b/.test(added)) warnings.push('The change contains something that looks like a phone number.');
      if (/sk-ant-[\w-]{10,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY/.test(added)) warnings.push('The change contains something that looks like an API key.');
      if (/[\w.+-]+@(gmail|outlook|hotmail|yahoo|icloud)\.com/i.test(added)) warnings.push('The change contains an email address.');
      this.set(id, {status: 'review', phase: null, summary: short(out.text, 600), report: String(out.text).slice(0, 4000), files, stat, diffFile, warnings, builtAt: Date.now()});
      this.say(`The build for "${short(idea.title, 60)}" is ready for you to review, ${this.addr()}.`);
      this.notify('Ready to review', `${idea.title}: ${stat}`);
    } catch (e) {
      await this.cleanup({worktree: wt, branch, repo}).catch(() => {});
      throw e;
    } finally { this.building = null; }
  }
  async checkSyntax(wt, base) {
    const names = (await git(wt, ['diff', '--name-only', '--diff-filter=AM', base, 'HEAD'])).trim().split(/\r?\n/).filter(Boolean);
    const errors = [];
    for (const n of names) {
      const f = path.join(wt, n);
      if (/\.json$/i.test(n)) { try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { errors.push(`${n}: ${e.message}`); } continue; }
      if (!/\.(c|m)?js$/i.test(n)) continue;
      // the app's own runtime doubles as Node for the check
      const err = await new Promise(r => execFile(process.execPath, ['--check', f], {cwd: wt, windowsHide: true, timeout: 30000, env: {...process.env, ELECTRON_RUN_AS_NODE: '1'}}, (e, _o, se) => r(e ? String(se || e.message).trim() : '')));
      if (err) errors.push(`${n}:\n${err.split(/\r?\n/).slice(0, 6).join('\n')}`);
    }
    return errors;
  }
  async merge(id) {
    const idea = this.get(id), a = idea.assist;
    const repo = a.repo || this.sourceRepo();
    try { await git(repo, ['merge', '--no-ff', '--no-edit', '-m', `Merge idea: ${short(idea.title, 70)}`, a.branch]); }
    catch (e) {
      await git(repo, ['merge', '--abort']).catch(() => {});
      throw Error(`Could not merge into your source folder (${short(e.message, 200)}). If you have unsaved changes there, commit or undo them and press Merge again.`);
    }
    await this.cleanup(a).catch(e => this.log('ideas', e.message));
    this.set(id, {status: 'done', result: 'Merged into your JARVIS source folder. It goes live with the next update.', mergedAt: Date.now(), worktree: null});
    const i = this.get(id); this.ideas().save({...i, stage: i.stage === 'done' ? 'done' : 'testing', progress: Math.max(i.progress, 80)});
    this.say(`Merged, ${this.addr()}. "${short(idea.title, 60)}" goes live with the next update.`);
    return this.list();
  }
  async cleanup({worktree, branch, repo}) {
    repo = repo || this.sourceRepo();
    if (worktree && repo) await git(repo, ['worktree', 'remove', '--force', worktree]).catch(() => {});
    if (worktree) try { fs.rmSync(worktree, {recursive: true, force: true}); } catch {}
    if (repo) await git(repo, ['worktree', 'prune']).catch(() => {});
    if (branch && repo) await git(repo, ['branch', '-D', branch]).catch(() => {});
  }

  /* ---------------- tower runs and the night shift ---------------- */
  towerFinished(run) {
    const idea = this.list().find(i => i.assist?.runId === run.id && i.assist.status === 'working'); if (!idea) return;
    if(run.rehearsal){this.set(idea.id,{status:'failed',phase:null,error:'This was a rehearsal, not a completed result. Connect an AI engine and run the task again.'});return;}
    if (run.status === 'done') this.set(idea.id, {status: 'done', phase: null, result: `${run.floorName} finished "${run.title}".`, resultFile: run.final || null});
    else this.set(idea.id, {status: 'failed', phase: null, error: run.status === 'budget' ? 'The agents stopped at the floor\'s budget cap.' : run.status === 'stopped' ? 'The run was stopped.' : (run.notes || run.note || run.error || 'The run hit a problem.')});
  }
  /** Between 1 and 5 am, once a night: up to three ideas that haven't moved in three days get a drafted plan. */
  async night(lastNight, markNight) {
    const now = new Date(), h = now.getHours(), day = now.toDateString();
    if (!this.config().nightly || h < 1 || h >= 5 || lastNight() === day) return 0;
    markNight(day);
    if (!this.readKey() && !(await this.detect()).ready) return 0;
    const quiet = this.list().filter(i => !i.origin && i.stage !== 'done' && !BUSY.includes(i.assist?.status) && !WAITING.includes(i.assist?.status)
      && Date.now() - i.updated > 3 * DAY && Date.now() - (i.assist?.updatedAt || 0) > 3 * DAY).sort((a, b) => a.updated - b.updated).slice(0, 3);
    for (const i of quiet) { try { await this.think(i.id, {source: 'night'}); } catch (e) { this.log('ideas', e.message); } }
    return quiet.length;
  }
}
