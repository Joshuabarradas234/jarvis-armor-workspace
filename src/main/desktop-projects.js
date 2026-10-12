/**
 * Project folders on the Desktop, filed into suits (dist/assets/desk-projects.js asks). JARVIS never decides where a
 * folder goes: for each one he asks which part of your life it belongs to (one hall each: the Iron Man hall for your
 * company, the Batcave for the family business, Spider-Man for personal), then which suit. Moving is a rename on the
 * same drive, so a folder is never half-copied, and if anything has it open nothing moves. Every move is written
 * down so it can be put back.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readJson, writeJson} from '../brain/util.js';

/** What each hall is for, until the Tower names a company for it (Tower → hall → company). */
export const AREAS = {ironman: 'Work', batcave: 'Family business', spiderman: 'Personal'};
const SKIP = /^(\.|\$|desktop\.ini$|node_modules$)/i;
const clean = s => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[. ]+$/, '').trim().slice(0, 80) || 'Project';
const inside = (child, parent) => { const r = path.relative(path.resolve(parent), path.resolve(child)); return r === '' || (!!r && !r.startsWith('..') && !path.isAbsolute(r)); };

/** The folders on the Desktop that no suit holds yet, newest first. */
export function scanDesktop({desktop, suits = [], never = [], skip = () => false, fsImpl = fs}) {
  let entries = [];
  try { entries = fsImpl.readdirSync(desktop, {withFileTypes: true}); } catch { return []; }
  const held = suits.map(s => s.folder).filter(Boolean);
  return entries.filter(e => e.isDirectory() && !SKIP.test(e.name) && !never.includes(e.name)).map(e => path.join(desktop, e.name))
    .filter(p => !held.some(f => inside(p, f) || inside(f, p)) && !skip(p))
    .map(p => { let at = 0; try { at = fsImpl.statSync(p).mtimeMs; } catch {} return {name: path.basename(p), path: p, modified: at}; })
    .sort((a, b) => b.modified - a.modified);
}

/** Where a folder goes: inside the suit's own folder, or a new one in Documents\JARVIS Workspaces\<hall> that becomes the suit's. */
export function destination({documents, hallName, suit, name, exists = fs.existsSync}) {
  const base = suit.folder && exists(suit.folder) ? suit.folder : path.join(documents, 'JARVIS Workspaces', clean(hallName));
  let to = path.join(base, clean(name)), n = 2;
  while (exists(to)) to = path.join(base, `${clean(name)} (${n++})`);
  return {to, becomesSuitFolder: !(suit.folder && exists(suit.folder))};
}

/** A rename, with what to do next when Windows says no. A different drive is linked, never copied. */
export function moveFolder(from, to, {fsImpl = fs} = {}) {
  const name = path.basename(from);
  try { fsImpl.mkdirSync(path.dirname(to), {recursive: true}); fsImpl.renameSync(from, to); return true; }
  catch (e) {
    if (e.code === 'EXDEV') return false;
    if (e.code === 'ENOENT') throw Error(`“${name}” isn't there any more.`);
    if (['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY'].includes(e.code)) throw Error(`Something has “${name}” open (an editor, a terminal or a File Explorer window). Close it and try again.`);
    throw Error(`“${name}” couldn't be moved: ${e.message}`);
  }
}

