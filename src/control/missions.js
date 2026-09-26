import fs from 'node:fs';
import path from 'node:path';

const MAX_TASKS = 24;
const MAX_LOG = 40;
const STATES = ['idle', 'planned', 'running', 'blocked', 'done'];

/** One bay's objective, its task list, and whatever its agent last reported. */
function blank(id) {
  return { id, objective: '', status: 'idle', progress: 0, tasks: [], agent: '', env: '', log: [], startedAt: null, endedAt: null };
}

function clean(patch, prev) {
  const next = { ...prev };
  if (patch.objective !== undefined) {
    if (typeof patch.objective !== 'string' || patch.objective.length > 400) throw Error('Objective must be text under 400 characters.');
    next.objective = patch.objective;
  }
  if (patch.status !== undefined) {
    if (!STATES.includes(patch.status)) throw Error(`Status must be one of ${STATES.join(', ')}.`);
    next.status = patch.status;
  }
  if (patch.progress !== undefined) {
    const n = Number(patch.progress);
    if (!Number.isFinite(n) || n < 0 || n > 100) throw Error('Progress must be between 0 and 100.');
    next.progress = Math.round(n);
  }
  if (patch.agent !== undefined) {
    if (typeof patch.agent !== 'string' || patch.agent.length > 1024) throw Error('Agent command must be text under 1024 characters.');
    next.agent = patch.agent.trim();
  }
  if (patch.env !== undefined) {
    if (typeof patch.env !== 'string' || patch.env.length > 2048) throw Error('Environment must be text under 2048 characters.');
    for (const line of patch.env.split(/\r?\n/)) {
      const t = line.trim();
      if (t && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) throw Error(`Each line must read NAME=value — "${t.slice(0, 40)}" does not.`);
    }
    next.env = patch.env;
  }
  if (patch.tasks !== undefined) {
    if (!Array.isArray(patch.tasks) || patch.tasks.length > MAX_TASKS) throw Error(`Up to ${MAX_TASKS} tasks per bay.`);
    next.tasks = patch.tasks.map(t => {
      if (!t || typeof t.text !== 'string' || !t.text.trim() || t.text.length > 160) throw Error('Each task needs text under 160 characters.');
      return { text: t.text.trim(), done: !!t.done };
    });
  }
  return next;
}

export class MissionStore {
  constructor({ dir }) {
    this.file = path.join(dir, 'missions.json');
    this.data = {};
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (raw && typeof raw === 'object') this.data = raw;
    } catch { /* first run, or unreadable: start empty */ }
  }

  key(theme, id) { return `${theme}:${id}`; }

  /**
   * A bay's mission, always in full shape. Records written by older builds can be
   * missing fields; one of those used to throw and take the whole control deck
   * down with it, so anything unreadable falls back to the blank value.
   */
  get(theme, id) {
    const raw = this.data[this.key(theme, id)];
    if (!raw || typeof raw !== 'object') return blank(id);
    const base = blank(id);
    const n = Number(raw.progress);
    return {
      ...base, ...raw, id,
      objective: typeof raw.objective === 'string' ? raw.objective : base.objective,
      status: STATES.includes(raw.status) ? raw.status : base.status,
      progress: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : base.progress,
      agent: typeof raw.agent === 'string' ? raw.agent : base.agent,
      env: typeof raw.env === 'string' ? raw.env : base.env,
      tasks: Array.isArray(raw.tasks)
        ? raw.tasks.filter(t => t && typeof t.text === 'string').map(t => ({ text: t.text, done: !!t.done }))
        : base.tasks,
      log: Array.isArray(raw.log) ? raw.log.filter(l => l && typeof l.line === 'string') : base.log,
      startedAt: Number.isFinite(Number(raw.startedAt)) ? Number(raw.startedAt) : null,
      endedAt: Number.isFinite(Number(raw.endedAt)) ? Number(raw.endedAt) : null,
    };
  }

  /** Every bay of a hall, in the order the hall lists them, with its mission attached. */
  board(theme, modules) {
    return modules.map(m => {
      const s = this.get(theme, m.id);
      const done = s.tasks.filter(t => t.done).length;
      return {
        id: m.id, index: m.index, name: m.name, isVehicle: !!m.isVehicle,
        objective: s.objective, status: s.status, agent: s.agent, env: s.env || '',
        progress: s.tasks.length ? Math.round(done / s.tasks.length * 100) : s.progress,
        tasks: s.tasks, tasksDone: done, tasksTotal: s.tasks.length,
        log: s.log.slice(-8), startedAt: s.startedAt, endedAt: s.endedAt
      };
    });
  }

  set(theme, id, patch) {
    const next = clean(patch, this.get(theme, id));
    this.data[this.key(theme, id)] = next;
    this.persist();
    return next;
  }

  /** Called by the runner as an agent reports in. */
  note(theme, id, line) {
    const s = this.get(theme, id);
    s.log = [...s.log, { at: Date.now(), line: String(line).slice(0, 300) }].slice(-MAX_LOG);
    this.data[this.key(theme, id)] = s;
    this.persist();
    return s;
  }

  // saves are grouped (at most every half second), and written to a spare file first so a crash mid-save loses nothing
  persist() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => { this.saveTimer = null; this.flush(); }, 500);
  }
  flush() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2)); fs.renameSync(tmp, this.file);
    } catch { /* a failed save must never take the app down */ }
  }
}

export { STATES };
