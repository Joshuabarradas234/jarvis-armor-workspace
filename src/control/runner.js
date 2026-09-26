import { spawn } from 'node:child_process';

/**
 * Runs the command a bay has been given and watches what it prints.
 *
 * An agent reports progress by printing plain lines:
 *   PROGRESS 40          - percent complete
 *   STATUS running       - idle | planned | running | blocked | done
 *   TASK done 2          - marks task 2 finished (TASK todo 2 unmarks it)
 *   LOG anything else    - a line for the log
 * Anything else it prints is logged as-is, so an agent that knows nothing
 * about this still shows its output on the control deck.
 */
export class AgentRunner {
  constructor({ missions, onUpdate, log }) {
    this.missions = missions;
    // a chatty agent (thousands of lines a second) updates the screens at most four times a second
    const pending = new Map();
    this.onUpdate = (theme, id) => { const k = theme + ':' + id; if (pending.has(k)) return; pending.set(k, setTimeout(() => { pending.delete(k); onUpdate(theme, id); }, 250)); };
    this.onUpdateNow = onUpdate;
    this.log = log || (() => {});
    this.running = new Map();          // "theme:id" -> child process
  }

  isRunning(theme, id) { return this.running.has(`${theme}:${id}`); }

  start(theme, id, name) {
    const key = `${theme}:${id}`;
    if (this.running.has(key)) throw Error(`${name} is already running.`);
    const mission = this.missions.get(theme, id);
    if (!mission.agent) throw Error(`${name} has no agent set. Add one in Settings.`);

    // the bay's own environment, on top of the app's — so each bay can target its own account
    const env = { ...process.env };
    for (const line of String(mission.env || '').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/.exec(line);
      if (m) env[m[1]] = m[2].trim();
    }
    const child = spawn(mission.agent, { shell: true, windowsHide: true, env, detached: process.platform !== 'win32' });
    child.stoppedByUser = false;
    this.running.set(key, child);
    this.missions.set(theme, id, { status: 'running' });
    const started = this.missions.get(theme, id);
    started.startedAt = Date.now(); started.endedAt = null;
    this.missions.data[key] = started; this.missions.persist();
    this.onUpdate(theme, id);

    let buffer = '';
    const read = chunk => {
      if (child.stoppedByUser) return;                 // nothing counts once you have stopped it
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) this.handle(theme, id, line.trim());
    };
    child.stdout?.on('data', read);
    child.stderr?.on('data', read);

    child.on('error', err => {
      this.missions.note(theme, id, `could not start: ${err.message}`);
      this.missions.set(theme, id, { status: 'blocked' });
      this.running.delete(key); this.onUpdate(theme, id);
    });
    child.on('close', code => {
      this.running.delete(key);
      const s = this.missions.get(theme, id);
      if (child.stoppedByUser) this.missions.set(theme, id, { status: 'idle' });
      else if (s.status === 'running') this.missions.set(theme, id, { status: code === 0 ? 'done' : 'blocked' });
      const fin = this.missions.get(theme, id);
      fin.endedAt = Date.now();
      if (code === 0 && fin.progress < 100 && !fin.tasks.length) fin.progress = 100;
      this.missions.data[key] = fin; this.missions.persist();
      this.missions.note(theme, id, child.stoppedByUser ? 'stopped' : code === 0 ? 'finished' : `stopped with code ${code}`);
      this.onUpdate(theme, id);
    });
    return true;
  }

  handle(theme, id, line) {
    if (!line) return;
    let m;
    if ((m = /^PROGRESS\s+(\d{1,3})$/i.exec(line))) {
      this.missions.set(theme, id, { progress: Math.min(100, Number(m[1])) });
    } else if ((m = /^STATUS\s+(\w+)$/i.exec(line))) {
      try { this.missions.set(theme, id, { status: m[1].toLowerCase() }); }
      catch { this.missions.note(theme, id, line); }
    } else if ((m = /^TASK\s+(done|todo)\s+(\d{1,2})$/i.exec(line))) {
      const s = this.missions.get(theme, id);
      const i = Number(m[2]) - 1;
      if (s.tasks[i]) { s.tasks[i] = { ...s.tasks[i], done: m[1].toLowerCase() === 'done' }; this.missions.set(theme, id, { tasks: s.tasks }); }
    } else {
      this.missions.note(theme, id, line.replace(/^LOG\s+/i, ''));
    }
    this.onUpdate(theme, id);
  }

  stop(theme, id) {
    const child = this.running.get(`${theme}:${id}`);
    if (!child) return false;
    child.stoppedByUser = true;
    // stop the agent and everything it started, not just the shell that launched it
    try {
      if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      else process.kill(-child.pid, 'SIGTERM');
    } catch { try { child.kill(); } catch { /* already gone */ } }
    return true;
  }

  stopAll() { for (const [key] of this.running) { const [t, i] = key.split(':'); this.stop(t, i); } }
}
