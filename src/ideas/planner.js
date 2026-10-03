import path from 'node:path';
import crypto from 'node:crypto';
import {readJson, writeJson} from '../brain/util.js';

/**
 * Brainstorming and project plans in the Ideas room. JARVIS only writes text here: nothing is sent, bought or
 * started. A plan lives on its idea (idea.project); the last ten brainstorms are kept in ideas-brainstorms.json.
 *   brainstorm({topic, about, answers, from})  questions that would sharpen it, and six project ideas
 *   adopt({session, index})                    one of those ideas becomes a card in the room
 *   plan(id, feedback)                         goal, phases, steps (who, time, cost), risks, the first actions
 *   howTo(id, stepId)                          one step explained in detail: how to do it, tips, mistakes to avoid
 *   step(id, stepId, done)                     ticks a step; the idea's progress follows the plan
 *   toTodos(id, stepIds)                       copies steps into your to-dos
 *   queueNight(id, stepId, {floorId, now})     hands a step to a Tower floor tonight (01:00-05:00), or now;
 *                                              the floor's own budget applies and its draft comes back to the step
 */
const line = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const block = (v, n) => String(v ?? '').replace(/\r/g, '').trim().slice(0, n);
const list = v => Array.isArray(v) ? v : [];
const WHO = ['you', 'jarvis', 'agents'];
function parseJson(text) {
  const t = String(text || ''), a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}
export function cleanBrainstorm(j) {
  return {questions: list(j?.questions).map(q => line(q, 200)).filter(Boolean).slice(0, 3),
    ideas: list(j?.ideas).map(i => ({title: line(i?.title, 100), pitch: line(i?.pitch, 300), why: line(i?.why, 400), first: line(i?.first, 300),
      effort: ['small', 'medium', 'large'].includes(i?.effort) ? i.effort : 'medium', cost: line(i?.cost, 60), time: line(i?.time, 60)})).filter(i => i.title).slice(0, 8)};
}
/** A plan from Claude, made safe to keep. Steps you had already ticked (or had explained) stay so when they come back. */
export function cleanPlan(j, old) {
  const before = new Map((old?.phases || []).flatMap(p => p.steps).map(s => [s.title.toLowerCase(), s]));
  const phases = list(j?.phases).slice(0, 6).map((p, pi) => ({id: `p${pi + 1}`, name: line(p?.name, 80) || `Phase ${pi + 1}`, why: line(p?.why, 300),
    steps: list(p?.steps).slice(0, 8).map((s, si) => {
      const title = line(s?.title, 140), prev = before.get(title.toLowerCase());
      return {id: `p${pi + 1}s${si + 1}`, title, detail: block(s?.detail, 700), who: WHO.includes(s?.who) ? s.who : 'you', time: line(s?.time, 80), cost: line(s?.cost, 80),
        done: !!prev?.done, doneAt: prev?.doneAt || 0, howTo: prev?.howTo || '', todo: !!prev?.todo, night: prev?.night || null};
    }).filter(s => s.title)})).filter(p => p.steps.length);
  return {goal: line(j?.goal, 300), finished: line(j?.finished, 400), phases,
    risks: list(j?.risks).slice(0, 6).map(r => ({risk: line(r?.risk, 200), fix: line(r?.fix, 300)})).filter(r => r.risk),
    needs: list(j?.needs).map(x => line(x, 120)).filter(Boolean).slice(0, 10),
    total: {time: line(j?.total?.time, 140), cost: line(j?.total?.cost, 140)},
    thisWeek: list(j?.thisWeek).map(x => line(x, 200)).filter(Boolean).slice(0, 5),
    questions: list(j?.questions).map(x => line(x, 200)).filter(Boolean).slice(0, 4)};
}
export const stepsOf = project => (project?.phases || []).flatMap(p => p.steps);
export function progressOf(project) { const all = stepsOf(project); return all.length ? Math.round(all.filter(s => s.done).length / all.length * 100) : 0; }
const planText = p => p.phases.map(ph => `${ph.name}:\n${ph.steps.map(s => `- ${s.done ? '[done] ' : ''}${s.title}`).join('\n')}`).join('\n');

