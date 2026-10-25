#!/usr/bin/env node
/**
 * JARVIS Server: JARVIS's brain on its own, for a computer that stays on (the owner's Mac mini, macOS 12, Node 22).
 * It has no windows: launchd starts it at login and restarts it if it stops (scripts/server/), and it keeps the Mac
 * awake. It runs JARVIS Core (phone, WhatsApp, email, approvals, schedules, overnight jobs, reports), keeps the
 * to-dos and the calendar, and writes up and keeps the meetings the ZenBook records (~/JARVIS/Meetings).
 * The ZenBook signs in to it over Tailscale (src/main/link.js).
 *
 *   node src/server/server.mjs           run (launchd does this)
 *   node src/server/server.mjs pair      ask the running server for a new pairing code, shown on this Mac's screen
 *
 * Data: ~/Library/Application Support/JARVIS Server/data (JARVIS_SERVER_DIR overrides it, for tests).
 * Your files: ~/JARVIS, a plain folder in your home folder that you can share with the ZenBook (meetings in ~/JARVIS/Meetings).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createJarvisCore} from '../brain/index.js';
import {TodoStore} from '../services/todos.js';
import {CalendarStore} from '../services/calendar.js';
import {IdeaStore} from '../services/ideas.js';
import {TowerStore} from '../tower/store.js';
import {TowerRunner} from '../tower/orchestrator.js';
import {WorkstationStore} from '../workstations/store.js';
import {SettingsStore} from '../settings/store.js';
import {validateSettings} from '../settings/schema.js';
import {MeetingFollowups} from '../meeting/followups.js';
import {MeetingManager, safe} from '../meeting/manager.js';
import {writeUp} from '../meeting/writeup.js';
import {ask} from '../brain/llm.js';
import {weather} from '../services/integrations.js';
import {LinkServer, isTailnet, tailscaleAddress} from '../main/link.js';
import {apply as moveApply, plan as movePlan, findOneDrive, KIND as MOVE_KIND} from '../main/move-jarvis.js';
import {dataKey, makeCrypt} from './secrets.js';

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VERSION = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version;
const BASE = process.env.JARVIS_SERVER_DIR || (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'JARVIS Server') : path.join(os.homedir(), '.jarvis-server'));
const DATA = path.join(BASE, 'data'), DOCS = path.join(BASE, 'Documents');   // Documents here, not ~/Documents: no macOS privacy prompt for a background job
const FILES = path.join(os.homedir(), 'JARVIS');   // the meetings: a plain folder in your home folder (not Documents, which macOS guards), easy to share with the ZenBook
const TEST = process.env.JARVIS_SERVER_TEST === '1';   // tests only: listen on 127.0.0.1 and never exit by itself
const sleep = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync(DATA, {recursive: true}); fs.mkdirSync(DOCS, {recursive: true});
const LOG = path.join(DATA, 'jarvis.log');
function log(kind, message) { const line = JSON.stringify({time: new Date().toISOString(), kind, message: String(message)}); try { fs.appendFileSync(LOG, line + '\n'); } catch {} if (TEST || process.env.JARVIS_SERVER_ECHO === '1') console.log(line); }
const REQUEST = path.join(DATA, 'pair-request'), CODE_FILE = path.join(DATA, 'pair-code.json');

/* ---------- "node server.mjs pair": ask the running server for a code ---------- */
if (process.argv[2] === 'pair') {
  const asked = Date.now(); fs.writeFileSync(REQUEST, String(asked));
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try { const c = JSON.parse(fs.readFileSync(CODE_FILE, 'utf8')); if (c.at >= asked) { console.log(`\n  Pairing code:  ${c.code}\n\n  On the ZenBook: JARVIS → Settings → System → JARVIS Link → type this code.\n  It works for ${c.minutes} minutes, once.\n`); process.exit(0); } } catch {}
  }
  console.log('\n  JARVIS Server is not answering. Is it running? (Double-click "Install JARVIS Server" again to start it.)\n'); process.exit(1);
}

