import fs from 'node:fs';
import path from 'node:path';
import {execFile, execFileSync} from 'node:child_process';

/**
 * Windows wakes a sleeping PC for a scheduled task marked "wake the computer to run this task". JARVIS keeps one
 * such task, "JARVIS wake-up", set two minutes before his next call, message or report. It starts JARVIS with
 * --jarvis-wake, which the running JARVIS takes as "look at the clock now" (the second copy closes at once).
 * The task lives in your own account (no administrator rights), and JARVIS removes it when he quits.
 */
export const TASK = 'JARVIS wake-up';
export const WAKE_ARG = '--jarvis-wake';
const xmlEsc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** Task Scheduler reads a start time without a zone as this PC's local time. */
export function localStamp(at) { const d = new Date(at), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
export function wakeTaskXml(at, exe) {
  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Wakes this PC so JARVIS can make your scheduled call, message or report. JARVIS moves or removes this task himself.</Description></RegistrationInfo>
  <Triggers><TimeTrigger><StartBoundary>${localStamp(at)}</StartBoundary><Enabled>true</Enabled></TimeTrigger></Triggers>
  <Principals><Principal id="Author"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>false</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <IdleSettings><StopOnIdleEnd>false</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings>
    <AllowStartOnDemand>true</AllowStartOnDemand>
    <Enabled>true</Enabled>
    <Hidden>false</Hidden>
    <RunOnlyIfIdle>false</RunOnlyIfIdle>
    <WakeToRun>true</WakeToRun>
    <ExecutionTimeLimit>PT5M</ExecutionTimeLimit>
    <Priority>7</Priority>
  </Settings>
  <Actions Context="Author"><Exec><Command>${xmlEsc(exe)}</Command><Arguments>${WAKE_ARG}</Arguments></Exec></Actions>
</Task>
`;
}
/** "Allow wake timers" in the power plan, from powercfg: off, on, or important only (which does not cover this task). */
export function parseWakeTimers(out) {
  const idx = k => { const m = new RegExp(`Current ${k} Power Setting Index:\\s*0x([0-9a-f]+)`, 'i').exec(String(out || '')); return m ? parseInt(m[1], 16) : null; };
  const name = v => v === 0 ? 'off' : v === 1 ? 'on' : v === 2 ? 'important only' : 'unknown';
  return {mains: name(idx('AC')), battery: name(idx('DC'))};
}
const run = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, {windowsHide: true, timeout: 20000}, (e, out, err) => e ? reject(Error(String(err || e.message).trim().split(/\r?\n/).pop() || e.message)) : resolve(String(out))));

export class WakeTimer {
  constructor({exe = process.execPath, dir, platform = process.platform, exec = run, execSync = execFileSync} = {}) { Object.assign(this, {exe, dir, platform, exec, execSync}); this.at = null; }
  get available() { return this.platform === 'win32'; }
  /** Wake the PC at `at` (ms), or remove the task when `at` is empty. */
  async set(at) {
    if (!this.available) return false;
    if (!at) return this.clear();
    const file = path.join(this.dir, 'wake-task.xml');
    fs.writeFileSync(file, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(wakeTaskXml(at, this.exe), 'utf16le')]));   // schtasks wants UTF-16 with a byte-order mark
    this.pending = true;
    try { await this.exec('schtasks.exe', ['/Create', '/F', '/TN', TASK, '/XML', file]); } finally { fs.rmSync(file, {force: true}); this.pending = false; }
    this.at = at; return true;
  }
  async clear() {
    if (!this.available) return false;
    try { await this.exec('schtasks.exe', ['/Delete', '/F', '/TN', TASK]); } catch (e) { if (!/cannot find|does not exist/i.test(e.message)) throw e; }
    this.at = null; return true;
  }
  /** When JARVIS quits: remove the task straight away, so a closed JARVIS never wakes the PC. */
  clearNow() {
    if (!this.available || (this.at === null && !this.pending)) return;
    if (this.pending) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);   // quitting while the task is being made: let schtasks finish, then remove it
    try { this.execSync('schtasks.exe', ['/Delete', '/F', '/TN', TASK], {windowsHide: true, timeout: 5000, stdio: 'ignore'}); } catch {}
    this.at = null;
  }
  async timers() { if (!this.available) return null; return parseWakeTimers(await this.exec('powercfg.exe', ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'RTCWAKE'])); }
}
