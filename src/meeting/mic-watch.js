/**
 * Noticing calls: Windows keeps a record of which apps use the microphone and when they let go of it (the privacy
 * record behind the microphone icon in the taskbar). When a call app such as Teams, Zoom or WhatsApp picks up the
 * microphone, JARVIS offers to record; when the app you are recording lets go of it, the call is over and the meeting
 * can end by itself, which is how a WhatsApp call's end is noticed. JARVIS's own listening is ignored. Reading the
 * record takes a tenth of a second with Windows' reg tool; nothing is installed and nothing is recorded by this.
 */
import {execFile} from 'node:child_process';

export const KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone';
// the apps that count as calls, and the name JARVIS uses for each
export const CALL_APPS = [[/MSTeams|Teams\.exe$|ms-teams/i, 'Teams'], [/zoom/i, 'Zoom'], [/WhatsApp/i, 'WhatsApp'], [/Skype/i, 'Skype'], [/Discord/i, 'Discord'],
  [/slack/i, 'Slack'], [/webex|CiscoCollab|atmgr/i, 'Webex'], [/Telegram/i, 'Telegram'], [/Signal/i, 'Signal'], [/YourPhone|PhoneExperienceHost|Phone ?Link/i, 'Phone Link'],
  [/chrome\.exe$|msedge\.exe$|firefox\.exe$|brave\.exe$|opera\.exe$|vivaldi\.exe$/i, 'your browser']];
const OWN = /(powershell|pwsh|SpeechRuntime|JARVIS Armor Workspace|electron)\.exe$/i;   // JARVIS listening for "Jarvis" or recording the meeting itself
export const callName = app => CALL_APPS.find(([re]) => re.test(app))?.[1] || '';

/** The microphone record as `reg query /s` prints it: [{app, start, stop}], stop 0 while the app is using it. */
export function parseMic(text) {
  const out = []; let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (/^HKEY_/i.test(line)) {
      const leaf = line.split('\\').pop(); cur = null;
      if (/\\microphone$/i.test(line) || /\\NonPackaged$/i.test(line)) continue;
      cur = {app: leaf.replace(/#/g, '\\'), start: 0, stop: null}; out.push(cur); continue;
    }
    const m = /^\s+(LastUsedTimeStart|LastUsedTimeStop)\s+REG_QWORD\s+0x([0-9a-f]+)/i.exec(line);
    if (m && cur) cur[m[1] === 'LastUsedTimeStart' ? 'start' : 'stop'] = parseInt(m[2], 16);
  }
  return out.filter(r => r.start > 0);
}
/** Call apps using the microphone right now: [{app, name}]. */
export function callsNow(rows) {
  return rows.filter(r => r.stop === 0 && !OWN.test(r.app)).map(r => ({app: r.app, name: callName(r.app)})).filter(r => r.name);
}

export class MicWatch {
  /**
   * read() -> the reg output; onCall({app, name}) when a call app picks up the microphone; onHangUp({app, name}) when
   * the app being followed has let go of it for `grace` ms. follow(app) starts following one app (the call being
   * recorded); follow(null) stops.
   */
  constructor({read = readMic, onCall = () => {}, onHangUp = () => {}, log = () => {}, now = () => Date.now(), every = 4000, grace = 20000}) {
    Object.assign(this, {read, onCall, onHangUp, log, now, every, grace});
    this.seen = new Map(); this.live = []; this.followed = null; this.goneAt = 0; this.timer = null; this.busy = false; this.first = true;
  }
  start() { if (this.timer) return; this.timer = setInterval(() => this.tick().catch(e => this.log(e.message)), this.every); this.tick().catch(e => this.log(e.message)); }
  stop() { clearInterval(this.timer); this.timer = null; this.seen.clear(); this.live = []; this.first = true; }
  follow(app) { this.followed = app || null; this.goneAt = 0; }
  async tick() {
    if (this.busy) return; this.busy = true;
    try {
      const now = this.now(), calls = callsNow(parseMic(await this.read())), live = new Set(calls.map(c => c.app)); this.live = calls;
      for (const c of calls) {
        const s = this.seen.get(c.app);
        if (!s) this.seen.set(c.app, {since: now, told: this.first});   // already in a call when JARVIS started: no offer for that one
        else if (!s.told && now - s.since >= this.every) { s.told = true; this.onCall(c); }   // seen twice in a row, so not a blip
      }
      for (const app of [...this.seen.keys()]) if (!live.has(app)) this.seen.delete(app);
      this.first = false;
      if (this.followed) {
        if (live.has(this.followed)) this.goneAt = 0;
        else if (!this.goneAt) this.goneAt = now;
        else if (now - this.goneAt >= this.grace) { const app = this.followed; this.followed = null; this.goneAt = 0; this.onHangUp({app, name: callName(app)}); }
      }
    } finally { this.busy = false; }
  }
}
export function readMic() {
  return new Promise((resolve, reject) => execFile('reg.exe', ['query', KEY, '/s'], {windowsHide: true, timeout: 4000, maxBuffer: 1 << 20}, (e, out) => e ? reject(e) : resolve(String(out))));
}
