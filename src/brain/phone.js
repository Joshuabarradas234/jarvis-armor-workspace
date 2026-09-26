/**
 * JARVIS Core — your phone. Calls, WhatsApp and text messages go through Twilio (your own account);
 * CallMeBot is a free extra route for WhatsApp messages to yourself.
 *
 *  - WhatsApp through Twilio can carry your replies back ("YES 12"), which JARVIS picks up every few seconds.
 *  - WhatsApp only lets a business number message you freely within 24 hours of your last message to it.
 *    If that window has closed, JARVIS falls back to CallMeBot, then a text message, so nothing is lost.
 *    Saying "goodnight" to JARVIS on WhatsApp each evening keeps the window open for the morning.
 *  - Twilio's WhatsApp sandbox (+1 415 523 8886) forgets you three days after you join it (error 63015). JARVIS
 *    notices your "join …" message, reminds you before it lapses with a one-tap link, and says so on every other
 *    route (call, CallMeBot, text) if it has lapsed. A WhatsApp sender of your own does not lapse.
 */
import {sleep, clip, xml, e164} from './util.js';

const WINDOW_ERRORS = new Set([63016, 63015, 63003, 63024, 63049, 63051, 63112]);   // outside the 24-hour window / not joined / not allowed
const FINAL = ['completed', 'busy', 'no-answer', 'failed', 'canceled'];
export const SANDBOX_NUMBER = '+14155238886';
export const SANDBOX_DAYS = 3;
const NOT_JOINED = 63015;

