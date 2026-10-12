/**
 * The think room (dist/room.html, dist/assets/think-room.js): every screen becomes part of one room for a project.
 * Each screen has its own tabs; the board (ideas, questions, decisions, next steps) is a tab too, with JARVIS beside
 * it to think with. Drag a tab off one screen onto another and it moves there live. Everything is kept per project:
 * the board, which page is on which screen, and the conversation (the same one Ask JARVIS has). Leaving the room
 * writes the board into the project's folder (JARVIS board.md), which JARVIS reads whenever you ask about it.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {readJson, writeJson, writeText} from '../brain/util.js';
import {RoomTabs, allowed} from './room-tabs.js';
import {BOARD_FILE} from './ask-jarvis.js';

export const COLUMNS = [['ideas', 'Ideas'], ['questions', 'Questions'], ['decisions', 'Decided'], ['next', 'Next steps']];
const COLS = COLUMNS.map(c => c[0]);

/** Only well-formed cards are kept: a known column, some text, at most 200 of them. */
export function cleanCards(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(c => c && typeof c === 'object' && COLS.includes(c.col) && String(c.text || '').trim()).slice(0, 200)
    .map(c => ({id: /^[\w-]{1,40}$/.test(String(c.id)) ? String(c.id) : crypto.randomUUID(), col: c.col, text: String(c.text).replace(/\s+/g, ' ').trim().slice(0, 400), by: c.by === 'jarvis' ? 'jarvis' : 'you', done: !!c.done, at: Number(c.at) || Date.now()}));
}
/** The board as plain lines, for Claude. */
export function boardText(cards) {
  return COLUMNS.map(([id, label]) => { const l = cards.filter(c => c.col === id); return l.length ? `${label}:\n${l.map(c => `- ${c.text}${c.done ? ' (done)' : ''}`).join('\n')}` : ''; }).filter(Boolean).join('\n\n');
}
/** The board as the project's JARVIS board.md. */
export function boardMarkdown(name, cards, when = new Date()) {
  const date = when.toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'});
  return `# ${name}: the board\n\nSaved from the think room on ${date}. JARVIS reads this whenever you ask about this project.\n\n` +
    COLUMNS.map(([id, label]) => { const l = cards.filter(c => c.col === id); return l.length ? `## ${label}\n\n${l.map(c => `- ${c.done ? '[x] ' : id === 'next' ? '[ ] ' : ''}${c.text}`).join('\n')}\n` : ''; }).filter(Boolean).join('\n');
}
/** Turn a JARVIS answer into cards: bullet points, filed by the heading above them. */
export function cardsFromAnswer(text) {
  const out = []; let col = 'ideas';
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const l = raw.trim(), hd = /^#{1,4}\s+(.*)$/.exec(l) || /^\*\*([^*]+)\*\*:?$/.exec(l), item = /^(?:[-*•]|\d+[.)])\s+(.*)$/.exec(l);
    if (hd) { const h = hd[1].toLowerCase(); col = /question/.test(h) ? 'questions' : /decid|decision|agreed/.test(h) ? 'decisions' : /next|step|do now|action/.test(h) ? 'next' : 'ideas'; continue; }
    if (item) out.push({col, text: item[1].replace(/\*\*/g, '').trim()});
    else if (/^\*\*next step:?\*\*/i.test(l)) out.push({col: 'next', text: l.replace(/^\*\*next step:?\*\*:?\s*/i, '').replace(/\*\*/g, '')});
  }
  return out.filter(c => c.text).slice(0, 20).map(c => ({...c, id: crypto.randomUUID(), by: 'jarvis', at: Date.now()}));
}

