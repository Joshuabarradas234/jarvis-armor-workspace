/**
 * The window helper for desktop hand control (scripts/windows/winctl.ps1): one PowerShell process kept running while
 * hand control is on, so finding and moving a window takes a millisecond or two instead of a new PowerShell each time.
 * at(x, y) finds the window under a point; move(handle, rect), max(handle), restore(handle). Physical pixels.
 */
import {spawn} from 'node:child_process';
import path from 'node:path';

export class WinControl {
  constructor({scripts, skipPid = process.pid, log = () => {}, spawnImpl = spawn, timeout = 4000}) {
    Object.assign(this, {scripts, skipPid, log, spawnImpl, timeout});
    this.child = null; this.ready = null; this.waits = new Map(); this.n = 0;
  }
  start() {
    if (this.ready) return this.ready;
    const child = this.child = this.spawnImpl('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(this.scripts, 'winctl.ps1'), '-Skip', String(this.skipPid)], {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
    this.ready = new Promise((resolve, reject) => {
      let buf = '';
      child.stdout.on('data', d => {
        buf += d; let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (!line) continue;
          let m; try { m = JSON.parse(line); } catch { continue; }
          if ('ready' in m) { if (m.ready) resolve(); else reject(Error(m.error || 'The window helper could not start.')); continue; }
          const w = this.waits.get(m.id); if (w) { this.waits.delete(m.id); w(m); }
        }
      });
      child.stderr.on('data', d => this.log(String(d).slice(0, 300)));
      child.on('error', e => { reject(e); if (this.child === child) this.reset(e.message); });
      child.on('exit', () => { reject(Error('The window helper stopped.')); if (this.child === child) this.reset('The window helper stopped.'); });   // an old helper that was replaced leaves the new one alone
    });
    this.ready.catch(() => {});
    return this.ready;
  }
  reset(why) { this.child = null; this.ready = null; for (const [, w] of this.waits) w({ok: false, error: why}); this.waits.clear(); }
  async call(cmd, args = {}) {
    await this.start();
    const id = ++this.n, child = this.child;
    return new Promise(resolve => {
      const t = setTimeout(() => { if (this.waits.delete(id)) resolve({ok: false, error: 'The window helper did not answer.'}); }, this.timeout);
      this.waits.set(id, m => { clearTimeout(t); resolve(m); });
      try { child.stdin.write(JSON.stringify({id, cmd, ...args}) + '\n'); } catch (e) { this.waits.delete(id); clearTimeout(t); resolve({ok: false, error: e.message}); }
    });
  }
  at(x, y) { return this.call('at', {x: Math.round(x), y: Math.round(y)}); }
  move(handle, r) { return this.call('move', {handle, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h)}); }
  max(handle) { return this.call('max', {handle}); }
  restore(handle) { return this.call('restore', {handle}); }
  stop() { const c = this.child; this.reset('Hand control was switched off.'); try { c?.stdin.end(); c?.kill(); } catch {} }
}
