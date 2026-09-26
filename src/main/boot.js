/**
 * JARVIS boot loader. PROTECTED: self-updates can never change this file (it only ever runs from app.asar).
 *
 * JARVIS can update himself, but only with your approval, and never by touching the installed files:
 * each approved update is a complete copy of the app in  <app data>\self\versions\vN\app,  built on top of the
 * version before it. This loader decides which one to start:
 *   - the newest approved update, if it has started properly before (or has not had two failed tries yet);
 *   - otherwise the one before it, and so on, down to the version you installed yourself.
 * An update that fails to load, or does not finish starting within three minutes, is marked bad and JARVIS
 * restarts on the previous version by itself. If you install a new build of JARVIS by hand, updates made on
 * the old build are set aside. Start with --safe-mode to ignore all self-updates.
 */
import {app, powerMonitor} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildId} from '../brain/selfupdate.js';   // always the installed (protected) copy, next to this file

const asarRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
if (process.env.JARVIS_TEST === '1') app.setPath('userData', path.join(asarRoot, 'test-results', 'profile'));
const userDir = app.getPath('userData');
const selfDir = path.join(userDir, 'self');
const stateFile = path.join(selfDir, 'state.json');
const read = () => {
  try { const s = JSON.parse(fs.readFileSync(stateFile, 'utf8')); if (s && typeof s === 'object' && s.versions && typeof s.versions === 'object') return {current: null, events: [], ...s}; } catch {}
  return {current: null, versions: {}, events: [], n: 0};
};
const write = s => {
  try { fs.mkdirSync(selfDir, {recursive: true}); const tmp = `${stateFile}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(s, null, 1)); fs.renameSync(tmp, stateFile); } catch {}
};
const note = (s, kind, text) => { s.events = [...(s.events || []), {t: Date.now(), kind, text}].slice(-40); };
let base = '0.0.0', baseId = '';
try { base = JSON.parse(fs.readFileSync(path.join(asarRoot, 'package.json'), 'utf8')).version || base; } catch {}
try { baseId = buildId(asarRoot); } catch {}   // the same build, not just the same version number
const safeMode = process.argv.includes('--safe-mode') || process.env.JARVIS_SAFE_MODE === '1';

const sha = b => crypto.createHash('sha256').update(b).digest('hex');
/**
 * Is every file of this version exactly what was installed with your approval? The installer wrote the list of
 * files and their fingerprints next to it (and its fingerprint into state.json); anything added, missing or
 * changed since means the version is not started.
 */
function intact(id, v) {
  const dir = path.join(selfDir, 'versions', id, 'app');
  if (typeof v.manifest !== 'string' || !/^[0-9a-f]{64}$/.test(v.manifest)) return false;
  let list;
  try { const raw = fs.readFileSync(path.join(selfDir, 'versions', id, 'manifest.json')); if (sha(raw) !== v.manifest) return false; list = JSON.parse(raw); } catch { return false; }
  if (!list || typeof list !== 'object') return false;
  let seen = 0;
  const walk = sub => {
    for (const n of fs.readdirSync(path.join(dir, sub))) {
      const r = sub ? `${sub}/${n}` : n; const st = fs.lstatSync(path.join(dir, r));
      if (st.isDirectory()) { walk(r); continue; }
      if (!st.isFile() || !Object.hasOwn(list, r) || list[r] !== sha(fs.readFileSync(path.join(dir, r)))) throw Error(r);
      seen++;
    }
  };
  try { walk(''); } catch { return false; }
  return seen === Object.keys(list).length;
}

/** Walk from the current update back towards the installed version, skipping anything broken. */
function choose(s) {
  let id = s.current, hops = 0;
  while (id && hops++ < 50) {
    if (typeof id !== 'string' || !/^v\d{1,6}$/.test(id) || !Object.hasOwn(s.versions, id)) { note(s, 'missing', `Update ${String(id).slice(0, 20)} is not on record.`); id = null; break; }
    const v = s.versions[id];
    if (!v) { note(s, 'missing', `Update ${id} is not on record.`); id = null; break; }
    if (v.base !== base || (v.baseId && baseId && v.baseId !== baseId)) {
      if (!v.superseded) { v.superseded = true; note(s, 'superseded', v.base === base ? `You installed a new build of JARVIS ${base}, so the updates made on the earlier build are set aside.` : `You installed JARVIS ${base}, so the updates made on ${v.base} are set aside.`); s.superseded = {at: Date.now(), from: v.base, to: base}; }
      id = null; break;
    }
    const dir = path.join(selfDir, 'versions', id, 'app');
    if (v.bad) { id = v.parent || null; continue; }
    if (!fs.existsSync(path.join(dir, 'src', 'main', 'main.js'))) { v.bad = true; v.reason = 'Its files are missing.'; note(s, 'bad', `${id}: files missing`); id = v.parent || null; continue; }
    if (!intact(id, v)) {
      v.bad = true; v.reason = 'Its files were changed after you approved it.';
      s.rolledBack = {from: id, title: v.title || '', reason: v.reason, at: Date.now()};
      note(s, 'rollback', `${id} (${v.title || 'update'}): its files were changed after you approved it, so it was not started.`);
      id = v.parent || null; continue;
    }
    if (!v.good && (v.attempts || 0) >= 2) {
      v.bad = true; v.reason = 'It did not start properly, twice.';
      s.rolledBack = {from: id, title: v.title || '', reason: v.reason, at: Date.now()};
      note(s, 'rollback', `${id} (${v.title || 'update'}) did not start properly twice; going back.`);
      id = v.parent || null; continue;
    }
    return id;
  }
  return null;
}

const state = read();
let current = safeMode ? null : choose(state);
if (!safeMode) state.current = current;
const v = current ? state.versions[current] : null;
if (v && !v.good) v.attempts = (v.attempts || 0) + 1;
write(state);

const root = v ? path.join(selfDir, 'versions', current, 'app') : asarRoot;
let watchdog = null, good = !v || !!v.good;

/** Mark the running update as bad and restart on the one before it. */
function fail(reason) {
  if (!v) return;
  const s = read(); const x = s.versions[current];
  if (x) { x.bad = true; x.good = false; x.reason = reason; }
  s.rolledBack = {from: current, title: x?.title || '', reason, at: Date.now()};
  note(s, 'rollback', `${current}: ${reason}`);
  s.current = x?.parent || null;
  write(s);
  try { app.relaunch(); } catch {}
  app.exit(0);
}
function arm() { clearTimeout(watchdog); if (!good && v) watchdog = setTimeout(() => fail('It did not finish starting within three minutes.'), 180000); }

globalThis.__jarvisBoot = {
  asarRoot, root, base, safeMode, userDir,
  version: current, n: v?.n || 0, title: v?.title || '',
  label: v ? `${base} · self-update ${v.n || current}` : base,
  rolledBack: state.rolledBack || null, superseded: state.superseded || null,
  /** Called by JARVIS once the main screen has loaded: this update works. */
  markGood() {
    if (good) return; good = true; clearTimeout(watchdog);
    const s = read(); const x = s.versions[current];
    if (x) { x.good = true; x.attempts = 0; x.goodAt = Date.now(); note(s, 'good', `${current} started properly.`); write(s); }
  },
  /** Something is badly wrong with this update: go back now. */
  markBad(reason) { if (v) fail(String(reason || 'It reported a fault.')); },
  /** The notices above have been passed on to you. */
  clearNotices() { const s = read(); delete s.rolledBack; delete s.superseded; write(s); this.rolledBack = null; this.superseded = null; },
};

if (v) {
  arm();
  app.whenReady().then(() => { try { powerMonitor.on('suspend', () => clearTimeout(watchdog)); powerMonitor.on('resume', arm); } catch {} });
}
try {
  await import(pathToFileURL(path.join(root, 'src', 'main', 'main.js')).href);
} catch (e) {
  if (!v) throw e;
  fail(`It would not load: ${String(e?.message || e).slice(0, 300)}`);
}
