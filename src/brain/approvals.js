/**
 * JARVIS Core — approvals. PROTECTED: self-updates may never change this file.
 *
 * Anything JARVIS wants to do that involves your business, your permissions, money, other people, or his own
 * code waits here as a numbered request (#12) until you answer. Nothing in the waiting list runs before that,
 * and a request that is not answered expires.
 *
 * Remote answers (WhatsApp) need the request's four-character code, which only JARVIS's own
 * "needs your OK" messages show: "YES 12 K7M3", or "YES ALL Q4R8" for everything in JARVIS's latest message except
 * code updates and emails. Text messages (SMS) can be faked, so they can never answer a request.
 * So a casual "ok", or a message the AI wrote itself, can never approve anything. Saying no needs no code.
 * The buttons in JARVIS Core and "Jarvis, approve 12" at the computer need no code (you are there).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KINDS = ['tool', 'update', 'settings', 'audit', 'email', 'tower', 'orders', 'undo'];
const CHANNELS = ['whatsapp', 'ui', 'voice'];
const YES = ['yes', 'y', 'yeah', 'yep', 'yup', 'approve', 'approved', 'accept', 'accepted', 'confirm', 'confirmed', 'go ahead', 'do it', 'send it', 'install it'];
const NO = ['no', 'n', 'nope', 'nah', 'deny', 'denied', 'decline', 'declined', 'reject', 'rejected', 'cancel', 'dont', 'do not'];
const DETAIL = ['details', 'detail', 'diff', 'show', 'show me', 'more', 'info', 'explain', 'what is', 'whats', 'changes', 'why'];
const FILLER = /\b(please|pls|thanks|thank you|cheers|jarvis|sir|number|numbers|request|requests|and|&|both|the|to|then|ok|okay)\b/g;
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ', DIGITS = '23456789';   // no I, O, 0 or 1: easy to read on a phone
/** Put a freshly written temp file in place. Windows can hold a file for a moment (antivirus, indexing, backup), so a refused
 *  rename is tried again for up to about a second instead of losing the save. */
const PAUSE = new Int32Array(new SharedArrayBuffer(4));
function replaceFile(tmp, file) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; }
    catch (e) { if (i >= 20 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) { try { fs.rmSync(tmp, {force: true}); } catch {} throw e; } Atomics.wait(PAUSE, 0, 0, 10 + i * 5); }
  }
}
const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const codeOf = seed => { const h = crypto.createHash('sha256').update(String(seed)).digest(); return LETTERS[h[0] % LETTERS.length] + DIGITS[h[1] % DIGITS.length] + LETTERS[h[2] % LETTERS.length] + DIGITS[h[3] % DIGITS.length]; };
const CODE = '[a-z][2-9][a-z][2-9]', isCode = w => new RegExp(`^${CODE}$`).test(w || '');

