/**
 * JARVIS Core — phone calls.
 *
 * JARVIS rings you through Twilio and speaks: the wake-up call, the overnight report, anything urgent.
 * Calls are one-way: JARVIS talks, and you answer on WhatsApp ("YES 12", "call me in 5", "is anyone mad?").
 * (Talking back on the call itself would need a public link from the internet into this computer, which is
 * not switched on.) If you don't pick up, JARVIS tries again as the standing orders say, then sends the
 * report to WhatsApp instead.
 */
import crypto from 'node:crypto';
import {speakableText} from './util.js';

export class CallDesk {
  /** hooks: ended(session, outcome) with outcome 'answered' | 'voicemail' | 'missed' | 'failed' */
  constructor({phone, hooks, log}) {
    Object.assign(this, {phone, hooks: hooks || {}, log: log || (() => {})});
    this.sessions = new Map();
  }
  active() { return [...this.sessions.values()].filter(s => !s.final); }
  get(id) { return this.sessions.get(id); }
  /**
   * Ring you and say `text`. purpose: 'report' | 'wake' | 'approval' | 'alert' | 'chat' | 'test'.
   * Anything else passed in (reportId, attempt, retries, gap, alarmId, jobId) is kept on the session for the retry logic.
   */
  async ring({purpose = 'report', text, ...extra}) {
    const s = {id: crypto.randomBytes(9).toString('base64url'), purpose, text: speakableText(text), createdAt: Date.now(), status: 'queued', final: false, outcome: '', attempt: 1, ...extra};
    this.sessions.set(s.id, s);
    for (const [k, v] of this.sessions) if (v.final && Date.now() - v.createdAt > 6 * 3600e3) this.sessions.delete(k);
    try {
      const r = await this.phone.call({twiml: this.phone.oneWay(s.text)});
      s.sid = r.sid; s.status = r.status;
      this.log('calls', `Calling you (${purpose}${s.attempt > 1 ? `, try ${s.attempt}` : ''})`);
    } catch (e) { s.final = true; s.outcome = 'failed'; s.error = e.message; this.hooks.ended?.(s, 'failed'); throw e; }
    this.follow(s).catch(e => { this.log('calls', e.message); this.finish(s, 'failed'); });
    return s;
  }
  /** Nobody tells us how a one-way call went, so watch it until it ends. */
  async follow(s) {
    const info = await this.phone.waitCall(s.sid, 6 * 60000);
    s.status = info.status; s.answeredBy = info.answeredBy || ''; s.duration = info.duration || 0;
    const machine = /^machine|^fax/.test(s.answeredBy);
    const outcome = info.status === 'completed' ? (machine ? 'voicemail' : s.duration > 3 ? 'answered' : 'missed') : info.status === 'in-progress' ? 'answered' : info.status === 'unknown' ? 'failed' : 'missed';   // still talking after six minutes: answered
    this.finish(s, outcome);
  }
  finish(s, outcome) {
    if (s.final) return; s.final = true; s.outcome = outcome;
    this.log('calls', `Call ${outcome}`);
    try { this.hooks.ended?.(s, outcome); } catch (e) { this.log('calls', e.message); }
  }
}
