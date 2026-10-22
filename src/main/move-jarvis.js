/**
 * Moving JARVIS to another computer (Settings → System → Move JARVIS), for example from the Windows PC to the Mac
 * mini. Everything he knows goes in one file; no password or key does (those are locked to the old computer and are
 * typed in again on the new one), and neither do old approval requests (nothing stale can be approved over there).
 *   bundle()  on the old computer: his data files, and the notes and standing orders in Documents\JARVIS
 *   plan()    on the new one: what will come over, and where each suit's project folder will be found
 *   apply()   writes it all, keeping a copy of whatever it replaces, with the old computer's paths rewritten
 */
import fs from 'node:fs';
import path from 'node:path';
import {writeText} from '../brain/util.js';

export const KIND = 'jarvis-move';
/** Rebuilt by JARVIS, this computer's own, or stale approval requests: never moved. */
const SKIP = /^(voice-grammar\.json|approvals\.json|desk-hands\.json|.*\.bak|.*\.before-.*)$/i;
const NAME = /^[\w .()-]+\.(json|jsonl)$/i, TEXT = /\.(md|txt|json|csv)$/i, MAX_FILE = 20e6, MAX_TOTAL = 150e6;

/** Everything to move, as one object (saved as JSON). */
export function bundle({userDir, docsDir, version, home, platform = process.platform}) {
  const files = {}, documents = {}; let total = 0;
  const add = (map, key, file) => {
    const st = fs.lstatSync(file); if (!st.isFile() || st.size > MAX_FILE) return;
    if ((total += st.size) > MAX_TOTAL) throw Error('There is more data than one move file can carry.');
    map[key] = fs.readFileSync(file, 'utf8');
  };
  for (const n of fs.readdirSync(userDir)) if (NAME.test(n) && !SKIP.test(n)) add(files, n, path.join(userDir, n));
  const docs = path.join(docsDir, 'JARVIS');
  const walk = rel => {
    let list = []; try { list = fs.readdirSync(rel ? path.join(docs, ...rel.split('/')) : docs, {withFileTypes: true}); } catch { return; }
    for (const e of list) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(r); else if (TEXT.test(e.name)) add(documents, r, path.join(docs, ...r.split('/'))); }
  };
  walk('');
  return {kind: KIND, version, savedAt: new Date().toISOString(), from: {platform, home, userDir, docsDir}, files, documents};
}

/**
 * Where a path from the old computer is on this one, or null if it isn't one of the old computer's own folders.
 * JARVIS's data folder maps to this one's; OneDrive maps to this computer's OneDrive (else its Desktop or Documents);
 * the rest of the home folder maps to this home folder.
 */
export function mapper({from = {}, home, oneDrive = '', userDir, exists = fs.existsSync}) {
  const norm = p => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');
  const fromHome = norm(from.home), fromUser = norm(from.userDir), absolute = p => /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/');
  const under = (p, base) => base && (p.toLowerCase() === base.toLowerCase() || p.toLowerCase().startsWith(base.toLowerCase() + '/')) ? p.slice(base.length).replace(/^\/+/, '') : null;
  const join = (base, r) => r ? path.join(base, ...r.split('/')) : base;
  return p => {
    if (typeof p !== 'string' || p.length > 1024 || !absolute(p)) return null;
    const n = norm(p); let rest;
    if ((rest = under(n, fromUser)) !== null) return join(userDir, rest);
    if ((rest = under(n, fromHome)) === null) return null;
    const od = /^OneDrive[^/]*(?:\/(.*))?$/i.exec(rest);
    if (!od) return join(home, rest);
    const r = od[1] || '', cands = [oneDrive && join(oneDrive, r), /^(Desktop|Documents)(\/|$)/i.test(r) && join(home, r)].filter(Boolean);
    return cands.find(c => exists(c)) || cands[0] || null;
  };
}
/** Every string in a JSON value that is a path on the old computer, rewritten for this one. */
export function rewrite(value, map, seen = {n: 0}) {
  if (typeof value === 'string') { const m = map(value); if (m && m !== value) { seen.n++; return m; } return value; }
  if (Array.isArray(value)) return value.map(v => rewrite(v, map, seen));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewrite(v, map, seen)]));
  return value;
}
/** Settings that belong to the old computer's screens and voices start fresh. */
export function forThisComputer(s, platform = process.platform) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) return s;
  const o = {...s, mainDisplay: null, controlDisplay: null, voiceName: ''};
  if (platform !== 'win32') o.wallpaper = false;   // the live wallpaper is Windows only
  return o;
}
const check = b => { if (!b || b.kind !== KIND || !b.files || typeof b.files !== 'object' || Array.isArray(b.files)) throw Error('That file is not a JARVIS move file.'); };

