/**
 * Desktop hand control: with JARVIS closed to the tray and hand control on, your hand moves a ring over both screens
 * (dist/hands.html). Close your hand into a fist over a window to pick it up, move to carry it, open your hand to put it
 * down, or throw it towards the other screen to send it there; a maximised window is maximised there. Pinch and hold to
 * open JARVIS. It only moves windows (scripts/windows/winctl.ps1): nothing is clicked, typed or closed.
 */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inside = (p, r) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
const centre = r => ({x: r.x + r.width / 2, y: r.y + r.height / 2});
const box = r => ({x: r.x, y: r.y, width: r.w, height: r.h});      // the helper's rectangles have w and h
const unbox = r => ({x: r.x, y: r.y, w: r.width, h: r.height});

/** The hand's place (0 to 1 across, 0 to 1 down) as a point on the desktop: all the screens together, kept on a screen. */
export function deskPoint(displays, nx, ny) {
  const b = displays.map(d => d.bounds), x0 = Math.min(...b.map(r => r.x)), y0 = Math.min(...b.map(r => r.y));
  const x1 = Math.max(...b.map(r => r.x + r.width)), y1 = Math.max(...b.map(r => r.y + r.height));
  const p = {x: x0 + clamp(nx, 0, 1) * (x1 - x0 - 1), y: y0 + clamp(ny, 0, 1) * (y1 - y0 - 1)};
  if (b.some(r => inside(p, r))) return p;
  let best = p, far = Infinity;   // between two screens of different sizes: onto the nearer one
  for (const r of b) { const q = {x: clamp(p.x, r.x, r.x + r.width - 1), y: clamp(p.y, r.y, r.y + r.height - 1)}, d = Math.hypot(q.x - p.x, q.y - p.y); if (d < far) { far = d; best = q; } }
  return best;
}
export function displayOf(displays, p) {
  return displays.find(d => inside(p, d.bounds)) || displays.slice().sort((a, b) => Math.hypot(centre(a.bounds).x - p.x, centre(a.bounds).y - p.y) - Math.hypot(centre(b.bounds).x - p.x, centre(b.bounds).y - p.y))[0];
}
/** Thrown fast enough (DIP per second) towards another screen? The screen best in line with the throw, or null. */
export function throwTarget(displays, from, v, {speed = 1300, align = 0.6} = {}) {
  const s = Math.hypot(v.x, v.y); if (!from || s < speed) return null;
  const c = centre(from.bounds); let best = null, score = align;
  for (const d of displays) {
    if (d.id === from.id) continue;
    const t = centre(d.bounds), dx = t.x - c.x, dy = t.y - c.y, cos = (dx * v.x + dy * v.y) / ((Math.hypot(dx, dy) || 1) * s);
    if (cos > score) { score = cos; best = d; }
  }
  return best;
}
/** Where a window lands on another screen: the same place relative to the screen, made smaller if it would not fit. */
export function placeOn(rect, from, to) {
  const a = from.workArea, b = to.workArea, width = Math.min(rect.width, b.width), height = Math.min(rect.height, b.height);
  const fx = a.width > rect.width ? (rect.x - a.x) / (a.width - rect.width) : 0.5, fy = a.height > rect.height ? (rect.y - a.y) / (a.height - rect.height) : 0.5;
  return {x: Math.round(b.x + clamp(fx, 0, 1) * (b.width - width)), y: Math.round(b.y + clamp(fy, 0, 1) * (b.height - height)), width, height};
}

