/*
 * JARVIS v9.17 — living second-screen backdrops.
 * A hall's second-screen picture can come with a small scene file (assets/deck/<hall>.json) that brings it to life:
 *   boat:  a 3D model floating in the water of the picture, rocking gently on the swell, half under the waterline,
 *          with its reflection and ripples round the hull;
 *   sound: a quiet background soundtrack made live in the browser (no audio files), e.g. "cave": water lapping,
 *          drips echoing, a low rumble and the odd bat.
 *   plane: an aircraft parked on a pad in the picture, turning slowly, its wing-tip lights blinking.
 * Nothing here is drawn when the hall has no scene file, or when you have picked your own backdrop picture.
 */
import {watchRenderBudget} from './render-budget.js';
import { disposeObject, reducedMotion } from './scene-quality.js';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export async function mountScene(host, cfg, base) {
  const THREE = await import('../vendor/three/three.module.min.js');
  const { GLTFLoader } = await import('../vendor/three/GLTFLoader.js');
  const { MeshoptDecoder } = await import('../vendor/three/meshopt_decoder.module.js');
  const { RoomEnvironment } = await import('../vendor/three/RoomEnvironment.js');
  const quality=watchRenderBudget();
  const canvas = document.createElement('canvas'); canvas.className = 'dk-scene'; host.appendChild(canvas);
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!cfg.keep });
  r.setClearColor(0x000000, 0); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = cfg.exposure || 1.0;
  r.localClippingEnabled = true;
  const pm = new THREE.PMREMGenerator(r), room = new RoomEnvironment(); let envTarget;
  try { envTarget = pm.fromScene(room, 0.04); } finally { room.dispose(); pm.dispose(); }
  const env = envTarget.texture;
  const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const texFrom = (draw, n = 256, srgb = true) => { const cv = document.createElement('canvas'); cv.width = cv.height = n; draw(cv.getContext('2d'), n); const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const ringTex = texFrom((x) => { const gr = x.createRadialGradient(128, 128, 96, 128, 128, 126); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, 'rgba(255,236,200,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256); });
  const shadeTex = texFrom((x) => { const gr = x.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.85)'); gr.addColorStop(0.6, 'rgba(0,0,0,.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); }, 128, false);
  const glowTex = texFrom((x) => { const gr = x.createRadialGradient(128, 128, 60, 128, 128, 126); gr.addColorStop(0, 'rgba(255,210,140,0)'); gr.addColorStop(0.78, 'rgba(255,210,140,.5)'); gr.addColorStop(0.86, 'rgba(255,230,190,.9)'); gr.addColorStop(1, 'rgba(255,210,140,0)'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256); });

  function lights(scene) {
    scene.environment = env;
    scene.add(new THREE.HemisphereLight('#9fb8d8', '#05070a', 0.55));
    const warm = new THREE.DirectionalLight('#ffc873', 2.6); warm.position.set(2.5, 1.6, -1.2); scene.add(warm);      // the gold screen wall
    const cool = new THREE.DirectionalLight('#7fb4ff', 1.1); cool.position.set(-2, 1.2, 2); scene.add(cool);
    const top = new THREE.DirectionalLight('#ffffff', 0.7); top.position.set(0, 3, 1); scene.add(top);
  }
  // a model, sized to length 1, darkened to sit in a dark cave
  async function model(B, clip) {
    const g = await loader.loadAsync(base + B.model); const o = g.scene; o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o, true), size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    const s = 1 / Math.max(size.x, size.z), draft = B.draft ?? 0;
    o.scale.setScalar(s); o.position.set(-c.x * s, -(box.min.y + size.y * draft) * s, -c.z * s);
    o.traverse(m => { if (m.isMesh && m.material) { for (const mt of [].concat(m.material)) { if (clip) mt.clippingPlanes = [clip]; mt.envMapIntensity = B.env ?? 0.45; if (mt.color) mt.color.multiplyScalar(B.tone ?? 0.5); if (mt.roughness !== undefined) mt.roughness = Math.min(1, Math.max(mt.roughness, B.rough ?? 0.45)); mt.needsUpdate = true; } } });
    const L = size.z >= size.x ? { w: size.x * s, l: size.z * s, alongZ: true } : { w: size.z * s, l: size.x * s, alongZ: false };
    return { o, L };
  }
  const flatIn = (group, mat, order) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); m.rotation.x = -Math.PI / 2; m.renderOrder = order; group.add(m); return m; };
  const spanOf = L => (m, w, l) => L.alongZ ? m.scale.set(w, l, 1) : m.scale.set(l, w, 1);

  /* a boat on the water: cut at the waterline, rocking on the swell, with its reflection, shadow and ripples */
  async function water(B) {
    const scene = new THREE.Scene(); lights(scene);
    const up = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), down = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    const rock = new THREE.Group(); scene.add(rock);
    const mirror = new THREE.Group(); mirror.scale.y = -1; scene.add(mirror);
    const { o, L } = await model({ draft: 0.45, ...B }, up); const span = spanOf(L);
    const hull = new THREE.Group(); hull.add(o); hull.rotation.y = THREE.MathUtils.degToRad(B.heading ?? -35); rock.add(hull);
    const ref = o.clone(true); ref.traverse(m => { if (m.isMesh && m.material) { const mats = [].concat(m.material).map(mt => { const q = mt.clone(); q.clippingPlanes = [down]; q.side = THREE.DoubleSide; q.transparent = true; q.opacity = B.reflection ?? 0.4; if (q.color) q.color.multiplyScalar(0.8); q.depthWrite = false; return q; }); m.material = mats.length === 1 ? mats[0] : mats; m.renderOrder = 2; } });
    // the part under the waterline shows faintly through the dark water, so the hull runs into it instead of being cut off
    const under = o.clone(true); under.traverse(m => { if (m.isMesh && m.material) { const mats = [].concat(m.material).map(mt => { const q = mt.clone(); q.clippingPlanes = [down]; q.transparent = true; q.opacity = B.under ?? 0.3; q.depthWrite = false; if (q.color) q.color.lerp(new THREE.Color('#0a2030'), 0.6); return q; }); m.material = mats.length === 1 ? mats[0] : mats; m.renderOrder = 2; } });
    hull.add(under);
    const refHull = new THREE.Group(); refHull.add(ref); refHull.rotation.y = hull.rotation.y; mirror.add(refHull);
    const decals = new THREE.Group(); decals.rotation.y = hull.rotation.y; scene.add(decals);
    const shadow = flatIn(decals, new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false, opacity: B.shadow ?? 0.75 }), -1); shadow.position.y = 0.001; span(shadow, L.w * 1.5, L.l * 1.12);
    const rings = Array.from({ length: 4 }, (_, i) => { const m = flatIn(decals, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }), 3); m.position.y = 0.002; m.userData.p = i / 4; return m; });
    const lap = flatIn(decals, new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }), 3); lap.position.y = 0.003;
    return { B, scene, update(t) {
      // on the swell: a slow rise and fall, with a little pitch and roll that don't line up, so it never looks like a loop
      const sw = B.swell ?? 1;
      rock.position.y = (Math.sin(t * 1.05) * 0.010 + Math.sin(t * 0.47 + 1.3) * 0.006) * sw;
      rock.rotation.x = (Math.sin(t * 0.83 + 0.4) * 0.030 + Math.sin(t * 0.31) * 0.012) * sw;
      rock.rotation.z = (Math.sin(t * 0.69 + 2.1) * 0.034 + Math.sin(t * 1.37) * 0.008) * sw;
      rock.rotation.y = Math.sin(t * 0.11) * 0.05 * sw;   // drifts a touch on its mooring
      mirror.rotation.copy(rock.rotation); mirror.rotation.x *= -1; mirror.rotation.z *= -1; mirror.position.y = -rock.position.y;
      for (const m of rings) { const p = ((t * 0.12 + m.userData.p) % 1); const sc = 1 + p * 0.8; span(m, L.w * 1.3 * sc, L.l * 1.05 * sc); m.material.opacity = (1 - p) * p * 0.8 * (B.ripples ?? 1); }
      span(lap, L.w * 1.05, L.l * 0.98); lap.material.opacity = 0.55 + 0.15 * Math.sin(t * 2.1); decals.rotation.y = hull.rotation.y + rock.rotation.y;
    } };
  }

  /* an aircraft parked on a pad: sitting on its shadow, the pad's ring lit round it, turning slowly on the turntable */
  async function pad(B) {
    const scene = new THREE.Scene(); lights(scene);
    const { o, L } = await model(B, null); const span = spanOf(L);
    const turn = new THREE.Group(); turn.rotation.y = THREE.MathUtils.degToRad(B.heading ?? 30); scene.add(turn);
    const craft = new THREE.Group(); craft.add(o); turn.add(craft);
    const shadow = flatIn(turn, new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false, opacity: B.shadow ?? 0.8 }), -1); shadow.position.y = 0.001; span(shadow, L.w * 1.1, L.l * 1.05);
    const ringG = new THREE.Group(); scene.add(ringG);
    const ring = flatIn(ringG, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 }), 3); ring.position.y = 0.002; ring.scale.set(B.ring ?? 1.25, B.ring ?? 1.25, 1);
    // blinking wing-tip lights
    const dot = B.lights === false ? null : texFrom((x) => { const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); }, 64);
    const tips = []; if (B.lights !== false) { const bb = new THREE.Box3().setFromObject(o); for (const [side, col] of [[-1, '#ff3b3b'], [1, '#3bff7a']]) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); const across = L.alongZ ? 'x' : 'z'; sp.position.set(0, (bb.min.y + bb.max.y) / 2, 0); sp.position[across] = side > 0 ? bb.max[across] : bb.min[across]; sp.scale.set(0.05, 0.05, 1); sp.renderOrder = 5; craft.add(sp); tips.push(sp); } }
    return { B, scene, update(t) {
      turn.rotation.y = THREE.MathUtils.degToRad(B.heading ?? 30) + (B.spin ? t * THREE.MathUtils.degToRad(B.spin) : 0);   // degrees a second
      ring.material.opacity = 0.35 + 0.15 * Math.sin(t * 1.3);
      const blink = (t % 1.6) < 0.12; for (const sp of tips) sp.material.opacity = blink ? 1 : 0.15;
    } };
  }

  const props = [];
  let alive = true, paused = false, timer = 0;
  // everything handed back to the graphics chip, and the drawing context itself let go
  function dispose() {
    if (!alive) return; alive = false; clearTimeout(timer); quality.dispose();
    const shared = new Set([env, ringTex, shadeTex, glowTex]), seen = new Set();
    for (const p of props) disposeObject(p.scene, shared, seen);
    envTarget.dispose(); for (const t of [ringTex, shadeTex, glowTex]) t.dispose();
    r.dispose(); try { r.forceContextLoss(); } catch {} canvas.remove();
  }
  try {
    for (const B of [].concat(cfg.boat || [], cfg.boats || [])) props.push({ ...(await water(B)), cam: new THREE.PerspectiveCamera(B.fov || 26, 1, 0.01, 50) });
    for (const B of [].concat(cfg.plane || [], cfg.planes || [])) props.push({ ...(await pad(B)), cam: new THREE.PerspectiveCamera(B.fov || 26, 1, 0.01, 50) });
  } catch (e) { dispose(); throw e; }   // a model that won't load doesn't leave a dead canvas behind

  // where each thing sits in the picture: cfg in picture pixels, the picture drawn like CSS "cover"
  function place(B) {
    const W = host.offsetWidth, H = host.offsetHeight; if (!W || !H) return null;
    const k = Math.max(W / cfg.w, H / cfg.h), ox = (W - cfg.w * k) / 2, oy = (H - cfg.h * k) / 2;
    const cx = ox + B.x * k, cy = oy + B.y * k, L = B.len * k;   // centre at the water or floor, its length on screen
    return { W, H, x: cx - L * 1.1, y: cy - L * 0.75, w: L * 2.2, h: L * 1.2, cy: L * 0.75 };
  }
  let last = performance.now(), ms = 0, sizeKey = "", elapsed = 0, still = false;
  function frame(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000)); last = now;
    if (document.hidden || host.closest('[hidden]')) return;
    const W = host.offsetWidth, H = host.offsetHeight; if (!W || !H) return;
    const budget=quality.get(),pr=budget.dpr;
    const resized = sizeKey !== `${W}x${H}@${pr}`, reduced = budget.quiet;
    if (reduced && still && !resized) return; still = reduced;
    if (resized) { sizeKey = W + 'x' + H + '@' + pr; r.setPixelRatio(pr); r.setSize(W, H, false); }
    if (!reduced) elapsed += dt; const t = reduced ? 0 : elapsed;
    r.setScissorTest(true); r.setViewport(0, 0, W, H); r.setScissor(0, 0, W, H); r.clear();
    for (const p of props) {
      const P = place(p.B); if (!P) continue; p.update(t);
      // the camera frames a box round the thing that matches its spot in the picture
      const cam = p.cam, tilt = THREE.MathUtils.degToRad(p.B.tilt ?? 22); cam.aspect = P.w / P.h; cam.updateProjectionMatrix();
      const vh = 1.2, dist = (vh / 2) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), lookY = (P.cy - P.h / 2) / P.h * vh;
      cam.position.set(0, Math.sin(tilt) * dist + lookY, Math.cos(tilt) * dist); cam.lookAt(0, lookY, 0);
      r.setViewport(P.x, P.H - P.y - P.h, P.w, P.h); r.setScissor(P.x, P.H - P.y - P.h, P.w, P.h);
      r.render(p.scene, cam);
    }
  }
  // a steady timer (about 30 frames a second) rather than animation frames, which a second window can be starved of
  // each frame is booked once the last one is done, so a slow computer drops frames instead of piling them up
  const tick = () => { if (!alive) return; const a = performance.now(); try { if (!paused) { frame(a); } } catch (e) { console.warn('[scene]', e); } const took = performance.now() - a; ms = took; timer = setTimeout(tick, document.hidden || paused || quality.get().quiet || host.closest('[hidden]') ? 250 : Math.max(12, 1000 / quality.get().fps - took, took * 0.5)); };
  tick();
  return { pause(on) { paused = !!on; last = performance.now(); }, lastFrameMs: () => ms, dispose };
}

