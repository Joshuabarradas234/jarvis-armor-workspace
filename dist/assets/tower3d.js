/*
 * JARVIS v9.10 — the tower in 3D, with a line from every floor to its live status.
 * Shows your own model (.glb) or picture if you've added one for this hall; otherwise a stand-in tower.
 */
import * as THREE from '../vendor/three/three.module.min.js';
import { GLTFLoader } from '../vendor/three/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/three/meshopt_decoder.module.js';
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


const H = 10;   // every tower is scaled to this height
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const COLORS = { working: null, done: '#5ff0a0', failed: '#ff5a4d', budget: '#ffb347', stopped: '#9fb6c3', idle: '#56697a' };

/* ------------------------------------------------------------------ stand-in towers (original designs, detailed) */
const rnd = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647)(42);
function mat(color, o = {}) { return new THREE.MeshStandardMaterial({ color, metalness: 0.4, roughness: 0.5, envMapIntensity: 1, ...o }); }
function glow(color, strength = 1) { const c = new THREE.Color(color).multiplyScalar(strength); return new THREE.MeshBasicMaterial({ color: c, toneMapped: false }); }
function box(w, h, d, m, x = 0, y = 0, z = 0, ry = 0) { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.position.set(x, y, z); g.rotation.y = ry; return g; }
/** lit windows on all four faces: most on, some dim, some off, like a real building at night */
function windows(group, w, d, y0, y1, rows, cols, color, { on = 0.72, depth = 0.012, inset = 0.62 } = {}) {
  const count = rows * cols * 4; const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ toneMapped: false }), count);
  const q = new THREE.Object3D(); const base = new THREE.Color(color); const c = new THREE.Color(); let k = 0;
  for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) for (const [nx, nz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const span = nx ? d : w; const off = -span / 2 + (col + 0.5) * span / cols; const y = y0 + (r + 0.5) * (y1 - y0) / rows;
    q.position.set(nx ? nx * (w / 2 + depth) : off, y, nz ? nz * (d / 2 + depth) : off);
    q.scale.set(nx ? depth : span / cols * inset, (y1 - y0) / rows * 0.58, nz ? depth : span / cols * inset);
    q.updateMatrix(); inst.setMatrixAt(k, q.matrix);
    const v = rnd(); c.copy(base).multiplyScalar(v < on ? 1.4 + rnd() * 0.9 : v < on + 0.12 ? 0.45 : 0.05); inst.setColorAt(k++, c);
  }
  group.add(inst);
}
function piers(group, w, d, y0, h, n, m, t = 0.05) {   // vertical ribs across every face
  for (let i = 0; i <= n; i++) { const f = -0.5 + i / n; for (const s of [1, -1]) { group.add(box(t, h, t * 1.4, m, f * w, y0 + h / 2, s * (d / 2 + t * 0.5))); group.add(box(t * 1.4, h, t, m, s * (w / 2 + t * 0.5), y0 + h / 2, f * d)); } }
}
function cornice(group, w, d, y, m, t = 0.08, over = 0.1) { group.add(box(w + over, t, d + over, m, 0, y + t / 2, 0)); }
function standIn(theme) {
  const g = new THREE.Group();
  if (theme === 'batcave') {
    const stone = mat('#17181d', { metalness: 0.35, roughness: 0.62 }), trim = mat('#34343c', { metalness: 0.7, roughness: 0.35 }), bronze = mat('#6b5431', { metalness: 0.9, roughness: 0.3 });
    // podium with a lit entrance
    g.add(box(3.0, 0.7, 2.6, stone, 0, 0.35, 0)); cornice(g, 3.0, 2.6, 0.7, trim, 0.07, 0.12);
    g.add(box(0.7, 0.5, 0.05, glow('#ffc861', 1.4), 0, 0.26, 1.31)); g.add(box(1.0, 0.08, 0.3, bronze, 0, 0.56, 1.42));
    const tiers = [[2.3, 2.0], [1.9, 1.9], [1.55, 1.6], [1.25, 1.3], [0.95, 1.0], [0.68, 0.8]]; let y = 0.77;
    tiers.forEach(([w, h], i) => {
      g.add(box(w, h, w, stone, 0, y + h / 2, 0));
      piers(g, w, w, y, h, 6, trim, 0.045);
      windows(g, w, w, y + 0.1, y + h - 0.12, Math.round(h * 5), 6, '#ffc861', { on: 0.62 - i * 0.04 });
      cornice(g, w, w, y + h, trim, 0.06, 0.08);
      for (const sx of [1, -1]) for (const sz of [1, -1]) {   // corner buttresses with little pinnacles
        g.add(box(0.14, h + 0.25, 0.14, trim, sx * w / 2, y + (h + 0.25) / 2, sz * w / 2));
        const pin = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.32, 4), bronze); pin.position.set(sx * w / 2, y + h + 0.41, sz * w / 2); pin.rotation.y = Math.PI / 4; g.add(pin);
      }
      y += h + 0.06;
    });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.5, 8), trim); drum.position.y = y + 0.25; g.add(drum);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.02, 8, 32), glow('#ffc861', 2)); ring.rotation.x = Math.PI / 2; ring.position.y = y + 0.42; g.add(ring);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(0.22, 2.4, 8), bronze); spire.position.y = y + 0.5 + 1.2; g.add(spire);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 12), glow('#fff1c2', 3)); tip.position.y = y + 2.95; tip.userData.blink = true; g.add(tip);
  } else if (theme === 'spiderman') {
    const lime = mat('#d9cdb3', { metalness: 0.02, roughness: 0.82 }), brick = mat('#7f3325', { metalness: 0.02, roughness: 0.88 }), steel = mat('#50565e', { metalness: 0.85, roughness: 0.3 }), wood = mat('#5a3b24', { metalness: 0.1, roughness: 0.8 });
    const neon = glow('#ff2d2d', 2.2), warm = '#ffd08a';
    // limestone base with tall arched ground-floor windows
    g.add(box(2.6, 1.2, 2.2, lime, 0, 0.6, 0)); windows(g, 2.6, 2.2, 0.12, 1.08, 2, 6, warm, { on: 0.85, inset: 0.5 }); cornice(g, 2.6, 2.2, 1.2, lime, 0.1, 0.14);
    g.add(box(0.6, 0.12, 0.35, steel, 0, 0.75, 1.24));   // entrance canopy
    const tiers = [[2.2, 1.9, 3.8, brick], [1.7, 1.5, 1.5, brick], [1.25, 1.1, 1.1, brick], [0.8, 0.7, 0.7, lime]]; let y = 1.3;
    tiers.forEach(([w, d, h, m], i) => {
      g.add(box(w, h, d, m, 0, y + h / 2, 0));
      if (m === brick) piers(g, w, d, y, h, 7 - i * 2, lime, 0.04);
      windows(g, w, d, y + 0.1, y + h - 0.1, Math.round(h * 4.4), 7 - i * 2, warm, { on: 0.7 });
      cornice(g, w, d, y + h, lime, 0.08, 0.1);
      for (const s of [1, -1]) { g.add(box(w + 0.12, 0.025, 0.025, neon, 0, y + h + 0.1, s * (d / 2 + 0.06))); g.add(box(0.025, 0.025, d + 0.12, neon, s * (w / 2 + 0.06), y + h + 0.1, 0)); }
      y += h + 0.08;
    });
    // rooftop water tower and radio mast
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 16), wood); tank.position.set(-0.18, y + 0.32, 0.1); g.add(tank);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.14, 16), wood); roof.position.set(-0.18, y + 0.54, 0.1); g.add(roof);
    for (const [lx, lz] of [[-0.1, -0.1], [0.1, -0.1], [-0.1, 0.1], [0.1, 0.1]]) g.add(box(0.015, 0.2, 0.015, steel, -0.18 + lx, y + 0.1, 0.1 + lz));
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.04, 1.9, 6), steel); mast.position.set(0.18, y + 0.95, -0.05); g.add(mast);
    for (let k = 1; k <= 4; k++) g.add(box(0.2 - k * 0.03, 0.012, 0.012, steel, 0.18, y + k * 0.38, -0.05));
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), glow('#ff3030', 3)); beacon.position.set(0.18, y + 1.92, -0.05); beacon.userData.blink = true; g.add(beacon);
  } else {
    const glass = mat('#a7d4e4', { metalness: 0.9, roughness: 0.06, transparent: true, opacity: 0.88 }), white = mat('#e9eef2', { metalness: 0.2, roughness: 0.35 }), fin = mat('#c3ced6', { metalness: 1, roughness: 0.2 });
    const band = glow('#5fe0ff', 1.8);
    g.add(box(2.8, 0.35, 2.2, white, 0, 0.175, 0)); g.add(box(2.9, 0.03, 2.3, band, 0, 0.36, 0));
    const n = 34; let y = 0.36;
    for (let i = 0; i < n; i++) {
      const w = 1.6 - Math.sin(i / n * Math.PI) * 0.12 - i * 0.012; const h = 0.25;
      const slab = box(w, h, w * 0.66, glass, 0, y + h / 2, 0, i * 0.1); g.add(slab);
      g.add(box(w * 1.03, 0.022, w * 0.69, band, 0, y + h + 0.011, 0, i * 0.1));
      for (const s of [1, -1]) { const m = box(0.03, h, 0.03, fin, 0, y + h / 2, 0, i * 0.1); m.position.set(Math.cos(-i * 0.1) * s * w / 2, y + h / 2, Math.sin(-i * 0.1) * s * w / 2); g.add(m); }
      y += h + 0.022;
    }
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; g.add(box(0.05, 1.8 - (i % 2) * 0.5, 0.24, fin, Math.cos(a) * 0.46, y + 0.9 - (i % 2) * 0.25, Math.sin(a) * 0.46, -a)); }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 16), glow('#8ff0ff', 3)); beacon.position.y = y + 1.95; beacon.userData.blink = true; g.add(beacon);
  }
  return g;
}