export class ThinkRoom {
  /**
   * d: {dir, create(opts) → BrowserWindow, View (WebContentsView), openExternal, log, screens() → [{n, label, workArea}], at() → n under the mouse,
   *     ask (AskJarvis), project(key), projects(), seed(key) → [url], todo(text)}
   */
  constructor(d) { this.d = {log: () => {}, ...d}; this.file = path.join(d.dir, 'rooms.json'); this.key = null; this.windows = new Map(); this.senders = new Map(); this.tabs = null; this.cards = []; this.off = []; this.busy = false; this.timer = null; }
  get isOpen() { return !!this.key; }
  allRooms() { const r = readJson(this.file, {}); return r && typeof r === 'object' && !Array.isArray(r) ? r : {}; }
  saved(key) { const r = this.allRooms()[key] || {}; return {cards: cleanCards(r.cards), tabs: Array.isArray(r.tabs) ? r.tabs.filter(t => allowed(t?.url)).slice(0, 18) : [], board: Number(r.board) || 0, off: Array.isArray(r.off) ? r.off.filter(Number.isInteger) : []}; }
  last() { const r = this.allRooms(); return Object.entries(r).sort((a, b) => (b[1].updated || 0) - (a[1].updated || 0))[0]?.[0] || null; }
  saveNow() {
    clearTimeout(this.timer); if (!this.key || !this.tabs) return;
    const all = this.allRooms(); all[this.key] = {cards: this.cards, tabs: this.tabs.all(), board: this.tabs.board, off: this.off, updated: Date.now()}; writeJson(this.file, all);
  }
  save() { clearTimeout(this.timer); this.timer = setTimeout(() => { try { this.saveNow(); } catch (e) { this.d.log('room', e.message); } }, 600); }
  screenOf(senderId) { return this.senders.get(senderId) || 0; }

  /** Open the room for a project on every screen (apart from ones you switched off), or bring it forward. */
  open(key, {fresh = false} = {}) {
    if (this.key === key && this.windows.size) { this.focus(); return; }
    if (this.key) this.leave({quiet: true});
    const st = this.saved(key), screens = this.d.screens(), at = this.d.at() || screens[0]?.n || 1;
    let use = screens.filter(s => !st.off.includes(s.n) || s.n === at); if (!use.length) use = screens.slice(0, 1);
    this.key = key; this.cards = st.cards; this.off = st.off.filter(n => n !== at);
    this.tabs = new RoomTabs({host: n => this.windows.get(n), onChange: () => { this.push('tabs'); this.save(); }, log: this.d.log, View: this.d.View, openExternal: this.d.openExternal});
    for (const s of use) this.window(s);
    const ns = [...this.windows.keys()], others = ns.filter(n => n !== at);
    this.tabs.board = ns.includes(st.board) ? st.board : at;
    const place = n => ns.includes(n) ? n : (others[0] || at);
    if (st.tabs.length && !fresh) for (const t of st.tabs) { try { this.tabs.open(place(t.screen), t.url, {activate: !!t.active}); } catch (e) { this.d.log('room', e.message); } }
    else { let i = 0; for (const url of (this.d.seed?.(key) || []).slice(0, 8)) { try { this.tabs.open(others.length ? others[i++ % others.length] : at, url, {activate: true}); } catch (e) { this.d.log('room', e.message); } } }
    for (const n of ns) if (!this.tabs.active.get(n)) this.tabs.active.set(n, this.tabs.board === n ? 'board' : this.tabs.tabs.find(t => t.screen === n)?.id || null);
    this.tabs.active.set(this.tabs.board, 'board');   // the board is what you see first
    this.tabs.apply(); this.save(); this.focus();
  }
  window(s) {
    const a = s.workArea, w = this.d.create({role: 'room', x: a.x, y: a.y, width: a.width, height: a.height, show: false, frame: false, backgroundColor: '#050b11', title: 'JARVIS · Think room'});
    this.windows.set(s.n, w); this.senders.set(w.webContents.id, s.n);
    const id = w.webContents.id;
    w.webContents.on('did-finish-load', () => { if (!w.isDestroyed()) { w.show(); this.send(s.n); } });
    w.on('closed', () => { this.senders.delete(id); if (this.windows.get(s.n) === w) { this.windows.delete(s.n); if (this.key && !this.leaving) { if (this.windows.size) { this.tabs.evacuate(s.n, this.tabs.board === s.n ? [...this.windows.keys()][0] : this.tabs.board); this.off = [...new Set([...this.off, s.n])]; this.push('screens'); this.save(); } else this.leave({quiet: true}); } } });
    w.loadURL(`jarvis://app/room.html?view=room&screen=${s.n}`).catch(e => this.d.log('room', e.message));
    return w;
  }
  focus() { const w = this.windows.get(this.tabs?.board); if (w && !w.isDestroyed()) { if (w.isMinimized()) w.restore(); w.show(); w.focus(); } }