/* ---------- one server at a time ---------- */
const LOCK = path.join(DATA, 'server.pid');
/** Is that process really a JARVIS Server? After the Mac restarts, an old number can belong to any other program. */
function isServer(pid) {
  try { process.kill(pid, 0); } catch (e) { if (e.code !== 'EPERM') return false; }
  if (process.platform === 'win32') return true;
  try { return /src[\/]server[\/]server.mjs/.test(execFileSync('ps', ['-p', String(pid), '-o', 'command='], {encoding: 'utf8', timeout: 5000})); } catch { return false; }
}
{ let pid = 0; try { pid = Number(fs.readFileSync(LOCK, 'utf8')); } catch {} if (pid && pid !== process.pid && isServer(pid)) { log('server', `Another JARVIS Server is already running (process ${pid}).`); process.exit(0); } }
fs.writeFileSync(LOCK, String(process.pid));

/* ---------- the stores, as the app makes them ---------- */
const crypt = makeCrypt(dataKey({dir: DATA, log, keychain: !TEST}));   // tests never touch the runner's Keychain
const keyFile = path.join(DATA, 'anthropic-key.enc');
const getKey = () => { try { return fs.existsSync(keyFile) ? crypt.decrypt(fs.readFileSync(keyFile)) : ''; } catch (e) { log('server', `The Claude key could not be read: ${e.message}`); return ''; } };
const settings = new SettingsStore(DATA, log);
const todos = new TodoStore(DATA), calendar = new CalendarStore(DATA), ideas = new IdeaStore(DATA);
const workstations = new WorkstationStore({configFile: path.join(APP, 'config', 'themes.json'), dir: DATA, log});
const tower = new TowerStore({dir: DATA, docs: DOCS});
const towerRunner = new TowerRunner({store: tower, getKey, log, onUpdate: () => {}, onDone: () => {}});
let link = null, core = null, coreError = '';
const cast = (channel, data) => { try { link?.broadcast(channel, data); } catch {} };
const meetingFollowups = new MeetingFollowups({dir: DATA, todos, core: () => core});
const meetingLog = new MeetingManager({dir: DATA, docs: DOCS, scripts: '', log});   // the meetings kept here: their history and transcript.md files
const WMO = {0: 'clear skies', 1: 'mostly clear', 2: 'partly cloudy', 3: 'overcast', 45: 'fog', 61: 'light rain', 63: 'rain', 65: 'heavy rain', 71: 'light snow', 73: 'snow', 80: 'showers', 95: 'thunderstorms'};
async function briefWeather() {
  try {
    const w = settings.get().weather || {}, loc = w.enabled && Number.isFinite(w.latitude) && Number.isFinite(w.longitude) ? {enabled: true, latitude: w.latitude, longitude: w.longitude, place: ''} : {enabled: true, latitude: 53.8008, longitude: -1.5491, place: 'Leeds'};
    if (!briefWeather.cache || Date.now() - briefWeather.at > 600000) { briefWeather.cache = await weather(loc); briefWeather.at = Date.now(); }
    const c = briefWeather.cache?.current; if (!c) return null;
    return {temp: Math.round(c.temperature_2m), words: WMO[c.weather_code] || '', wind: Math.round(c.wind_speed_10m || 0), place: loc.place, code: c.weather_code};
  } catch (e) { log('weather', e.message); return null; }
}
function briefing() {
  const day = new Date().toISOString().slice(0, 10), open = todos.list().filter(t => !t.done);
  const events = calendar.list().filter(e => String(e.start).slice(0, 10) === day).map(e => ({time: new Date(e.start).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}), title: e.title, past: Date.parse(e.start) < Date.now()}));
  return {events, todos: open.slice(0, 6).map(t => t.text), todoCount: open.length, bays: [], ideas: ideas.list().filter(i => i.stage !== 'done').slice(0, 5).map(i => ({title: i.title, progress: i.progress})), tower: {}};
}

