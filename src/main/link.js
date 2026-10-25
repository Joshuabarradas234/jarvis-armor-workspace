/**
 * JARVIS Link: one computer (the Mac mini, running JARVIS Server) runs JARVIS's brain; another (the ZenBook) signs in.
 *
 * The server listens only on this computer's Tailscale address (100.64.0.0/10, the private network Tailscale gives
 * your own devices), never on the internet or the home network, and answers only devices paired with a one-time
 * code shown on the server. A paired device gets a long random key, kept encrypted on that device; the server keeps
 * only a fingerprint of it, and removing the device ends it at once. Tailscale encrypts the traffic.
 *
 * What goes over the link: JARVIS Core (phone, WhatsApp, email, approvals, schedules, reports), to-dos, the calendar,
 * and each meeting once it ends (its recording and offline transcript), which the server writes up and keeps.
 * Screens, tabs, voice, hands, live recording, the Tower and ideas stay on the computer you are using.
 */
import http from 'node:http';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {readJson, writeJson} from '../brain/util.js';

export const PORT = 47870;
/** The brain's requests, which the signed-in computer sends to the server. Never anything that opens a window, a file picker or a folder. */
export const FORWARD = new Set(['core', 'todo-list', 'todo-add', 'todo-toggle', 'todo-remove', 'todo-clear-done', 'calendar-list', 'calendar-save', 'calendar-delete']);
/** Everything the server answers: those, plus the Claude key (kept sealed on the server) and how it is doing. */
export const LINK_METHODS = new Set([...FORWARD, 'tower-key', 'server-info', 'meeting-history', 'meeting-read']);
/** The server's news that the client's windows need. */
export const LINK_CHANNELS = new Set(['core', 'todos', 'calendar', 'briefing', 'meeting']);
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', MAX_BODY = 2e6, MAX_MOVE = 200e6, MAX_MEETING = 2e9, MAX_MEETING_DETAILS = 8e6, WRONG_LIMIT = 5, LOCKOUT = 15 * 60000;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');

/** True for an address on a Tailscale network (100.64.0.0/10), as IPv4 or IPv4-mapped IPv6. */
export function isTailnet(ip) { const m = /^(?:::ffff:)?100\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/i.exec(String(ip || '')); return !!m && Number(m[1]) >= 64 && Number(m[1]) <= 127; }
/** This computer's Tailscale address, or '' if Tailscale isn't running. */
export function tailscaleAddress(ifaces = os.networkInterfaces()) {
  for (const list of Object.values(ifaces || {})) for (const a of list || []) if ((a.family === 'IPv4' || a.family === 4) && !a.internal && isTailnet(a.address)) return a.address;
  return '';
}
export const newCode = (rand = crypto.randomBytes) => Array.from(rand(6), b => CODE_CHARS[b % CODE_CHARS.length]).join('');