  /* ---------- what each screen is told ---------- */
  info() {
    const p = this.key === 'all' ? null : this.d.project(this.key);
    return {key: this.key, project: p ? {name: p.name, area: p.area, theme: p.theme, suit: p.suit, folder: !!p.folder} : {name: 'Everything', area: 'All your projects', theme: 'all', folder: false},
      projects: [{key: 'all', name: 'Everything', area: ''}, ...this.d.projects().filter(x => x.folder || x.key === this.key).map(x => ({key: x.key, name: x.name, area: x.area}))]};
  }
  screens() { const on = [...this.windows.keys()]; return this.d.screens().map(s => ({n: s.n, label: s.label, on: on.includes(s.n), board: this.tabs?.board === s.n})); }
  state(n, part = 'all') {
    const out = {type: 'room', n};
    if (part === 'all' || part === 'tabs') { out.tabs = this.tabs.list(n); out.screens = this.screens(); }
    if (part === 'all' || part === 'screens') out.screens = this.screens();
    if (part === 'all' || part === 'cards') out.cards = this.cards;
    if (part === 'all' || part === 'thread') { out.thread = this.d.ask.thread(this.key); out.busy = this.busy; }
    if (part === 'all') Object.assign(out, this.info());
    return out;
  }
  send(n, part = 'all') { const w = this.windows.get(n); if (w && !w.isDestroyed() && !w.webContents.isLoading()) w.webContents.send('jarvis:core', this.state(n, part)); }
  push(part) { for (const n of this.windows.keys()) this.send(n, part); }

  /* ---------- the board and JARVIS ---------- */
  setCards(cards) { this.cards = cleanCards(cards); this.push('cards'); this.save(); return this.cards; }
  addCards(list) {
    const have = new Set(this.cards.map(c => c.text.toLowerCase()));
    const fresh = cleanCards(list).filter(c => !have.has(c.text.toLowerCase()));
    if (fresh.length) this.setCards([...this.cards, ...fresh]); return fresh.length;   // how many were new
  }
  async ask(text) {
    if (this.busy) throw Error('Still thinking about the last one.');
    this.busy = true; this.push('thread');
    try { const r = await this.d.ask.send({key: this.key, mode: 'think', text, extra: boardText(this.cards)}); return r; }
    finally { this.busy = false; this.push('thread'); }
  }
  async sort() {
    if (this.busy) throw Error('Still thinking about the last one.');
    this.busy = true; this.push('thread');
    try { const cards = await this.d.ask.cards(this.key, boardText(this.cards)); return this.addCards(cards); }
    finally { this.busy = false; this.push('thread'); }
  }
  saveBoard() {
    const p = this.key === 'all' ? null : this.d.project(this.key);
    if (!p?.folder) throw Error('This project has no folder yet. Give its suit a folder first.');
    if (!this.cards.length) throw Error('The board is empty.');
    if (!fs.existsSync(p.folder)) throw Error("The project's folder is missing.");
    const file = path.join(p.folder, BOARD_FILE); writeText(file, boardMarkdown(p.name, this.cards)); return file;
  }

  /* ---------- screens ---------- */
  screenAt(x, y) { for (const [n, w] of this.windows) { if (w.isDestroyed()) continue; const b = w.getBounds(); if (x >= b.x && y >= b.y && x < b.x + b.width && y < b.y + b.height) return n; } return 0; }
  setScreen(n, on) {
    const s = this.d.screens().find(x => x.n === n); if (!s) throw Error("That screen isn't connected.");
    if (on) { this.off = this.off.filter(x => x !== n); if (!this.windows.has(n)) this.window(s); }
    else {
      if (!this.windows.has(n)) return true; if (this.windows.size === 1) throw Error('The room needs one screen. Use Leave the room instead.');
      const to = this.tabs.board !== n ? this.tabs.board : [...this.windows.keys()].find(x => x !== n);
      this.tabs.evacuate(n, to); this.off = [...new Set([...this.off, n])];
      const w = this.windows.get(n); this.windows.delete(n); this.leaving = true; try { w.destroy(); } finally { this.leaving = false; }
    }
    this.push('screens'); this.save(); return true;
  }
  /** Close the room: the board goes into the project folder, and everything is kept for next time. */
  leave({quiet = false} = {}) {
    if (!this.key) return {file: ''};
    let file = '';
    try { this.saveNow(); } catch (e) { this.d.log('room', e.message); }
    if (this.cards.length) try { file = this.saveBoard(); } catch (e) { if (!quiet) this.d.log('room', e.message); }
    this.leaving = true;
    try { this.tabs?.closeAll(); for (const w of this.windows.values()) if (!w.isDestroyed()) w.destroy(); }
    finally { this.leaving = false; }
    this.windows.clear(); this.senders.clear(); this.key = null; this.tabs = null; this.cards = []; this.busy = false;
    return {file};
  }
}