export class IdeaPlanner {
  /** `assistant` is the IdeaAssistant (it holds the ideas store and asks Claude); `todos` is a getter for your to-do list. */
  constructor({assistant, todos, dir, runner = () => null, tower = () => null, activeTheme = () => ''}) { Object.assign(this, {assistant, todos, runner, tower, activeTheme}); this.file = path.join(dir, 'ideas-brainstorms.json'); this.busy = new Set(); this.nightBusy = false; }
  ideas() { return this.assistant.ideas(); }
  sessions() { const s = readJson(this.file, []); return Array.isArray(s) ? s.filter(x => x && typeof x.id === 'string' && Array.isArray(x.ideas)) : []; }
  claim(key, what) { if (this.busy.has(key)) throw Error(`JARVIS is already ${what}.`); this.busy.add(key); return () => this.busy.delete(key); }

  async brainstorm({topic, about = '', answers = '', from = ''} = {}) {
    topic = block(topic, 1500); if (topic.length < 3) throw Error('Say what you would like to brainstorm.');
    const done = this.claim('brainstorm', 'brainstorming');
    try {
      const prev = from ? this.sessions().find(s => s.id === from) : null, room = this.assistant.list().map(i => i.title).slice(0, 40);
      const system = 'You are JARVIS, helping the owner brainstorm projects. Suggest varied, concrete projects that one person could really start, using what the owner says about their time, money and skills. Mix quick wins with bigger bets. Never invent facts or statistics; where something needs checking (prices, demand, rules), say so. British English.';
      const prompt = `WHAT THE OWNER WANTS TO BRAINSTORM:\n"""${topic}"""\n` +
        (about ? `\nABOUT THE OWNER (time, money, skills, what matters):\n"""${block(about, 1500)}"""\n` : '') +
        (prev ? `\nIDEAS ALREADY SUGGESTED IN THIS SESSION (suggest different ones):\n${prev.ideas.map(i => '- ' + i.title).join('\n')}\n` : '') +
        (answers ? `\nTHE OWNER'S ANSWERS TO YOUR QUESTIONS:\n"""${block(answers, 2000)}"""\n` : '') +
        (room.length ? `\nIDEAS ALREADY IN THE ROOM (avoid duplicates):\n${room.map(t => '- ' + t).join('\n')}\n` : '') +
        '\nReply with JSON only:\n{"questions":["up to 3 short questions whose answers would sharpen these ideas"],"ideas":[{"title":"short name","pitch":"one sentence: what it is","why":"why it could work for this owner","first":"the very first step, doable this week","effort":"small|medium|large","cost":"rough cost to start, or free","time":"rough time to a first result"}]}\nGive six ideas.';
      const j = cleanBrainstorm(parseJson(await this.assistant.ask(system, prompt, {maxTokens: 3500, kind: 'ideas brainstorm'})));
      if (!j.ideas.length) throw Error('Claude did not return any ideas. Try again, or say a little more about what you want.');
      const s = {id: crypto.randomUUID(), at: Date.now(), topic, about: block(about, 1500), answers: block(answers, 2000), from: prev?.id || '', ...j, adopted: []};
      writeJson(this.file, [s, ...this.sessions()].slice(0, 10), 1);
      return s;
    } finally { done(); }
  }
  adopt({session, index} = {}) {
    const all = this.sessions(), s = all.find(x => x.id === session), i = s?.ideas[Number(index)];
    if (!i) throw Error('That brainstorm idea is no longer there.');
    const notes = `${i.pitch}\n\nWhy it could work: ${i.why}\nFirst step: ${i.first}\nEffort: ${i.effort} · cost to start: ${i.cost || 'unknown'} · first result: ${i.time || 'unknown'}\n\nFrom a brainstorm: ${line(s.topic, 200)}`;
    const before = new Set(this.ideas().list().map(x => x.id));
    this.ideas().save({title: i.title, stage: 'spark', progress: 0, notes, x: 12 + Math.random() * 70, y: 18 + Math.random() * 58});
    const made = this.ideas().list().find(x => !before.has(x.id));
    s.adopted = [...new Set([...(s.adopted || []), Number(index)])]; writeJson(this.file, all, 1);
    this.assistant.changed(); return {id: made?.id || '', session: s};
  }

