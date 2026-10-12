// 1.95.0: the think room. Every screen joins one room; tabs (and the board) move between screens live; the board,
// the tabs and the conversation are kept per project, and the board is saved into the project's folder.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {RoomTabs, toUrl} from '../../src/main/room-tabs.js';
import {ThinkRoom, cleanCards, boardText, boardMarkdown, cardsFromAnswer} from '../../src/main/think-room.js';
import {AskJarvis, folderFacts, BOARD_FILE} from '../../src/main/ask-jarvis.js';
import {parseCommand} from '../../src/voice/commands.js';
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-195-')); t.after(() => fs.rmSync(d, {recursive: true, force: true})); return d; };
let wcId = 100;
class FakeView {
  constructor() { const h = {back: false}; this.bounds = null; this.visible = false; this.webContents = {url: '', title: '', dead: false, getTitle: () => this.webContents.title, getURL: () => this.webContents.url, isLoading: () => false, isDestroyed: () => this.webContents.dead,
    setWindowOpenHandler: f => { this.popup = f; }, on: () => {}, loadURL: async u => { this.webContents.url = u; this.webContents.title = new URL(u).hostname; }, close: () => { this.webContents.dead = true; }, reload: () => {}, navigationHistory: {canGoBack: () => h.back, goBack() {}, canGoForward: () => false}}; }
  setVisible(v) { this.visible = v; } setBounds(b) { this.bounds = b; }
}
function fakeWin(opts = {}) {
  const views = new Set(), handlers = {}, sent = [];
  const w = {opts, views, sent, dead: false, contentView: {addChildView: v => views.add(v), removeChildView: v => views.delete(v)}, isDestroyed: () => w.dead, isMinimized: () => false,
    webContents: {id: ++wcId, on: () => {}, isLoading: () => false, send: (ch, m) => sent.push(m)}, on: (ev, f) => { handlers[ev] = f; }, loadURL: async u => { w.url = u; }, show() {}, focus() {}, restore() {},
    getBounds: () => ({x: opts.x, y: opts.y, width: opts.width, height: opts.height}), destroy() { w.dead = true; handlers.closed?.(); }};
  return w;
}