export class Approvals {
  constructor({dir, log, onChange} = {}) {
    this.file = path.join(dir, 'approvals.json');
    this.log = log || (() => {});
    this.onChange = onChange || (() => {});
    let data = null;
    try { data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch {}
    this.data = data && Array.isArray(data.items) ? data : {next: 1, items: []};
    if (!Array.isArray(this.data.batches)) this.data.batches = [];
    if (!Number.isInteger(this.data.next) || this.data.next < 1) this.data.next = 1 + Math.max(0, ...this.data.items.map(a => a.id || 0));
    for (const a of this.data.items) if (!a.code || a.code.length !== 4) a.code = codeOf(a.token || a.id);   // codes were two characters before 1.80.1
    // anything that was being carried out when JARVIS stopped did not finish: say so rather than guess
    for (const a of this.data.items) if (a.status === 'approved' && !a.finishedAt) { a.status = 'failed'; a.result = 'JARVIS restarted before this finished. Check it, and ask again if it is still needed.'; a.finishedAt = Date.now(); }
    this.expire(false);
    this.save();
  }
  save() {
    this.data.items = this.data.items.slice(-400); this.data.batches = this.data.batches.slice(-30);
    fs.mkdirSync(path.dirname(this.file), {recursive: true});
    const tmp = `${this.file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(this.data, null, 1)); replaceFile(tmp, this.file);
  }
  list({status, kind, limit = 100} = {}) {
    return this.data.items.filter(a => (!status || (Array.isArray(status) ? status.includes(a.status) : a.status === status)) && (!kind || a.kind === kind)).slice(-limit).reverse().map(a => this.view(a));
  }
  waiting() { this.expire(); return this.data.items.filter(a => a.status === 'waiting'); }
  get(id) { return this.data.items.find(a => a.id === Number(id)) || null; }
  /** What screens and the AI see: never the code or token (only JARVIS's own digests carry codes). */
  view(a) { if (!a) return null; const {token, code, ...rest} = a; return rest; }

  /**
   * Ask for permission. `payload` is whatever the action needs to run once approved.
   * `risk`: 'low' | 'normal' | 'high' (high = code, permissions, money).
   */
  create({kind = 'tool', title, detail = '', payload = {}, risk = 'normal', ref = '', source = 'jarvis', group = '', expiresHours = 72} = {}) {
    if (!KINDS.includes(kind)) throw Error(`Unknown approval kind: ${kind}`);
    if (!title) throw Error('An approval needs a title.');
    // the same request twice (same kind + ref) while the first is still waiting is one request
    if (ref) { const dup = this.data.items.find(a => a.status === 'waiting' && a.kind === kind && a.ref === ref); if (dup) return dup; }
    const token = crypto.randomBytes(18).toString('base64url');
    const a = {id: this.data.next++, token, code: codeOf(token), kind, title: clip(String(title).replace(/\s+/g, ' ').trim(), 200), detail: clip(detail, 6000), payload, risk: ['low', 'normal', 'high'].includes(risk) ? risk : 'normal',
      ref: String(ref || ''), source, group: String(group || ''), status: 'waiting', createdAt: Date.now(), expiresAt: Date.now() + Math.max(1, expiresHours) * 3600e3,
      notified: [], notifiedAt: 0, decidedAt: 0, via: '', proof: '', note: '', result: '', finishedAt: 0};
    this.data.items.push(a); this.save();
    this.log('approvals', `#${a.id} waiting: ${a.title}`);
    try { this.onChange('created', a); } catch (e) { this.log('approvals', e.message); }
    return a;
  }
  /** Record that these requests went out in one of JARVIS's own messages; returns that message's batch code. */
  markNotified(ids, via) {
    const now = Date.now(), list = [].concat(ids).map(id => this.get(id)).filter(a => a && a.status === 'waiting');
    for (const a of list) { a.notified = [...new Set([...(a.notified || []), via])]; a.notifiedAt = now; }
    let batch = null;
    if (list.length) {
      const inUse = new Set(this.data.batches.filter(b => now - b.at < 24 * 3600e3).map(b => b.code));   // no two recent messages share a code
      let code; do { code = codeOf(`${now}:${crypto.randomBytes(8).toString('hex')}`); } while (inUse.has(code) && inUse.size < 150);
      batch = {id: `b${now.toString(36)}`, code, ids: list.map(a => a.id), at: now, via}; this.data.batches.push(batch);
    }
    this.save();
    return batch;
  }
  /** Record your answer. `via` says where it came from; `proof` is the message id when there is one. */
  decide(id, yes, {via, proof = '', note = ''} = {}) {
    if (!CHANNELS.includes(via)) throw Error('Unknown channel for an approval.');
    const a = this.get(id); if (!a) throw Error(`There is no request #${id}.`);
    this.expire();
    if (a.status !== 'waiting') return {already: true, approval: a};
    a.status = yes ? 'approved' : 'denied'; a.decidedAt = Date.now(); a.via = via; a.proof = String(proof).slice(0, 80); a.note = clip(note, 400);
    if (!yes) a.finishedAt = a.decidedAt;
    this.save();
    this.log('approvals', `#${a.id} ${a.status} via ${via}`);
    try { this.onChange('decided', a); } catch (e) { this.log('approvals', e.message); }
    return {already: false, approval: a};
  }
  /** After an approved request has run. */
  finish(id, ok, result = '') {
    const a = this.get(id); if (!a) return null;
    a.status = ok ? 'done' : 'failed'; a.result = clip(result, 2000); a.finishedAt = Date.now(); this.save();
    try { this.onChange('finished', a); } catch (e) { this.log('approvals', e.message); }
    return a;
  }
  /** Withdraw a request JARVIS no longer needs (e.g. you sent the email yourself from Gmail). */
  withdraw(id, why = '') {
    const a = this.get(id); if (!a || a.status !== 'waiting') return null;
    a.status = 'withdrawn'; a.result = clip(why, 400); a.finishedAt = Date.now(); this.save();
    try { this.onChange('finished', a); } catch {}
    return a;
  }
  expire(save = true) {
    const now = Date.now(); let n = 0;
    for (const a of this.data.items) if (a.status === 'waiting' && a.expiresAt && a.expiresAt < now) { a.status = 'expired'; a.finishedAt = now; n++; }
    if (n && save) this.save();
    return n;
  }

  /**
   * Read a remote reply. Returns null when it is not a reply to a request, or
   *   {details: id}
   *   {decision: 'yes'|'no', items: [{id, code}], all: bool, batchCode, bare: bool}
   * Accepted: "YES 12 K7M3", "yes 12K7M3 14A2B3", "YES ALL Q4R8", "NO 12", "no 12 13", "NO ALL", "details 12", and a bare "yes"/"no".
   * A message that says anything more ("yes, and what time is my meeting?") is not a reply.
   */
  static parse(text) {
    let t = String(text || '').toLowerCase().replace(/[’']/g, '').replace(/[.,!?;:()]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 160) return null;
    for (const w of DETAIL.slice().sort((a, b) => b.length - a.length)) { const m = new RegExp(`^${w} #?(\\d{1,5})$`).exec(t); if (m) return {details: Number(m[1])}; }
    let decision = null;
    for (const [list, d] of [[YES, 'yes'], [NO, 'no']]) {
      for (const w of list.slice().sort((a, b) => b.length - a.length)) if (t === w || t.startsWith(w + ' ') || t.startsWith(w + '#')) { decision = d; t = t.slice(w.length).trim(); break; }
      if (decision) break;
    }
    if (!decision) return null;
    t = t.replace(/#/g, ' ').replace(FILLER, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return {decision, items: [], all: false, batchCode: '', bare: true};
    const words = t.split(' ');
    if (words[0] === 'all' || words[0] === 'everything') {
      const rest = words.slice(1); if (rest.length > 1 || (rest[0] && !isCode(rest[0]))) return null;
      return {decision, items: [], all: true, batchCode: (rest[0] || '').toUpperCase(), bare: false};
    }
    const items = [];
    for (let i = 0; i < words.length; i++) {
      let m = new RegExp(`^(\\d{1,5})(${CODE})?$`).exec(words[i]);
      if (!m) return null;   // anything else: not a bare answer
      let code = m[2] || '';
      if (!code && isCode(words[i + 1])) code = words[++i];
      items.push({id: Number(m[1]), code: code.toUpperCase()});
    }
    return {decision, items, all: false, batchCode: '', bare: false};
  }
  /** The latest message JARVIS sent with requests in it (within 12 hours). With a code, only if it is that message's code. */
  batch(code) {
    const recent = this.data.batches.filter(b => Date.now() - b.at < 12 * 3600e3); const last = recent[recent.length - 1] || null;
    return code ? (last && last.code === code ? last : null) : last;
  }
  /** Was this code on one of JARVIS's recent messages (so a mistyped code is told apart from an old one)? */
  recentBatchCode(code) { return this.data.batches.some(b => b.code === code && Date.now() - b.at < 24 * 3600e3); }
  /**
   * One-stop for WhatsApp/SMS: read a reply and record decisions. Never carries anything out (the caller does).
   * Returns {handled:false} or {handled, details?, decision, decided:[…], already:[…], missing:[…], needCode:[…], held:[…], bare}
   */
  handleReply(text, {via, proof = ''} = {}) {
    const p = Approvals.parse(text);
    if (!p) return {handled: false};
    if (p.details) return {handled: true, details: this.get(p.details)};
    const out = {handled: true, decision: p.decision, decided: [], already: [], missing: [], needCode: [], held: [], bare: p.bare, locked: false};
    if (p.bare) return out;   // "yes" / "no" on its own decides nothing: the caller shows what is waiting, with codes
    // guessing codes gets nowhere: after five wrong codes in ten minutes no code is accepted for half an hour,
    // and after ten in a day, for a day
    const g = this.data.guess || (this.data.guess = {misses: [], lockedUntil: 0});
    const locked = () => p.decision === 'yes' && g.lockedUntil > Date.now();
    if (locked()) { out.locked = true; return out; }
    const miss = () => {
      const now = Date.now(); g.misses = [...(g.misses || []).filter(t => now - t < 24 * 3600e3), now];
      const recent = g.misses.filter(t => now - t < 10 * 60000).length;
      if (g.misses.length >= 10) { g.lockedUntil = now + 24 * 3600e3; g.misses = []; this.log('approvals', 'Too many wrong codes today: approvals by message are paused for a day.'); }
      else if (recent >= 5) { g.lockedUntil = now + 30 * 60000; this.log('approvals', 'Too many wrong codes: approvals by message are paused for 30 minutes.'); }
      this.save();
    };
    const note = String(text).slice(0, 200);
    const act = a => { const r = this.decide(a.id, p.decision === 'yes', {via, proof, note}); (r.already ? out.already : out.decided).push(r.approval); };
    if (p.all) {
      const b = p.decision === 'yes' ? this.batch(p.batchCode) : this.batch();
      if (p.decision === 'yes' && (!p.batchCode || !b)) { if (p.batchCode && !this.recentBatchCode(p.batchCode)) miss(); out.locked = locked(); out.needCode = this.waiting(); return out; }
      const ids = b ? b.ids : [];
      for (const a of ids.map(id => this.get(id)).filter(Boolean)) {
        if (a.status !== 'waiting') { out.already.push(a); continue; }
        if (p.decision === 'yes' && (a.risk === 'high' || a.kind === 'email')) { out.held.push(a); continue; }   // code updates and emails always need their own number and code
        act(a);
      }
      return out;
    }
    const seen = new Map(); for (const it of p.items) seen.set(it.id, (seen.get(it.id) || 0) + 1);
    for (const it of p.items) {
      if (locked()) { out.locked = true; break; }   // no more guesses in this message once approvals are paused
      const a = this.get(it.id);
      if (!a) { if (!out.missing.includes(it.id)) out.missing.push(it.id); continue; }
      if (a.status !== 'waiting') { if (!out.already.includes(a)) out.already.push(a); continue; }
      if (p.decision === 'yes' && (seen.get(it.id) > 1 || it.code !== a.code)) { if (it.code) miss(); if (!out.needCode.includes(a)) out.needCode.push(a); continue; }   // one code per request per message
      act(a);
    }
    return out;
  }
}