  async plan(id, feedback = '') {
    const idea = this.assistant.get(id), done = this.claim(id, 'planning this idea');
    try {
      const old = idea.project;
      const system = 'You are JARVIS, a practical project planner. Turn the idea into a plan one person can follow from start to finish: phases in order, and in each phase concrete steps small enough to do in one sitting. For every step say who does it: "you" (the owner), "jarvis" (JARVIS can research or draft it for the owner to check) or "agents" (the AI agent tower could produce it). Give honest rough time and cost estimates, and say when something is a guess. Point out what could go wrong and how to avoid it. Never invent facts, prices, laws or statistics. British English.';
      const prompt = `IDEA: ${idea.title}\nSTAGE: ${idea.stage}, ${idea.progress}% along\nNOTES:\n"""${block(idea.notes, 4000) || '(none)'}"""\n\n${this.assistant.context(idea)}\n` +
        (idea.assist?.plan ? `\nJARVIS'S EARLIER PROPOSAL:\n${block(idea.assist.plan, 3000)}\n` : '') +
        (old ? `\nTHE CURRENT PLAN (keep what works, and keep finished steps under the same titles):\n${planText(old)}\n` : '') +
        (feedback ? `\nTHE OWNER'S FEEDBACK:\n"""${block(feedback, 2000)}"""\n` : '') +
        '\nReply with JSON only:\n{"goal":"one sentence","finished":"what done looks like","phases":[{"name":"short name","why":"what this phase achieves","steps":[{"title":"short action","detail":"what exactly to do, in two or three sentences","who":"you|jarvis|agents","time":"rough time","cost":"rough cost, or none"}]}],"risks":[{"risk":"what could go wrong","fix":"how to avoid or handle it"}],"needs":["tools, accounts, skills or money needed"],"total":{"time":"rough total","cost":"rough total"},"thisWeek":["the first three actions, taken from the steps"],"questions":["anything the owner should decide first"]}\nUse three to six phases with two to six steps each.';
      const project = {...cleanPlan(parseJson(await this.assistant.ask(system, prompt, {maxTokens: 7000, kind: 'ideas plan'})), old), at: Date.now(), feedback: block(feedback, 2000)};
      if (!project.phases.length) throw Error('Claude did not return a usable plan. Try again.');
      this.ideas().setProject(id, project);
      const now = this.assistant.get(id);
      this.ideas().save({...now, stage: now.stage === 'spark' ? 'designing' : now.stage, progress: stepsOf(project).some(s => s.done) ? progressOf(project) : now.progress});
      this.assistant.changed(); return this.assistant.get(id);
    } finally { done(); }
  }
  find(id, stepId) {
    const idea = this.assistant.get(id), project = idea.project; if (!project) throw Error('Plan this idea first.');
    const phase = project.phases.find(p => p.steps.some(s => s.id === stepId)), step = phase?.steps.find(s => s.id === stepId);
    if (!step) throw Error('That step is not in the plan any more.');
    return {idea, project, phase, step};
  }
  async howTo(id, stepId, {again = false} = {}) {
    const {idea, project, phase, step} = this.find(id, stepId);
    if (step.howTo && !again) return step;
    const done = this.claim(`${id}:${stepId}`, 'explaining this step');
    try {
      const all = stepsOf(project), at = all.indexOf(step);
      const system = 'You explain exactly how to do one step of a project, for someone doing it for the first time. Be practical: what to prepare, numbered actions, which kinds of tools or services help (name only well-known ones, and say to check current prices), mistakes to avoid, and how to know the step is done. Never invent facts, prices or laws. British English, Markdown, under 450 words.';
      const prompt = `PROJECT: ${idea.title}\nGOAL: ${project.goal}\nPHASE: ${phase.name} (${phase.why})\nTHE STEP: ${step.title}\n${step.detail}\nWho does it: ${step.who}. Rough time: ${step.time || 'unknown'}.\n` +
        `\nTHE STEP BEFORE: ${all[at - 1]?.title || '(none, this is the first)'}\nTHE STEP AFTER: ${all[at + 1]?.title || '(none, this is the last)'}\nNOTES ON THE IDEA:\n"""${block(idea.notes, 1500) || '(none)'}"""\n\nExplain how to do this step.`;
      const text = block(await this.assistant.ask(system, prompt, {maxTokens: 2000, kind: 'ideas how-to'}), 6000);
      if (!text) throw Error('Claude did not explain it. Try again.');
      const fresh = this.find(id, stepId); fresh.step.howTo = text;   // the plan may have been ticked meanwhile
      this.ideas().setProject(id, fresh.project); this.assistant.changed(); return fresh.step;
    } finally { done(); }
  }
  step(id, stepId, done) {
    const {idea, project, step} = this.find(id, stepId);
    step.done = !!done; step.doneAt = done ? Date.now() : 0;
    this.ideas().setProject(id, project);
    const progress = progressOf(project), order = ['spark', 'designing', 'building', 'testing', 'done'];
    const stage = progress > 0 && order.indexOf(idea.stage) < order.indexOf('building') ? 'building' : idea.stage;
    this.ideas().save({...this.assistant.get(id), progress, stage});
    this.assistant.changed(); return this.assistant.get(id);
  }
  toTodos(id, stepIds) {
    const idea = this.assistant.get(id), project = idea.project; if (!project) throw Error('Plan this idea first.');
    const wanted = new Set(list(stepIds)), steps = stepsOf(project).filter(s => wanted.has(s.id) && !s.done);
    if (!steps.length) throw Error('Choose a step that is not done yet.');
    const name = line(idea.title, 40);
    for (const s of steps) { this.todos().add(line(`${s.title} (${name})`, 200), {source: `idea:${id}:${s.id}`}); s.todo = true; }
    this.ideas().setProject(id, project); this.assistant.changed();
    return {added: steps.length};
  }

