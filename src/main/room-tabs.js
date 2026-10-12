/**
 * The think room's tabs (src/main/think-room.js): one manager for every screen of the room. Each tab lives on one
 * screen; moving it hands the live page to another window, so nothing reloads and nothing is lost. The board is a
 * tab too (id 'board'), drawn by the room page itself rather than a web view, so it moves between screens the same way.
 */
const MAX_TABS = 18;
export const allowed = url => { try { const u = new URL(url); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; } };
/** What you typed in the address box: an address, or a search. */
export function toUrl(text) {
  const t = String(text || '').trim(); if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/\S*)?$/.test(t) && !/\s/.test(t)) return `https://${t}`;
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`;
}

export class RoomTabs {
  /** host(n) → BrowserWindow of screen n (or null); onChange() after anything changes; View is Electron's WebContentsView. */
  constructor({host, onChange = () => {}, log = () => {}, View, openExternal = async () => {}}) { Object.assign(this, {host, onChange, log, View, openExternal}); this.tabs = []; this.board = 1; this.active = new Map(); this.layout = new Map(); }
  live(t) { const wc = t.view?.webContents; return !!wc && !wc.isDestroyed(); }
  prune() { this.tabs = this.tabs.filter(t => this.live(t)); }
  /** The tabs on screen n, the board first if it is here. */
  list(n) {
    this.prune();
    const out = this.tabs.filter(t => t.screen === n).map(t => ({id: t.id, title: t.view.webContents.getTitle() || t.url, url: t.view.webContents.getURL() || t.url, loading: t.view.webContents.isLoading(), active: this.active.get(n) === t.id}));
    if (this.board === n) out.unshift({id: 'board', title: 'Board', board: true, active: this.active.get(n) === 'board'});
    return out;
  }
  all() { this.prune(); return this.tabs.map(t => ({url: t.view.webContents.getURL() || t.url, title: t.view.webContents.getTitle() || '', screen: t.screen, active: this.active.get(t.screen) === t.id})); }
  win(n) { const w = this.host(n); return w && !w.isDestroyed() ? w : null; }
  open(n, url, {activate = true} = {}) {
    if (!allowed(url)) throw Error('Only web pages (http or https) open in a tab.');
    if (this.tabs.length >= MAX_TABS) throw Error(`Up to ${MAX_TABS} tabs across the room.`);
    const win = this.win(n); if (!win) throw Error(`Screen ${n} isn't part of the room.`);
    const view = new this.View({webPreferences: {sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, partition: 'persist:jarvis-tabs'}});
    const tab = {id: crypto.randomUUID(), url, view, screen: n}; this.tabs.push(tab);
    const wc = view.webContents;
    wc.setWindowOpenHandler(({url: target}) => { if (allowed(target)) { try { this.open(tab.screen, target); } catch (e) { this.log('room', e.message); } } return {action: 'deny'}; });   // a pop-up opens next to it, on whichever screen it is on now
    wc.on('will-navigate', (e, target) => { if (!allowed(target)) e.preventDefault(); });
    wc.on('will-redirect', (e, target) => { if (!allowed(target)) e.preventDefault(); });
    for (const ev of ['page-title-updated', 'did-navigate', 'did-navigate-in-page', 'did-start-loading', 'did-stop-loading']) wc.on(ev, () => { if (this.tabs.includes(tab)) this.onChange(); });
    wc.on('render-process-gone', () => this.close(tab.id));
    win.contentView.addChildView(view); view.setBounds({x: 0, y: 0, width: 0, height: 0});
    wc.loadURL(url).catch(e => this.log('room', e.message));
    if (activate || !this.active.get(n)) this.active.set(n, tab.id);
    this.apply(); this.onChange(); return tab.id;
  }
  find(id) { this.prune(); return this.tabs.find(t => t.id === id) || null; }
  activate(id) {
    if (id === 'board') { this.active.set(this.board, 'board'); this.apply(); this.onChange(); return true; }
    const t = this.find(id); if (!t) return false; this.active.set(t.screen, id); this.apply(); this.onChange(); return true;
  }
  /** What a screen shows after its active tab leaves: the next tab, else the board if it is here. */
  fallback(n, gone) { const next = this.tabs.find(t => t.screen === n && t.id !== gone); this.active.set(n, next ? next.id : this.board === n ? 'board' : null); }
  close(id) {
    const i = this.tabs.findIndex(t => t.id === id); if (i < 0) return false;
    const [t] = this.tabs.splice(i, 1);
    try { this.win(t.screen)?.contentView.removeChildView(t.view); } catch {}
    try { t.view.webContents.close(); } catch {}
    if (this.active.get(t.screen) === id) this.fallback(t.screen, id);
    this.apply(); this.onChange(); return true;
  }
  /** Move a tab (or the board) to screen n, live: the page keeps its place. */
  move(id, n) {
    if (!this.win(n)) throw Error(`Screen ${n} isn't part of the room.`);
    if (id === 'board') { const from = this.board; if (from === n) return true; this.board = n; if (this.active.get(from) === 'board') this.fallback(from, 'board'); this.active.set(n, 'board'); this.apply(); this.onChange(); return true; }
    const t = this.find(id); if (!t) return false; if (t.screen === n) return true;
    const from = t.screen;
    try { this.win(from)?.contentView.removeChildView(t.view); } catch {}
    t.screen = n; this.win(n).contentView.addChildView(t.view);
    if (this.active.get(from) === id) this.fallback(from, id);
    this.active.set(n, id); this.apply(); this.onChange(); return true;
  }
  /** A screen leaves the room: its tabs (and the board) move to the screen given. */
  evacuate(n, to) {
    for (const t of this.tabs.filter(t => t.screen === n)) { try { this.win(n)?.contentView.removeChildView(t.view); } catch {} t.screen = to; try { this.win(to)?.contentView.addChildView(t.view); } catch {} if (!this.active.get(to)) this.active.set(to, t.id); }
    if (this.board === n) { this.board = to; if (!this.active.get(to)) this.active.set(to, 'board'); }
    this.active.delete(n); this.layout.delete(n); this.apply(); this.onChange();
  }
  address(id, text) { const t = this.find(id), url = toUrl(text); if (!t) throw Error('That tab has closed.'); if (!allowed(url)) throw Error('Enter a web address.'); t.view.webContents.loadURL(url).catch(e => this.log('room', e.message)); return true; }
  navigate(id, command) {
    const t = this.find(id); if (!t) return false; const wc = t.view.webContents, h = wc.navigationHistory;
    if (command === 'back' && h.canGoBack()) h.goBack(); else if (command === 'forward' && h.canGoForward()) h.goForward(); else if (command === 'reload') wc.reload();
    else if (command === 'external') this.openExternal(wc.getURL()).catch(e => this.log('room', e.message));
    return true;
  }
  /** The room page tells us where the page area is on its screen (zero while it shows the board). */
  setLayout(n, rect) { const r = k => Math.max(0, Math.round(Number(rect?.[k]) || 0)); this.layout.set(n, {x: r('x'), y: r('y'), width: r('width'), height: r('height')}); this.apply(); }
  apply() {
    for (const t of this.tabs) { if (!this.live(t)) continue; const box = this.layout.get(t.screen), on = !!box && box.width > 0 && this.active.get(t.screen) === t.id; t.view.setVisible(on); t.view.setBounds(on ? box : {x: 0, y: 0, width: 0, height: 0}); }
  }
  closeAll() { for (const t of [...this.tabs]) { try { this.win(t.screen)?.contentView.removeChildView(t.view); } catch {} try { t.view.webContents.close(); } catch {} } this.tabs = []; this.active.clear(); this.layout.clear(); }
}
