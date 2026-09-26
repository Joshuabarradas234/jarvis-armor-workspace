/*
 * JARVIS v9.11 — inside a floor of the tower.
 * Pick a floor and the camera goes in: every agent at their own desk, their screen showing what they are doing
 * right now, typing while they work, a tick when they are done. Styled for the building: a glass lab at Stark,
 * dark wood and brass at Wayne Enterprises, a brick newsroom at the Bugle.
 * Work = the whole floor · Team = in close on the desks · Brief & training = the briefing board · History = the archive.
 */
import * as THREE from '../vendor/three/three.module.min.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';

// v9.20: the tags are updated in place (same buttons, new position and text) instead of being rebuilt, so a press
// that lasts longer than one update still lands on its button
function patchKeyed(box, html, key) {
  const t = document.createElement('template'); t.innerHTML = html;
  const next = [...t.content.children], keep = new Set();
  const have = new Map([...box.children].map(el => [el.getAttribute(key), el]));
  let before = box.firstChild;
  for (const n of next) {
    const k = n.getAttribute(key); keep.add(k); let el = have.get(k);
    if (!el) { box.insertBefore(n, before); before = n.nextSibling; continue; }
    for (const a of ['class', 'style']) { const v = n.getAttribute(a); if (el.getAttribute(a) !== v) el.setAttribute(a, v ?? ''); }
    if (el.innerHTML !== n.innerHTML) el.innerHTML = n.innerHTML;
    if (el !== before) box.insertBefore(el, before); before = el.nextSibling;
  }
  for (const [k, el] of have) if (!keep.has(k)) el.remove();
}