  /* ---------------- the night shift: plan steps the agents can do ---------------- */
  /** The hall whose Tower takes this idea's steps: the suit's hall, else the one you are in. */
  themeFor(idea) { return idea.target?.kind === 'suit' ? idea.target.theme : this.activeTheme(); }
  floors(id) { const theme = this.themeFor(this.assistant.get(id)); return {theme, floors: (this.tower()?.tower(theme).floors || []).map(f => ({id: f.id, name: f.name, number: f.number}))}; }
  queueNight(id, stepId, {floorId, now = false} = {}) {
    const {idea, project, step} = this.find(id, stepId);
    if (step.done) throw Error('That step is already done.');
    if (['queued', 'running'].includes(step.night?.status)) throw Error('That step is already with the agents.');
    const theme = this.themeFor(idea), floor = this.tower().floor(theme, String(floorId || ''));
    step.night = {status: 'queued', theme, floorId: floor.id, floorName: floor.name, at: Date.now(), runId: '', file: '', error: ''};
    this.ideas().setProject(id, project); this.assistant.changed();
    return now ? this.startStep(id, stepId) : Promise.resolve(step);
  }
  cancelNight(id, stepId) {
    const {project, step} = this.find(id, stepId);
    if (step.night?.status === 'running') throw Error('The agents have started. Stop it in the Tower if you need to.');
    step.night = null; this.ideas().setProject(id, project); this.assistant.changed(); return step;
  }
  /** The brief a floor needs, built from the plan, so the agents can start without asking. */
  briefFor(idea, project, phase, step) {
    return {task: `${step.title}\n\n${step.detail || ''}`.trim(),
      brief: {outcome: step.title, audience: `The owner, for the project “${idea.title}”`, files: 'None needed: the project notes are below.',
        constraints: 'Drafts only: never send, publish, buy, book or contact anyone. Mark anything uncertain or that needs checking.',
        finished: step.detail ? `${step.detail} Ready for the owner to check.` : `A finished draft of “${step.title}”, ready for the owner to check.`},
      input: `PROJECT: ${idea.title}\nGOAL: ${project.goal}\nPHASE: ${phase.name}${phase.why ? ` (${phase.why})` : ''}\nNOTES ON THE IDEA:\n${block(idea.notes, 3000) || '(none)'}`};
  }
  async startStep(id, stepId) {
    const {idea, project, phase, step} = this.find(id, stepId), n = step.night, b = this.briefFor(idea, project, phase, step);
    let patch;
    try {
      const run = await this.runner().start(n.theme, n.floorId, b.task, {brief: b.brief, input: b.input, title: `Plan: ${step.title}`, planStep: `${id}:${stepId}`, scheduled: true});
      patch = run.status === 'needs_brief' ? {status: 'failed', runId: run.id, error: 'The floor wants a fuller brief. Open it in the Tower.'} : {status: 'running', runId: run.id, error: ''};
    } catch (e) { patch = {status: 'failed', error: line(e.message, 200)}; }
    const fresh = this.find(id, stepId); fresh.step.night = {...fresh.step.night, ...patch};
    this.ideas().setProject(id, fresh.project); this.assistant.changed(); return fresh.step;
  }
  queued() { return this.assistant.list().flatMap(i => stepsOf(i.project).filter(s => s.night?.status === 'queued' && !s.done).map(s => ({idea: i, step: s}))); }
  /** Between 01:00 and 05:00, start the queued steps: one per floor at a time (the floor is busy until its run ends). */
  async nightShift(now = new Date()) {
    if (now.getHours() < 1 || now.getHours() >= 5 || this.nightBusy || !this.runner()) return 0;
    this.nightBusy = true; let started = 0;
    try {
      const busy = new Set([...this.runner().live.values()].map(l => `${l.run.theme}|${l.run.floorId}`));
      for (const {idea, step} of this.queued()) {
        const key = `${step.night.theme}|${step.night.floorId}`; if (busy.has(key)) continue;
        busy.add(key); const r = await this.startStep(idea.id, step.id); if (r.night?.status === 'running') started++;
      }
    } finally { this.nightBusy = false; }
    return started;
  }
  /** For JARVIS's clock: wake the PC at 01:00 when steps are waiting for the night shift. */
  upcoming(now = Date.now()) {
    const n = this.queued().length; if (!n) return [];
    const d = new Date(now); if (d.getHours() >= 1) d.setDate(d.getDate() + 1); d.setHours(1, 0, 0, 0);
    return [{at: d.getTime(), kind: 'job', what: `the agents start ${n} plan step${n === 1 ? '' : 's'}`, source: 'ideas', id: 'plan-night'}];
  }
  /** A plan step's Tower run has ended (main calls this). Its draft waits for you on the step; you tick it done. */
  runFinished(run) {
    const [id, stepId] = String(run.planStep || '').split(':'); let found;
    try { found = this.find(id, stepId); } catch { return false; }
    const {project, step} = found, n = step.night || {};
    if (run.handedTo) step.night = {...n, status: 'running', runId: run.handedTo.runId, floorName: run.handedTo.floorName};
    else step.night = {...n, runId: run.id, file: run.final || '', status: run.status === 'done' && !run.rehearsal ? 'ready' : 'failed',
      error: run.status === 'done' ? (run.rehearsal ? 'That was a rehearsal: connect an engine and try again.' : '') : run.status === 'budget' ? 'Stopped at the floor\'s budget cap. Open it in the Tower and press Continue.'
        : run.status === 'needs_changes' ? 'It failed review. Open it in the Tower to correct it.' : run.status === 'stopped' ? 'It was stopped.' : line(run.error || run.note || 'The run hit a problem.', 200)};
    this.ideas().setProject(id, project); this.assistant.changed(); return true;
  }
}
