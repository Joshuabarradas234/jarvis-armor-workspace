/**
 * JARVIS Core — what it keeps on disk (in the app's data folder):
 *   brain.json          settings (no passwords)
 *   brain-secrets.enc   Twilio token, email app password… encrypted with Windows' own credential protection
 *   brain-state.json    what has already run today, bedtime, where email checking got to…
 *   activity.jsonl      everything JARVIS did on its own
 *   reports.json        overnight reports, audits, summaries (also saved as Markdown in Documents\JARVIS\Reports)
 *   alarms.json         one-off wake-up calls ("wake me at 6:30")
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readJson, writeJson, writeText, replaceFile, clip, e164, dayKey, safeFileName} from './util.js';

export const MODELS = [
  {id: 'claude-opus-5-5', name: 'Claude Opus 5.5 (smartest)'},
  {id: 'claude-opus-5', name: 'Claude Opus 5'},
  {id: 'claude-sonnet-5', name: 'Claude Sonnet 5 (recommended)'},
  {id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5 (fastest, cheapest)'},
];
export const DEFAULTS = {
  enabled: true,
  owner: {name: '', address: 'sir', phone: '', email: ''},   // your name and mobile are entered in Settings → JARVIS Core and stay on this PC
  models: {brain: 'claude-sonnet-5', fast: 'claude-haiku-4-5-20251001', code: 'claude-sonnet-5'},
  codeEngine: 'auto',            // auto | api | claude-code
  budgetPerDay: 5,               // US dollars of Claude API use per day, for everything JARVIS does on its own
  phone: {
    twilioSid: '', twilioFrom: '', whatsappFrom: '+14155238886',   // the Twilio WhatsApp sandbox number until you have your own
    whatsapp: true, sms: false, callmebot: false,
    voice: 'Polly.Brian-Neural', language: 'en-GB',
    ringSeconds: 25, retries: 2, retryMinutes: 5,
  },
  delivery: {reports: 'call', approvals: 'whatsapp', alerts: 'whatsapp', updates: 'whatsapp'},   // call | whatsapp | both
  email: {enabled: false, address: '', imapHost: 'imap.gmail.com', imapPort: 993, smtpHost: 'smtp.gmail.com', smtpPort: 465, draftReplies: true, labelPrefix: 'JARVIS',
    categories: ['Needs reply', 'Customers', 'Billing', 'Receipts', 'Newsletters', 'Notifications', 'FYI']},
  quiet: {on: true, from: '22:30', to: '06:30'},
  selfImprove: {enabled: true, maxPerNight: 2, autoRestart: 'idle'},   // autoRestart: idle | ask | never
  meetingWork: {autoStart:false,perMeeting:1},
  workDesk: {folder:'',personalities:true,photoDrop:true,photoAnalysis:false,photoLimit:1},
  voiceNotes: {enabled: false, dailyLimit: 0.50},
  routines: {weekly: true, backup: true, releases: true, zone: Intl.DateTimeFormat().resolvedOptions().timeZone},
  github: {repo: 'Joshuabarradas234/jarvis-armor-workspace', pullRequests: true},   // approved self-updates are proposed there as pull requests once a key is saved
  keepAwake: true,
  wakePc: true,   // Windows wakes the PC from sleep for the next call, message or report
  pcVoice: true,
};
const SECRET_KEYS = ['twilioToken', 'callmebotKey', 'emailPassword', 'openaiKey', 'higgsfieldKey', 'githubToken', 'assemblyaiKey'];
const merge = (base, over) => {
  const out = Array.isArray(base) ? [...base] : {...base};
  for (const [k, v] of Object.entries(over || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && base?.[k] && typeof base[k] === 'object' && !Array.isArray(base[k]) ? merge(base[k], v) : v;
  return out;
};
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const num = (v, d) => { const n = Number(v); return v === '' || v === null || v === undefined || !Number.isFinite(n) ? d : n; };

export class BrainStore {
  /** crypt: {available(), encrypt(text)->Buffer, decrypt(Buffer)->text} (Electron safeStorage in the app) */
  constructor({dir, docs, crypt, log}) {
    Object.assign(this, {dir, docs, crypt, log: log || (() => {})});
    this.files = {config: path.join(dir, 'brain.json'), secrets: path.join(dir, 'brain-secrets.enc'), state: path.join(dir, 'brain-state.json'),
      activity: path.join(dir, 'activity.jsonl'), reports: path.join(dir, 'reports.json'), alarms: path.join(dir, 'alarms.json'), spend: path.join(dir, 'brain-spend.json')};
    this.home = path.join(docs, 'JARVIS');
    this.config = this.clean(merge(DEFAULTS, readJson(this.files.config, {})));
    this.state = readJson(this.files.state, {}) || {};
    this.reports = readJson(this.files.reports, []) || [];
    this.alarms = readJson(this.files.alarms, []) || [];
    this.spend = readJson(this.files.spend, {day: dayKey(), usd: 0, byKind: {}}) || {day: dayKey(), usd: 0, byKind: {}};
    this.spendHistory = readJson(path.join(dir, 'brain-spend-history.json'), {}) || {};
    this.activity = [];
    try { this.activity = fs.readFileSync(this.files.activity, 'utf8').trim().split('\n').slice(-400).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch {}
    this.secretCache = null;
    try { fs.mkdirSync(this.home, {recursive: true}); } catch (e) { this.log('brain', `Could not create ${this.home}: ${e.message}`); }
  }
  /* ---------- settings ---------- */
  clean(c) {
    const o = merge(DEFAULTS, c);
    o.enabled = o.enabled !== false;
    o.owner = {name: clip(String(o.owner.name || '').trim(), 40), address: clip(String(o.owner.address || 'sir').trim(), 20) || 'sir', phone: e164(o.owner.phone) || DEFAULTS.owner.phone, email: clip(String(o.owner.email || '').trim(), 120)};
    for (const k of ['brain', 'fast', 'code']) if (typeof o.models[k] !== 'string' || !/^[\w.-]{3,60}$/.test(o.models[k])) o.models[k] = DEFAULTS.models[k];
    if (!['auto', 'api', 'claude-code'].includes(o.codeEngine)) o.codeEngine = 'auto';
    o.budgetPerDay = Math.max(0.25, Math.min(200, Number(o.budgetPerDay) || DEFAULTS.budgetPerDay));
    const p = o.phone;
    p.twilioSid = /^AC[0-9a-f]{32}$/i.test(String(p.twilioSid || '').trim()) ? String(p.twilioSid).trim() : '';
    p.twilioFrom = e164(p.twilioFrom); p.whatsappFrom = e164(p.whatsappFrom);
    for (const k of ['whatsapp', 'sms', 'callmebot']) p[k] = !!p[k];
    delete p.twoWay; delete p.publicUrl;
    p.voice = /^[\w.-]{3,60}$/.test(p.voice || '') ? p.voice : DEFAULTS.phone.voice;
    p.language = /^[a-z]{2}-[A-Z]{2}$/.test(p.language || '') ? p.language : 'en-GB';
    p.ringSeconds = Math.max(10, Math.min(60, Math.round(Number(p.ringSeconds) || 25)));
    p.retries = Math.max(0, Math.min(5, Math.round(num(p.retries, 2))));
    p.retryMinutes = Math.max(1, Math.min(30, Math.round(Number(p.retryMinutes) || 5)));
    for (const k of Object.keys(DEFAULTS.delivery)) if (!['call', 'whatsapp', 'both'].includes(o.delivery[k])) o.delivery[k] = DEFAULTS.delivery[k];
    const e = o.email;
    e.enabled = !!e.enabled; e.address = clip(String(e.address || '').trim(), 120);
    for (const k of ['imapHost', 'smtpHost']) e[k] = /^[\w.-]{3,120}$/.test(e[k] || '') ? e[k] : DEFAULTS.email[k];
    for (const k of ['imapPort', 'smtpPort']) e[k] = Math.max(1, Math.min(65535, Math.round(Number(e[k]) || DEFAULTS.email[k])));
    e.draftReplies = e.draftReplies !== false; e.labelPrefix = clip(String(e.labelPrefix || 'JARVIS').replace(/[^\w -]/g, '').trim(), 30) || 'JARVIS';
    e.categories = (Array.isArray(e.categories) ? e.categories : DEFAULTS.email.categories).map(x => clip(String(x).replace(/[^\w &-]/g, '').trim(), 30)).filter(Boolean).slice(0, 12);
    if (!e.categories.includes('Needs reply')) e.categories.unshift('Needs reply');
    o.quiet = {on: o.quiet.on !== false, from: HHMM.test(o.quiet.from) ? o.quiet.from : DEFAULTS.quiet.from, to: HHMM.test(o.quiet.to) ? o.quiet.to : DEFAULTS.quiet.to};
    o.selfImprove = {enabled: o.selfImprove.enabled !== false, maxPerNight: Math.max(0, Math.min(5, Math.round(num(o.selfImprove.maxPerNight, 2)))), autoRestart: ['idle', 'ask', 'never'].includes(o.selfImprove.autoRestart) ? o.selfImprove.autoRestart : 'idle'};
    o.meetingWork={autoStart:o.meetingWork?.autoStart===true,perMeeting:Math.max(.1,Math.min(10,num(o.meetingWork?.perMeeting,1)))};
    o.workDesk={folder:typeof o.workDesk?.folder==='string'?o.workDesk.folder.slice(0,2048):'',personalities:o.workDesk?.personalities!==false,photoDrop:o.workDesk?.photoDrop!==false,photoAnalysis:o.workDesk?.photoAnalysis===true,photoLimit:Math.max(0,Math.min(10,num(o.workDesk?.photoLimit,1)))};
    o.voiceNotes = {enabled: o.voiceNotes?.enabled === true, dailyLimit: Math.max(0, Math.min(10, num(o.voiceNotes?.dailyLimit, .5)))};
    let zone=String(o.routines?.zone||DEFAULTS.routines.zone);try{new Intl.DateTimeFormat('en-GB',{timeZone:zone}).format();}catch{zone=DEFAULTS.routines.zone;}
    o.routines={weekly:o.routines?.weekly!==false,backup:o.routines?.backup!==false,releases:o.routines?.releases!==false,zone};
    o.github={repo:/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(String(o.github?.repo||'').trim())?String(o.github.repo).trim():DEFAULTS.github.repo,pullRequests:o.github?.pullRequests!==false};
    o.keepAwake = o.keepAwake !== false; o.wakePc = o.wakePc !== false; o.pcVoice = o.pcVoice !== false;
    return o;
  }
  get() { return this.config; }
  save(patch) {
    this.config = this.clean(merge(this.config, patch || {}));
    writeJson(this.files.config, this.config, 2);
    return this.config;
  }
  /* ---------- secrets ---------- */
  secrets() {
    if (this.secretCache) return this.secretCache;
    let out = {};
    try {
      if (fs.existsSync(this.files.secrets)) {
        const raw = fs.readFileSync(this.files.secrets);
        out = JSON.parse(raw.subarray(0, 6).toString() === 'PLAIN:' && process.env.JARVIS_TEST === '1' ? raw.subarray(6).toString('utf8') : this.crypt.decrypt(raw));
      }
    } catch (e) { this.log('brain', 'Could not read saved passwords: ' + e.message); }
    this.secretCache = out; return out;
  }
  secret(name) { return this.secrets()[name] || ''; }
  hasSecret(name) { return !!this.secret(name); }
  setSecret(name, value) {
    if (!SECRET_KEYS.includes(name)) throw Error('Unknown secret.');
    const all = {...this.secrets()};
    const v = String(value ?? '').trim();
    if (v) all[name] = v.slice(0, 400); else delete all[name];
    const text = JSON.stringify(all);
    let buf;
    if (this.crypt?.available()) buf = this.crypt.encrypt(text);
    else if (process.env.JARVIS_TEST === '1') buf = Buffer.concat([Buffer.from('PLAIN:'), Buffer.from(text)]);
    else throw Error('Secure password storage is not available on this computer.');
    fs.mkdirSync(this.dir, {recursive: true}); const tmp = `${this.files.secrets}.${process.pid}.tmp`; fs.writeFileSync(tmp, buf); replaceFile(tmp, this.files.secrets);
    this.secretCache = all; return true;
  }
  secretFlags() { return Object.fromEntries(SECRET_KEYS.map(k => [k, this.hasSecret(k)])); }
  /* ---------- state ---------- */
  setState(patch) { Object.assign(this.state, patch); writeJson(this.files.state, this.state); return this.state; }
  /* ---------- activity ---------- */
  act(kind, text, extra = {}) {
    const row = {t: Date.now(), kind, text: clip(String(text).replace(/\s+/g, ' ').trim(), 400), ...extra};
    this.activity.push(row); if (this.activity.length > 500) this.activity = this.activity.slice(-400);
    try {
      if (fs.existsSync(this.files.activity) && fs.statSync(this.files.activity).size > 1.5e6) fs.renameSync(this.files.activity, this.files.activity + '.previous');
      fs.appendFileSync(this.files.activity, JSON.stringify(row) + '\n');
    } catch {}
    return row;
  }
  recent(hours = 24, kinds) { const since = Date.now() - hours * 3600e3; return this.activity.filter(a => a.t >= since && (!kinds || kinds.includes(a.kind))); }
  /* ---------- reports ---------- */
  addReport({kind, title, text, spoken = '', data = null}) {
    const r = {id: crypto.randomUUID().slice(0, 8), kind, title: clip(title, 160), at: Date.now(), text: clip(text, 60000), spoken: clip(spoken, 6000), data, delivered: [], file: ''};
    try {
      const dir = path.join(this.home, 'Reports'); fs.mkdirSync(dir, {recursive: true});
      const d = new Date(r.at); const f = path.join(dir, `${dayKey(d)} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')} ${safeFileName(title)}.md`);
      writeText(f, `# ${title}\n\n_${d.toLocaleString('en-GB', {weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'})}_\n\n${text}\n`); r.file = f;
    } catch (e) { this.log('brain', 'Could not save the report file: ' + e.message); }
    this.reports.push(r); this.reports = this.reports.slice(-60); writeJson(this.files.reports, this.reports);
    return r;
  }
  report(id) { return this.reports.find(r => r.id === id) || null; }
  markDelivered(id, via, ok, note = '') { const r = this.report(id); if (!r) return; r.delivered.push({via, ok, at: Date.now(), note: clip(note, 200)}); writeJson(this.files.reports, this.reports); }
  /* ---------- alarms (one-off; the everyday ones live in the Standing orders file) ---------- */
  addAlarm({at, zone, kind = 'call', report = true, note = '', source = 'you'}) {
    if (!Number.isFinite(at) || at < Date.now() - 60000) throw Error('That time has already gone.');
    const a = {id: crypto.randomUUID().slice(0, 8), at, zone: typeof zone==='string'?zone:'', kind: ['call', 'whatsapp'].includes(kind) ? kind : 'call', report: !!report, note: clip(note, 200), source, status: 'armed', created: Date.now(), tries: 0};
    this.alarms.push(a); this.flushAlarms(); return a;
  }
  cancelAlarm(id) { const a = this.alarms.find(x => x.id === id); if (a && a.status === 'armed') { a.status = 'cancelled'; this.flushAlarms(); } return a; }
  flushAlarms() { const cut = Date.now() - 7 * 864e5; this.alarms = this.alarms.filter(a => a.status === 'armed' || a.at > cut).slice(-100); writeJson(this.files.alarms, this.alarms); }
  /* ---------- spend ---------- */
  spent() { if (this.spend.day !== dayKey()) this.spend = {day: dayKey(), usd: 0, byKind: {}}; return this.spend.usd; }
  addSpend(usd, kind = 'brain') {
    if (!(usd > 0)) return; this.spent();
    this.spend.usd = Math.round((this.spend.usd + usd) * 10000) / 10000; this.spend.byKind[kind] = Math.round(((this.spend.byKind[kind] || 0) + usd) * 10000) / 10000;
    writeJson(this.files.spend, this.spend);
    this.spendHistory[this.spend.day] = structuredClone(this.spend);
    for (const day of Object.keys(this.spendHistory).sort().slice(0,-90)) delete this.spendHistory[day];
    writeJson(path.join(this.dir, 'brain-spend-history.json'), this.spendHistory);
  }
  /** Give back (part of) a reservation that was never used, within today's total. */
  refundSpend(usd, kind = 'brain') {
    if (!(usd > 0)) return; this.spent(); const back = Math.min(usd, this.spend.usd);
    this.spend.usd = Math.round((this.spend.usd - back) * 10000) / 10000; this.spend.byKind[kind] = Math.max(0, Math.round(((this.spend.byKind[kind] || 0) - back) * 10000) / 10000);
    writeJson(this.files.spend, this.spend); this.spendHistory[this.spend.day] = structuredClone(this.spend);
    writeJson(path.join(this.dir, 'brain-spend-history.json'), this.spendHistory);
  }
  budgetLeft() { return Math.max(0, this.config.budgetPerDay - this.spent()); }
  /* ---------- JARVIS's own notes (it may tidy these itself) ---------- */
  notesFile() { return path.join(this.home, 'Notes.md'); }
  notes() { try { return fs.readFileSync(this.notesFile(), 'utf8'); } catch { return ''; } }
  addNote(text) {
    const f = this.notesFile(); let cur = this.notes();
    if (!cur) cur = `# JARVIS notes\n\nThings I have learned while working for you. I keep this tidy myself; edit it whenever you like.\n\n`;
    const stamp = new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
    writeText(f, `${cur.trimEnd()}\n- ${String(text).replace(/\s+/g, ' ').trim().slice(0, 500)} _(added ${stamp})_\n`);
  }
  setNotes(text) { writeText(this.notesFile(), String(text)); }
}