/* ---------- sound: made live, quiet, loops forever without repeating */
export function makeSound(kind, volume = 0.5) {
  const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null;
  const ctx = new Ctx(); const out = ctx.createGain(); out.gain.value = 0; out.connect(ctx.destination);
  const timers = new Map(); let on = false; let n = 0;
  // each sound schedules its own next one; nothing is made while the sound is off
  const every = (a, b, fn) => { const id = n++; const go = () => { if (on) { try { fn(); } catch {} } timers.set(id, setTimeout(go, (a + Math.random() * (b - a)) * 1000)); }; timers.set(id, setTimeout(go, (a + Math.random() * (b - a)) * 1000)); };
  const noise = (secs, brown) => { const buf = ctx.createBuffer(2, ctx.sampleRate * secs, ctx.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); let l = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { l = (l + 0.02 * w) / 1.02; d[i] = l * 3.4; } else d[i] = w; } } const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; return s; };
  const verb = (() => { const len = ctx.sampleRate * 3.4, b = ctx.createBuffer(2, len, ctx.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); } const c = ctx.createConvolver(); c.buffer = b; const g = ctx.createGain(); g.gain.value = 0.55; c.connect(g).connect(out); return c; })();
  if (kind === 'cave') {
    // water lapping against the hull and the walkway: brown noise, low-passed, swelling in slow waves
    const w = noise(6, true), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520; const wg = ctx.createGain(); wg.gain.value = 0.22;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.19; const lg = ctx.createGain(); lg.gain.value = 0.12; lfo.connect(lg).connect(wg.gain);
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.07; const lg2 = ctx.createGain(); lg2.gain.value = 180; lfo2.connect(lg2).connect(lp.frequency);
    w.connect(lp).connect(wg).connect(out); wg.connect(verb); w.start(); lfo.start(); lfo2.start();
    // little slaps of water
    every(0.7, 2.4, () => { const s = noise(1, false), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700 + Math.random() * 900; bp.Q.value = 1.2; const g = ctx.createGain(); const t = ctx.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05 + Math.random() * 0.05, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.5); s.connect(bp).connect(g).connect(out); g.connect(verb); s.start(t); s.stop(t + 0.6); });
    // the cave: a deep, slow rumble
    const rum = noise(8, true), rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 90; const rg = ctx.createGain(); rg.gain.value = 0.35; rum.connect(rl).connect(rg).connect(out); rum.start();
    // drips echoing off the rock
    every(1.8, 6.5, () => { const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime, f = 900 + Math.random() * 1400; o.type = 'sine'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.9, t + 0.06); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0003, t + 0.22); const p = ctx.createStereoPanner(); p.pan.value = Math.random() * 1.6 - 0.8; o.connect(g).connect(p).connect(verb); p.connect(out); o.start(t); o.stop(t + 0.3); });
    // now and then, bats: a quick flutter of wings and a few high chirps, far off in the dark
    every(18, 45, () => {
      const t = ctx.currentTime, pan = ctx.createStereoPanner(); pan.pan.setValueAtTime(Math.random() < 0.5 ? -0.9 : 0.9, t); pan.pan.linearRampToValueAtTime(pan.pan.value * -0.6, t + 2.2); pan.connect(verb); const pg = ctx.createGain(); pg.gain.value = 0.35; pan.connect(pg).connect(out);
      const flap = noise(3, false), fb = ctx.createBiquadFilter(); fb.type = 'bandpass'; fb.frequency.value = 1400; fb.Q.value = 0.8; const fg = ctx.createGain(); fg.gain.value = 0; flap.connect(fb).connect(fg).connect(pan);
      for (let i = 0; i < 26; i++) { const at = t + i * (0.07 + Math.random() * 0.03); fg.gain.setValueAtTime(0.0, at); fg.gain.linearRampToValueAtTime(0.05 * Math.sin(Math.PI * i / 26), at + 0.02); fg.gain.linearRampToValueAtTime(0, at + 0.05); }
      flap.start(t); flap.stop(t + 2.4);
      for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++) { const o = ctx.createOscillator(), g = ctx.createGain(), at = t + 0.2 + Math.random() * 1.8, f = 5200 + Math.random() * 2600; o.type = 'triangle'; o.frequency.setValueAtTime(f, at); o.frequency.exponentialRampToValueAtTime(f * 0.62, at + 0.045); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.012, at + 0.005); g.gain.exponentialRampToValueAtTime(0.0002, at + 0.05); o.connect(g).connect(pan); o.start(at); o.stop(at + 0.06); }
    });
  }
  const api = {
    ctx, on: false,
    start() { this.on = on = true; clearTimeout(this.sus); ctx.resume?.().catch(() => {}); out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(volume, ctx.currentTime, 1.2); },
    stop() { this.on = on = false; out.gain.cancelScheduledValues(ctx.currentTime); out.gain.setTargetAtTime(0, ctx.currentTime, 0.5); clearTimeout(this.sus); this.sus = setTimeout(() => { if (!on) ctx.suspend?.().catch(() => {}); }, 2500); },   // muted: the sound engine sleeps, so it costs no battery
    duck(on) { if (this.on) out.gain.setTargetAtTime(on ? volume * 0.25 : volume, ctx.currentTime, 0.4); },
    dispose() { on = false; clearTimeout(this.sus); timers.forEach(t => clearTimeout(t)); timers.clear(); try { ctx.close(); } catch {} },
  };
  return api;
}