/* ------------------------------------------------------------------ fitting any model to the tower frame */
function normalise(obj) {
  obj.updateMatrixWorld(true);
  const box3 = new THREE.Box3().setFromObject(obj, true); const size = box3.getSize(new THREE.Vector3());
  const s = H / (size.y || 1); obj.scale.multiplyScalar(s);
  obj.updateMatrixWorld(true); const b2 = new THREE.Box3().setFromObject(obj, true); const c = b2.getCenter(new THREE.Vector3());
  obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y;
  return obj;
}
/** how far the building reaches from its centre line, at each height (for placing the floor lines) */
function radiusProfile(obj, bins = 48) {
  const prof = new Array(bins).fill(0); const v = new THREE.Vector3();
  obj.updateMatrixWorld(true);
  obj.traverse(m => {
    if (!m.isMesh || !m.geometry?.attributes?.position) return;
    const pos = m.geometry.attributes.position; const step = Math.max(1, Math.floor(pos.count / 4000));
    const inst = m.isInstancedMesh ? m.count : 0; const tmp = new THREE.Matrix4();
    for (let k = 0; k < (inst || 1); k++) {
      if (inst) m.getMatrixAt(k, tmp);
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i); if (inst) v.applyMatrix4(tmp); v.applyMatrix4(m.matrixWorld);
        const b = Math.max(0, Math.min(bins - 1, Math.floor(v.y / H * bins))); prof[b] = Math.max(prof[b], Math.hypot(v.x, v.z));
      }
    }
  });
  for (let i = 0; i < bins; i++) if (!prof[i]) prof[i] = prof[i - 1] || 0.5;
  return h => prof[Math.max(0, Math.min(bins - 1, Math.floor(h / H * bins)))];
}