export class LinkServer {
  /**
   * d: {dir, call(method, payload) → Promise, onMove(bundle) → Promise, onMeeting(details, file) → Promise, log, port, name, address() → string, allow(ip) → bool}
   * `address` and `allow` default to Tailscale only; tests pass loopback versions.
   */
  constructor(d) {
    this.d = {log: () => {}, port: PORT, address: tailscaleAddress, allow: isTailnet, name: os.hostname(), now: Date.now, onMove: async () => { throw Error('Moving JARVIS here is not possible.'); }, onMeeting: async () => { throw Error('Meetings are not kept here.'); }, ...d};
    this.file = path.join(d.dir, 'link-devices.json'); this.server = null; this.listening = ''; this.pairing = null; this.wrong = []; this.streams = new Set();
  }
  devices() { const l = readJson(this.file, []); return Array.isArray(l) ? l : []; }
  list() { return this.devices().map(({id, name, created, seen}) => ({id, name, created, seen})); }
  status() { return {listening: this.listening, port: this.d.port, name: this.d.name, devices: this.list(), pairing: this.code() ? {expires: this.pairing.expires} : null}; }
  code() { return this.pairing && this.pairing.expires > this.d.now() ? this.pairing.code : ''; }
  /** A one-time code, shown on this computer. */
  startPairing(minutes = 10) { this.pairing = {code: newCode(), expires: this.d.now() + minutes * 60000}; return {code: this.pairing.code, expires: this.pairing.expires}; }
  remove(id) { writeJson(this.file, this.devices().filter(x => x.id !== id)); for (const s of [...this.streams]) if (s.device === id) { try { s.res.end(); } catch {} this.streams.delete(s); } return this.list(); }
  locked() { const now = this.d.now(); this.wrong = this.wrong.filter(t => now - t < LOCKOUT); return this.wrong.length >= WRONG_LIMIT; }
  pair(code, name) {
    if (this.locked()) throw Object.assign(Error('Too many wrong codes. Wait 15 minutes, then try again.'), {status: 429});
    const want = this.code(), got = String(code || '').trim().toUpperCase();
    const ok = !!want && got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
    if (!ok) { this.wrong.push(this.d.now()); throw Object.assign(Error('That code is wrong or has run out. Show a new one on the Mac.'), {status: 403}); }
    this.pairing = null;   // each code works once
    const token = crypto.randomBytes(32).toString('base64url');
    const device = {id: crypto.randomUUID(), name: String(name || 'A computer').replace(/[^\w .'-]/g, '').slice(0, 60) || 'A computer', hash: sha(token), created: this.d.now(), seen: this.d.now()};
    writeJson(this.file, [...this.devices(), device].slice(-20)); this.d.log('link', `Paired ${device.name}.`);
    return {token, device: {id: device.id, name: device.name}, server: this.d.name};
  }
  device(req) {
    const m = /^Bearer ([\w-]{20,200})$/.exec(req.headers.authorization || ''); if (!m) return null;
    const h = sha(m[1]), list = this.devices(), d = list.find(x => typeof x.hash === 'string' && x.hash.length === h.length && crypto.timingSafeEqual(Buffer.from(x.hash), Buffer.from(h)));
    if (d && this.d.now() - (d.seen || 0) > 60000) { d.seen = this.d.now(); writeJson(this.file, list); }
    return d || null;
  }
  /** A meeting arriving: 4 bytes giving the length of its details (JSON), the details, then the recording, written to a
   *  file in <dir>/incoming as it comes, never held in memory. */
  receive(req) {
    const dir = path.join(this.d.dir, 'incoming'); fs.mkdirSync(dir, {recursive: true});
    const file = path.join(dir, `${crypto.randomUUID()}.part`);
    return new Promise((resolve, reject) => {
      let head = Buffer.alloc(0), need = 0, details = null, size = 0, out = null, done = false;
      const fail = (status, message) => { if (done) return; done = true; req.destroy(); out?.destroy(); try { fs.rmSync(file, {force: true}); } catch {} reject(Object.assign(Error(message), {status})); };
      req.on('data', c => {
        if (done) return; size += c.length; if (size > MAX_MEETING) return fail(413, 'That recording is too big.');
        if (out) { if (!out.write(c)) { req.pause(); out.once('drain', () => req.resume()); } return; }
        head = Buffer.concat([head, c]);
        if (!need && head.length >= 4) { need = 4 + head.readUInt32LE(0); if (need > MAX_MEETING_DETAILS + 4) return fail(413, 'Too big.'); }
        if (need && head.length >= need) {
          try { details = JSON.parse(head.subarray(4, need).toString('utf8')); } catch { return fail(400, 'Not JSON.'); }
          out = fs.createWriteStream(file, {mode: 0o600}); out.on('error', e => fail(500, e.message));
          const rest = head.subarray(need); head = null; if (rest.length) out.write(rest);
        }
      });
      req.on('end', () => { if (done) return; if (!out) return fail(400, 'No meeting details.'); out.end(() => { done = true; resolve({details, file}); }); });
      req.on('error', e => fail(400, e.message));
    });
  }
  /** Pass news on to every signed-in device. */
  broadcast(channel, data) {
    if (!LINK_CHANNELS.has(channel) || !this.streams.size) return;
    let line; try { line = `data: ${JSON.stringify({channel, data})}\n\n`; } catch { return; }
    for (const s of [...this.streams]) { try { s.res.write(line); } catch { this.streams.delete(s); } }
  }
  async handle(req, res) {
    const send = (status, body) => { if (res.headersSent) return; res.writeHead(status, {'content-type': 'application/json', 'cache-control': 'no-store'}); res.end(JSON.stringify(body)); };
    if (!this.d.allow(req.socket.remoteAddress)) return send(403, {error: 'Only your own devices, over Tailscale.'});
    const url = new URL(req.url, 'http://link');
    const body = (limit = MAX_BODY) => new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(Error('Too big.'), {status: 413})); req.destroy(); } else chunks.push(c); });
      req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(Error('Not JSON.'), {status: 400})); } });
      req.on('error', reject);
    });
    try {
      if (req.method === 'POST' && url.pathname === '/pair') { const b = await body(); return send(200, this.pair(b.code, b.name)); }
      const device = this.device(req); if (!device) return send(401, {error: 'This computer is not signed in to JARVIS on the Mac, or was removed. Sign in again.'});
      if (req.method === 'GET' && url.pathname === '/events') {
        res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive'}); res.write(': ok\n\n');
        const s = {res, device: device.id}; this.streams.add(s); req.on('close', () => this.streams.delete(s)); return;
      }
      if (req.method === 'GET' && url.pathname === '/hello') return send(200, {server: this.d.name, device: device.name});
      if (req.method === 'POST' && url.pathname === '/call') {
        const b = await body(); if (typeof b.method !== 'string' || !LINK_METHODS.has(b.method)) return send(403, {error: 'That request stays on the computer you are using.'});
        try { return send(200, {ok: true, result: await this.d.call(b.method, b.payload, device)}); } catch (e) { return send(200, {ok: false, error: String(e?.message || e).slice(0, 2000)}); }
      }
      if (req.method === 'POST' && url.pathname === '/move') {   // everything JARVIS knows, from the computer that is handing his brain over
        const b = await body(MAX_MOVE); this.d.log('link', `${device.name} is moving JARVIS's brain here.`);
        try { return send(200, {ok: true, result: await this.d.onMove(b, device)}); } catch (e) { return send(200, {ok: false, error: String(e?.message || e).slice(0, 2000)}); }
      }
      if (req.method === 'POST' && url.pathname === '/meeting') {   // a meeting the device recorded, for the server to write up and keep
        const {details, file} = await this.receive(req); this.d.log('link', `${device.name} sent a meeting.`);
        try { return send(200, {ok: true, result: await this.d.onMeeting(details, file, device)}); }
        catch (e) { try { fs.rmSync(file, {force: true}); } catch {} return send(200, {ok: false, error: String(e?.message || e).slice(0, 2000)}); }
      }
      return send(404, {error: 'Not found.'});
    } catch (e) { return send(e.status || 500, {error: String(e?.message || e).slice(0, 500)}); }
  }
  /** Listen on the Tailscale address only, and check again every minute (Tailscale may start after the server). */
  start() {
    const tick = () => {
      const addr = this.d.address();
      if (addr === this.listening) return;
      if (this.server) { try { this.server.close(); } catch {} this.server = null; this.listening = ''; }
      if (!addr) { this.d.log('link', 'Tailscale is not running on this computer, so nothing can sign in yet.'); return; }
      const srv = http.createServer((req, res) => { this.handle(req, res).catch(() => {}); });
      srv.on('error', e => { this.d.log('link', `Could not listen on ${addr}:${this.d.port}: ${e.message}`); if (this.server === srv) { this.server = null; this.listening = ''; } });
      srv.listen(this.d.port, addr, () => this.d.log('link', `Listening for your own devices on ${addr}:${this.d.port} (Tailscale only).`));
      this.server = srv; this.listening = addr;
    };
    tick(); this.timer = setInterval(tick, 60000);
    this.beat = setInterval(() => { for (const s of [...this.streams]) { try { s.res.write(': beat\n\n'); } catch { this.streams.delete(s); } } }, 25000);
    return this;
  }
  stop() { clearInterval(this.timer); clearInterval(this.beat); for (const s of this.streams) { try { s.res.end(); } catch {} } this.streams.clear(); try { this.server?.close(); } catch {} this.server = null; this.listening = ''; }
}