/* ---------- JARVIS Core ---------- */
function startCore() {
  try {
    core = createJarvisCore({userDir: DATA, docs: DOCS, appVersion: VERSION, boot: {asarRoot: APP, root: APP, base: VERSION, version: null, label: `${VERSION} · server`}, log,
      broadcast: cast, say: () => {}, notify: (title, body) => { log('notice', `${title}: ${body}`); cast('core', {type: 'notice', title, body}); },
      pcAwake: () => true, isIdle: () => true, getKey, crypt, fetch: (u, o) => fetch(u, o),
      settings: {get: () => settings.get(), apply: async p => settings.update(p), validate: p => validateSettings(p, settings.get())},
      todos, calendar, ideas, tower, towerRunner, meetingFollowups, workstations, scripts: '', assets: '', photoIntake: false, routinesEnabled: true,
      towerLobby: async (text, t = workstations.activeTheme, opts = {}) => { const route = await towerRunner.route(t, text); const run = await towerRunner.start(t, route.floorId, text, {routeCost: route.cost, notify: opts.notify}); return {...route, run, floorName: tower.floor(t, route.floorId).name}; },
      briefing, weather: briefWeather, health: async () => [], openUrl: () => {}, openFile: async () => false,
      printDocument: async () => { throw Error('PDFs are made on the ZenBook.'); }, keepAwake: () => {}, upcomingExtra: () => [],
      oneDrive: findOneDrive({home: os.homedir()}), relaunch: () => restart('JARVIS Core asked to restart.'), logFile: LOG});
    core.start(); coreError = ''; log('server', `JARVIS Core started (JARVIS ${VERSION}, Node ${process.version}).`);
    setTimeout(() => { try { core?.booted?.(); } catch (e) { log('brain', e.message); } }, 5000);
  } catch (e) { core = null; coreError = String(e?.message || e); log('brain', `JARVIS Core did not start: ${e?.stack || e?.message}`); }
}
function restart(why) { log('server', `${why} Restarting.`); if (TEST) return; setTimeout(() => { try { fs.rmSync(LOCK, {force: true}); } catch {} process.exit(0); }, 800); }   // launchd starts it again

/* ---------- requests from the ZenBook ---------- */
async function call(method, payload) {
  switch (method) {
    case 'core': {
      if (!core) throw Error(coreError ? `JARVIS Core could not start on the Mac: ${coreError}` : 'JARVIS Core is still starting on the Mac.');
      if (typeof payload?.method !== 'string') throw Error('Invalid request.');
      return core.api(payload.method, payload.data && typeof payload.data === 'object' ? payload.data : {});
    }
    case 'todo-list': return todos.list();
    case 'todo-add': { const meta = payload?.meta && typeof payload.meta === 'object' && !Array.isArray(payload.meta) ? payload.meta : {}; const r = todos.add(payload?.text, meta); cast('todos', r); return r; }   // meta: a meeting's to-dos keep their owner and deadline
    case 'todo-toggle': { const r = todos.toggle(String(payload?.id || '')); cast('todos', r); return r; }
    case 'todo-remove': { const r = todos.remove(String(payload?.id || '')); cast('todos', r); return r; }
    case 'todo-clear-done': { const r = todos.clearDone(); cast('todos', r); return r; }
    case 'calendar-list': return calendar.list();
    case 'calendar-save': { const r = calendar.save(payload); cast('calendar', calendar.list()); return r; }
    case 'calendar-delete': { const r = calendar.remove(payload); cast('calendar', calendar.list()); return r; }
    case 'tower-key': {   // the Claude key, typed on the ZenBook, kept sealed on the Mac
      if (typeof payload !== 'string' || payload.length > 400) throw Error('Invalid API key.');
      const k = payload.trim(); if (k && !/^sk-ant-[\w-]{20,}$/.test(k)) throw Error('That does not look like a Claude API key (they start with sk-ant-).');
      if (!k) fs.rmSync(keyFile, {force: true}); else fs.writeFileSync(keyFile, crypt.encrypt(k), {mode: 0o600});
      return true;
    }
    case 'meeting-history': return meetingLog.history.slice(-300).map(({id, theme, hallName, suitId, suitName, startedAt, endedAt, emailed, emailError}) => ({id, theme, hallName, suitId, suitName, startedAt, endedAt, emailed, emailError}));
    case 'meeting-read': { const h = meetingLog.find(String(payload?.id || '')); if (!h?.transcript || !fs.existsSync(h.transcript)) throw Error('That meeting is not on the Mac.'); return {markdown: fs.readFileSync(h.transcript, 'utf8').slice(0, 3e6)}; }
    case 'server-info': return {name: os.hostname(), version: VERSION, node: process.version, platform: process.platform, macos: os.release(), core: core ? 'running' : coreError || 'starting', claudeKey: !!getKey(), started: STARTED, devices: link?.list().length || 0};
    default: throw Error('That request stays on the computer you are using.');
  }
}
/** Move JARVIS: everything the ZenBook knew, written here, then a fresh start on it. */
async function onMove(bundle) {
  if (bundle?.kind !== MOVE_KIND) throw Error('That is not a JARVIS move file.');
  const where = {home: os.homedir(), oneDrive: findOneDrive({home: os.homedir()}), userDir: DATA, docsDir: DOCS};
  const p = movePlan(bundle, where);
  try { core?.dispose?.(); } catch {} core = null;
  const r = moveApply(bundle, {...where, platform: process.platform});
  log('move', `Brought over ${r.files} files and ${r.documents} documents from JARVIS ${p.version} (${r.rewritten} paths changed for this Mac). The old ones are in ${r.kept}.`);
  if (TEST) startCore(); else restart('JARVIS moved here.');
  return {...r, plan: p};
}