/** how far back the camera must stand, at each angle round the building, for every part of it to be in view */
function silhouette(obj) {
  const pts = []; const v = new THREE.Vector3(); obj.updateMatrixWorld(true);
  obj.traverse(m => {
    if (!m.isMesh || !m.geometry?.attributes?.position) return;
    const pos = m.geometry.attributes.position; const inst = m.isInstancedMesh ? m.count : 0; const tmp = new THREE.Matrix4();
    const step = Math.max(1, Math.floor(pos.count * Math.max(1, inst) / 16000));
    for (let k = 0; k < (inst || 1); k++) { if (inst) m.getMatrixAt(k, tmp); for (let i = 0; i < pos.count; i += step) { v.fromBufferAttribute(pos, i); if (inst) v.applyMatrix4(tmp); v.applyMatrix4(m.matrixWorld); pts.push(v.x, v.z); } }
  });
  const P = Float32Array.from(pts); let K = 0, bins = null;
  const build = k => {
    bins = new Float32Array(72); K = k;
    for (let b = 0; b < 72; b++) { const a = b / 72 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a); let d = 0;
      for (let i = 0; i < P.length; i += 2) { const x = P[i], z = P[i + 1]; const need = Math.abs(x * c - z * sn) / k + (x * sn + z * c); if (need > d) d = need; } bins[b] = d; }
  };
  return (a, k) => { if (!bins || Math.abs(k - K) / k > 0.02) build(k); const t = ((a / (Math.PI * 2)) % 1 + 1) % 1 * 72; const i = Math.floor(t) % 72, j = (i + 1) % 72, f = t - Math.floor(t); return bins[i] * (1 - f) + bins[j] * f; };
}
const SWAY = 0.4;   // how far the tower turns each way on its own

