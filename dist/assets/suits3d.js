/*
 * JARVIS v9.14 — real 3D suits standing in the hall's glass cases.
 * Where a suit has its own model (assets/suits/<hall>/<suit id>.glb) it stands in its case in 3D, turning slowly under
 * the case light. The painted suit is taken out of the picture behind it (assets/wallpaper/<hall>-empty.jpg, the same
 * hall with those cases empty), so what you see behind the suit is the real inside of the case, and a sheet of glass
 * sits in front of it. The suit is sized to fill its case and stands on the case floor.
 * v9.15: opening a suit is a suit-up moment (the glass slides away and the suit steps out while the hall flies in);
 * pinch or drag a suit to spin it (let go and it turns back); each arc reactor glows with how busy that suit is;
 * "Jarvis, show me Mark 39" flies up to that case without opening it.
 */
const J = window.jarvis;
const VIEW = new URLSearchParams(location.search).get('view') || 'main';
const hall = () => document.body.dataset.theme || 'ironman';
const ACCENT = { ironman: '#7fd6e8', batcave: '#f5c542', spiderman: '#ff4d4d' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = k => { k = clamp(k, 0, 1); return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; };

if (J && VIEW === 'main') {
  let THREE = null, GLTFLoader = null, Meshopt = null, RoomEnv = null;
  const S = { renderer: null, canvas: null, clean: null, host: null, theme: null, list: null, stage: null, bays: new Map(), raf: 0, last: 0, env: null, glassTex: null, glowTex: {} };

  async function libs() {
    if (THREE) return;
    THREE = await import('../vendor/three/three.module.min.js');
    ({ GLTFLoader } = await import('../vendor/three/GLTFLoader.js'));
    ({ MeshoptDecoder: Meshopt } = await import('../vendor/three/meshopt_decoder.module.js'));
    ({ RoomEnvironment: RoomEnv } = await import('../vendor/three/RoomEnvironment.js'));
  }

  /* where each case's glass is in the hall picture, and the picture with those cases empty */
  async function stageFor(theme) {
    try {
      const r = await fetch(`jarvis://asset/wallpaper/${theme}-empty.json`); if (!r.ok) return null;
      const j = await r.json(); if (!j?.bays || !j.w || !j.h) return null;
      return { ...j, empty: `jarvis://asset/wallpaper/${theme}-empty.jpg`, base: `/wallpaper/${theme}.jpg` };
    } catch { return null; }
  }

  // the front pane of glass: faint light streaks and darker edges, so the suit reads as standing behind glass
  function glassTexture() {
    if (S.glassTex) return S.glassTex;
    const c = document.createElement('canvas'); c.width = 256; c.height = 512; const x = c.getContext('2d');
    const tint = x.createLinearGradient(0, 0, 0, 512); tint.addColorStop(0, 'rgba(190,230,255,.10)'); tint.addColorStop(0.5, 'rgba(150,205,235,.04)'); tint.addColorStop(1, 'rgba(120,190,230,.08)');
    x.fillStyle = tint; x.fillRect(0, 0, 256, 512);
    for (const [px, w, a] of [[38, 22, 0.13], [62, 8, 0.07], [196, 14, 0.08], [226, 5, 0.1]]) {
      const s = x.createLinearGradient(px - w, 0, px + w, 0); s.addColorStop(0, 'rgba(255,255,255,0)'); s.addColorStop(0.5, `rgba(255,255,255,${a})`); s.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = s; x.fillRect(px - w, 0, w * 2, 512);
    }
    const diag = x.createLinearGradient(0, 40, 256, 300); diag.addColorStop(0.35, 'rgba(255,255,255,0)'); diag.addColorStop(0.45, 'rgba(255,255,255,.05)'); diag.addColorStop(0.5, 'rgba(255,255,255,0)');
    x.fillStyle = diag; x.fillRect(0, 0, 256, 512);
    for (const [a, b] of [[0, 1], [256, -1]]) { const e = x.createLinearGradient(a, 0, a + b * 26, 0); e.addColorStop(0, 'rgba(10,20,30,.28)'); e.addColorStop(1, 'rgba(10,20,30,0)'); x.fillStyle = e; x.fillRect(Math.min(a, a + b * 26), 0, 26, 512); }
    x.fillStyle = 'rgba(230,248,255,.34)'; x.fillRect(2, 0, 2, 512); x.fillRect(252, 0, 2, 512);   // the glass edges catch the light
    const top = x.createRadialGradient(128, 0, 4, 128, 0, 150); top.addColorStop(0, 'rgba(225,245,255,.20)'); top.addColorStop(1, 'rgba(225,245,255,0)'); x.fillStyle = top; x.fillRect(0, 0, 256, 200);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; S.glassTex = t; return t;
  }
  // the glowing pad the suit stands on
  function glowTexture(accent) {
    if (S.glowTex[accent]) return S.glowTex[accent];
    const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, accent + 'ff'); g.addColorStop(0.35, accent + '99'); g.addColorStop(1, accent + '00');
    x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = accent; x.globalAlpha = 0.9; x.lineWidth = 5; x.beginPath(); x.arc(128, 128, 92, 0, Math.PI * 2); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; S.glowTex[accent] = t; return t;
  }

  // the arc reactor's glow: a bright core with a soft halo
  function reactorTexture() {
    if (S.reactorTex) return S.reactorTex;
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.14, 'rgba(210,248,255,.95)'); g.addColorStop(0.32, 'rgba(120,220,255,.45)'); g.addColorStop(1, 'rgba(80,190,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; S.reactorTex = t; return t;
  }
  function makeBay(id, url, accent) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(22, 0.6, 0.05, 60);
    scene.environment = S.env;
    scene.add(new THREE.HemisphereLight('#e4f4ff', '#141c24', 0.8));
    const top = new THREE.SpotLight('#f2fbff', 26, 0, 0.62, 0.55, 1.2); top.position.set(0, 2.6, 0.9); top.target.position.set(0, 0.45, 0); scene.add(top, top.target);   // the case light above
    const key = new THREE.DirectionalLight('#ffffff', 1.3); key.position.set(0.8, 1.6, 2.4); scene.add(key);
    const rimL = new THREE.DirectionalLight(accent, 2.0); rimL.position.set(-1.6, 1.4, -1.8); scene.add(rimL);
    const rimR = new THREE.DirectionalLight('#dff4ff', 1.2); rimR.position.set(1.7, 1.2, -1.4); scene.add(rimR);
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTexture(accent), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, opacity: 0.85 }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.003; pad.renderOrder = 1; scene.add(pad);
    // a soft shadow on the case floor under the feet, so the suit stands on it instead of hovering
    if (!S.shadeTex) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 2, 64, 64, 62); g.addColorStop(0, 'rgba(0,0,0,.9)'); g.addColorStop(0.55, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); S.shadeTex = new THREE.CanvasTexture(c); }
    const shade = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: S.shadeTex, transparent: true, depthWrite: false, opacity: 0.7, toneMapped: false }));
    shade.rotation.x = -Math.PI / 2; shade.position.y = 0.002; shade.renderOrder = 0; scene.add(shade);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glassTexture(), transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    glass.renderOrder = 10; scene.add(glass);
    const pivot = new THREE.Group(); scene.add(pivot);
    const scan = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    scan.renderOrder = 8; scan.visible = false; scene.add(scan);
    const bay = { scan, shade, id, scene, camera, pivot, pad, glass, top, ready: false, t: Math.random() * 10, hover: 0, width: 0.5, depth: 0.3, spinA: 0, holding: false, up: null, level: 0.5, lvl: 0.5, reactor: null };
    new GLTFLoader().setMeshoptDecoder(Meshopt).load(url, g => {
      const o = g.scene; o.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(o, true), size = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
      const s = 1 / (size.y || 1); o.scale.setScalar(s); o.position.set(-c.x * s, -b.min.y * s, -c.z * s);
      o.traverse(m => { if (m.isMesh && m.material) { for (const mt of [].concat(m.material)) { mt.envMapIntensity = 1.1; if (mt.roughness !== undefined) mt.roughness = Math.max(0.24, mt.roughness); mt.needsUpdate = true; } } });
      pivot.add(o); bay.width = size.x * s; bay.depth = size.z * s; bay.ready = true;
      // the arc reactor: find the front of the chest and light it
      if (S.stage?.reactor !== false) try {   // only suits with an arc reactor (not the Batcave)
        pivot.updateMatrixWorld(true);
        const ry = S.stage?.bays?.[id]?.reactor || 0.73;
        const hit = new THREE.Raycaster(new THREE.Vector3(0, ry, 5), new THREE.Vector3(0, 0, -1)).intersectObject(o, true)[0];
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: reactorTexture(), color: '#bff3ff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
        sp.position.set(0, ry, (hit ? hit.point.z : bay.depth * 0.5) + 0.012); sp.renderOrder = 5; pivot.add(sp); bay.reactor = sp;
      } catch (e) { console.warn('[suits] reactor', e); }
    }, undefined, e => console.warn('[suits]', url, e?.message || e));
    return bay;
  }

  // free a case's model from the graphics chip (the shared glass, glow, shadow and lighting are kept)
  function disposeBay(b) {
    const shared = new Set([S.glassTex, S.reactorTex, S.shadeTex, S.env, ...Object.values(S.glowTex || {})]);
    b.scene.traverse(o => {
      o.geometry?.dispose?.();
      for (const m of [].concat(o.material || [])) { for (const k in m) { const v = m[k]; if (v && v.isTexture && !shared.has(v)) v.dispose(); } m.dispose?.(); }
    });
  }
  async function sync() {
    const back = document.querySelector('.hall-backdrop'), hs = document.querySelector('.hall-hotspots');
    if (!back || !hs) return stop();
    const theme = hall();
    if (theme !== S.theme || !S.list) {
      // a quick hall switch can have two of these loading at once: only the newest one is kept
      const gen = S.gen = (S.gen || 0) + 1;
      S.theme = theme; S.list = null; S.stage = null;
      let list = {}; try { list = await J.call('suit-models', { theme }); } catch {}
      if (gen !== S.gen) return;
      const stage = Object.keys(list || {}).length ? await stageFor(theme) : null;
      if (gen !== S.gen) return;
      for (const b of S.bays.values()) disposeBay(b); S.bays.clear(); cleanKey = '';
      S.list = list || {}; S.stage = stage;
    }
    const want = Object.keys(S.list || {});
    if (!want.length) return stop();
    await libs();
    if (!S.renderer) {
      S.canvas = document.createElement('canvas'); S.canvas.className = 'sx-layer';
      S.renderer = new THREE.WebGLRenderer({ canvas: S.canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
      S.renderer.outputColorSpace = THREE.SRGBColorSpace; S.renderer.toneMapping = THREE.ACESFilmicToneMapping; S.renderer.toneMappingExposure = 1.12;
      S.renderer.setScissorTest(true);
      const pm = new THREE.PMREMGenerator(S.renderer); S.env = pm.fromScene(new RoomEnv(), 0.04).texture; pm.dispose(); S.renderer.setClearColor(0x000000, 0);
      S.clean = document.createElement('div'); S.clean.className = 'sx-clean';
    }
    // behind the hologram in the middle of the hall and the buttons, in front of the hall picture: inside the picture's own layer
    if (S.clean.parentElement !== back) back.append(S.clean);
    if (S.canvas.parentElement !== back) back.append(S.canvas);
    for (const id of want) if (!S.bays.has(id)) S.bays.set(id, makeBay(id, S.list[id], S.stage?.padColor || ACCENT[theme] || '#7fd6e8'));
    for (const id of [...S.bays.keys()]) if (!want.includes(id)) { disposeBay(S.bays.get(id)); S.bays.delete(id); }
    document.body.classList.add('sx-on');
    if (!S.raf) { S.last = performance.now(); S.raf = requestAnimationFrame(frame); }
  }
  function stop() { if (S.raf) cancelAnimationFrame(S.raf); S.raf = 0; S.canvas?.remove(); S.clean?.remove(); document.body.classList.remove('sx-on'); }

  // the hall picture fills its box like CSS "cover", centred: this turns picture pixels into box pixels
  function mapper(back) {
    const st = S.stage, W = back.offsetWidth, H = back.offsetHeight; if (!st || !W || !H) return null;
    const s = Math.max(W / st.w, H / st.h), ox = (W - st.w * s) / 2, oy = (H - st.h * s) / 2;
    return { s, f: (x, y) => [ox + x * s, oy + y * s] };
  }
  // the empty-case picture only shows where a 3D suit stands, and only if the hall is using its own picture
  let cleanKey = '';
  function placeClean(back, M) {
    const bg = getComputedStyle(back).backgroundImage || '';
    const ok = !!(S.stage && M && bg.includes(S.stage.base));
    if (!ok) { if (cleanKey !== 'off') { S.clean.style.display = 'none'; cleanKey = 'off'; } return false; }
    const ids = [...S.bays.values()].filter(b => b.ready && S.stage.bays[b.id]).map(b => b.id);
    const key = [back.offsetWidth, back.offsetHeight, ids.join(',')].join('|'); if (key === cleanKey) return true; cleanKey = key;
    const path = ids.map(id => { const g = S.stage.bays[id], pad = 18; const [a, b] = M.f(g.x0 - pad, g.y0 - pad), [c, d] = M.f(g.x1 + pad, Math.max(g.y1, g.foot) + pad); return `M${a.toFixed(1)} ${b.toFixed(1)}H${c.toFixed(1)}V${d.toFixed(1)}H${a.toFixed(1)}Z`; }).join('');
    Object.assign(S.clean.style, { display: path ? '' : 'none', backgroundImage: `url("${S.stage.empty}")`, clipPath: path ? `path('${path}')` : '' });
    return true;
  }

  function frame(now) {
    S.raf = requestAnimationFrame(frame);
    if (document.hidden || now - S.last < 32) return;   // about 30 frames a second is plenty for a slow turn
    const dt = Math.min(0.1, (now - S.last) / 1000); S.last = now;
    const back = S.canvas?.parentElement; if (!back) return;
    const inHall = !document.querySelector('.workstation:not(.hidden)') && !document.body.classList.contains('globe-open') && !document.body.classList.contains('ideas-open');
    S.canvas.style.visibility = inHall ? '' : 'hidden'; if (!inHall) return;
    const W = back.offsetWidth, Hh = back.offsetHeight; if (!W || !Hh) return;
    // sharper while the hall is zoomed in on a case
    const zs = S.zoomScale || 1, pr = Math.min(2, (devicePixelRatio || 1) * Math.max(1, zs * 0.75)); const r = S.renderer;
    if (S.sizeKey !== `${W}x${Hh}@${pr}`) { S.sizeKey = `${W}x${Hh}@${pr}`; r.setPixelRatio(pr); r.setSize(W, Hh, false); }
    r.setScissor(0, 0, W, Hh); r.setViewport(0, 0, W, Hh); r.clear();
    const M = mapper(back); const staged = placeClean(back, M);
    const hovered = S.spin?.bay?.id || (S.show && performance.now() < S.show.until ? S.show.id : null) || document.querySelector('.hotspot:hover, .hotspot.hover, .hotspot.active')?.dataset?.suit;
    for (const bay of S.bays.values()) {
      if (!bay.ready) continue;
      const g = staged ? S.stage.bays[bay.id] : null;
      let x, y, w, h, footPx;
      if (g) {
        const [a, b] = M.f(g.x0, g.y0), [c, d] = M.f(g.x1, g.y1); x = a; y = b; w = c - a; h = d - b; footPx = M.f(0, g.foot)[1] - b;
        // keep the head clear of the name plate: the suit fills the space between the plate and the case floor
        if (!bay.up && (S.zoomScale || 1) < 1.05) {
          if (!bay.plateAt || now - bay.plateAt > 600) { bay.plateAt = now; bay.plateY = null; const pl = document.querySelector(`.bay-label[data-suit="${CSS.escape(bay.id)}"]`); if (pl && pl.offsetParent !== null) { const br = back.getBoundingClientRect(), lr = pl.getBoundingClientRect(), k = br.height / Hh || 1; if (lr.left < (br.left + (x + w) * k) && lr.right > (br.left + x * k)) bay.plateY = (lr.bottom - br.top) / k + 6; } }
          const py = bay.plateY; if (py && py > y && py < y + footPx * 0.45) { const dd = py - y; y += dd; h -= dd; footPx -= dd; }
        }
      } else {
        // no empty-case picture for this hall (or a picture of your own): use the button's box, as before
        const el = document.querySelector(`.hotspot[data-suit="${CSS.escape(bay.id)}"]`); if (!el) continue;
        x = el.offsetLeft + el.offsetWidth * 0.12; w = el.offsetWidth * 0.76; y = el.offsetTop + el.offsetHeight * 0.19; h = el.offsetHeight * 0.71; footPx = h * 0.97;
      }
      if (w < 8 || h < 8) continue;
      bay.t += dt; bay.hover += ((hovered === bay.id ? 1 : 0) - bay.hover) * Math.min(1, dt * 5);
      const o = g || {};   // per-case settings: face = stands facing you, fill/widthFit = how much of the case it fills, spill = may reach past the glass edge
      // suit-up: the glass slides away, the case light flares, the suit turns to you and steps out
      const upK = bay.up ? (now - bay.up.t0) / 1000 : 0, gs = bay.up ? ease((upK - 0.1) / 0.8) : 0, st = bay.up ? ease((upK - 0.45) / 1.1) : 0;
      const face = Math.max(bay.hover, st);
      if (!bay.holding) bay.spinA *= Math.exp(-dt * 2.4);   // let go and it turns back
      const sway = o.face ? Math.sin(bay.t * 0.3) * 0.04 : Math.sin(bay.t * 0.32) * 0.38 * Math.min(1, 0.42 / Math.max(bay.width, bay.depth, 0.3));   // wide suits turn less, so they stay inside the glass
      bay.pivot.rotation.y = sway * (1 - face) + bay.spinA;   // turns slowly; faces you when you point at it
      // size: tall enough to fill the case, narrow enough to fit its width (even while turning, unless it faces you)
      const reach = o.face ? Math.max(bay.width, 0.3) : Math.max(bay.width, bay.depth * 0.75, 0.3);
      const suitPx = Math.min(footPx * (o.fill || 0.9), (w * (o.widthFit || 0.9)) / reach) * (1 + bay.hover * 0.03);
      const spill = (o.spill || 0) + st * 0.2 + (Math.abs(bay.spinA) > 0.05 ? 0.08 : 0), gw = w; if (spill) { x -= w * spill; w *= 1 + 2 * spill; }
      { const lift = st * 0.16 * h; if (lift) { y -= lift; h += lift; footPx += lift; } }   // room above the case for the suit stepping out
      bay.pivot.position.z = st * 0.42; bay.pivot.scale.setScalar(1 + st * 0.05);
      // a scan line runs up the suit as it powers on
      const sk = bay.up ? clamp((upK - 0.35) / 1.2, 0, 1) : 0; bay.scan.visible = sk > 0 && sk < 1;
      if (bay.scan.visible) { bay.scan.position.set(0, sk * 1.02, bay.depth * 0.5 + 0.5 * st + 0.04); bay.scan.scale.set(Math.max(bay.width, 0.4) * 1.3, 0.012, 1); bay.scan.material.opacity = 0.9 * Math.sin(sk * Math.PI); }
      bay.top.intensity = 26 * (1 + 1.4 * Math.max(0, Math.sin(clamp((upK - 0.05) / 0.9, 0, 1) * Math.PI)) + st * 0.3);
      const cam = bay.camera; cam.aspect = w / h;
      const Hw = h / suitPx, tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), dist = Hw / (2 * tan);
      const yTop = footPx / suitPx, cy = yTop - Hw / 2;
      cam.position.set(0, cy, dist); cam.lookAt(0, cy, 0); cam.updateProjectionMatrix();
      // the glass sits just in front of the suit and fills the case; the pad glows under its feet
      const gd = 0.55, gh = 2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * (dist - gd);
      bay.glass.position.set(gs * gh * cam.aspect * 1.08, cy, gd); bay.glass.scale.set(gh * cam.aspect * gw / w, gh, 1); bay.glass.visible = !!g && gs < 0.99; bay.glass.material.opacity = 1 - gs * 0.5;
      const pw = Math.min(reach * 1.5, Hw * cam.aspect * 0.95); bay.pad.scale.set(pw, pw * 0.55, 1);
      bay.shade.scale.set(Math.max(bay.width, 0.3) * 1.25, Math.max(bay.depth, 0.2) * 1.6, 1);
      bay.pad.material.opacity = (0.55 + 0.2 * Math.sin(bay.t * 1.6)) * (bay.reactor ? 1 : 0.55 + 0.6 * bay.lvl) + bay.hover * 0.25 + st * 0.3;   // no reactor: the case floor shows how busy the suit is
      // the arc reactor: bright and pulsing while the suit is busy, dim when it has not been used for days
      bay.lvl += (bay.level - bay.lvl) * Math.min(1, dt * 1.5);
      if (bay.reactor) { const busy = bay.busy ? 0.18 * (0.5 + 0.5 * Math.sin(bay.t * 3.2)) : 0.05 * Math.sin(bay.t * 1.3); const L = clamp(bay.lvl + busy + st * 0.7 + bay.hover * 0.15, 0.08, 1.8);
        bay.reactor.material.opacity = clamp(0.15 + L * 0.85, 0, 1); const sz = 0.035 + L * 0.055; bay.reactor.scale.set(sz, sz, 1); }
      r.setViewport(x, Hh - y - h, w, h); r.setScissor(x, Hh - y - h, w, h);
      r.render(bay.scene, cam);
    }
  }
  /* ---------- grab and spin: pinch (or hold the mouse) on a suit and move sideways; let go and it turns back */
  addEventListener('pointerdown', e => {
    const h = e.target?.closest?.('.hotspot[data-suit]'); const bay = h && S.bays.get(h.dataset.suit);
    if (!bay || !bay.ready || !['ARMOR_HALL', 'SUIT_HOVER'].includes(S.snap?.state || 'ARMOR_HALL')) return;
    S.spin = { bay, lastX: e.clientX, total: 0 }; bay.holding = true;
  }, true);
  addEventListener('pointermove', e => {
    const sp = S.spin; if (!sp) return;
    if (!(e.buttons & 1)) { sp.bay.holding = false; S.spin = null; return; }
    const d = e.clientX - sp.lastX; sp.lastX = e.clientX;
    if (Math.abs(d) < 90) { sp.bay.spinA += d * 0.013; sp.total += Math.abs(d); }   // a jump (the hand ring letting go of its lock) doesn't whip it round
  }, true);
  const endSpin = () => { const sp = S.spin; if (!sp) return; sp.bay.holding = false; S.spinEnd = { total: sp.total, at: performance.now() }; S.spin = null; };
  addEventListener('pointerup', endSpin, true); addEventListener('pointercancel', endSpin, true);
  // a spin isn't a click: don't open the suit after one
  addEventListener('click', e => { const se = S.spinEnd; if (se && performance.now() - se.at < 500 && se.total > 24 && e.target?.closest?.('.hotspot[data-suit]')) { e.stopImmediatePropagation(); e.preventDefault(); S.spinEnd = null; } }, true);

  /* ---------- how busy each suit is, for its arc reactor */
  async function activity() {
    if (!S.bays.size || document.hidden) return;
    let a = {}; try { a = await J.call('suit-activity', { theme: S.theme || hall() }) || {}; } catch { return; }
    const now = Date.now();
    for (const bay of S.bays.values()) {
      const v = a[bay.id] || {}; const ago = v.last ? (now - v.last) / 3600000 : null;
      bay.busy = v.status === 'running' || !!v.open;
      bay.level = bay.busy ? 1 : v.status === 'blocked' ? 0.85 : ago === null ? 0.4 : ago < 24 ? 0.8 : ago < 72 ? 0.55 : 0.25;
    }
  }
  setInterval(activity, 15000); setTimeout(activity, 4000);

  /* ---------- flying in: the suit-up zoom, and "show me Mark 39" */
  function caseRect(id) {
    const back = document.querySelector('.hall-backdrop'); const M = back && mapper(back); const g = S.stage?.bays?.[id];
    if (!M || !g || cleanKey === 'off' || !cleanKey) return null;
    const [a, b] = M.f(g.x0, g.y0), [c, d] = M.f(g.x1, g.y1); return { x: a, y: b, w: c - a, h: d - b, W: back.offsetWidth, H: back.offsetHeight };
  }
  function zoomTo(id, fill, max = 3.2, fly = false) {
    const r = caseRect(id), root = document.querySelector('.image-hall'); if (!r || !root) return false;
    const o = clamp(r.H * fill / r.h, 1.3, max), cx = r.x + r.w / 2, cy = r.y + r.h * 0.47;
    if (fly) { flyTo((r.W / 2 - cx) * o, (r.H / 2 - cy) * o, o); return true; }
    root.style.setProperty('--zoom-x', `${(r.W / 2 - cx) * o}px`); root.style.setProperty('--zoom-y', `${(r.H / 2 - cy) * o}px`); root.style.setProperty('--zoom-scale', o);
    S.zoomScale = o; return true;
  }
  // "show me": the fly-in is animated here (own variables, so the hall's own zoom and breathing can't fight it)
  const F = { x: 0, y: 0, s: 1, tx: 0, ty: 0, ts: 1, raf: 0 };
  function flyTo(x, y, sc) {
    const root = document.querySelector('.image-hall'); if (!root) return;
    F.tx = x; F.ty = y; F.ts = sc; root.classList.add('sx-fly');
    if (F.raf) return; let last = performance.now();
    const step = now => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now; const k = 1 - Math.exp(-dt * 2.6);
      F.x += (F.tx - F.x) * k; F.y += (F.ty - F.y) * k; F.s += (F.ts - F.s) * k;
      root.style.setProperty('--fly-x', F.x.toFixed(1) + 'px'); root.style.setProperty('--fly-y', F.y.toFixed(1) + 'px'); root.style.setProperty('--fly-s', F.s.toFixed(4));
      S.zoomScale = F.s;
      if (Math.abs(F.ts - F.s) < 0.002 && Math.abs(F.tx - F.x) < 0.5 && Math.abs(F.ty - F.y) < 0.5) { F.raf = 0; if (F.ts === 1) root.classList.remove('sx-fly'); return; }
      F.raf = requestAnimationFrame(step);
    };
    F.raf = requestAnimationFrame(step);
  }
  function zoomReset() { flyTo(0, 0, 1); }
  function zoomResetVars() { const root = document.querySelector('.image-hall'); if (!root) return; root.style.setProperty('--zoom-x', '0px'); root.style.setProperty('--zoom-y', '0px'); root.style.setProperty('--zoom-scale', 1); S.zoomScale = 1; }
  function applyZoom() {
    const s = S.snap || {}, root = document.querySelector('.image-hall');
    const sel = s.selected && S.bays.get(s.selected)?.ready ? s.selected : null;
    root?.classList.toggle('sx-noeyes', !!sel && ['SUIT_SELECTED', 'MODULE'].includes(s.state));
    if (sel && ['SUIT_SELECTED', 'MODULE'].includes(s.state)) { zoomTo(sel, 0.9); return; }
    if (S.show && performance.now() < S.show.until && ['ARMOR_HALL', 'SUIT_HOVER'].includes(s.state)) { if (zoomTo(S.show.id, 0.6, 2.4, true)) return; }
    if (!['ARMOR_HALL', 'SUIT_HOVER'].includes(s.state) && root?.classList.contains('sx-fly')) { cancelAnimationFrame(F.raf); F.raf = 0; F.x = F.y = 0; F.s = 1; root.classList.remove('sx-fly'); }
    S.zoomScale = 1;   // the hall has set its own zoom (none) with this change
  }
  try {
    J.on('snapshot', s => {
      if (!s) return; const was = S.snap?.state; S.snap = s;
      if (s.state === 'SUIT_SELECTED' && was !== 'SUIT_SELECTED') { const b = S.bays.get(s.selected); if (b?.ready) b.up = { t0: performance.now() }; S.show = null; }
      if (!['SUIT_SELECTED', 'MODULE'].includes(s.state)) for (const b of S.bays.values()) b.up = null;
      setTimeout(applyZoom, 40);
    });
    J.on('suit-show', m => {
      if (!m?.id || !S.bays.get(m.id)?.ready) return;
      const dur = S.showMs || 7000; S.show = { id: m.id, until: performance.now() + dur }; setTimeout(applyZoom, 60);
      clearTimeout(S.showTimer); S.showTimer = setTimeout(() => { if (!S.show) return; S.show = null; if (['ARMOR_HALL', 'SUIT_HOVER'].includes(S.snap?.state)) { zoomReset(); J.call('action', { action: 'hover', id: null }).catch(() => {}); } }, dur);
    });
  } catch {}
  window.addEventListener('resize', () => setTimeout(applyZoom, 60));

  // the hall is re-drawn when you change hall or come back from a suit
  setInterval(() => { if (document.querySelector('.hall-backdrop')) sync().catch(e => console.warn('[suits]', e)); else stop(); }, 1500);
  new MutationObserver(() => { if (S.theme && S.theme !== hall()) { S.list = null; cleanKey = ''; sync().catch(() => {}); } }).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  window.__jarvisSuits = S;
}