/* ---------- meetings the ZenBook recorded: kept here, and written up here ---------- */
/** Only what a meeting has, at sensible sizes. */
function meetingFrom(d) {
  const str = (v, n) => String(v ?? '').slice(0, n), num = v => Number.isFinite(Number(v)) ? Number(v) : 0, list = (v, n, k) => Array.isArray(v) ? v.slice(0, k).map(x => str(x, n)) : [];
  if (!d || typeof d !== 'object' || !/^[\w-]{8,64}$/.test(String(d.id || ''))) throw Error('That is not a meeting.');
  return {id: d.id, theme: str(d.theme, 30).replace(/[^a-z]/g, '') || 'ironman', hallName: str(d.hallName, 80) || 'Hall', suitId: str(d.suitId, 60), suitName: str(d.suitName, 80) || 'Meeting',
    startedAt: num(d.startedAt) || Date.now(), endedAt: num(d.endedAt) || Date.now(), duration: Math.max(0, num(d.duration)), transcript: str(d.transcript, 2e6),
    sources: list(d.sources, 20, 4), warnings: list(d.warnings, 400, 20), to: str(d.to, 200), lines: []};
}
const writing = new Set();
/** A meeting has arrived: its recording goes in ~/JARVIS/Meetings/<hall>/<suit>/<date>, and the write-up starts. */
async function onMeeting(details, file) {
  const m = meetingFrom(details), known = meetingLog.find(m.id);
  if (known || writing.has(m.id)) { fs.rmSync(file, {force: true}); return {id: m.id, folder: known?.folder || '', already: true}; }   // sent again after a lost answer: one copy
  const when = new Date(m.startedAt), pad = n => String(n).padStart(2, '0');
  m.folder = path.join(FILES, 'Meetings', safe(m.hallName), safe(m.suitName), `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())} ${pad(when.getHours())}.${pad(when.getMinutes())}`);
  if (fs.existsSync(m.folder)) m.folder += ` (${m.id.slice(0, 4)})`;
  fs.mkdirSync(m.folder, {recursive: true}); m.recording = path.join(m.folder, 'recording.webm');
  if (fs.statSync(file).size) fs.renameSync(file, m.recording); else fs.rmSync(file, {force: true});
  writing.add(m.id); log('meeting', `The ${m.suitName} meeting arrived; writing it up.`);
  writeUpMeeting(m).catch(e => log('meeting', `The ${m.suitName} write-up stopped: ${e?.stack || e?.message}`)).finally(() => writing.delete(m.id));
  return {id: m.id, folder: m.folder};
}
async function writeUpMeeting(m) {
  let markdown, notes = null, workPlan = [];
  try {
    ({markdown, notes, workPlan} = await writeUp(m, {assemblyKey: core?.store?.secret?.('assemblyaiKey') || '', catalog: core?.meetingWork?.catalog(), log: t => log('meeting', t),
      status: text => cast('meeting', {type: 'status', id: m.id, text}), spend: (c, why) => core?.store?.addSpend(c, why),
      noEngine: 'No summary: add your Claude API key (on the ZenBook, in the Tower → Engines; it is kept on the Mac).',
      summarise: async ({system, prompt}) => {
        const key = getKey(); if (!key) return null;
        if (core && core.store.budgetLeft() < .10) throw Error('The daily summary budget is used up.');
        const r = await ask({key, model: tower.settings().plannerModel, system, prompt, maxTokens: 5000}); try { core?.store.addSpend(r.cost, 'meeting notes'); } catch {} return r.text;
      }}));
  } catch (e) { markdown = `# Meeting notes: ${m.suitName}\n\n> The write-up stopped (${e.message}), so this is the offline transcript.\n\n${m.transcript || '(Nothing was transcribed.)'}\n`; }
  let followup = null;
  if (notes) try { followup = meetingFollowups.capture(m, notes, m.to); cast('todos', todos.list()); } catch (e) { markdown += '\n> Action items or draft could not be saved: ' + e.message + '\n'; log('meeting', e.message); }
  const file = meetingLog.record(m, {markdown, emailed: false, emailError: null});
  if (notes && core) try { const plan = core.meetingWork.capture(m, workPlan); cast('core', {type: 'meeting-work-ready', id: m.id, count: plan.tasks.length}); } catch (e) { log('meeting', 'Follow-through: ' + e.message); }
  log('meeting', `The ${m.suitName} meeting is written up: ${file}`);
  cast('meeting', {type: 'saved', id: m.id, suitName: m.suitName, hallName: m.hallName, followup: !!followup, accurate: !!m.accurate});
}