export class DeskProjects {
  /** d: {desktop, documents, dir, workstations, tower, isWorkshop(path), log, fsImpl} */
  constructor(d) { this.d = {fsImpl: fs, log: () => {}, isWorkshop: () => false, ...d}; this.stateFile = path.join(d.dir, 'desk-projects.json'); }
  state() { const s = readJson(this.stateFile, {}) || {}; return {never: Array.isArray(s.never) ? s.never : [], later: s.later && typeof s.later === 'object' ? s.later : {}, moves: Array.isArray(s.moves) ? s.moves : [], lastAuto: s.lastAuto || 0}; }
  save(s) { writeJson(this.stateFile, s); }
  allSuits() { const w = this.d.workstations; return w.themes.flatMap(t => (w.suits[t.id] || []).map(s => ({...s, theme: t.id}))); }
  area(themeId) { const org = this.d.tower?.()?.tower?.(themeId)?.org; return String(org || '').trim() || AREAS[themeId] || this.d.workstations.theme(themeId)?.name || themeId; }
  /** The halls in the order JARVIS asks them, each with its suits (empty ones first). */
  halls() {
    const w = this.d.workstations, order = Object.keys(AREAS);
    return [...w.themes].sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99)).map(t => ({id: t.id, name: t.name, area: this.area(t.id),
      suits: (w.suits[t.id] || []).filter(s => !s.isVehicle).map(s => ({id: s.id, name: s.name, folder: s.folder ? path.basename(s.folder) : '', free: !s.folder}))
        .sort((a, b) => Number(b.free) - Number(a.free))}));
  }
  folders(now = Date.now()) {
    const s = this.state();
    return scanDesktop({desktop: this.d.desktop, suits: this.allSuits(), never: s.never, skip: this.d.isWorkshop, fsImpl: this.d.fsImpl}).map(f => ({...f, later: (s.later[f.name] || 0) > now}));
  }
  /** What the card needs: the folders to ask about and the halls to offer. */
  pending() { const all = this.folders(); return {folders: all.filter(f => !f.later), waiting: all.filter(f => f.later).length, halls: this.halls(), last: this.state().moves.slice(-1)[0] || null}; }
  /** Once a day at most, when the hall opens: true if there's something to ask. */
  dueAuto(now = Date.now()) { const s = this.state(); if (now - s.lastAuto < 20 * 3600e3) return false; const n = this.folders(now).filter(f => !f.later).length; if (n) this.save({...s, lastAuto: now}); return n > 0; }

  file({name, theme, suit: suitId, move = true}) {
    const f = this.folders().find(x => x.name === name); if (!f) throw Error(`“${name}” isn't on the Desktop any more.`);
    const w = this.d.workstations, suit = w.suit(String(suitId), theme), hall = w.theme(theme);
    const before = suit.folder || '';
    let to = f.path, moved = false, becomes = !before || !this.d.fsImpl.existsSync(before);
    if (move) {
      const dest = destination({documents: this.d.documents, hallName: hall.name, suit, name: f.name, exists: p => this.d.fsImpl.existsSync(p)});
      moved = moveFolder(f.path, dest.to, {fsImpl: this.d.fsImpl}); if (moved) { to = dest.to; becomes = dest.becomesSuitFolder; }
    }
    if (!moved && !becomes) throw Error(`${suit.name} already has a folder. Move “${f.name}” into it, or choose an empty suit.`);
    if (becomes) w.saveSuit(suit.id, {folder: to}, theme);
    const entry = {id: crypto.randomUUID(), name: f.name, from: f.path, to, moved, theme, suit: suit.id, suitName: suit.name, hall: hall.name, before, at: Date.now()};
    const s = this.state(); delete s.later[f.name]; s.moves = [...s.moves, entry].slice(-50); this.save(s);
    this.d.log('desk', `${f.name} → ${suit.name} (${hall.name})${moved ? `, moved to ${to}` : ', linked where it is'}`);
    return entry;
  }
  skip({name, never = false}) {
    const s = this.state();
    if (never) s.never = [...new Set([...s.never, String(name)])].slice(-200); else s.later[String(name)] = Date.now() + 7 * 864e5;   // "Later" waits a week
    this.save(s); return this.pending();
  }
  /** Put a filed folder back on the Desktop, and give the suit back its old folder. */
  undo(id) {
    const s = this.state(), m = s.moves.find(x => x.id === id); if (!m) throw Error('That move is no longer on record.');
    const fsx = this.d.fsImpl;
    if (m.moved) { if (fsx.existsSync(m.from)) throw Error(`There's already a “${m.name}” on the Desktop.`); if (!fsx.existsSync(m.to)) throw Error(`“${m.name}” isn't where I put it any more.`); moveFolder(m.to, m.from, {fsImpl: fsx}); }
    try { const suit = this.d.workstations.suit(m.suit, m.theme); if (suit.folder && path.resolve(suit.folder) === path.resolve(m.to)) this.d.workstations.saveSuit(m.suit, {folder: m.before}, m.theme); } catch {}
    s.moves = s.moves.filter(x => x.id !== id); this.save(s);
    return m;
  }
}