/* ------------------------------------------------------------------ one tower view */
export function mountTower(host, { theme, accent = '#7fd6e8', model = null, compact = false, onPick, spin = 'sway' } = {}) {
  host.classList.add('t3-host'); host.classList.toggle('t3-compact', !!compact); host.innerHTML = `<div class="t3-stage"></div><svg class="t3-lines"></svg><div class="t3-tags"></div><div class="t3-msg" hidden></div>`;
  const stage = host.querySelector('.t3-stage'), svg = host.querySelector('.t3-lines'), tags = host.querySelector('.t3-tags'), msg = host.querySelector('.t3-msg');
  let floors = [], runs = new Map(), band = model?.band || [0.1, 0.9], alive = true, raf = 0, angle = model?.hero ?? 0.6, base = angle, swayT = 0, dist = 0, fitAt = null, paused = false, lastDraw = 0, drag = null, last = performance.now(), anchors = [], img = null, imgEdge = null;
  const W = () => host.clientWidth, Hh = () => host.clientHeight;
  const swayMax = (a, k) => { let w = 0; for (let n = -4; n <= 4; n++) w = Math.max(w, fitAt(a + n / 4 * SWAY, k)); return w; };
  const lensK = () => Math.tan(THREE.MathUtils.degToRad(14)) * Math.max(0.2, camera?.aspect || stageW() / Math.max(1, Hh()));
  const stageW = () => Math.round(W() * (compact ? 0.58 : 0.56));

  // ---- 3D (model or stand-in) ----
  let renderer, scene, camera, root, profile, rings = [], reach = 1.2, placed = false, front = null, pad = null;
  const use3d = !model || model.kind !== 'image';
  if (use3d) {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); renderer.setClearColor(0x000000, 0);   // see-through: the tower stands in the hall, not in a box
    renderer.setPixelRatio(Math.min(2, Math.max(1.25, devicePixelRatio || 1))); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    stage.appendChild(renderer.domElement);
    scene = new THREE.Scene(); scene.fog = new THREE.Fog('#05090d', H * 3, H * 6);
    const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose(); renderer.setClearColor(0x000000, 0);
    camera = new THREE.PerspectiveCamera(28, 1, 0.1, 200);
    scene.add(new THREE.HemisphereLight('#cfe8ff', '#10141a', 1.1));
    const key = new THREE.DirectionalLight('#ffffff', 2.2); key.position.set(6, 12, 8); scene.add(key);
    const rim = new THREE.DirectionalLight(accent, 1.4); rim.position.set(-8, 6, -6); scene.add(rim);
    front = new THREE.DirectionalLight('#dfefff', 0); scene.add(front); scene.add(front.target);   // follows the camera so the side you look at is lit
    pad = new THREE.Group(); scene.add(pad);
    // a dark plinth that fades out at the edge, so the tower stands on light rather than on a grey plate
    const gc = document.createElement('canvas'); gc.width = gc.height = 256; const gx = gc.getContext('2d'); const gr = gx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(14,22,30,0.96)'); gr.addColorStop(0.72, 'rgba(8,13,18,0.9)'); gr.addColorStop(1, 'rgba(5,9,13,0)'); gx.fillStyle = gr; gx.fillRect(0, 0, 256, 256);
    const gt = new THREE.CanvasTexture(gc); gt.colorSpace = THREE.SRGBColorSpace;
    const floorDisc = new THREE.Mesh(new THREE.CircleGeometry(4.2, 64), new THREE.MeshBasicMaterial({ map: gt, transparent: true, depthWrite: false, toneMapped: false })); floorDisc.rotation.x = -Math.PI / 2; floorDisc.renderOrder = -1; pad.add(floorDisc);
    const halo = new THREE.Mesh(new THREE.RingGeometry(3.3, 3.36, 96), glow(accent, 1.2)); halo.rotation.x = -Math.PI / 2; halo.position.y = 0.005; pad.add(halo);
    for (let i = 1; i <= 3; i++) { const r = new THREE.Mesh(new THREE.RingGeometry(i * 0.95, i * 0.95 + 0.012, 96), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.18, toneMapped: false })); r.rotation.x = -Math.PI / 2; r.position.y = 0.004; pad.add(r); }
    root = new THREE.Group(); scene.add(root);
    const setModel = obj => {
      root.clear(); root.add(normalise(obj)); profile = radiusProfile(root);
      // how wide the model is, so the camera can step back far enough to show all of it
      let r = 0.5; for (let hh = 0; hh <= H; hh += H / 48) r = Math.max(r, profile(hh)); reach = r;
      fitAt = silhouette(root); pad.scale.setScalar(Math.max(1, r * 1.12 / 3.6));
      // no favourite side given: face the side where the building fills the panel best
      if (model?.hero == null) { const k = lensK(); let best = 0, bw = 1e9; for (let n = 0; n < 72; n++) { const a = n / 72 * Math.PI * 2; const w = swayMax(a, k); if (w < bw - 0.05) { bw = w; best = a; } } angle = base = best; swayT = 0; }
      dist = 0;
      buildRings(); layoutTags();
    };
    if (model?.kind === 'glb') {
      msg.hidden = false; msg.textContent = 'Loading your tower…';
      new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).load(model.url, gltf => { gltf.scene.traverse(o => { if (o.isMesh && o.material) {
        // scanned/AI models often come out mirror-glossy, which just reflects the room as white: give them a satin finish instead
        const m = o.material; m.roughnessMap = null; m.metalnessMap = null; m.roughness = 0.55; m.metalness = 0.25; m.envMapIntensity = 0.55; m.needsUpdate = true;
      } });
      // a textured model only needs a soft glow on its lights, not on its walls
      renderer.toneMappingExposure = 1.2; front.intensity = 0.9;
      msg.hidden = true; setModel(gltf.scene); }, undefined, err => { msg.hidden = false; msg.textContent = 'Could not load your model (' + (err?.message || 'unknown error') + '). Showing the stand-in.'; setModel(standIn(theme)); });
    } else setModel(standIn(theme));
    stage.addEventListener('pointerdown', e => { drag = { x: e.clientX, a: angle }; stage.setPointerCapture?.(e.pointerId); });
    stage.addEventListener('pointermove', e => { if (drag) angle = drag.a + (e.clientX - drag.x) * 0.01; });
    const end = () => { if (drag) { base = angle; swayT = 0; } drag = null; }; stage.addEventListener('pointerup', end); stage.addEventListener('pointerleave', end);
  } else {
    // a picture of the tower: floor lines start from the building's right-hand edge at each height
    img = new Image(); img.className = 't3-img'; img.decoding = 'async'; img.src = model.url; stage.appendChild(img);
    img.onload = () => {
      const c = document.createElement('canvas'); const s = Math.min(1, 600 / img.naturalHeight); c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height).data; const bg = [d[0], d[1], d[2], d[3]];
      imgEdge = []; let top = c.height, bottom = 0;
      for (let yy = 0; yy < c.height; yy++) { let e = -1; for (let xx = c.width - 1; xx >= 0; xx--) { const i = (yy * c.width + xx) * 4; const solid = d[i + 3] > 30 && (bg[3] < 30 || Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 60); if (solid) { e = xx; break; } } imgEdge.push(e < 0 ? null : e / c.width); if (e >= 0) { top = Math.min(top, yy); bottom = Math.max(bottom, yy); } }
      imgEdge.top = top / c.height; imgEdge.bottom = bottom / c.height; layoutTags();
    };
  }

  function buildRings() {
    if (!root) return;
    for (const r of rings) scene.remove(r.mesh); rings = [];
    floors.forEach((f, i) => {
      const h = floorHeight(i);
      const r = (profile ? profile(h) : 1) * 1.08 + 0.05;
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(r, 0.02, 8, 128), new THREE.MeshBasicMaterial({ color: '#56697a', transparent: true, opacity: 0.55, toneMapped: false }));
      mesh.rotation.x = Math.PI / 2; mesh.position.y = h; scene.add(mesh); rings.push({ mesh, f });
    });
  }
  const floorHeight = i => { const n = floors.length || 1; return H * (band[0] + (i + 0.5) / n * (band[1] - band[0])); };

  // ---- floor status ----
  const statusOf = f => {
    const list = [...runs.values()].filter(r => r.floorId === f.id).sort((a, b) => b.startedAt - a.startedAt); const r = list[0];
    if (!r) return { st: 'idle', pct: 0, line: 'Idle — no work yet' };
    if (['planning', 'queued'].includes(r.status)) return { st: 'working', pct: r.progress || 2, line: `Planning · ${esc(f.agents?.find(a => a.role === 'lead')?.name || 'lead')}`, r };
    if (r.status === 'working') { const s = r.steps.find(x => x.status === 'working'); const done = r.steps.filter(x => x.status === 'done').length; return { st: 'working', pct: r.progress, line: `Step ${done + 1}/${r.steps.length} · ${esc(s ? s.agentName + ': ' + s.title : 'working')}`, r }; }
    if (r.status === 'reviewing') return { st: 'working', pct: r.progress, line: `Sign-off · ${esc(f.agents?.find(a => a.role === 'reviewer')?.name || 'reviewer')}`, r };
    if (r.status === 'done') return { st: 'done', pct: 100, line: `✓ Done · ${esc(r.title)}${(r.approvals || []).some(a => a.status === 'waiting') ? ' · needs approval' : ''}`, r };
    if (r.status === 'budget') return { st: 'budget', pct: r.progress, line: `Budget cap reached · ${esc(r.title)}`, r };
    if (r.status === 'stopped') return { st: 'stopped', pct: r.progress, line: `Stopped · ${esc(r.title)}`, r };
    return { st: 'failed', pct: r.progress, line: `✗ Failed · ${esc(String(r.error || r.title).slice(0, 80))}`, r };
  };

  function layoutTags() {
    const sw = stageW(), w = W(), h = Hh();
    const ordered = floors.map((f, i) => ({ f, i })).reverse();   // top floor first
    // screen positions of each floor's anchor on the building's right edge
    anchors = ordered.map(({ f, i }) => {
      if (use3d && camera && placed) {
        const hh = floorHeight(i); const rr = (profile ? profile(hh) : 1) * 1.08 + 0.05;
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).setY(0).normalize();
        const p = new THREE.Vector3(right.x * rr, hh, right.z * rr).project(camera);
        const x = (p.x + 1) / 2 * sw, y = (1 - p.y) / 2 * h;
        return Number.isFinite(x) && Number.isFinite(y) ? { f, i, x: Math.max(0, Math.min(sw, x)), y: Math.max(0, Math.min(h, y)) } : { f, i, x: sw * 0.6, y: h * 0.5 };
      }
      if (imgEdge && img) {
        const rect = img.getBoundingClientRect(), hr = host.getBoundingClientRect();
        const n = floors.length || 1; const top = imgEdge.top, bot = imgEdge.bottom;
        const fy = bot - (band[0] + (i + 0.5) / n * (band[1] - band[0])) * (bot - top);
        const row = imgEdge[Math.round(fy * (imgEdge.length - 1))] ?? 0.5;
        return { f, i, x: rect.left - hr.left + (row ?? 0.5) * rect.width + 6, y: rect.top - hr.top + fy * rect.height };
      }
      return { f, i, x: sw * 0.6, y: h * (0.15 + 0.7 * (ordered.length ? (ordered.findIndex(o => o.f === f) + 0.5) / ordered.length : 0.5)) };
    });
    // tags down the right, in floor order, never overlapping
    const gap = compact ? 46 : 58; let prev = -1e9;
    const ys = anchors.map(a => a.y).map(y => { const v = Math.max(y, prev + gap); prev = v; return v; });
    const over = ys.length ? Math.max(0, ys[ys.length - 1] - (h - gap / 2 - 8)) : 0; for (let k = 0; k < ys.length; k++) ys[k] = Math.max(gap / 2, ys[k] - over);
    const tx = sw + (compact ? 14 : 26);
    let svgHtml = '', tagHtml = '';
    anchors.forEach((a, k) => {
      const s = statusOf(a.f); const col = COLORS[s.st] || accent; const y = ys[k];
      const mid = tx - 18;
      svgHtml += `<path d="M${a.x.toFixed(1)},${a.y.toFixed(1)} L${mid.toFixed(1)},${y.toFixed(1)} L${tx},${y.toFixed(1)}" style="stroke:${col}" class="st-${s.st}"/><circle cx="${a.x.toFixed(1)}" cy="${a.y.toFixed(1)}" r="3.5" style="fill:${col}" class="st-${s.st}"/>`;
      tagHtml += `<button type="button" class="t3-tag st-${s.st}" data-floor="${esc(a.f.id)}" style="top:${(y - gap / 2 + 3).toFixed(1)}px;left:${tx}px;--c:${col}">
        <span class="t3-n"><b>${a.f.number}</b> ${esc(a.f.name)}</span><em>${s.st === 'working' ? s.pct + '%' : s.st === 'done' ? '✓' : s.st === 'failed' ? '✗' : s.st === 'budget' ? '$' : ''}</em>
        <i class="t3-bar"><i style="width:${s.pct}%"></i></i><small>${s.line}</small></button>`;
      const ring = rings.find(r => r.f.id === a.f.id); if (ring) { ring.mesh.material.color.set(col); ring.st = s.st; }
    });
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.innerHTML = svgHtml; patchKeyed(tags, tagHtml, 'data-floor');
  }
  tags.addEventListener('click', e => { const t = e.target.closest('[data-floor]'); if (t) onPick?.(t.dataset.floor); });

  let tagClock = 0;
  function frame(now) {
    if (!alive) return;
    if (paused || now - lastDraw < 30) { raf = requestAnimationFrame(frame); return; }   // ~30 fps is plenty, and kinder to the battery
    lastDraw = now;
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (use3d && renderer) {
      const sw = stageW(), h = Hh();
      if (renderer.domElement.width !== Math.floor(sw * renderer.getPixelRatio()) || renderer.domElement.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(sw, h, false); renderer.domElement.style.width = sw + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = sw / Math.max(1, h); camera.updateProjectionMatrix(); }
      if (!drag) { if (spin === 'turn') angle += dt * 0.12; else if (spin === 'sway') { swayT += dt; angle = base + Math.sin(swayT * 0.23) * SWAY; } }
      // fit the whole building: tall enough for its height, far enough for its width in this (narrow) panel
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), aspect = Math.max(0.2, camera.aspect);
      const k = tanV * aspect;
      const need = fitAt ? (drag || spin !== 'sway' ? fitAt(angle, k) : swayMax(base, k)) : reach / k + reach;
      const fitH = (H * 0.55) / tanV;
      const want = Math.max(fitH, need * 1.04, H * 1.3);
      dist = dist ? dist + (want - dist) * (1 - Math.exp(-dt * 2.5)) : want;   // ease in and out as the building turns
      camera.position.set(Math.sin(angle) * dist, H * 0.44, Math.cos(angle) * dist); camera.lookAt(0, H * 0.5, 0); camera.updateMatrixWorld(); placed = true;
      if (front) { front.position.set(camera.position.x, H * 0.9, camera.position.z); front.target.position.set(0, H * 0.4, 0); }
      scene.fog.near = dist * 1.1; scene.fog.far = dist * 2.6;   // haze only the far distance, never the tower itself
      const t = now / 1000;
      for (const r of rings) { r.mesh.material.opacity = r.st === 'working' ? 0.6 + 0.4 * Math.sin(t * 4) : r.st === 'idle' ? 0.3 : 0.9; }
      root?.traverse(o => { if (o.userData.blink) o.visible = Math.sin(t * 3) > -0.2; });
      renderer.render(scene, camera);
      window.__t3Frames = (window.__t3Frames || 0) + 1;
    }
    if (now - tagClock > (use3d ? 90 : 500)) { tagClock = now; layoutTags(); }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  return {
    update(nextFloors, nextRuns) {
      const changed = nextFloors.map(f => f.id).join() !== floors.map(f => f.id).join();
      floors = nextFloors.slice().sort((a, b) => a.number - b.number); runs = nextRuns;
      if (changed) buildRings(); layoutTags();
    },
    setBand(b) { band = b; buildRings(); layoutTags(); },
    setAngle(a) { angle = base = a; swayT = 0; },
    anchorOf(id) { const a = anchors.find(x => x.f.id === id); return a ? { x: a.x, y: a.y } : null; },
    pause(on) { paused = !!on; if (!on) last = performance.now(); },
    dispose() { alive = false; cancelAnimationFrame(raf); try { renderer?.dispose(); renderer?.forceContextLoss(); } catch {} host.innerHTML = ''; },
  };
}
