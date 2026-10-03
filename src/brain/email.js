/**
 * JARVIS Core — email, spoken directly to your mail server (Gmail by default), with no add-ons:
 *   IMAP to read, label and save draft replies;  SMTP to send, only after you approve.
 * Gmail needs an "app password" (Google Account → Security → 2-Step Verification → App passwords).
 */
import tls from 'node:tls';
import net from 'node:net';
import crypto from 'node:crypto';

const q = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const imapDate = d => `${d.getDate()}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
const insecure = () => process.env.JARVIS_TEST_INSECURE_TLS === '1';

/* ================================================================== IMAP */
/** Split an IMAP response (text with {n} literals) into nested lists. Literals come back as Buffers. */
export function tokenize(str, lits = []) {
  const root = [], stack = [root]; let i = 0; const n = str.length;
  const top = () => stack[stack.length - 1];
  while (i < n) {
    const c = str[i];
    if (c === ' ' || c === '\r' || c === '\n') { i++; continue; }
    if (c === '(') { const l = []; top().push(l); stack.push(l); i++; continue; }
    if (c === ')') { if (stack.length > 1) stack.pop(); i++; continue; }
    if (c === '"') {
      let s = ''; i++;
      while (i < n && str[i] !== '"') { if (str[i] === '\\' && i + 1 < n) i++; s += str[i++]; }
      i++; top().push(s); continue;
    }
    if (c === '\u0001') { const e = str.indexOf('\u0001', i + 1); top().push(lits[Number(str.slice(i + 1, e))]); i = e + 1; continue; }
    let s = '';
    while (i < n && !' ()\r\n'.includes(str[i])) {
      if (str[i] === '[') { const e = str.indexOf(']', i); if (e < 0) { s += str.slice(i); i = n; break; } s += str.slice(i, e + 1); i = e + 1; continue; }
      s += str[i++];
    }
    top().push(s.toUpperCase() === 'NIL' ? null : s);
  }
  return root;
}
const pairs = list => { const o = {}; for (let k = 0; k + 1 < (list || []).length; k += 2) o[String(list[k]).toUpperCase()] = list[k + 1]; return o; };

export class Imap {
  constructor({host, port = 993, user, pass, log, timeout = 45000}) {
    Object.assign(this, {host, port, user, pass: String(pass || '').replace(/\s+/g, ''), log: log || (() => {}), timeout});
    this.n = 0; this.buf = Buffer.alloc(0); this.queue = []; this.cur = null; this.caps = new Set(); this.parts = []; this.greeted = null;
  }
  connect() {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { reject(Error(`${this.host} did not answer.`)); try { this.sock?.destroy(); } catch {} }, this.timeout);
      this.greeted = {resolve: () => { clearTimeout(t); resolve(); }, reject: e => { clearTimeout(t); reject(e); }};
      this.sock = tls.connect({host: this.host, port: this.port, servername: net.isIP(this.host) ? undefined : this.host, rejectUnauthorized: !insecure()});
      this.sock.on('data', d => { this.buf = Buffer.concat([this.buf, d]); this.drain(); });
      this.sock.on('error', e => { this.fail(Error(`Mail server: ${e.message}`)); });
      this.sock.on('close', () => this.fail(Error('The mail server closed the connection.')));
    });
  }
  fail(e) {
    this.dead = this.dead || e;   // later commands fail at once instead of waiting for a reply that cannot come
    if (this.greeted) { this.greeted.reject(e); this.greeted = null; }
    if (this.cur) { this.cur.reject(e); this.cur = null; }
    for (const c of this.queue.splice(0)) c.reject(e);
  }
  /** Assemble whole responses: a line ending in {n} is followed by n bytes of literal, then the rest of the line. */
  drain() {
    for (;;) {
      const nl = this.buf.indexOf('\r\n'); if (nl < 0) return;
      const line = this.buf.subarray(0, nl).toString('utf8');
      const lit = /\{(\d+)\+?\}$/.exec(line);
      if (lit) {
        const size = Number(lit[1]), start = nl + 2;
        if (this.buf.length < start + size) return;   // wait for the rest
        this.parts.push(line.slice(0, lit.index)); this.parts.push(Buffer.from(this.buf.subarray(start, start + size)));
        this.buf = this.buf.subarray(start + size); continue;
      }
      this.parts.push(line); this.buf = this.buf.subarray(nl + 2);
      const parts = this.parts; this.parts = [];
      this.response(parts);
    }
  }
  response(parts) {
    const lits = []; let text = '';
    for (const p of parts) { if (Buffer.isBuffer(p)) { text += `\u0001${lits.length}\u0001`; lits.push(p); } else text += p; }
    if (this.greeted) {
      if (/^\* (OK|PREAUTH)/i.test(text)) { const c = /\[CAPABILITY ([^\]]+)\]/i.exec(text); if (c) this.caps = new Set(c[1].toUpperCase().split(' ')); const g = this.greeted; this.greeted = null; g.resolve(); }
      else if (/^\* BYE/i.test(text)) this.fail(Error('The mail server turned the connection away.'));
      return;
    }
    const cur = this.cur; if (!cur) return;
    if (text.startsWith('+')) { cur.onContinue?.(); return; }
    if (text.startsWith('* ')) { cur.lines.push({text, lits}); return; }
    const m = /^(\S+) (OK|NO|BAD)\b ?(.*)$/i.exec(text);
    if (m && m[1] === cur.tag) {
      clearTimeout(cur.timer); this.cur = null;
      if (m[2].toUpperCase() === 'OK') cur.resolve({lines: cur.lines, text: m[3]}); else { const e = Error(`Mail server: ${m[3] || m[2]}`); e.imap = m[2].toUpperCase(); cur.reject(e); }
      this.next();
    }
  }
  next() {
    if (this.cur || !this.queue.length) return;
    const c = this.cur = this.queue.shift();
    c.timer = setTimeout(() => { if (this.cur === c) { this.cur = null; c.reject(Error('The mail server took too long.')); try { this.sock.destroy(); } catch {} } }, this.timeout);
    this.sock.write(`${c.tag} ${c.cmd}\r\n`);
  }
  run(cmd, {literal} = {}) {
    return new Promise((resolve, reject) => {
      if (this.dead) return reject(this.dead);
      const tag = `J${++this.n}`;
      const c = {tag, cmd: literal ? `${cmd} {${literal.length}}` : cmd, resolve, reject, lines: []};
      if (literal) c.onContinue = () => { this.sock.write(literal); this.sock.write('\r\n'); };
      this.queue.push(c); this.next();
    });
  }
  async login() {
    await this.connect();
    if (!this.caps.size) { const r = await this.run('CAPABILITY'); for (const l of r.lines) { const m = /^\* CAPABILITY (.+)$/i.exec(l.text); if (m) this.caps = new Set(m[1].toUpperCase().split(' ')); } }
    try { await this.run(`LOGIN ${q(this.user)} ${q(this.pass)}`); }
    catch (e) { throw Error(/AUTHENTICATIONFAILED|invalid credentials|login failed|auth/i.test(e.message) ? 'The mail server turned the login down. For Gmail, use an app password (not your normal password).' : e.message); }
    const r = await this.run('CAPABILITY'); for (const l of r.lines) { const m = /^\* CAPABILITY (.+)$/i.exec(l.text); if (m) this.caps = new Set(m[1].toUpperCase().split(' ')); }
    this.gmail = this.caps.has('X-GM-EXT-1');
    return this;
  }
  async select(box = 'INBOX', readOnly = false) {
    const r = await this.run(`${readOnly ? 'EXAMINE' : 'SELECT'} ${q(box)}`);
    const out = {exists: 0, uidValidity: 0, uidNext: 0};
    for (const l of r.lines) {
      let m; if ((m = /^\* (\d+) EXISTS/i.exec(l.text))) out.exists = Number(m[1]);
      if ((m = /UIDVALIDITY (\d+)/i.exec(l.text))) out.uidValidity = Number(m[1]);
      if ((m = /UIDNEXT (\d+)/i.exec(l.text))) out.uidNext = Number(m[1]);
    }
    this.box = box; return out;
  }
  async search(criteria) {
    const r = await this.run(`UID SEARCH ${criteria}`); const out = [];
    for (const l of r.lines) { const m = /^\* SEARCH\b(.*)$/i.exec(l.text); if (m) for (const x of m[1].trim().split(/\s+/)) if (/^\d+$/.test(x)) out.push(Number(x)); }
    return out.sort((a, b) => a - b);
  }
  /** Fetch messages: flags, Gmail labels and the first part of the raw message (enough for the text). */
  async fetch(uids, {bytes = 60000} = {}) {
    if (!uids.length) return [];
    const gm = this.gmail && this.gmItems !== false ? ['X-GM-LABELS', 'X-GM-THRID', 'X-GM-MSGID'] : [];
    const items = ['UID', 'FLAGS', 'INTERNALDATE', 'RFC822.SIZE', ...gm, `BODY.PEEK[]<0.${bytes}>`];
    let r;
    try { r = await this.run(`UID FETCH ${uids.join(',')} (${items.join(' ')})`); }
    catch (e) { if (!gm.length || e.imap !== 'BAD') throw e; this.gmItems = false; return this.fetch(uids, {bytes}); }   // a server that only half-speaks Gmail
    const out = [];
    for (const l of r.lines) {
      if (!/^\* \d+ FETCH/i.test(l.text)) continue;
      const tok = tokenize(l.text, l.lits); const attrs = pairs(tok[3]);
      if (!Number.isInteger(Number(attrs.UID)) || Number(attrs.UID) < 1) continue;   // a flag update without its UID is not a message
      const bodyKey = Object.keys(attrs).find(k => k.startsWith('BODY[]'));
      const raw = attrs[bodyKey]; const rawBuf = Buffer.isBuffer(raw) ? raw : Buffer.from(String(raw || ''), 'utf8');
      out.push({uid: Number(attrs.UID), flags: (attrs.FLAGS || []).map(String), labels: (attrs['X-GM-LABELS'] || []).map(x => Buffer.isBuffer(x) ? x.toString() : String(x)),
        thread: attrs['X-GM-THRID'] || '', gmId: attrs['X-GM-MSGID'] || '', date: Date.parse(attrs.INTERNALDATE) || 0, size: Number(attrs['RFC822.SIZE']) || 0, raw: rawBuf});
    }
    return out.sort((a, b) => a.uid - b.uid);
  }
  async addLabels(uids, labels) {
    if (!uids.length || !labels.length) return;
    if (this.gmail) return this.run(`UID STORE ${uids.join(',')} +X-GM-LABELS (${labels.map(q).join(' ')})`);
    for (const l of labels) { try { await this.run(`UID COPY ${uids.join(',')} ${q(l)}`); } catch {} }   // other servers: a copy in a folder of that name
  }
  async archive(uids) { if (this.gmail && uids.length) return this.run(`UID STORE ${uids.join(',')} -X-GM-LABELS (\\Inbox)`); }
  async markRead(uids, read = true) { if (uids.length) return this.run(`UID STORE ${uids.join(',')} ${read ? '+' : '-'}FLAGS (\\Seen)`); }
  async createBox(name) { try { await this.run(`CREATE ${q(name)}`); return true; } catch (e) { if (/exists|already/i.test(e.message)) return false; return false; } }
  async list() {
    const r = await this.run('LIST "" "*"'); const out = [];
    for (const l of r.lines) { if (!/^\* LIST/i.test(l.text)) continue; const tok = tokenize(l.text, l.lits); const name = tok[4]; out.push({flags: (tok[2] || []).map(String), name: Buffer.isBuffer(name) ? name.toString() : String(name)}); }
    return out;
  }
  async specialBox(flag, fallbacks) {
    const all = await this.list();
    const hit = all.find(b => b.flags.some(f => f.toLowerCase() === flag.toLowerCase())) || all.find(b => fallbacks.includes(b.name));
    return hit?.name || fallbacks[0];
  }
  async append(box, raw, flags = []) { return this.run(`APPEND ${q(box)} (${flags.join(' ')})`, {literal: Buffer.from(raw)}); }
  async deleteUids(uids) { if (!uids.length) return; await this.run(`UID STORE ${uids.join(',')} +FLAGS (\\Deleted)`); try { await this.run(this.caps.has('UIDPLUS') ? `UID EXPUNGE ${uids.join(',')}` : 'EXPUNGE'); } catch {} }
  async logout() { try { await Promise.race([this.run('LOGOUT'), new Promise(r => setTimeout(r, 3000))]); } catch {} try { this.sock.end(); } catch {} }
}

/* ================================================================== MIME */
function decodeCharset(buf, charset = 'utf-8') {
  let cs = String(charset || 'utf-8').toLowerCase().replace(/^["']|["']$/g, '');
  if (cs === 'us-ascii' || cs === 'ascii') cs = 'utf-8';
  try { return new TextDecoder(cs).decode(buf); } catch { try { return new TextDecoder('utf-8').decode(buf); } catch { return buf.toString('latin1'); } }
}
function qpDecode(s) {
  const bytes = []; const t = s.replace(/=\r?\n/g, '');
  for (let i = 0; i < t.length; i++) {
    if (t[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(t.slice(i + 1, i + 3))) { bytes.push(parseInt(t.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(t.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes);
}
/** "=?UTF-8?B?…?=" and friends, as in subjects and names. */
export function decodeWords(s) {
  return String(s || '').replace(/(=\?[^?]+\?[bBqQ]\?[^?]*\?=)\s+(?==\?)/g, '$1').replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (m, cs, enc, text) => {
    try { const buf = enc.toUpperCase() === 'B' ? Buffer.from(text, 'base64') : qpDecode(text.replace(/_/g, ' ')); return decodeCharset(buf, cs.split('*')[0]); } catch { return m; }
  });
}
function headerMap(raw) {
  const out = {};
  const unfolded = raw.replace(/\r?\n[ \t]+/g, ' ');
  for (const line of unfolded.split(/\r?\n/)) {
    const c = line.indexOf(':'); if (c < 1) continue;
    const k = line.slice(0, c).trim().toLowerCase();
    const v = decodeWords(decodeCharset(Buffer.from(line.slice(c + 1).trim(), 'latin1'), 'utf-8'));
    (out[k] = out[k] || []).push(v);
  }
  return out;
}
export function contentType(v) {
  const s = String(v || 'text/plain'); const semi = s.indexOf(';');
  const type = (semi < 0 ? s : s.slice(0, semi)).trim().toLowerCase(); const params = {};
  const re = /;\s*([\w*.-]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/g; let m;
  while ((m = re.exec(s))) {
    let key = m[1].toLowerCase(), val = m[2].trim(); if (val.startsWith('"')) val = val.slice(1, -1).replace(/\\(.)/g, '$1');
    if (key.endsWith('*')) { key = key.slice(0, -1); const x = /^([^']*)'[^']*'(.*)$/.exec(val); if (x) { try { val = decodeURIComponent(x[2]); } catch {} } }
    params[key] = val;
  }
  return {type, params};
}
/** Addresses: 'Sarah Jones <sarah@x.com>, "Doe, J" <j@y.com>' -> [{name, address}] */
export function addresses(v) {
  const out = []; let cur = '', quote = false, angle = false;
  for (const ch of String(v || '')) { if (ch === '"') quote = !quote; if (ch === '<') angle = true; if (ch === '>') angle = false; if (ch === ',' && !quote && !angle) { out.push(cur); cur = ''; } else cur += ch; }
  if (cur.trim()) out.push(cur);
  return out.map(x => {
    const m = /^\s*"?([^"<]*?)"?\s*<([^>]+)>/.exec(x);
    if (m) return {name: m[1].trim(), address: m[2].trim().toLowerCase()};
    const a = /[\w.+'-]+@[\w.-]+/.exec(x); const n = /\(([^)]+)\)/.exec(x);
    return a ? {name: n ? n[1].trim() : '', address: a[0].toLowerCase()} : null;
  }).filter(Boolean);
}
const codePoint = n => (Number.isInteger(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '�');   // a broken entity must not stop the inbox
export function htmlToText(h) {
  return String(h || '').replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h\d|table|blockquote)>/gi, '\n').replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, d) => codePoint(Number(d))).replace(/&#x([0-9a-f]+);/gi, (_, h2) => codePoint(parseInt(h2, 16)))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim();
}
/** The new part of an email: drop quoted history and long signatures. */
export function freshText(t) {
  const lines = String(t || '').replace(/\r/g, '').split('\n'); const out = [];
  for (const l of lines) {
    if (/^On .{6,120} wrote:\s*$/i.test(l.trim()) || /^-{2,}\s*Original Message\s*-{2,}/i.test(l.trim()) || /^From: .+/.test(l.trim()) && out.length > 3 || /^_{10,}$/.test(l.trim())) break;
    if (/^>/.test(l)) continue;
    out.push(l);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
export function parseMessage(buf) {
  const raw = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf || ''), 'utf8');
  const s = raw.toString('latin1');
  const split = /\r?\n\r?\n/.exec(s); const headRaw = split ? s.slice(0, split.index) : s; const body = split ? raw.subarray(split.index + split[0].length) : Buffer.alloc(0);
  const h = headerMap(headRaw);
  const one = k => (h[k] || [])[0] || '';
  const found = {text: '', html: '', attachments: []};
  walk(h, body, found, 0);
  const from = addresses(one('from'))[0] || {name: '', address: ''};
  const ids = v => (String(v || '').match(/<[^>]+>/g) || []);
  return {headers: h, subject: one('subject').replace(/\s+/g, ' ').trim(), from, replyTo: addresses(one('reply-to'))[0] || null, to: addresses(one('to')), cc: addresses(one('cc')),
    date: Date.parse(one('date')) || 0, messageId: ids(one('message-id'))[0] || '', inReplyTo: ids(one('in-reply-to'))[0] || '', references: ids(one('references')),
    listUnsubscribe: one('list-unsubscribe'), precedence: one('precedence').toLowerCase(), autoSubmitted: one('auto-submitted').toLowerCase(),
    text: found.text || htmlToText(found.html), attachments: found.attachments};
}
function walk(h, body, found, depth) {
  if (depth > 6) return;
  const ct = contentType((h['content-type'] || [])[0]);
  const enc = String((h['content-transfer-encoding'] || [])[0] || '').toLowerCase().trim();
  const disp = String((h['content-disposition'] || [])[0] || '').toLowerCase();
  if (ct.type.startsWith('multipart/') && ct.params.boundary) {
    const b = '--' + ct.params.boundary; const s = body.toString('latin1');
    const chunks = s.split(b).slice(1);
    for (const ch of chunks) {
      if (ch.startsWith('--')) break;
      const part = ch.replace(/^\r?\n/, '');
      const sp = /\r?\n\r?\n/.exec(part); const ph = headerMap(sp ? part.slice(0, sp.index) : '');
      const pb = Buffer.from(sp ? part.slice(sp.index + sp[0].length).replace(/\r?\n$/, '') : part, 'latin1');
      walk(ph, pb, found, depth + 1);
    }
    return;
  }
  let data = body;
  if (enc === 'base64') data = Buffer.from(body.toString('latin1').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64');
  else if (enc === 'quoted-printable') data = qpDecode(body.toString('latin1'));
  const name = ct.params.name || contentType(disp.replace(/^[^;]*/, 'x')).params.filename || '';
  if (/attachment/.test(disp) || (name && !ct.type.startsWith('text/'))) { found.attachments.push({name: decodeWords(name), type: ct.type, size: data.length}); return; }
  if (ct.type === 'text/plain' && !found.text) found.text = decodeCharset(data, ct.params.charset).trim();
  else if (ct.type === 'text/html' && !found.html) found.html = decodeCharset(data, ct.params.charset);
  else if (ct.type === 'message/rfc822') { const inner = parseMessage(data); if (!found.text) found.text = inner.text; }
}

/* ================================================================== writing and sending */
/** A plain, single email address: nothing that could smuggle extra commands or headers into a message. */
export const validAddress = a => typeof a === 'string' && a.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,62}[A-Za-z0-9])?)+$/.test(a);
const oneLineHeader = v => String(v ?? '').replace(/[\r\n\u0000]+/g, ' ').trim();
const encWord = s => /[^\x20-\x7e]/.test(s) ? chunkWords(s) : s;
function chunkWords(s) {
  const out = []; let cur = '';
  for (const ch of s) { if (Buffer.byteLength(cur + ch) > 42) { out.push(cur); cur = ''; } cur += ch; }
  if (cur) out.push(cur);
  return out.map(x => `=?UTF-8?B?${Buffer.from(x).toString('base64')}?=`).join('\r\n ');
}
const addr = a => {
  const o = typeof a === 'string' ? {name: '', address: a} : a;
  if (!validAddress(o.address)) throw Error(`“${String(o.address).slice(0, 60)}” is not a valid email address.`);
  const name = oneLineHeader(o.name).replace(/[<>"]/g, '');
  return name ? `${/[^\x20-\x7e]/.test(name) ? encWord(name) : q(name)} <${o.address}>` : o.address;
};
const msgId = v => /^<[^<>\s]{3,250}>$/.test(String(v || '')) ? v : '';
export function buildMessage({from, to, cc = [], subject, text, inReplyTo = '', references = [], messageId, date = new Date()}) {
  const dom = (/@([\w.-]+)/.exec(typeof from === 'string' ? from : from.address) || [])[1] || 'jarvis.local';
  const id = msgId(messageId) || `<${crypto.randomBytes(12).toString('hex')}.jarvis@${dom}>`;
  const refs = references.map(msgId).filter(Boolean); const irt = msgId(inReplyTo);
  const head = [`From: ${addr(from)}`, `To: ${[].concat(to).map(addr).join(', ')}`, ...(cc.length ? [`Cc: ${cc.map(addr).join(', ')}`] : []), `Subject: ${encWord(oneLineHeader(subject))}`,
    `Date: ${date.toUTCString().replace('GMT', '+0000')}`, `Message-ID: ${id}`, ...(irt ? [`In-Reply-To: ${irt}`] : []), ...(refs.length ? [`References: ${refs.join(' ')}`] : []),
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', 'X-Mailer: JARVIS Armor Workspace'];
  const b64 = Buffer.from(String(text || '').replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  return {raw: head.join('\r\n') + '\r\n\r\n' + b64 + '\r\n', messageId: id};
}

/** Send one message over SMTP (port 465 = TLS from the start; 587 = STARTTLS). */
export function smtpSend({host, port = 465, user, pass, from, to, raw, log, timeout = 45000}) {
  const password = String(pass || '').replace(/\s+/g, '');
  const rcpts = [].concat(to).map(r => typeof r === 'string' ? r : r.address);
  if (!validAddress(user) || !rcpts.length || !rcpts.every(validAddress)) return Promise.reject(Error('Refused: an email address is not valid.'));
  return new Promise((resolve, reject) => {
    let sock, buf = '', waiting = null, done = false, sent = false, bodyOut = false;
    // notSent: the server certainly has not taken the message (it refused, or the body never went out)
    const fail = e => { if (done) return; done = true; clearTimeout(t); try { sock?.destroy(); } catch {} const err = e instanceof Error ? e : Error(String(e)); if (err.notSent === undefined) err.notSent = !bodyOut; reject(err); };
    const t = setTimeout(() => fail(Error('The mail server took too long.')), timeout);
    const onData = d => {
      buf += d.toString('utf8');
      for (;;) {
        const lines = buf.split('\r\n'); let end = -1;
        for (let i = 0; i < lines.length - 1; i++) if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) { end = i; break; }
        if (end < 0) return;
        const reply = lines.slice(0, end + 1); buf = lines.slice(end + 1).join('\r\n');
        const code = Number(reply[end].slice(0, 3)); const w = waiting; waiting = null; w?.({code, text: reply.map(l => l.slice(4)).join(' ')});
      }
    };
    const expect = (ok, cmd) => new Promise((res, rej) => { waiting = r => { if (ok.includes(r.code)) return res(r); const e = Error(`Mail server said ${r.code}: ${r.text}`); e.notSent = true; rej(e); }; if (cmd !== undefined) sock.write(cmd + '\r\n'); });
    const attach = s => { sock = s; s.on('data', onData); s.on('error', e => fail(Error(`Mail server: ${e.message}`))); s.on('close', () => { if (!sent) fail(Error('The mail server closed the connection.')); else if (!done) { done = true; clearTimeout(t); resolve(true); } }); };
    (async () => {
      const implicit = port === 465;
      attach(implicit ? tls.connect({host, port, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: !insecure()}) : net.connect({host, port}));
      await expect([220]);
      let ehlo = await expect([250], 'EHLO jarvis.local');
      if (!implicit) {
        if (!/STARTTLS/i.test(ehlo.text)) throw Error('The mail server does not offer a secure connection.');
        await expect([220], 'STARTTLS');
        sock.removeListener('data', onData);
        attach(tls.connect({socket: sock, servername: net.isIP(host) ? undefined : host, rejectUnauthorized: !insecure()}));
        ehlo = await expect([250], 'EHLO jarvis.local');
      }
      try { await expect([235], 'AUTH PLAIN ' + Buffer.from(`\0${user}\0${password}`).toString('base64')); }
      catch (e) { throw Error(/535|534|5\.7\.8/.test(e.message) ? 'The mail server turned the login down. For Gmail, use an app password.' : e.message); }
      await expect([250], `MAIL FROM:<${user}>`);
      for (const r of rcpts) await expect([250, 251], `RCPT TO:<${r}>`);
      await expect([354], 'DATA');
      const body = raw.replace(/\r?\n/g, '\r\n').split('\r\n').map(l => l.startsWith('.') ? '.' + l : l).join('\r\n');
      bodyOut = true; sock.write(body.endsWith('\r\n') ? body : body + '\r\n');
      await expect([250], '.'); sent = true;   // accepted: a connection closed after this is not a failure
      try { await Promise.race([expect([221], 'QUIT'), new Promise(r => setTimeout(r, 2000))]); } catch {}
      done = true; clearTimeout(t); try { sock.end(); } catch {} resolve(true);
    })().catch(fail);
  });
}