const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hueOf = s => { let h = 0; for (const c of String(s || '')) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const LIVE = ['queued', 'planning', 'working', 'reviewing'];

const STYLE = {
  ironman: { floor: '#1b242c', floorRough: 0.22, wall: '#27313a', wall2: '#141b21', trim: '#7fd6e8', desk: '#2f3a44', top: '#8fd8ec', glassTop: true, screen: '#04161f', ink: '#aef0ff', dim: '#4d8aa0', accent: '#7fd6e8',
    sky: ['#0a1422', '#28415e'], towers: '#0d1622', lit: 'rgba(160,220,255,.7)', night: true, chair: '#1d252d', suit: [200, 18, 30], ceiling: '#1a2127', light: '#dff6ff', exposure: 1.2, name: 'LAB' },
  batcave: { floor: '#2b1b12', floorRough: 0.45, wood: true, wall: '#3b2617', wall2: '#24160d', trim: '#c9a04a', desk: '#3f2717', top: '#55341f', screen: '#140d04', ink: '#f5c542', dim: '#8a6a2a', accent: '#f5c542', lamp: true,
    sky: ['#070a12', '#161d2c'], towers: '#0b0e16', lit: 'rgba(255,196,110,.85)', night: true, chair: '#1b1210', suit: [220, 10, 16], ceiling: '#1d130c', light: '#ffd9a0', exposure: 1.15, rug: '#3a1c1c', name: 'BOARDROOM' },
  spiderman: { floor: '#8d9095', floorRough: 0.6, brick: true, wall: '#8e3e30', wall2: '#5e2a21', trim: '#ff4d4d', desk: '#8c939b', top: '#c3c8ce', screen: '#0d1115', ink: '#f2f6f9', dim: '#7c8894', accent: '#ff4d4d', papers: true,
    sky: ['#8fb9e0', '#e2ecf4'], towers: '#7e8c9a', lit: 'rgba(255,255,255,.28)', night: false, chair: '#2d2e35', suit: [210, 14, 28], ceiling: '#e8e6e2', light: '#fff6ea', exposure: 1.0, clock: true, name: 'NEWSROOM' },
};

/* ------------------------------------------------------------------ canvas textures */
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(7);
function skyline(S) {
  return canvasTex(2048, 640, (x, w, h) => {
    const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, S.sky[0]); g.addColorStop(1, S.sky[1]); x.fillStyle = g; x.fillRect(0, 0, w, h);
    if (S.night) { x.fillStyle = 'rgba(255,255,255,.7)'; for (let i = 0; i < 140; i++) x.fillRect(rng() * w, rng() * h * 0.45, 1.5, 1.5); }
    for (const layer of [0.55, 0.8, 1]) {
      let px = -20; while (px < w) {
        const bw = 60 + rng() * 150, bh = h * (0.25 + rng() * 0.5) * layer; const y = h - bh;
        x.fillStyle = S.towers; x.globalAlpha = layer === 1 ? 1 : 0.55 + layer * 0.3; x.fillRect(px, y, bw, bh);
        if (rng() > 0.7) { x.fillRect(px + bw * 0.45, y - 30 - rng() * 40, 4, 40); }   // a mast
        x.globalAlpha = 1;
        if (layer === 1) { x.fillStyle = S.lit; for (let wy = y + 12; wy < h - 8; wy += 16) for (let wx = px + 8; wx < px + bw - 8; wx += 13) if (rng() < (S.night ? 0.42 : 0.25)) x.fillRect(wx, wy, 6, 8); }
        px += bw + 4 + rng() * 14;
      }
    }
  });
}
function woodTex(base) {
  return canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = base; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { x.strokeStyle = `rgba(${rng() > 0.5 ? '0,0,0' : '255,210,160'},${0.04 + rng() * 0.07})`; x.lineWidth = 1 + rng() * 3; x.beginPath(); const px = rng() * w; x.moveTo(px, 0); x.bezierCurveTo(px + rng() * 20 - 10, h * 0.3, px + rng() * 20 - 10, h * 0.7, px + rng() * 16 - 8, h); x.stroke(); }
    for (let px = 0; px < w; px += 64) { x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(px, 0, 2, h); }
  }, [3, 1]);
}
function brickTex(base) {
  return canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = '#6f6a64'; x.fillRect(0, 0, w, h);
    const bw = 64, bh = 24;
    for (let r = 0; r * bh < h; r++) for (let c = -1; c * bw < w; c++) {
      const ox = r % 2 ? bw / 2 : 0; const col = new THREE.Color(base).offsetHSL(0, 0, (rng() - 0.5) * 0.08);
      x.fillStyle = '#' + col.getHexString(); x.fillRect(c * bw + ox + 2, r * bh + 2, bw - 4, bh - 4);
    }
  }, [5, 2]);
}
function floorTex(S) {
  if (S.wood) return woodTex('#3a2416');
  return canvasTex(512, 512, (x, w, h) => {
    x.fillStyle = S.floor; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(0,0,0,.12)'; x.lineWidth = 2; for (let i = 0; i <= w; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(w, i); x.stroke(); }
    if (S.glassTop) { x.strokeStyle = 'rgba(127,214,232,.35)'; x.lineWidth = 1; for (let i = 64; i <= w; i += 128) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } }
  }, [6, 4]);
}
/** a desk screen: who is at it, what they are doing, the last few lines of their log */
function drawScreen(x, w, h, S, d) {
  x.fillStyle = S.screen; x.fillRect(0, 0, w, h);
  const g = x.createLinearGradient(0, 0, 0, h); g.addColorStop(0, 'rgba(255,255,255,.06)'); g.addColorStop(1, 'rgba(0,0,0,.2)'); x.fillStyle = g; x.fillRect(0, 0, w, h);
  const col = d.state === 'done' ? '#5ff0a0' : d.state === 'failed' ? '#ff6a5c' : d.state === 'working' ? S.ink : S.dim;
  x.fillStyle = col; x.fillRect(0, 0, w, 6);
  x.font = '600 26px Consolas, monospace'; x.fillStyle = S.ink; x.fillText(d.name.toUpperCase().slice(0, 22), 16, 40);
  x.font = '18px Consolas, monospace'; x.fillStyle = col;
  x.fillText((d.state === 'working' ? '● ' : d.state === 'done' ? '✓ ' : d.state === 'failed' ? '✗ ' : '○ ') + (d.line || '').slice(0, 34), 16, 72);
  x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(16, 86, w - 32, 6); x.fillStyle = col; x.fillRect(16, 86, (w - 32) * clamp(d.pct || 0, 0, 100) / 100, 6);
  x.font = '15px Consolas, monospace'; x.fillStyle = S.dim;
  (d.log || []).slice(-5).forEach((l, i) => x.fillText('› ' + String(l).slice(0, 44), 16, 120 + i * 22));
  if (d.state === 'working') { const t = performance.now() / 500; if (Math.floor(t) % 2) { x.fillStyle = S.ink; x.fillRect(24 + ((d.log || []).slice(-1)[0] || '').slice(0, 40).length * 8.2, 120 + (Math.min(5, (d.log || []).length) - 1) * 22 - 14, 9, 16); } }
}