/** What will come over, before anything is written. */
export function plan(b, {home, oneDrive = '', userDir, exists = fs.existsSync}) {
  check(b);
  const map = mapper({from: b.from, home, oneDrive, userDir, exists}), folders = [];
  try {
    const w = JSON.parse(b.files['workstations.json'] || '{}');
    for (const [theme, list] of Object.entries(w.suits || {})) for (const s of Array.isArray(list) ? list : []) if (s?.folder) { const to = map(s.folder) || s.folder; folders.push({suit: String(s.name || ''), theme, from: s.folder, to, found: !!exists(to)}); }
  } catch {}
  return {version: String(b.version || ''), savedAt: String(b.savedAt || ''), fromPlatform: String(b.from?.platform || ''), files: Object.keys(b.files).filter(n => NAME.test(n) && !SKIP.test(n)).length, documents: Object.keys(b.documents || {}).length, folders, oneDrive};
}

/** Write it all. Whatever it replaces is kept in <data folder>/before-move-<time>. */
export function apply(b, {home, oneDrive = '', userDir, docsDir, platform = process.platform, exists = fs.existsSync, now = Date.now()}) {
  check(b);
  const map = mapper({from: b.from, home, oneDrive, userDir, exists}), keep = path.join(userDir, `before-move-${now}`), seen = {n: 0};
  let files = 0, documents = 0;
  const save = (dest, text, keepAs) => { if (fs.existsSync(dest)) { fs.mkdirSync(path.dirname(keepAs), {recursive: true}); fs.copyFileSync(dest, keepAs); } fs.mkdirSync(path.dirname(dest), {recursive: true}); writeText(dest, text); };
  for (const [name, text] of Object.entries(b.files)) {
    if (!NAME.test(name) || SKIP.test(name) || typeof text !== 'string') continue;   // a plain file name: nothing can climb out of the folder
    let out = text;
    if (/\.json$/i.test(name)) { try { let v = rewrite(JSON.parse(text), map, seen); if (name === 'settings.json') v = forThisComputer(v, platform); out = JSON.stringify(v, null, 2); } catch {} }
    save(path.join(userDir, name), out, path.join(keep, name)); files++;
  }
  for (const [rel, text] of Object.entries(b.documents || {})) {
    const parts = String(rel).split('/');
    if (typeof text !== 'string' || !TEXT.test(rel) || parts.some(p => !p || p === '.' || p === '..' || /[<>:"\\|?*\u0000-\u001f]/.test(p))) continue;
    save(path.join(docsDir, 'JARVIS', ...parts), text, path.join(keep, 'Documents', 'JARVIS', ...parts)); documents++;
  }
  return {files, documents, rewritten: seen.n, kept: keep};
}

/** This computer's OneDrive folder, if it has one (on a Mac it lives in ~/Library/CloudStorage). */
export function findOneDrive({home, env = process.env, platform = process.platform, fsImpl = fs}) {
  if (platform === 'win32') return env.OneDriveConsumer || env.OneDrive || env.OneDriveCommercial || '';
  const base = path.join(home, 'Library', 'CloudStorage');
  try { const d = fsImpl.readdirSync(base).filter(n => /^OneDrive/i.test(n)).sort((a, b) => Number(/Personal/i.test(b)) - Number(/Personal/i.test(a)))[0]; return d ? path.join(base, d) : ''; } catch { return ''; }
}