/** The ZenBook's side: requests to the brain go to the server; its news comes back to this computer's windows. */
export class LinkClient {
  /** d: {host, port, token, onEvent(channel, data), onState(state), log, fetchImpl} */
  constructor(d) { this.d = {port: PORT, onEvent: () => {}, onState: () => {}, log: () => {}, fetchImpl: globalThis.fetch, ...d}; this.state = 'connecting'; this.closed = false; }
  base() { const h = String(this.d.host || '').trim(); return `http://${h.includes(':') && !h.startsWith('[') ? `[${h}]` : h}:${this.d.port}`; }
  headers() { return {'content-type': 'application/json', authorization: `Bearer ${this.d.token}`}; }
  async post(route, body, timeout) { return this.send(route, {headers: this.headers(), body: JSON.stringify(body)}, timeout); }
  async send(route, {headers, body, duplex}, timeout) {
    let res; try { res = await this.d.fetchImpl(`${this.base()}${route}`, {method: 'POST', headers, body, duplex, signal: AbortSignal.timeout(timeout)}); }
    catch (e) { this.setState('reconnecting'); throw Error(`I can't reach JARVIS on ${this.d.host}. Is the Mac switched on, with Tailscale connected on both computers?`); }
    const j = await res.json().catch(() => ({}));
    if (res.status === 401) { this.setState('signed-out'); throw Error(j.error || 'This computer is no longer signed in. Sign in again in Settings → System → JARVIS Link.'); }
    if (!res.ok) throw Error(j.error || `JARVIS on ${this.d.host} answered ${res.status}.`);
    if (!j.ok) throw Error(j.error || 'That did not work.');
    return j.result;
  }
  call(method, payload) { if (!LINK_METHODS.has(method)) return Promise.reject(Error('That request stays on this computer.')); return this.post('/call', {method, payload}, method === 'core' ? 300000 : 60000); }
  /** Hand everything JARVIS knows to the server (Move JARVIS). */
  move(bundle) { return this.post('/move', bundle, 600000); }
  /** A recorded meeting for the server to write up and keep: its details, then the recording file (streamed, if there is one). */
  sendMeeting(details, file) {
    const head = Buffer.from(JSON.stringify(details)), len = Buffer.alloc(4); len.writeUInt32LE(head.length);
    if (head.length > MAX_MEETING_DETAILS || (file && fs.statSync(file).size > MAX_MEETING)) return Promise.reject(Error('That meeting is too big to send.'));
    async function* body() { yield len; yield head; if (file) for await (const c of fs.createReadStream(file)) yield c; }
    return this.send('/meeting', {headers: {'content-type': 'application/octet-stream', authorization: `Bearer ${this.d.token}`}, body: body(), duplex: 'half'}, 30 * 60000);
  }
  async hello() { const res = await this.d.fetchImpl(`${this.base()}/hello`, {headers: this.headers(), signal: AbortSignal.timeout(10000)}); if (!res.ok) throw Error(`status ${res.status}`); return res.json(); }
  setState(s) { if (s !== this.state) { this.state = s; try { this.d.onState(s); } catch {} } }
  /** Keep the news stream open, reconnecting with growing pauses. */
  async listen() {
    let wait = 2000;
    while (!this.closed) {
      try {
        this.abort = new AbortController();
        const res = await this.d.fetchImpl(`${this.base()}/events`, {headers: this.headers(), signal: this.abort.signal});
        if (res.status === 401) { this.setState('signed-out'); return; }
        if (!res.ok || !res.body) throw Error(`status ${res.status}`);
        this.setState('connected'); wait = 2000;
        const reader = res.body.getReader(), dec = new TextDecoder(); let buf = '';
        for (;;) {
          const {value, done} = await reader.read(); if (done) break;
          buf += dec.decode(value, {stream: true}); let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const block = buf.slice(0, i); buf = buf.slice(i + 2);
            const line = block.split('\n').find(l => l.startsWith('data: ')); if (!line) continue;
            try { const m = JSON.parse(line.slice(6)); if (LINK_CHANNELS.has(m.channel)) this.d.onEvent(m.channel, m.data); } catch {}
          }
        }
        throw Error('the stream ended');
      } catch (e) {
        if (this.closed) return;
        this.setState('reconnecting'); this.d.log('link', `Lost the link to ${this.d.host} (${e.message}); trying again.`);
        await new Promise(r => setTimeout(r, wait)); wait = Math.min(wait * 2, 60000);
      }
    }
  }
  close() { this.closed = true; try { this.abort?.abort(); } catch {} }
  /** Sign in with the code shown on the server: returns the key to keep, encrypted, on this computer. */
  static async pair({host, port = PORT, code, name, fetchImpl = globalThis.fetch}) {
    const c = new LinkClient({host, port, token: 'x'.repeat(20), fetchImpl});
    let res; try { res = await fetchImpl(`${c.base()}/pair`, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({code: String(code || '').trim().toUpperCase(), name}), signal: AbortSignal.timeout(15000)}); }
    catch { throw Error(`I can't reach ${host}. Check the name, that JARVIS Server is installed there, and that Tailscale is connected on both computers.`); }
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.token) throw Error(j.error || `${host} answered ${res.status}.`);
    return j;
  }
}