/* ------------------------------------------------------------------ a seated worker */
function worker(color, S) {
  const g = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05 });
  const skin = new THREE.MeshStandardMaterial({ color: '#d7b9a0', roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1d2129', roughness: 0.7 });
  const cap = (r, l, m) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 12), m);
  const torso = new THREE.Group(); torso.position.set(0, 0.62, 0); g.add(torso);
  const chest = cap(0.17, 0.3, suit); chest.position.y = 0.26; torso.add(chest);
  const neck = cap(0.05, 0.05, skin); neck.position.y = 0.52; torso.add(neck);
  const head = new THREE.Group(); head.position.y = 0.66; torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.125, 20, 16), skin); head.add(skull);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.13, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), dark); hair.position.y = 0.012; hair.rotation.x = 0.25; head.add(hair);
  const arms = [];
  for (const side of [-1, 1]) {
    const sh = new THREE.Group(); sh.position.set(side * 0.21, 0.44, 0); torso.add(sh);
    const upper = cap(0.052, 0.22, suit); upper.position.y = -0.14; sh.add(upper); sh.rotation.x = 0.55; sh.rotation.z = side * 0.12;
    const el = new THREE.Group(); el.position.y = -0.28; sh.add(el);
    const fore = cap(0.045, 0.2, suit); fore.position.y = -0.12; el.add(fore); el.rotation.x = 0.95;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.048, 12, 10), skin); hand.position.y = -0.26; el.add(hand);
    arms.push({ sh, el, side });
  }
  // legs, seated
  for (const side of [-1, 1]) {
    const thigh = cap(0.07, 0.32, dark); thigh.rotation.x = Math.PI / 2; thigh.position.set(side * 0.1, 0.56, -0.2); g.add(thigh);
    const shin = cap(0.06, 0.34, dark); shin.position.set(side * 0.1, 0.3, -0.4); g.add(shin);
  }
  // the chair
  const chair = new THREE.MeshStandardMaterial({ color: S.chair, roughness: 0.55, metalness: 0.2 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.08, 0.5), chair); seat.position.set(0, 0.5, -0.05); g.add(seat);
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.07), chair); back.position.set(0, 0.86, 0.22); back.rotation.x = -0.1; g.add(back);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 10), chair); post.position.set(0, 0.26, 0); g.add(post);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.03, 18), chair); base.position.set(0, 0.03, 0); g.add(base);
  return { g, torso, head, arms };
}