export class DeskHands {
  /**
   * displays() -> [{id, bounds, workArea}] in DIP; toPhysical(point), rectToPhysical(rect), rectToDip(rect) convert for
   * the helper; win = WinControl; cursor(point | null, look, hold) moves the ring; feedback(kind) shows what happened.
   */
  constructor({displays, toPhysical, rectToPhysical, rectToDip, win, cursor = () => {}, feedback = () => {}, wake = () => {}, log = () => {}, now = () => Date.now()}) {
    Object.assign(this, {displays, toPhysical, rectToPhysical, rectToDip, win, cursor, feedback, wake, log, now});
    this.cancel(); this.wokeAt = -1e9; this.moving = false;
  }
  cancel() { this.grab = null; this.pending = null; this.next = null; this.trail = []; this.lostAt = 0; }
  /** One reading from the hand window: {visible, nx, ny, grab, hold (0 to 1)}. */
  hand(m) {
    const now = this.now();
    if (!m || !m.visible) {
      if (!this.lostAt) this.lostAt = now;
      if ((this.grab || this.pending) && now - this.lostAt > 400) this.drop(false);   // hand gone: put the window down where it is
      this.cursor(null); return;
    }
    this.lostAt = 0;
    const p = deskPoint(this.displays(), Number(m.nx) || 0, Number(m.ny) || 0);
    this.trail.push({t: now, x: p.x, y: p.y}); this.trail = this.trail.filter(s => now - s.t <= 250);
    const holding = !!(this.grab || this.pending), hold = clamp(Number(m.hold) || 0, 0, 1);
    this.cursor(p, holding ? 'grab' : hold > 0 ? 'hold' : 'open', hold);
    if (m.grab) { if (!holding) this.pick(p); else if (this.grab) this.carry(p); }
    else if (holding) this.drop(true);
    if (hold >= 1 && !holding && now - this.wokeAt > 5000) { this.wokeAt = now; this.wake(); }
  }
  async pick(p) {
    const job = this.pending = {released: null};
    try {
      const phys = this.toPhysical(p), r = await this.win.at(phys.x, phys.y), w = r?.ok ? r.window : null;
      if (this.pending !== job) return;
      if (!w) { this.pending = null; this.feedback('miss'); return; }
      let outer = this.rectToDip(box(w.outer));
      const g = {handle: w.handle, title: w.title, process: w.process, max: !!w.maximized, start: p, outer, from: displayOf(this.displays(), centre(outer))};
      if (g.max) {   // like Windows: a maximised window comes off at its normal size, under your hand
        const rr = await this.win.restore(w.handle);
        if (rr?.ok && rr.window) { const n = this.rectToDip(box(rr.window.outer)), fx = clamp((p.x - outer.x) / (outer.width || 1), 0.1, 0.9); g.outer = {x: Math.round(p.x - n.width * fx), y: Math.round(p.y - 20), width: n.width, height: n.height}; }
      }
      this.pending = null; this.grab = g; this.feedback('grabbed');
      if (job.released) this.drop(job.released.throwable);   // you let go while it was being picked up
      else this.carry(this.trail.at(-1) || p);
    } catch (e) { if (this.pending === job) this.pending = null; this.log(e.message); }
  }
  carry(p) {
    const g = this.grab; if (!g) return;
    g.rect = {x: Math.round(g.outer.x + p.x - g.start.x), y: Math.round(g.outer.y + p.y - g.start.y), width: g.outer.width, height: g.outer.height};
    this.send(g);
  }
  /** One move at a time to the helper; if the hand moved on meanwhile, only its newest place is sent next. */
  send(g) {
    if (this.moving) { this.next = g; return; }
    this.moving = true;
    Promise.resolve(this.win.move(g.handle, unbox(this.rectToPhysical(g.rect)))).then(r => {
      if (r && !r.ok && this.grab === g) { this.grab = null; this.feedback(/closed/i.test(r.error || '') ? 'miss' : 'denied'); }   // gone, or a window Windows won't let us move (one running as administrator)
    }, e => this.log(e.message)).finally(() => { this.moving = false; const n = this.next; this.next = null; if (n && n === this.grab) this.send(n); });
  }
  velocity() {
    const t = this.trail; if (t.length < 2) return {x: 0, y: 0};
    const a = t[0], b = t[t.length - 1], dt = Math.max(0.03, (b.t - a.t) / 1000);
    return {x: (b.x - a.x) / dt, y: (b.y - a.y) / dt};
  }
  drop(throwable) {
    if (this.pending) { this.pending.released = {throwable}; return; }
    const g = this.grab; if (!g) return;
    this.grab = null; this.next = null;
    const ds = this.displays(), rect = g.rect || g.outer, from = displayOf(ds, centre(rect)), origin = g.from || from;
    // judged from the screen it was picked up on: carried with your hand, it may be halfway across by the time you let go
    const to = throwable ? throwTarget(ds, origin, this.velocity()) : null;
    if (!to) {
      if (g.max && from && g.from && from.id !== g.from.id) this.settle(g, null, true).then(() => this.feedback('dropped'));   // carried to the other screen: maximised again there
      else this.feedback('dropped');
      return;
    }
    this.settle(g, placeOn(g.outer, origin, to), g.max).then(() => this.feedback('thrown'));
  }
  async settle(g, landing, max) {
    try {
      while (this.moving) await new Promise(r => setTimeout(r, 15));   // after the last carry move
      if (landing) { const r = await this.win.move(g.handle, unbox(this.rectToPhysical(landing))); if (r && !r.ok) { this.feedback('denied'); return; } }
      if (max) await this.win.max(g.handle);
    } catch (e) { this.log(e.message); }
  }
}