export class Phone {
  constructor({config, owner, secret, log, fetchImpl, state, onLapse}) {
    Object.assign(this, {config, owner, secret, log: log || (() => {}), f: fetchImpl || fetch, onLapse});
    const mem = {};
    this.state = state || {get: () => mem, set: p => Object.assign(mem, p)};
    this.windowClosedAt = 0; this.windowCode = 0;
  }
  /* ---------- the WhatsApp sandbox ---------- */
  isSandbox() { return e164(this.config().whatsappFrom || '') === SANDBOX_NUMBER; }
  /** Opens WhatsApp on your phone with "join <code>" already typed to the sandbox: one tap to renew. */
  static joinLink(code) { return `https://wa.me/${SANDBOX_NUMBER.slice(1)}${code ? `?text=${encodeURIComponent(`join ${code}`)}` : ''}`; }
  sandbox() {
    if (!this.isSandbox()) return {sandbox: false};
    const s = this.state.get() || {}; const joinedAt = s.sandboxJoinedAt || 0, expiresAt = joinedAt ? joinedAt + SANDBOX_DAYS * 864e5 : 0;
    const expired = !!expiresAt && Date.now() > expiresAt && (s.sandboxOkAt || 0) < expiresAt;   // past its three days, and nothing has got through since
    return {sandbox: true, code: s.sandboxCode || '', joinedAt, expiresAt, lapsed: !!s.sandboxLapsedAt || expired, lapsedAt: s.sandboxLapsedAt || (expired ? expiresAt : 0), link: Phone.joinLink(s.sandboxCode)};
  }
  /** How to renew the sandbox, in words. With `link`, it ends with a link that does it in one tap (nothing after it, so the phone keeps the whole link). */
  renewText({link = true} = {}) {
    const sb = this.sandbox();
    if (!sb.code) return 'send your sandbox code (“join …”, shown in the Twilio Console → Messaging → Try it out → Send a WhatsApp message) to +1 415 523 8886.';
    return `send *join ${sb.code}* to +1 415 523 8886.${link ? ` This link does it in one tap:\n${sb.link}` : ''}`;
  }
  /** The line that goes first in a message sent some other way because WhatsApp could not get through. */
  fixLine(code) {
    if (code === NOT_JOINED && this.isSandbox()) return `⚠️ My WhatsApp link has lapsed: Twilio's test sandbox forgets you ${SANDBOX_DAYS} days after you join it. To renew it, ${this.renewText()}`;
    if (code === NOT_JOINED) return '⚠️ WhatsApp would not take my message (error 63015): check the WhatsApp sender in the Twilio Console.';
    if (code === 63016) return '⚠️ My WhatsApp window is closed (WhatsApp only lets me write freely within 24 hours of your last message). Send me any WhatsApp message to reopen it.';
    return '';
  }
  whatsappFailed(code) {
    this.windowClosedAt = Date.now(); this.windowCode = code;
    if (code === NOT_JOINED && this.isSandbox() && !this.state.get()?.sandboxLapsedAt) {
      this.state.set({sandboxLapsedAt: Date.now()});
      this.log('phone', 'The WhatsApp sandbox has lapsed (error 63015): it needs the join code again.');
      try { this.onLapse?.(); } catch {}
    }
  }
  whatsappOk() {
    this.windowClosedAt = 0; this.windowCode = 0;
    if (this.isSandbox()) this.state.set({sandboxLapsedAt: 0, sandboxOkAt: Date.now()});
  }
  base() { return (process.env.JARVIS_TWILIO_URL || 'https://api.twilio.com').replace(/\/+$/, ''); }
  sid() { return this.config().twilioSid; }
  to() { return e164(this.owner().phone); }
  ready() {
    const c = this.config(), token = !!this.secret('twilioToken'), twilio = !!(c.twilioSid && token), to = this.to();   // nothing can reach you until your number is saved
    return {twilio, whatsapp: twilio && !!to && c.whatsapp && !!c.whatsappFrom, sms: twilio && !!to && c.sms && !!c.twilioFrom, calls: twilio && !!to && !!c.twilioFrom,
      callmebot: !!to && c.callmebot && !!this.secret('callmebotKey'), any: !!to && (twilio || (c.callmebot && !!this.secret('callmebotKey'))), to};
  }
  async twilio(method, sub, params) {
    const c = this.config(), token = this.secret('twilioToken');
    if (!c.twilioSid || !token) throw Error('Twilio is not set up yet (Settings → JARVIS Core → Phone).');
    let url = `${this.base()}/2010-04-01/Accounts/${c.twilioSid}${sub}`;
    const init = {method, headers: {Authorization: 'Basic ' + Buffer.from(`${c.twilioSid}:${token}`).toString('base64')}, signal: AbortSignal.timeout(20000)};
    if (params) {
      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) { if (v === undefined || v === null || v === '') continue; for (const x of [].concat(v)) body.append(k, String(x)); }
      if (method === 'GET') url += (url.includes('?') ? '&' : '?') + body.toString();
      else { init.body = body.toString(); init.headers['Content-Type'] = 'application/x-www-form-urlencoded'; }
    }
    let res;
    try { res = await this.f(url, init); } catch (e) { throw Error(`Could not reach Twilio: ${e.message}`); }
    const data = await res.json().catch(() => ({}));
    if (!res.ok && /trial account/i.test(data.message || '')) { const err = Error('Twilio refused it: a free trial account only sends Twilio’s own sample messages and calls, not JARVIS’s. Upgrade the Twilio account (Console → Upgrade, pay as you go) to use calls, WhatsApp and texts.'); err.code = data.code || 'TRIAL'; err.status = res.status; throw err; }
    if (!res.ok) { const err = Error(`Twilio ${res.status}: ${data.message || res.statusText}${data.code ? ` (error ${data.code})` : ''}`); err.code = data.code; err.status = res.status; throw err; }
    return data;
  }
  /* ---------- messages ---------- */
  static chunks(text, max = 1500) {
    const out = []; let rest = String(text || '').trim();
    while (rest.length > max) { let cut = rest.lastIndexOf('\n', max); if (cut < max * 0.5) cut = rest.lastIndexOf(' ', max); if (cut < max * 0.5) cut = max; out.push(rest.slice(0, cut).trim()); rest = rest.slice(cut).trim(); }
    if (rest) out.push(rest); return out;
  }
  async sendTwilio(body, channel) {
    const c = this.config(), to = this.to(); if (!to) throw Error('Your phone number is not set.');
    const from = channel === 'whatsapp' ? `whatsapp:${c.whatsappFrom}` : c.twilioFrom;
    const sids = [];
    for (const part of Phone.chunks(body, channel === 'whatsapp' ? 1500 : 1500)) {
      const m = await this.twilio('POST', '/Messages.json', {To: channel === 'whatsapp' ? `whatsapp:${to}` : to, From: from, Body: part});
      sids.push(m.sid);
    }
    return sids;
  }
  async messageStatus(sid) { return this.twilio('GET', `/Messages/${sid}.json`); }
  /** WhatsApp through Twilio fails *after* it is accepted when the 24-hour window is shut: look again a few seconds later. */
  async confirm(sids, ms = 9000) {
    const until = Date.now() + ms; let last = null;
    while (Date.now() < until) {
      await sleep(1500);
      try { last = await this.messageStatus(sids[sids.length - 1]); } catch (e) { return {ok: true, unknown: e.message, unconfirmed: true}; }
      if (['delivered', 'read', 'sent'].includes(last.status)) return {ok: true, status: last.status};
      if (['failed', 'undelivered'].includes(last.status)) return {ok: false, status: last.status, code: Number(last.error_code) || 0, error: last.error_message || ''};
    }
    return {ok: true, status: last?.status || 'queued', unconfirmed: true};   // accepted, not yet seen delivered
  }
  async callmebot(body) {
    const key = this.secret('callmebotKey'), to = this.to(); if (!key) throw Error('CallMeBot is not set up.'); if (!to) throw Error('Your phone number is not set.');
    for (const part of Phone.chunks(body, 900)) {
      const url = `https://api.callmebot.com/whatsapp.php?${new URLSearchParams({phone: to.replace('+', ''), text: part, apikey: key})}`;
      const res = await this.f(url, {signal: AbortSignal.timeout(20000)}); const t = await res.text().catch(() => '');
      if (!res.ok || /error|invalid|not (allowed|valid)|apikey/i.test(t) && !/queued|sent/i.test(t)) throw Error(`CallMeBot: ${clip(t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '), 160) || res.status}`);
      await sleep(1200);
    }
    return true;
  }
  /**
   * Message you, by the best route that works: WhatsApp (Twilio) → WhatsApp (CallMeBot) → text message.
   * Returns {ok, via, sids, error, fellBack}.
   */
  async deliver(body, {prefer = 'whatsapp'} = {}) {
    const r = this.ready(); const errors = [];
    const routes = [];
    if (prefer === 'sms' && r.sms) routes.push('sms');
    if (r.whatsapp) routes.push('whatsapp');
    if (r.callmebot) routes.push('callmebot');
    if (r.sms && !routes.includes('sms')) routes.push('sms');
    if (!routes.length) return {ok: false, via: '', error: 'No way to message you is set up yet (Settings → JARVIS Core → Phone).'};
    const why = code => code === 63016 ? ' (the 24-hour window is closed: message JARVIS on WhatsApp to reopen it)' : code === NOT_JOINED && this.isSandbox() ? ' (the WhatsApp sandbox has lapsed: it needs the join code again)' : '';
    let waCode = 0;
    for (const via of routes) {
      try {
        if (via === 'whatsapp') {
          if (this.windowClosedAt && Date.now() - this.windowClosedAt < 20 * 60000 && routes.length > 1) { waCode = this.windowCode; errors.push(`WhatsApp not tried${why(waCode) || ' (it failed a few minutes ago)'}`); continue; }
          const sids = await this.sendTwilio(body, 'whatsapp');
          const c = await this.confirm(sids);
          if (!c.ok) {
            if (WINDOW_ERRORS.has(c.code)) { waCode = c.code; this.whatsappFailed(c.code); }
            errors.push(`WhatsApp ${c.code ? `error ${c.code}` : c.status}${why(c.code)}`);
            continue;
          }
          if (!c.unconfirmed) this.whatsappOk();   // only a message seen delivered proves the WhatsApp route works
          return {ok: true, via, sids, fellBack: errors.length > 0, error: errors.join('; ')};
        }
        // another route because WhatsApp failed: say why first, and how to fix it
        const note = this.fixLine(waCode), text = note ? `${note}\n\n${body}` : body;
        if (via === 'callmebot') { await this.callmebot(text); return {ok: true, via, sids: [], fellBack: errors.length > 0, error: errors.join('; '), note}; }
        if (via === 'sms') { const sids = await this.sendTwilio(text, 'sms'); return {ok: true, via, sids, fellBack: errors.length > 0, error: errors.join('; '), note}; }
      } catch (e) {
        const code = Number(e.code) || 0;
        if (via === 'whatsapp' && WINDOW_ERRORS.has(code)) { waCode = code; this.whatsappFailed(code); }
        errors.push(`${e.message}${via === 'whatsapp' ? why(code) : ''}`);
      }
    }
    return {ok: false, via: '', error: errors.join('; '), note: this.fixLine(waCode)};
  }
  /** Your messages to JARVIS (WhatsApp and SMS) since `since`, oldest first. */
  async inbound(since) {
    const c = this.config(), me = this.to(); if (!c.twilioSid || !me) return [];
    const day = new Date(since - 864e5).toISOString().slice(0, 10);   // the filter works in whole (UTC) days
    const lists = [];
    if (c.whatsapp && c.whatsappFrom) lists.push(this.twilio('GET', '/Messages.json', {To: `whatsapp:${c.whatsappFrom}`, From: `whatsapp:${me}`, 'DateSent>': day, PageSize: 50}));
    if (c.sms && c.twilioFrom) lists.push(this.twilio('GET', '/Messages.json', {To: c.twilioFrom, From: me, 'DateSent>': day, PageSize: 50}));   // texts only when you switched them on
    const out = []; let failed = false;
    for (const r of await Promise.allSettled(lists)) {
      if (r.status !== 'fulfilled') { failed = true; this.log('phone', 'Checking messages: ' + r.reason?.message); continue; }
      for (const m of r.value.messages || []) {
        if (m.direction !== 'inbound') continue;
        const t = Date.parse(m.date_sent || m.date_created); if (!(t >= since - 120000)) continue;
        out.push({sid: m.sid, at: t, body: String(m.body || '').trim(), via: String(m.from).startsWith('whatsapp:') ? 'whatsapp' : 'sms', media: Number(m.num_media) || 0});
      }
    }
    out.sort((a, b) => a.at - b.at); out.incomplete = failed;   // the caller keeps its place, so nothing is skipped after a failed look
    return out;
  }
  /* ---------- calls ---------- */
  /** Ring you and say the TwiML (one-way: Twilio reads it out; nothing calls back into this computer). */
  async call({twiml, machineDetection = true}) {
    const c = this.config(), to = this.to();
    if (!c.twilioFrom) throw Error('Calls need a Twilio phone number (Settings → JARVIS Core → Phone).');
    if (!to) throw Error('Your phone number is not set.');
    const params = {To: to, From: c.twilioFrom, Timeout: c.ringSeconds, Twiml: twiml};
    if (machineDetection) params.MachineDetection = 'Enable';
    const r = await this.twilio('POST', '/Calls.json', params);
    return {sid: r.sid, status: r.status};
  }
  async callInfo(sid) { const r = await this.twilio('GET', `/Calls/${sid}.json`); return {status: r.status, answeredBy: r.answered_by || '', duration: Number(r.duration) || 0}; }
  async hangup(sid) { try { await this.twilio('POST', `/Calls/${sid}.json`, {Status: 'completed'}); } catch {} }
  /** Follow a call until it ends (for one-way calls, where nobody tells us). */
  async waitCall(sid, ms = 5 * 60000) {
    const until = Date.now() + ms; let info = null;
    while (Date.now() < until) { await sleep(4000); try { info = await this.callInfo(sid); } catch { continue; } if (FINAL.includes(info.status)) return info; }
    return info || {status: 'unknown'};
  }
  /* ---------- TwiML ---------- */
  sayXml(text) { const c = this.config(); return `<Say voice="${xml(c.voice)}" language="${xml(c.language)}">${xml(text)}</Say>`; }
  oneWay(text) {
    // a short pause first, so the start is not clipped while you bring the phone to your ear
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="1"/>${this.sayXml(clip(text, 3300))}<Pause length="1"/></Response>`;
  }
}