/* ------------------------------------------------------------------ the view */
export function mountFloor(host, { theme = 'ironman', accent, onPick, onExit } = {}) {
  const S = STYLE[theme] || STYLE.ironman; const AC = accent || S.accent;
  host.classList.add('fl-host');
  host.innerHTML = `<div class="fl-stage"></div><div class="fl-labels"></div>
    <header class="fl-head"><button type="button" class="fl-out" title="Back out to the building">‹ Building</button><div><small class="fl-kicker"></small><b class="fl-title"></b></div></header>
    <div class="fl-foot"></div>`;
  const stage = host.querySelector('.fl-stage'), labels = host.querySelector('.fl-labels');
  host.querySelector('.fl-out').addEventListener('click', e => { e.stopPropagation(); onExit?.(); });

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, Math.max(1, devicePixelRatio || 1))); renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = S.exposure;
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(S.night ? '#07090d' : '#cfd9e0');
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
  scene.fog = new THREE.Fog(scene.background, 14, 26);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 60);
  scene.add(new THREE.HemisphereLight(S.light, S.night ? '#1a120a' : '#8a9aa6', S.night ? 0.55 : 0.9));
  const key = new THREE.DirectionalLight(S.light, S.night ? 0.6 : 1.3); key.position.set(3, 6, 5); scene.add(key);

  // ---- the room: 14 wide, back wall at z = -6, open towards you
  const W = 14, D = 9.5, Hh = 3.8, BZ = -6;
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...o });
  const box = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); scene.add(b); return b; };
  const floorM = mat('#ffffff', { map: floorTex(S), roughness: S.floorRough, metalness: S.glassTop ? 0.2 : 0.05 });
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D + 4), floorM); fl.rotation.x = -Math.PI / 2; fl.position.z = BZ + (D + 4) / 2; scene.add(fl);
  if (S.rug) { const rug = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.2), mat(S.rug, { roughness: 0.95 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.005, -1.2); scene.add(rug); }
  const wallM = S.brick ? mat('#ffffff', { map: brickTex(S.wall), roughness: 0.9 }) : S.wood ? mat('#ffffff', { map: woodTex(S.wall), roughness: 0.55 }) : mat(S.wall, { roughness: 0.4 });
  box(0.2, Hh, D, wallM, -W / 2, Hh / 2, BZ + D / 2); box(0.2, Hh, D, wallM, W / 2, Hh / 2, BZ + D / 2);   // side walls
  box(W, 0.1, D, mat(S.ceiling, { roughness: 0.8 }), 0, Hh, BZ + D / 2);   // ceiling
  for (let z = BZ + 1.2; z < BZ + D; z += 2.2) { const strip = box(W * 0.8, 0.02, 0.18, new THREE.MeshBasicMaterial({ color: S.light }), 0, Hh - 0.06, z); strip.material.toneMapped = false; }
  // back wall: a band of windows onto the city, with the floor's big screen in the middle
  box(W, 0.9, 0.2, wallM, 0, 0.45, BZ); box(W, 0.35, 0.2, wallM, 0, Hh - 0.18, BZ);
  const city = new THREE.Mesh(new THREE.PlaneGeometry(W * 1.6, (Hh - 1.25) * 1.5), new THREE.MeshBasicMaterial({ map: skyline(S), toneMapped: false })); city.position.set(0, 0.9 + (Hh - 1.25) / 2 + 0.2, BZ - 3); scene.add(city);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh - 1.25), new THREE.MeshStandardMaterial({ color: '#9fc4d8', transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.3 })); glass.position.set(0, 0.9 + (Hh - 1.25) / 2, BZ + 0.02); scene.add(glass);
  const mullM = mat(S.wall2, { metalness: 0.4, roughness: 0.4 });
  for (let x = -W / 2; x <= W / 2 + 0.01; x += W / 7) box(0.08, Hh - 1.25, 0.14, mullM, x, 0.9 + (Hh - 1.25) / 2, BZ + 0.04);
  const trim = new THREE.MeshBasicMaterial({ color: S.trim, toneMapped: false });
  box(W, 0.03, 0.03, trim, 0, 0.92, BZ + 0.12); box(0.03, 0.03, D, trim, -W / 2 + 0.12, 0.02, BZ + D / 2); box(0.03, 0.03, D, trim, W / 2 - 0.12, 0.02, BZ + D / 2);
  // the big screen: what the floor is working on
  const bigCv = document.createElement('canvas'); bigCv.width = 1024; bigCv.height = 460; const bigTex = new THREE.CanvasTexture(bigCv); bigTex.colorSpace = THREE.SRGBColorSpace;
  box(4.4, 2.1, 0.12, mat('#101418', { metalness: 0.6, roughness: 0.3 }), 0, 2.2, BZ + 0.14);
  const big = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.9), new THREE.MeshBasicMaterial({ map: bigTex, toneMapped: false })); big.position.set(0, 2.2, BZ + 0.21); scene.add(big);
  // briefing board (left wall) and the archive (right wall)
  const boardCv = document.createElement('canvas'); boardCv.width = 1024; boardCv.height = 640; const boardTex = new THREE.CanvasTexture(boardCv); boardTex.colorSpace = THREE.SRGBColorSpace;
  box(0.1, 1.9, 3.1, mat(S.wall2, { metalness: 0.3 }), -W / 2 + 0.12, 1.85, -1.2);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(2.95, 1.78), new THREE.MeshBasicMaterial({ map: boardTex, toneMapped: false })); board.rotation.y = Math.PI / 2; board.position.set(-W / 2 + 0.18, 1.85, -1.2); scene.add(board);
  const shelf = new THREE.Group(); shelf.position.set(W / 2 - 0.35, 0, -1.2); shelf.rotation.y = -Math.PI / 2; scene.add(shelf);
  const shelfM = S.wood ? mat('#ffffff', { map: woodTex('#4a2d1a') }) : mat(S.wall2, { metalness: 0.35, roughness: 0.4 });
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.05, 0.45), shelfM); b.position.set(0, 0.55 + i * 0.62, 0); shelf.add(b); }
  const sideM = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.4, 0.45), shelfM); sideM.position.set(-1.6, 1.4, 0); shelf.add(sideM); const side2 = sideM.clone(); side2.position.x = 1.6; shelf.add(side2);
  const files = new THREE.Group(); shelf.add(files);
  if (S.clock) { const clk = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), new THREE.MeshBasicMaterial({ map: canvasTex(256, 256, (x) => { x.fillStyle = '#f3f0e8'; x.beginPath(); x.arc(128, 128, 124, 0, 7); x.fill(); x.lineWidth = 10; x.strokeStyle = '#222'; x.stroke(); x.fillStyle = '#222'; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; x.fillRect(128 + Math.sin(a) * 100 - 3, 128 - Math.cos(a) * 100 - 3, 6, 6); } }) })); clk.position.set(4.2, 3.1, BZ + 0.13); scene.add(clk);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.24, 0.01), new THREE.MeshBasicMaterial({ color: '#111' })); hand.position.set(4.2, 3.1, BZ + 0.15); hand.geometry.translate(0, 0.1, 0); scene.add(hand); scene.userData.clockHand = hand; }

  // ---- desks and the team
  let seats = [], agents = [], floorId = null, pickables = [];
  const deskM = S.wood ? mat('#ffffff', { map: woodTex(S.desk), roughness: 0.4 }) : mat(S.desk, { roughness: 0.35, metalness: 0.2 });
  const topM = S.glassTop ? new THREE.MeshStandardMaterial({ color: S.top, transparent: true, opacity: 0.55, roughness: 0.05, metalness: 0.2 }) : S.wood ? mat('#ffffff', { map: woodTex(S.top), roughness: 0.35 }) : mat(S.top, { roughness: 0.4, metalness: 0.3 });
  const teamG = new THREE.Group(); scene.add(teamG);
  function station(a, pos, rotY, lead) {
    const g = new THREE.Group(); g.position.set(...pos); g.rotation.y = rotY; teamG.add(g);
    const w = lead ? 2.2 : 1.6;
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, 0.85), topM); top.position.set(0, 0.76, -0.62); g.add(top);
    if (S.glassTop) { const leg = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 0.72, 0.04), deskM); leg.position.set(0, 0.38, -0.98); g.add(leg); }
    else { for (const sx of [-1, 1]) { const ped = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.72, 0.78), deskM); ped.position.set(sx * (w / 2 - 0.23), 0.37, -0.62); g.add(ped); } }
    // the screen facing the worker (and you, over their shoulder)
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(lead ? 1.3 : 0.95, lead ? 0.66 : 0.52, 0.035), mat('#15181c', { metalness: 0.5, roughness: 0.3 })); frame.position.set(0, 1.18, -0.92); g.add(frame);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(lead ? 1.24 : 0.9, lead ? 0.6 : 0.47), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })); scr.position.set(0, 1.18, -0.9); g.add(scr);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.04), mat('#15181c', { metalness: 0.6 })); stand.position.set(0, 0.9, -0.95); g.add(stand);
    if (S.lamp) {   // a green banker's lamp on a brass stem
      const brass = new THREE.MeshStandardMaterial({ color: '#b08a3e', roughness: 0.3, metalness: 0.85 });
      const lampM = new THREE.MeshStandardMaterial({ color: '#1d6a45', emissive: '#1d6a45', emissiveIntensity: 0.25, roughness: 0.25, metalness: 0.3, side: THREE.DoubleSide });
      const lx = w / 2 - 0.32, lz = -0.78;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.03, 20), brass); base.position.set(lx, 0.8, lz); g.add(base);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 8), brass); stem.position.set(lx, 0.95, lz); g.add(stem);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.34, 20, 1, true, 0, Math.PI), lampM); shade.rotation.set(0, 0, Math.PI / 2); shade.position.set(lx, 1.1, lz); g.add(shade);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe2a8', toneMapped: false })); bulb.position.set(lx, 1.07, lz); g.add(bulb);
      const glow = new THREE.PointLight('#ffd9a0', 1.1, 2.4, 1.6); glow.position.set(lx, 1.0, lz + 0.1); g.add(glow);
    }
    if (S.papers) { for (let i = 0; i < 2 + Math.floor(rng() * 3); i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.4), mat('#f4f1ea', { roughness: 0.95 })); p.position.set(-w / 2 + 0.28 + rng() * 0.2, 0.79 + i * 0.012, -0.5 + rng() * 0.1); p.rotation.y = rng() * 0.4 - 0.2; g.add(p); } }
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.02, 0.15), mat('#20242a', { metalness: 0.3 })); kb.position.set(0, 0.795, -0.42); g.add(kb);
    const person = worker(new THREE.Color().setHSL(((a.hue ?? hueOf(a.name)) % 360) / 360, 0.32, 0.36), S); g.add(person.g);
    // status ring above the head
    const ringM = new THREE.MeshBasicMaterial({ color: '#56697a', transparent: true, opacity: 0.8, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.014, 8, 48), ringM); ring.rotation.x = Math.PI / 2; ring.position.set(0, 1.62, 0); g.add(ring);
    const hit = new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, 1.6), new THREE.MeshBasicMaterial({ visible: false })); hit.position.set(0, 0.9, -0.3); hit.userData.agent = a.id; g.add(hit); pickables.push(hit);
    return { a, g, cv, tex, person, ring, lead, sig: '' };
  }
  function buildTeam(floor) {
    for (const s of seats) teamG.remove(s.g); seats = []; pickables = [];
    agents = floor.agents || [];
    const lead = agents.find(x => x.role === 'lead'), reviewer = agents.find(x => x.role === 'reviewer');
    const specs = agents.filter(x => x !== lead && x !== reviewer);
    const rows = specs.length > 4 ? [specs.slice(0, Math.ceil(specs.length / 2)), specs.slice(Math.ceil(specs.length / 2))] : [specs];
    rows.forEach((row, ri) => { const z = -2.1 - ri * 1.9; const gap = Math.min(2.5, 10.5 / Math.max(1, row.length)); row.forEach((a, i) => seats.push(station(a, [(i - (row.length - 1) / 2) * gap, 0, z], 0, false))); });
    if (lead) seats.push(station(lead, [-1.2, 0, 0.9], 0, true));
    if (reviewer) seats.push(station(reviewer, [3.3, 0, 0.9], 0, false));
  }

  // ---- what each person is doing, from the latest run
  let run = null, floor = null, tab = 'work';
  function stateOf(a) {
    if (!run) return { state: 'idle', line: 'Waiting for a task', log: [], pct: 0 };
    const live = LIVE.includes(run.status);
    if (a.role === 'lead') {
      if (run.phase === 'planning' || run.status === 'queued' || run.status === 'planning') return { state: 'working', line: 'Planning the work', log: (run.desk?.lead || []).map(x => x.text), pct: run.progress || 3 };
      return { state: run.status === 'failed' ? 'failed' : 'done', line: live ? 'Watching the team' : 'Plan handed out', log: (run.desk?.lead || []).map(x => x.text), pct: 100 };
    }
    if (a.role === 'reviewer') {
      if (run.phase === 'reviewing' || run.status === 'reviewing') return { state: 'working', line: 'Checking and signing off', log: (run.desk?.reviewer || []).map(x => x.text), pct: run.progress };
      if (run.status === 'done') return { state: 'done', line: 'Signed off', log: (run.desk?.reviewer || []).map(x => x.text), pct: 100 };
      if (run.status === 'failed' || run.status === 'budget') return { state: 'failed', line: run.status === 'budget' ? 'Budget cap reached' : 'Stopped', log: [], pct: run.progress };
      return { state: 'idle', line: live ? 'Waiting to review' : 'Nothing to review', log: [], pct: 0 };
    }
    const steps = (run.steps || []).filter(s => s.agent === a.id);
    if (!steps.length) return { state: 'idle', line: live ? 'Not on this job' : 'Free', log: [], pct: 0 };
    const w = steps.find(s => s.status === 'working'); const failed = steps.find(s => s.status === 'failed');
    const done = steps.filter(s => s.status === 'done').length;
    const cur = w || failed || steps[steps.length - 1];
    return { state: w ? 'working' : failed ? 'failed' : done === steps.length ? 'done' : 'idle', line: cur.title, log: (cur.log || []).map(x => x.text), pct: Math.round(done / steps.length * 100) + (w ? Math.round(50 / steps.length) : 0), step: cur.id };
  }
  const COL = { working: AC, done: '#5ff0a0', failed: '#ff5a4d', idle: '#56697a' };
  function paintScreens(force) {
    for (const s of seats) {
      const st = stateOf(s.a); s.st = st;
      const sig = JSON.stringify([st.state, st.line, st.pct, (st.log || []).slice(-5), st.state === 'working' ? Math.floor(performance.now() / 500) % 2 : 0]);
      if (!force && sig === s.sig) continue; s.sig = sig;
      drawScreen(s.cv.getContext('2d'), s.cv.width, s.cv.height, S, { name: s.a.name, ...st }); s.tex.needsUpdate = true;
      s.ring.material.color.set(COL[st.state] || COL.idle);
    }
    // the floor's big screen
    const x = bigCv.getContext('2d'), w = bigCv.width, h = bigCv.height;
    x.fillStyle = '#05080c'; x.fillRect(0, 0, w, h);
    x.strokeStyle = AC; x.globalAlpha = 0.25; for (let i = 0; i < w; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, h); x.stroke(); } x.globalAlpha = 1;
    x.font = '600 26px Consolas, monospace'; x.fillStyle = AC; x.fillText(`FLOOR ${floor?.number ?? ''} · ${String(floor?.name || '').toUpperCase()}`, 30, 50);
    const live = run && LIVE.includes(run.status);
    x.font = '300 46px "Segoe UI", sans-serif'; x.fillStyle = '#ffffff';
    const title = run ? run.title || run.task || '' : 'No work yet'; x.fillText(title.length > 34 ? title.slice(0, 33) + '…' : title, 30, 118);
    x.font = '22px Consolas, monospace'; x.fillStyle = run ? (run.status === 'done' ? '#5ff0a0' : run.status === 'failed' || run.status === 'budget' ? '#ff6a5c' : AC) : '#8aa0ab';
    x.fillText(run ? (live ? `${String(run.phase || run.status).toUpperCase()} · ${run.progress || 0}%` : run.status === 'done' ? '✓ DONE — SIGNED OFF' : `✗ ${String(run.status).toUpperCase()}`) : 'Give the floor a task on the right →', 30, 164);
    x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(30, 190, w - 60, 14); x.fillStyle = COL[run ? (run.status === 'done' ? 'done' : run.status === 'failed' ? 'failed' : 'working') : 'idle']; x.fillRect(30, 190, (w - 60) * clamp(run?.progress || 0, 0, 100) / 100, 14);
    const steps = run?.steps || []; x.font = '20px Consolas, monospace';
    steps.slice(0, 8).forEach((s, i) => { x.fillStyle = s.status === 'done' ? '#5ff0a0' : s.status === 'working' ? AC : s.status === 'failed' ? '#ff6a5c' : '#6d7f89'; x.fillText(`${s.status === 'done' ? '✓' : s.status === 'working' ? '●' : s.status === 'failed' ? '✗' : '○'} ${String(s.agentName || '').slice(0, 14).padEnd(14)} ${String(s.title || '').slice(0, 44)}`, 30, 244 + i * 26); });
    bigTex.needsUpdate = true;
  }
  function paintBoard() {
    const x = boardCv.getContext('2d'), w = boardCv.width, h = boardCv.height;
    x.fillStyle = S.night ? '#141008' : '#f6f7f4'; x.fillRect(0, 0, w, h);
    x.fillStyle = S.night ? S.ink : '#1b2530'; x.font = '600 34px "Segoe UI", sans-serif'; x.fillText('THE BRIEF', 36, 58);
    x.fillStyle = S.accent; x.fillRect(36, 72, 120, 4);
    x.font = '22px "Segoe UI", sans-serif'; x.fillStyle = S.night ? '#e9dcc0' : '#26323d';
    const words = String(floor?.purpose || '').split(/\s+/); let line = '', y = 118;
    for (const wd of words) { if (x.measureText(line + wd).width > w - 72) { x.fillText(line, 36, y); line = ''; y += 30; if (y > h - 120) break; } line += wd + ' '; }
    if (y <= h - 120) x.fillText(line, 36, y);
    x.font = '600 18px Consolas, monospace'; x.fillStyle = S.accent; x.fillText((floor?.skills || []).map(s => '#' + s.replace(/\s+/g, '')).join('  ').slice(0, 70), 36, h - 70);
    x.fillStyle = S.night ? '#9c8a66' : '#5a6772'; x.font = '18px Consolas, monospace'; x.fillText(`${(floor?.lessons || '').split('\n').filter(Boolean).length} lessons learned · ${(floor?.knowledge || []).length} knowledge files`, 36, h - 36);
    boardTex.needsUpdate = true;
  }
  // one box shape and one material per colour, shared by every folder, so redrawing the shelf makes nothing new
  const fileGeo = new THREE.BoxGeometry(0.1, 0.42, 0.34), fileMat = new Map();
  const matFor = (c, live) => { const k = c + (live ? '*' : ''); if (!fileMat.has(k)) fileMat.set(k, new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: live ? 0.5 : 0.08 })); return fileMat.get(k); };
  let filesKey = '';
  function stackFiles(runs) {
    const list = (runs || []).slice(0, 24), key = list.map(r => r.id + r.status).join('|'); if (key === filesKey) return; filesKey = key;
    files.clear();
    list.forEach((r, i) => {
      const c = r.status === 'done' ? '#3fbf7f' : r.status === 'failed' || r.status === 'budget' ? '#d9534f' : LIVE.includes(r.status) ? AC : '#8a96a0';
      const b = new THREE.Mesh(fileGeo, matFor(c, LIVE.includes(r.status)));
      b.position.set(-1.45 + (i % 8) * 0.36 + 0.1, 0.8 + Math.floor(i / 8) * 0.62, 0); b.rotation.z = (rng() - 0.5) * 0.08; files.add(b);
    });
  }

  // ---- camera: one spot per tab, eased between, with a gentle drift and drag-to-look
  const SHOTS = { work: { p: [0, 3.2, 6.6], t: [0, 1.15, -1.9] }, team: { p: [0.6, 2.45, 4.9], t: [0.3, 1.05, -1.7] }, brief: { p: [-2.4, 2.0, 1.4], t: [-6.9, 1.8, -1.2] }, history: { p: [2.4, 2.0, 1.4], t: [6.9, 1.7, -1.2] } };
  const cam = { p: new THREE.Vector3(0, 4.5, 11), t: new THREE.Vector3(0, 1.4, -2) }; let yaw = 0, drag = null;
  stage.addEventListener('pointerdown', e => { drag = { x: e.clientX, y0: yaw, moved: 0 }; stage.setPointerCapture?.(e.pointerId); });
  stage.addEventListener('pointermove', e => { if (drag) { yaw = clamp(drag.y0 + (e.clientX - drag.x) * 0.004, -0.6, 0.6); drag.moved += Math.abs(e.movementX || 0); } });
  stage.addEventListener('pointerup', e => {
    const d = drag; drag = null; if (!d || d.moved > 6) return;
    const r = stage.getBoundingClientRect(); const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = ray.intersectObjects(pickables)[0]; if (hit) { const s = seats.find(x => x.a.id === hit.object.userData.agent); onPick?.(s.a, s.st); }
  });
  labels.addEventListener('click', e => { const b = e.target.closest('[data-agent]'); if (!b) return; const s = seats.find(x => x.a.id === b.dataset.agent); if (s) onPick?.(s.a, s.st); });

  let alive = true, raf = 0, last = performance.now(), lastLbl = 0;
  function frame(now) {
    if (!alive) return; raf = requestAnimationFrame(frame);
    const dt = clamp((now - last) / 1000, 0, 0.1); last = now;
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return;
    if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const shot = SHOTS[tab] || SHOTS.work; const k = 1 - Math.exp(-dt * 2.2);
    cam.p.lerp(new THREE.Vector3(...shot.p), k); cam.t.lerp(new THREE.Vector3(...shot.t), k);
    const t = now / 1000; const off = new THREE.Vector3().subVectors(cam.p, cam.t).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.sin(t * 0.15) * 0.05);
    camera.position.copy(cam.t).add(off); camera.lookAt(cam.t);
    // the team at work
    for (const s of seats) {
      const st = s.st?.state || 'idle'; const P = s.person; const ph = t * 9 + s.a.name.length;
      const typing = st === 'working';
      P.arms.forEach((a, i) => { a.el.rotation.x = 0.95 + (typing ? Math.sin(ph + i * Math.PI) * 0.12 : st === 'done' ? -0.35 : 0); a.sh.rotation.x = 0.55 + (typing ? Math.sin(ph * 0.5 + i) * 0.04 : st === 'done' ? -0.3 : 0); });
      P.torso.rotation.x = st === 'done' ? 0.12 : st === 'failed' ? -0.18 : typing ? -0.06 + Math.sin(t * 1.3) * 0.02 : 0;
      P.head.rotation.x = st === 'failed' ? -0.35 : typing ? Math.sin(t * 2.1 + s.a.name.length) * 0.06 - 0.08 : 0.05;
      P.head.rotation.y = typing ? Math.sin(t * 0.7 + s.a.name.length) * 0.12 : 0;
      s.ring.material.opacity = st === 'working' ? 0.55 + 0.45 * Math.sin(t * 4) : 0.85; s.ring.rotation.z = t * (st === 'working' ? 1.6 : 0.3);
    }
    if (scene.userData.clockHand) scene.userData.clockHand.rotation.z = -((Date.now() / 60000) % 60) / 60 * Math.PI * 2;
    if (now - lastLbl > 500) { lastLbl = now; paintScreens(false); }
    renderer.render(scene, camera);
    placeLabels();
  }
  function placeLabels() {
    const w = stage.clientWidth, h = stage.clientHeight; let html = '';
    if (tab === 'brief' || tab === 'history') { labels.innerHTML = ''; return; }
    const spots = [];
    for (const s of seats) {
      const v = new THREE.Vector3(0, 1.78, 0).applyMatrix4(s.g.matrixWorld).project(camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
      spots.push({ s, x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h });
    }
    // keep name tags from sitting on top of each other
    spots.sort((a, b) => a.y - b.y);
    const bw = tab === 'team' ? 190 : 150, bh = tab === 'team' ? 58 : 44;
    for (let i = 0; i < spots.length; i++) for (let j = 0; j < i; j++) { const a = spots[j], b = spots[i]; if (Math.abs(a.x - b.x) < bw && Math.abs(a.y - b.y) < bh) b.y = a.y + bh; }
    for (const { s, x, y } of spots) {
      const st = s.st || { state: 'idle', line: '' };
      html += `<button type="button" class="fl-lbl st-${st.state}${tab === 'team' ? ' big' : ''}" data-agent="${esc(s.a.id)}" style="transform:translate(${x.toFixed(0)}px,${y.toFixed(0)}px);--c:${COL[st.state]}">
        <b>${esc(s.a.name)}</b><small>${esc(s.a.title || s.a.role)}${s.a.rank ? ' · ' + esc(s.a.rank) : ''}</small>${tab === 'team' || st.state === 'working' ? `<em>${esc(st.line || '')}</em>` : ''}</button>`;
    }
    patchKeyed(labels, html, 'data-agent');
  }
  raf = requestAnimationFrame(frame);

  return {
    update(next) {
      const f = next.floor; if (!f) return;
      const sig = (f.agents || []).map(a => a.id + a.name + a.role).join('|');
      if (f.id !== floorId || sig !== floor?.__sig) { floorId = f.id; buildTeam(f); }
      floor = f; floor.__sig = sig; run = next.run || null; if (next.tab) tab = next.tab;
      host.querySelector('.fl-kicker').textContent = `FLOOR ${f.number} · ${S.name}`; host.querySelector('.fl-title').textContent = f.name;
      host.querySelector('.fl-foot').textContent = tab === 'team' ? 'Click someone to see their desk cam' : tab === 'brief' ? 'The floor\'s brief, its skills and what it has learned' : tab === 'history' ? 'Every job this floor has done: green signed off, red failed' : run && LIVE.includes(run.status) ? 'Live — screens show what each person is doing' : 'Drag to look around · click someone for their desk cam';
      paintScreens(true); paintBoard(); stackFiles(next.runs);
    },
    setTab(t) { tab = SHOTS[t] ? t : 'work'; },
    pause(on) { if (on) { alive = false; cancelAnimationFrame(raf); } else if (!alive) { alive = true; last = performance.now(); raf = requestAnimationFrame(frame); } },
    dispose() { alive = false; cancelAnimationFrame(raf); try { renderer.dispose(); renderer.forceContextLoss(); } catch {} host.innerHTML = ''; host.classList.remove('fl-host'); },
  };
}