/* ---------- pairing codes, shown on this Mac ---------- */
function showCode({code, minutes}) {
  const text = `To sign in from your ZenBook, open JARVIS, then Settings → System → JARVIS Link, and type this code:\n\n${code}\n\nIt works once, for ${minutes} minutes.`;
  try { fs.writeFileSync(CODE_FILE, JSON.stringify({code, minutes, at: Date.now()})); } catch {}
  try { fs.writeFileSync(path.join(os.homedir(), 'Desktop', 'JARVIS pairing code.txt'), `JARVIS Server pairing code: ${code}\n\n${text}\n`); } catch {}
  if (process.platform === 'darwin' && !TEST) { try { spawn('osascript', ['-e', `display dialog ${JSON.stringify(text)} with title "JARVIS Server" buttons {"OK"} default button 1 giving up after ${minutes * 60}`], {detached: true, stdio: 'ignore'}).unref(); } catch {} }
  log('link', `Pairing code ready, for ${minutes} minutes.`);
}
const STARTED = Date.now();
link = new LinkServer({dir: DATA, call, onMove, onMeeting, log, name: os.hostname(),
  address: TEST ? () => '127.0.0.1' : tailscaleAddress, allow: TEST ? ip => isTailnet(ip) || /^(::ffff:)?127\.0\.0\.1$/.test(String(ip)) : isTailnet});
const origPair = link.pair.bind(link);
link.pair = (code, name) => { const r = origPair(code, name); try { fs.rmSync(path.join(os.homedir(), 'Desktop', 'JARVIS pairing code.txt'), {force: true}); fs.rmSync(CODE_FILE, {force: true}); } catch {} return r; };
startCore();
link.start();
if (!link.list().length) showCode({code: link.startPairing(60).code, minutes: 60});   // nothing paired yet: a code straight away
setInterval(() => { if (fs.existsSync(REQUEST)) { try { fs.rmSync(REQUEST, {force: true}); } catch {} showCode({code: link.startPairing(10).code, minutes: 10}); } }, 1500);

/* ---------- stay awake, and stop cleanly ---------- */
if (process.platform === 'darwin' && !TEST) { try { spawn('caffeinate', ['-i', '-w', String(process.pid)], {detached: true, stdio: 'ignore'}).unref(); log('server', 'Keeping this Mac awake while JARVIS Server runs (the screen can still sleep).'); } catch (e) { log('server', e.message); } }
const stop = sig => { log('server', `Stopping (${sig}).`); try { link.stop(); } catch {} try { core?.dispose?.(); } catch {} try { fs.rmSync(LOCK, {force: true}); } catch {} process.exit(0); };
process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'));
process.on('uncaughtException', e => log('crash', e?.stack || e?.message || String(e)));
process.on('unhandledRejection', e => log('crash', e?.stack || String(e)));
log('server', `JARVIS Server ${VERSION} is up. Data: ${DATA}`);