test('room tabs: each screen has its own; a tab moves to another screen live (same page, no reload); the board moves too', () => {
  const wins = {1: fakeWin(), 2: fakeWin(), 3: fakeWin()}, rt = new RoomTabs({host: n => wins[n], View: FakeView});
  rt.board = 1; rt.active.set(1, 'board');
  const a = rt.open(2, 'https://example.com/plan'), b = rt.open(2, 'https://example.com/menu'), c = rt.open(3, 'https://example.com/sheet');
  assert.deepEqual(rt.list(1).map(t => t.id), ['board']); assert.deepEqual(rt.list(2).map(t => [t.id, t.active]), [[a, false], [b, true]]);
  rt.setLayout(2, {x: 0, y: 90, width: 1000, height: 700}); rt.setLayout(3, {x: 0, y: 90, width: 800, height: 600});
  const view = rt.find(b).view; assert.equal(view.visible, true);
  rt.move(b, 3);   // live: the same view, now in screen 3's window
  assert.ok(wins[3].views.has(view) && !wins[2].views.has(view)); assert.equal(rt.find(b).view, view); assert.equal(rt.active.get(3), b); assert.equal(rt.active.get(2), a);
  assert.deepEqual(view.bounds, {x: 0, y: 90, width: 800, height: 600});
  rt.move('board', 2); assert.equal(rt.board, 2); assert.equal(rt.active.get(2), 'board'); assert.equal(rt.active.get(1), null);
  assert.equal(rt.find(a).view.visible, false);   // the board is showing on screen 2, so its page hides
  view.popup({url: 'https://example.com/popup'}); assert.equal(rt.list(3).length, 3);   // a pop-up opens on the screen its tab is on now
  rt.evacuate(3, 1); assert.deepEqual(rt.list(1).map(t => t.url).sort(), ['https://example.com/menu', 'https://example.com/popup', 'https://example.com/sheet']);
  assert.throws(() => rt.open(1, 'file:///C:/secret.txt'), /Only web pages/); assert.throws(() => rt.move(a, 7), /isn't part of the room/);
  assert.equal(toUrl('example.com/x'), 'https://example.com/x'); assert.equal(toUrl('cafe loyalty apps'), 'https://www.google.com/search?q=cafe%20loyalty%20apps');
  rt.closeAll(); assert.equal(rt.tabs.length, 0);
});

test('the board: cards are checked, JARVIS answers become cards under the right heading, and the board is written as JARVIS board.md', () => {
  assert.deepEqual(cleanCards([{col: 'nope', text: 'x'}, {col: 'ideas', text: '  '}, {col: 'next', text: ' Ring  the café ', by: 'jarvis', id: 'ok-1'}]).map(c => [c.id, c.col, c.text, c.by]), [['ok-1', 'next', 'Ring the café', 'jarvis']]);
  const cards = cardsFromAnswer('### Three ways in\n- **Start small** with three cafés\n- Bundle deliveries\n\n### Two questions\n1. Which café says yes?\n\n**Next step:** draft the offer');
  assert.deepEqual(cards.map(c => [c.col, c.text]), [['ideas', 'Start small with three cafés'], ['ideas', 'Bundle deliveries'], ['questions', 'Which café says yes?'], ['next', 'draft the offer']]);
  assert.ok(cards.every(c => c.by === 'jarvis'));
  const md = boardMarkdown('Corner Shop', [...cards, {col: 'decisions', text: 'Fridays only', done: false}], new Date(2026, 9, 13));
  assert.match(md, /^# Corner Shop: the board\n\nSaved from the think room on 13 October 2026/); assert.ok(md.includes('## Decided\n\n- Fridays only')); assert.ok(md.includes('## Next steps\n\n- [ ] draft the offer'));
  assert.equal(boardText([{col: 'ideas', text: 'A'}, {col: 'next', text: 'B', done: true}]), 'Ideas:\n- A\n\nNext steps:\n- B (done)');
});

test('the room: opens on every screen, the board where you are, a suit\'s pages on the others; kept per project; a screen can leave; Leave saves the board into the folder', async t => {
  const d = tmp(t), folder = path.join(d, 'shop'); fs.mkdirSync(folder);
  const made = [], screens = [{n: 1, label: 'Laptop', workArea: {x: 0, y: 0, width: 1500, height: 900}}, {n: 2, label: 'Monitor', workArea: {x: 1500, y: 0, width: 1900, height: 1040}}, {n: 3, label: 'TV', workArea: {x: 3400, y: 0, width: 1900, height: 1040}}];
  const proj = {key: 'ironman:im2', id: 'im2', theme: 'ironman', name: 'shop', suit: 'Mark Two', hall: 'Armor Hall', area: 'Work', folder};
  const asked = [], aj = new AskJarvis({dir: d, ask: async (s, p, o) => { asked.push(s); return o.maxTokens === 900 ? '{"ideas":["Loyalty stamps"],"next":["Call three cafés"]}' : '- Start with three cafés'; }, projects: () => [proj]});
  const mk = () => new ThinkRoom({dir: d, View: FakeView, screens: () => screens, at: () => 2, create: o => { const w = fakeWin(o); made.push(w); return w; }, ask: aj, project: k => k === proj.key ? proj : null, projects: () => [proj], seed: () => ['https://example.com/a', 'https://example.com/b']});
  const room = mk();
  room.open(proj.key);
  assert.equal(made.length, 3); assert.equal(room.tabs.board, 2);   // the board where the mouse is
  assert.deepEqual(room.tabs.all().map(x => x.screen).sort(), [1, 3]);   // the suit's pages on the other screens
  assert.ok(made[0].url.endsWith('room.html?view=room&screen=1'));
  const st = room.state(2); assert.equal(st.project.name, 'shop'); assert.deepEqual(st.screens.map(s => [s.n, s.on, s.board]), [[1, true, false], [2, true, true], [3, true, false]]);
  await room.ask('What first?'); assert.equal(aj.thread(proj.key).messages.length, 2);
  assert.equal(room.addCards(cardsFromAnswer(aj.thread(proj.key).messages[1].content)), 1);
  await room.ask('And then?'); assert.ok(asked.at(-1).includes('The board on the wall of the think room right now:\nIdeas:\n- Start with three cafés'));
  assert.equal(await room.sort(), 2); assert.equal(room.addCards([{col: 'ideas', text: 'loyalty stamps'}]), 0); assert.equal(room.cards.length, 3);   // nothing twice
  room.setScreen(3, false); assert.equal(room.windows.size, 2); assert.ok(room.tabs.all().every(x => x.screen !== 3)); assert.throws(() => { room.setScreen(1, false); room.setScreen(2, false); }, /needs one screen/);
  const r = room.leave(); assert.equal(r.file, path.join(folder, BOARD_FILE)); assert.ok(fs.readFileSync(r.file, 'utf8').includes('- Loyalty stamps'));
  assert.ok(made.every(w => w.dead)); assert.equal(room.isOpen, false);
  assert.ok(folderFacts(folder, {deep: true}).includes("JARVIS board.md (the think room's board)"));
  // next time: the same board and pages, and the screens you took out stay out
  made.length = 0; const again = mk(); again.open(proj.key);
  assert.equal(again.cards.length, 3); assert.equal(again.tabs.tabs.length, 2); assert.equal(made.length, 1); assert.equal(again.last(), proj.key);
  again.leave({quiet: true});
});

test('the room is opened from the tray, voice, Ctrl+K and the Ask window; only room screens can drive it; it is saved on quit', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["case 'room-open':{if(!['main','ask','room'].includes(role))return false;", "case 'room-tab-drop':{if(role!=='room'||!room.isOpen)return false;const n=room.screenAt(", "case 'room-cards':{if(role!=='room'||!room.isOpen)return false;",
    "case 'room-ask':{if(role!=='room'||!room.isOpen)return false;", "{label:'THINK ROOM',click:()=>{try{openRoom();}", "try{room?.leave({quiet:true});}catch{}", "case 'ask-init':return {projects:askProjects().filter(p=>p.folder).map(",
    "if(action==='room-open'){try{openRoom();"]) assert.ok(main.includes(s), s);
  assert.ok(fs.readFileSync('dist/room.html', 'utf8').includes('<script type="module" src="./assets/think-room.js"></script>'));
  assert.ok(fs.readFileSync('dist/assets/work-menu.js', 'utf8').includes("['Think room',"));
  assert.ok(fs.readFileSync('dist/assets/ask-jarvis.js', 'utf8').includes("J.call('room-open', {key})"));
  const heard = (p, idle) => parseCommand(p, {theme: {assistant: 'Jarvis'}, themes: [{id: 'ironman', assistant: 'Jarvis'}], modules: [], idle});
  assert.deepEqual(heard('jarvis open the think room', false), {action: 'room-open'}); assert.deepEqual(heard("jarvis let's build", true), {action: 'room-open'});
  assert.deepEqual(heard('jarvis leave the room', false), {action: 'room-leave'});
});
