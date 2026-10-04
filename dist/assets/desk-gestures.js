/**
 * Desktop hand control: reading one hand from its 21 points (the hand landmarker's), with the same thresholds as the
 * hall (hands-ideas.js), so a fist and a pinch feel the same everywhere. No page or camera code here.
 *   open hand: the ring follows your knuckles     fist (from an open hand): grab     open again: let go
 *   pinch held for a second (thumb and index together): open JARVIS
 */
export const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const pt = p => Array.isArray(p) ? {x: p[0], y: p[1]} : p;
export const handSize = lm => Math.max(d2(lm[0], lm[9]), d2(lm[5], lm[17]) * 1.3, 0.02);
const extended = (lm, tip, pip) => d2(lm[0], lm[tip]) > d2(lm[0], lm[pip]) * 1.12;
const curled = (lm, tip, mcp) => d2(lm[0], lm[tip]) < d2(lm[0], lm[mcp]) * 1.08;
/** What one hand is doing. `lm` is 21 points, [x, y, z] or {x, y}, in camera space (0 to 1). */
export function readHand(raw) {
  const lm = raw.map(pt), size = handSize(lm);
  const open = [extended(lm, 8, 6), extended(lm, 12, 10), extended(lm, 16, 14), extended(lm, 20, 18)].filter(Boolean).length >= 3;
  const pinch = d2(lm[4], lm[8]) / size;
  const fist = d2(lm[0], lm[8]) < d2(lm[0], lm[5]) * 0.95 && curled(lm, 12, 9) && curled(lm, 16, 13) && curled(lm, 20, 17) && pinch > 0.22;
  const aim = {x: 1 - (lm[5].x * 2 + lm[9].x) / 3, y: (lm[5].y * 2 + lm[9].y) / 3};   // the knuckles, mirrored like a mirror
  return {size, open, fist, pinch, aim};
}
/** One-euro filter: holds still when the hand is still, keeps up when it moves fast. */
export function Euro(minCut = 1.4, beta = 0.008, dCut = 1.0) {
  let x = null, dx = 0, t = 0;
  const a = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
  return (v, now) => {
    if (x === null) { x = v; t = now; return v; }
    const dt = Math.max(0.001, (now - t) / 1000); t = now;
    dx += a(dCut, dt) * ((v - x) / dt - dx);
    x += a(minCut + beta * Math.abs(dx), dt) * (v - x); return x;
  };
}
/** Where the hand has to be: the box you set with "Calibrate hands", or beside you on the side of the hand you use. */
export function reachBox(saved, rightHand) {
  if (saved && [saved.x0, saved.x1, saved.y0, saved.y1].every(Number.isFinite) && saved.x1 - saved.x0 >= 0.28 && saved.y1 - saved.y0 >= 0.22) return {x0: saved.x0, x1: saved.x1, y0: saved.y0, y1: saved.y1};
  return rightHand === false ? {x0: 0.06, x1: 0.60, y0: 0.14, y1: 0.66} : {x0: 0.40, x1: 0.94, y0: 0.14, y1: 0.66};
}
const SCALE = 1500;   // the filter is tuned in pixels: work in a 1500-pixel space, then back to 0..1
export class DeskGestures {
  constructor() { this.fx = Euro(); this.fy = Euro(); this.grab = false; this.fistN = 0; this.openN = 0; this.openAt = -1e9; this.pinchAt = 0; }
  /** One frame: the hand's points (or null when there is no hand). Returns {visible, nx, ny, grab, hold}. */
  update(lm, {now, rightHand, box}) {
    if (!lm) { this.fistN = this.openN = 0; this.pinchAt = 0; return {visible: false, nx: 0, ny: 0, grab: this.grab, hold: 0}; }
    const h = readHand(lm), b = box || reachBox(null, rightHand);
    if (h.open) this.openAt = now;
    this.fistN = h.fist ? this.fistN + 1 : 0; this.openN = h.open ? this.openN + 1 : 0;
    // a fist grabs only when it closes from an open hand, so a hand that comes into view already closed does nothing
    if (!this.grab && this.fistN >= 2 && now - this.openAt < 1500) this.grab = true;
    else if (this.grab && this.openN >= 2) this.grab = false;
    let hold = 0;
    if (!this.grab && !h.fist && h.pinch < 0.4) { if (!this.pinchAt) this.pinchAt = now; hold = Math.min(1, (now - this.pinchAt) / 1000); }
    else if (h.pinch > 0.56 || h.fist || this.grab) this.pinchAt = 0;
    else if (this.pinchAt) hold = Math.min(1, (now - this.pinchAt) / 1000);   // between the two: the pinch is still on
    const nx = Math.max(0, Math.min(1, (h.aim.x - b.x0) / (b.x1 - b.x0))), ny = Math.max(0, Math.min(1, (h.aim.y - b.y0) / (b.y1 - b.y0)));
    return {visible: true, nx: Math.max(0, Math.min(1, this.fx(nx * SCALE, now) / SCALE)), ny: Math.max(0, Math.min(1, this.fy(ny * SCALE, now) / SCALE)), grab: this.grab, hold};
  }
}
