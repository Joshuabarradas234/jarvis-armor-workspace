/*
 * JARVIS v9.11 — the earth.
 * "Jarvis, show me the earth": a holographic globe you can spin with your hand or the mouse, with satellite and
 * night views. "Jarvis, show me a map of New York": the globe turns to the place, dives in, and a live street
 * (or satellite) map takes over, with the local time, the weather and the coordinates on the HUD.
 *
 * Globe pictures: NASA Blue Marble / Black Marble (public domain). Borders: Natural Earth via world-atlas.
 * Street maps: © OpenStreetMap contributors © CARTO. Satellite close-ups: Sentinel-2 cloudless by EOX.
 */
const J = window.jarvis;
const VIEW = new URLSearchParams(location.search).get('view') || 'main';
const call = (m, p) => J.call(m, p);
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DEG = Math.PI / 180;
const hall = () => document.body.dataset.theme || 'ironman';

/* colours for the hologram, per hall */
const PALETTE = {
  ironman: { ocean: '#0b3f95', ocean2: '#05214f', land: '#7fd0ff', land2: '#3f9fe6', border: '#e3f7ff', rim: '#5fd9ff', ui: '#7fd6e8', tint: 'sepia(1) hue-rotate(168deg) saturate(3.4) brightness(1.08) contrast(1.05)' },
  batcave: { ocean: '#1a1f2b', ocean2: '#0a0c12', land: '#f5c542', land2: '#b8891c', border: '#fff1c4', rim: '#f5c542', ui: '#f5c542', tint: 'sepia(1) hue-rotate(6deg) saturate(2.2) brightness(1.05) contrast(1.05)' },
  spiderman: { ocean: '#2a0a12', ocean2: '#12040a', land: '#ff6b6b', land2: '#c92a3a', border: '#ffe0e0', rim: '#ff4d4d', ui: '#ff4d4d', tint: 'sepia(1) hue-rotate(-28deg) saturate(3) brightness(1.02) contrast(1.05)' },
};
const pal = () => PALETTE[hall()] || PALETTE.ironman;

const ALIASES = {
  nyc: 'new york', 'new york city': 'new york', 'the big apple': 'new york', manhattan: 'new york', 'la': 'los angeles', sf: 'san francisco',
  'the uk': 'united kingdom', uk: 'united kingdom', britain: 'united kingdom', 'great britain': 'united kingdom', england: 'england',
  'the us': 'united states of america', us: 'united states of america', usa: 'united states of america', america: 'united states of america', 'the states': 'united states of america', 'united states': 'united states of america',
  'the uae': 'united arab emirates', uae: 'united arab emirates', 'south korea': 'south korea', holland: 'netherlands', 'the netherlands': 'netherlands',
  jozi: 'johannesburg', joburg: 'johannesburg', 'cape town': 'cape town', 'washington dc': 'washington, d.c.', 'washington d c': 'washington, d.c.', dc: 'washington, d.c.',
};
/* a few places people ask for that are not a city or a country */
const EXTRA = {
  england: { name: 'England', lat: 52.6, lon: -1.6, bbox: [-5.8, 49.9, 1.8, 55.8], kind: 'country' },
  scotland: { name: 'Scotland', lat: 56.8, lon: -4.2, bbox: [-7.7, 54.6, -0.7, 58.7], kind: 'country' },
  wales: { name: 'Wales', lat: 52.3, lon: -3.7, bbox: [-5.3, 51.3, -2.6, 53.5], kind: 'country' },
  europe: { name: 'Europe', lat: 50, lon: 12, bbox: [-12, 35, 40, 70], kind: 'region' },
  africa: { name: 'Africa', lat: 2, lon: 20, bbox: [-18, -35, 52, 37], kind: 'region' },
  asia: { name: 'Asia', lat: 34, lon: 95, bbox: [60, -10, 150, 60], kind: 'region' },
  'north america': { name: 'North America', lat: 45, lon: -100, bbox: [-130, 15, -60, 70], kind: 'region' },
  'south america': { name: 'South America', lat: -15, lon: -60, bbox: [-82, -56, -34, 13], kind: 'region' },
  australia: null, // a country, found in the borders data
  'the moon': null,
};

const G = {
  isOpen: false, el: null, three: null, ready: null, style: 'holo', spin: true, mode: 'globe',
  places: null, countries: null, target: null, home: { name: 'Leeds', lat: 53.8008, lon: -1.5491 },
  yaw: 0, pitch: 0.35, dist: 3.4, want: null, vel: { x: 0, y: 0 }, lastT: 0, raf: 0,
  // a linear zoom, so a two-hand pinch can scale it: the map's zoom levels are powers of two
  get zoom() { return this.mode === 'map' && this.map ? Math.pow(2, this.map.getZoom()) : 3.4 / this.dist; },
  setZoom(z) { this.touched = performance.now(); if (this.mode === 'map' && this.map) this.map.setZoom(clamp(Math.log2(Math.max(1, z)), 2, 18), { animate: false }); else { this.want = null; this.dist = clamp(3.4 / z, 1.22, 7); } },
};
window.__jarvisGlobe = G;

/* ------------------------------------------------------------------ data */
function loadScript(src, test) {
  return new Promise((res, rej) => { if (test()) return res(); const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => rej(Error('Could not load ' + src)); document.head.appendChild(s); });
}
async function loadData() {
  if (G.places && G.countries) return;
  const [places, topo] = await Promise.all([fetch('jarvis://asset/geo/places.json').then(r => r.json()), fetch('jarvis://asset/geo/countries-50m.json').then(r => r.json()), loadScript('./vendor/geo/topojson-client.min.js', () => !!window.topojson)]);
  G.places = places;   // [name, ascii, alt, admin1, country, iso2, lat, lon, pop, capital]
  G.topo = topo;
  const fc = window.topojson.feature(topo, topo.objects.countries);
  G.countries = fc.features.map(f => ({ name: f.properties.name, geometry: f.geometry, bbox: bboxOf(f.geometry) }));
}
function bboxOf(g) {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  // the largest piece decides the box, so France is France and not its islands
  let best = null, area = -1;
  for (const p of polys) { const r = p[0]; let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); a = Math.abs(a); if (a > area) { area = a; best = r; } }
  for (const [x, y] of best || []) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, '').replace(/[^a-z0-9, ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Find a place by name: countries and 7,000 cities are on board; anything else is looked up online. */
async function findPlace(query) {
  await loadData();
  let q = norm(query).replace(/^(?:the city of|city of|downtown|central)\s+/, '').replace(/\s+(?:city centre|city center|centre|center)$/, '');
  let near = '';
  const comma = q.split(',').map(s => s.trim()).filter(Boolean); if (comma.length > 1) { q = comma[0]; near = comma.slice(1).join(' '); }
  q = ALIASES[q] || q;
  if (EXTRA[q]) return { ...EXTRA[q], q: query };
  const bare = q.replace(/^the /, '');
  const c = G.countries.find(k => norm(k.name) === bare) || G.countries.find(k => norm(k.name).replace(/^the /, '') === bare);
  if (c) { const [x0, y0, x1, y1] = c.bbox; return { name: c.name, lat: (y0 + y1) / 2, lon: (x0 + x1) / 2, bbox: c.bbox, kind: 'country', q: query }; }
  const match = r => { const n = norm(r[0]), a = norm(r[1]), alts = String(r[2] || '').split('|').map(norm); return n === bare || a === bare || alts.includes(bare); };
  let hits = G.places.filter(match);
  if (near) { const nn = norm(near); const f = hits.filter(r => norm(r[3]).includes(nn) || norm(r[4]).includes(nn) || norm(r[5]) === nn); if (f.length) hits = f; }
  if (hits.length) { const r = hits[0]; return placeFrom(r, query); }
  // not a city we carry: ask the map service
  try {
    const r = await call('geo-search', { q: query });
    if (r && Number.isFinite(r.lat)) return { name: r.name || query, detail: r.detail || '', lat: r.lat, lon: r.lon, bbox: r.bbox || null, kind: r.kind || 'place', q: query };
  } catch {}
  // last try: a city whose name starts with what was said
  const pre = G.places.find(r => norm(r[0]).startsWith(bare) && r[8] > 100000);
  return pre ? placeFrom(pre, query) : null;
}
const placeFrom = (r, q) => ({ name: r[0], detail: [r[3] !== r[0] ? r[3] : '', r[4]].filter(Boolean).join(', '), country: r[4], lat: r[6], lon: r[7], pop: r[8], kind: 'city', q });

/* ------------------------------------------------------------------ the overlay */
const ICON = {
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>', minus: '<svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
  home: '<svg viewBox="0 0 24 24"><path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/></svg>', spin: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>', search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>',
};
function build() {
  const el = document.createElement('div'); el.className = 'gx'; el.hidden = true;
  el.innerHTML = `
    <div class="gx-grid"></div>
    <div class="gx-stage"></div>
    <div class="gx-map" hidden></div>
    <div class="gx-reticle" hidden><i></i><b></b></div>
    <div class="gx-labels"></div>
    <section class="gx-hud gx-tl"><header><b class="gx-time">--:--</b><em class="gx-utc">UTC</em></header><small class="gx-date"></small><small class="gx-coord">＋0.0000, ＋0.0000</small><small class="gx-alt">↥ 12 742 km</small></section>
    <section class="gx-hud gx-tr"><b class="gx-place">Earth</b><small class="gx-detail">Hold a hand up and pinch to spin</small><div class="gx-wx"></div></section>
    <nav class="gx-rail">
      <button type="button" data-gx="in" title="Zoom in">${ICON.plus}</button><button type="button" data-gx="out" title="Zoom out">${ICON.minus}</button>
      <i></i>
      <button type="button" data-gx="holo" class="gx-t" title="Hologram">HOLO</button><button type="button" data-gx="satellite" class="gx-t" title="Satellite">SAT</button><button type="button" data-gx="night" class="gx-t" title="Night lights">NIGHT</button>
      <i></i>
      <button type="button" data-gx="spin" class="on" title="Spin on its own">${ICON.spin}</button><button type="button" data-gx="earth" title="Back to the whole earth">${ICON.globe}</button><button type="button" data-gx="home" title="Home">${ICON.home}</button>
      <i></i>
      <button type="button" data-gx="close" title="Close (Esc)">${ICON.close}</button>
    </nav>
    <form class="gx-search">${ICON.search}<input type="text" maxlength="120" placeholder="Search a place…  or say “Jarvis, show me a map of London”" spellcheck="false"></form>
    <p class="gx-hint">Drag or pinch-and-move to spin · scroll or two-hand pinch to zoom · double-click to dive in</p>
    <p class="gx-attrib"></p>`;
  document.body.appendChild(el); G.el = el;
  el.addEventListener('click', e => { const b = e.target.closest('[data-gx]'); if (!b) return; e.stopPropagation(); G.button(b.dataset.gx); });
  el.querySelector('.gx-search').addEventListener('submit', e => { e.preventDefault(); const i = e.target.querySelector('input'); const v = i.value.trim(); if (v) { G.go(v); i.blur(); } });
  el.querySelector('.gx-search input').addEventListener('keydown', e => e.stopPropagation());
  addEventListener('keydown', e => { if (G.isOpen && e.key === 'Escape') G.close(); });
  return el;
}

/* ------------------------------------------------------------------ the globe (three.js) */
async function makeGlobe() {
  const THREE = await import('../vendor/three/three.module.min.js');
  await loadData();
  const stage = G.el.querySelector('.gx-stage');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, Math.max(1, devicePixelRatio || 1))); renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  const world = new THREE.Group(); scene.add(world);
  const P = pal();

  // land, borders and a lat/long grid painted once into a picture that wraps the sphere
  const W = 4096, Hh = 2048; const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const cx = cv.getContext('2d');
  cx.fillStyle = '#000'; cx.fillRect(0, 0, W, Hh);
  const X = lon => (lon + 180) / 360 * W, Y = lat => (90 - lat) / 180 * Hh;
  const ringPath = ring => {
    // keep a ring continuous across the date line, then draw it again one world over if it spills off the edge
    let prev = null, off = 0; const pts = [];
    for (const [lon, lat] of ring) { let l = lon + off; if (prev !== null && l - prev > 180) { off -= 360; l -= 360; } else if (prev !== null && l - prev < -180) { off += 360; l += 360; } prev = l; pts.push([l, lat]); }
    return pts;
  };
  const drawShape = (geom, mode) => {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
    for (const shift of [0, -360, 360]) {
      cx.beginPath();
      for (const poly of polys) for (const ring of poly) { const pts = ringPath(ring); pts.forEach(([l, a], i) => { const x = X(l + shift), y = Y(a); if (i) cx.lineTo(x, y); else cx.moveTo(x, y); }); cx.closePath(); }
      if (mode === 'fill') cx.fill('evenodd'); else cx.stroke();
    }
  };
  cx.fillStyle = 'rgb(255,0,0)'; for (const c of G.countries) drawShape(c.geometry, 'fill');
  cx.globalCompositeOperation = 'lighter'; cx.strokeStyle = 'rgb(0,200,0)'; cx.lineWidth = 2.2; cx.lineJoin = 'round';
  for (const c of G.countries) drawShape(c.geometry, 'stroke');
  cx.strokeStyle = 'rgb(0,0,150)'; cx.lineWidth = 1.2;
  for (let lon = -180; lon <= 180; lon += 15) { cx.beginPath(); cx.moveTo(X(lon), 0); cx.lineTo(X(lon), Hh); cx.stroke(); }
  for (let lat = -75; lat <= 75; lat += 15) { cx.beginPath(); cx.moveTo(0, Y(lat)); cx.lineTo(W, Y(lat)); cx.stroke(); }
  cx.globalCompositeOperation = 'source-over';
  const landTex = new THREE.CanvasTexture(cv); landTex.anisotropy = renderer.capabilities.getMaxAnisotropy(); landTex.colorSpace = THREE.NoColorSpace;

  const U = {
    uMap: { value: landTex }, uTime: { value: 0 },
    uOcean: { value: new THREE.Color(P.ocean) }, uOcean2: { value: new THREE.Color(P.ocean2) }, uLand: { value: new THREE.Color(P.land) }, uLand2: { value: new THREE.Color(P.land2) },
    uBorder: { value: new THREE.Color(P.border) }, uRim: { value: new THREE.Color(P.rim) }, uSun: { value: new THREE.Vector3(-0.6, 0.5, 0.8).normalize() },
  };
  const holoMat = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){ vUv=uv; vN=normalize(normalMatrix*normal); vW=normalize((modelMatrix*vec4(position,0.)).xyz); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D uMap; uniform vec3 uOcean,uOcean2,uLand,uLand2,uBorder,uRim,uSun; uniform float uTime;
      varying vec2 vUv; varying vec3 vN; varying vec3 vW;
      void main(){
        vec4 t=texture2D(uMap,vUv); float land=t.r, border=t.g, grid=t.b;
        float lat=(vUv.y-.5)*3.14159;
        vec3 ocean=mix(uOcean2,uOcean,.55+.45*cos(lat*1.3));
        vec3 col=mix(ocean,mix(uLand2,uLand,.55+.45*land),land);
        col=mix(col,uBorder,border*.75);
        col+=uRim*grid*.16*(1.-land);
        float ndl=dot(normalize(vW),normalize(uSun));
        col*=.6+.55*clamp(ndl*.5+.5,0.,1.);
        float fr=pow(1.-max(dot(normalize(vN),vec3(0.,0.,1.)),0.),2.4);
        col=mix(col,uRim,fr*.7);
        col+=uRim*.03*sin(vUv.y*1400.+uTime*2.2);
        gl_FragColor=vec4(col,1.);
      }`,
  });
  const loader = new THREE.TextureLoader();
  const tex = {};
  const lazyTex = (k, url) => tex[k] || (tex[k] = loader.load(url, t => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); }));
  const satMat = new THREE.MeshPhongMaterial({ shininess: 14, specular: new THREE.Color('#1c2a38') });
  const nightMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 160, 120), holoMat); world.add(earth);
  scene.add(new THREE.AmbientLight('#b8c8e0', 0.75)); const sun = new THREE.DirectionalLight('#ffffff', 1.9); scene.add(sun);

  // the glow of the atmosphere
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(P.rim) }, uPow: { value: 3.6 } }, side: THREE.BackSide, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    vertexShader: `varying vec3 vN; void main(){ vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uPow; varying vec3 vN; void main(){ float i=pow(clamp(.74-dot(vN,vec3(0.,0.,1.)),0.,1.),uPow)*1.25; gl_FragColor=vec4(uColor*i,i); }`,
  });
  const glow = new THREE.Mesh(new THREE.SphereGeometry(1.16, 96, 64), glowMat); scene.add(glow);

  // stars
  const starPos = new Float32Array(1800 * 3); for (let i = 0; i < 1800; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 20); starPos.set([v.x, v.y, v.z], i * 3); }
  const starGeo = new THREE.BufferGeometry(); starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#cfe8ff', size: 1.3, sizeAttenuation: false, transparent: true, opacity: 0.55, depthWrite: false })); scene.add(stars);

  // orbit rings with a satellite each
  const orbits = [];
  for (const [r, tiltX, tiltZ, speed] of [[1.42, 1.1, 0.35, 0.22], [1.62, 0.5, -0.9, -0.14]]) {
    const pts = new THREE.EllipseCurve(0, 0, r, r).getPoints(256).map(p => new THREE.Vector3(p.x, 0, p.y));
    const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: P.rim, transparent: true, opacity: 0.28 }));
    const holder = new THREE.Group(); holder.rotation.set(tiltX, 0, tiltZ); holder.add(line);
    const sat = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff' })); holder.add(sat);
    scene.add(holder); orbits.push({ holder, sat, r, speed, a: Math.random() * 6 });
  }

  // city lights: the 220 biggest cities as points on the surface
  const big = G.places.slice(0, 220);
  const cityPos = new Float32Array(big.length * 3); big.forEach((r, i) => { const v = ll2v(THREE, r[6], r[7], 1.003); cityPos.set([v.x, v.y, v.z], i * 3); });
  const cityGeo = new THREE.BufferGeometry(); cityGeo.setAttribute('position', new THREE.BufferAttribute(cityPos, 3));
  const cities = new THREE.Points(cityGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 2.6, sizeAttenuation: false, transparent: true, opacity: 0.8, depthWrite: false })); world.add(cities);

  // pins and the arc from home
  const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.9)'); g.addColorStop(0.5, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const pin = (color, size) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dotTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.setScalar(size); return s; };
  const homePin = pin('#ffb347', 0.07); world.add(homePin);
  const tgtPin = pin('#ffffff', 0.09); tgtPin.visible = false; world.add(tgtPin);
  const pulse = new THREE.Mesh(new THREE.RingGeometry(0.02, 0.026, 48), new THREE.MeshBasicMaterial({ color: P.rim, transparent: true, side: THREE.DoubleSide, depthWrite: false })); pulse.visible = false; world.add(pulse);
  let arc = null, comet = pin('#ffffff', 0.05); comet.visible = false; world.add(comet);

  const labels = G.el.querySelector('.gx-labels');
  const three = { THREE, renderer, scene, camera, world, earth, holoMat, satMat, nightMat, U, glow, glowMat, stars, orbits, cities, homePin, tgtPin, pulse, comet, lazyTex, sun, get arc() { return arc; }, set arc(a) { arc = a; } };
  G.three = three;
  placeHome();
  setStyle(G.style);
  hookInput(renderer.domElement);
  return three;
}
function ll2v(THREE, lat, lon, r = 1) { const phi = (90 - lat) * DEG, th = (lon + 180) * DEG; return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th)); }
function v2ll(v) { const n = v.clone().normalize(); const lat = 90 - Math.acos(clamp(n.y, -1, 1)) / DEG; let lon = Math.atan2(n.z, -n.x) / DEG - 180; lon = ((lon + 540) % 360) - 180; return { lat, lon }; }
/** yaw/pitch that bring a place to the middle of the view */
function aimAt(lat, lon) { const t = G.three; const v = ll2v(t.THREE, lat, lon); const az = Math.atan2(v.x, v.z); return { yaw: -az, pitch: lat * DEG }; }
function centreLL() { const t = G.three; const v = new t.THREE.Vector3(0, 0, 1).applyEuler(new t.THREE.Euler(-G.pitch, 0, 0)).applyEuler(new t.THREE.Euler(0, -G.yaw, 0)); return v2ll(v); }

function placeHome() {
  const t = G.three; if (!t) return;
  t.homePin.position.copy(ll2v(t.THREE, G.home.lat, G.home.lon, 1.01));
}
function setTarget(p) {
  const t = G.three; if (!t) return; const THREE = t.THREE;
  G.target = p;
  const at = ll2v(THREE, p.lat, p.lon, 1.012);
  t.tgtPin.position.copy(at); t.tgtPin.visible = true;
  t.pulse.position.copy(ll2v(THREE, p.lat, p.lon, 1.004)); t.pulse.lookAt(at.clone().multiplyScalar(2)); t.pulse.visible = true;
  // a great-circle arc from home, lifted off the surface by how far it goes
  if (t.arc) { t.world.remove(t.arc); t.arc.geometry.dispose(); }
  const a = ll2v(THREE, G.home.lat, G.home.lon), b = ll2v(THREE, p.lat, p.lon); const ang = a.angleTo(b);
  if (ang > 0.02) {
    const pts = []; for (let i = 0; i <= 96; i++) { const f = i / 96; const v = new THREE.Vector3().copy(a).lerp(b, f).normalize(); v.multiplyScalar(1 + Math.sin(f * Math.PI) * (0.06 + ang * 0.16)); pts.push(v); }
    t.arc = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    t.arc.userData.pts = pts; t.world.add(t.arc); t.comet.visible = true;
  } else t.comet.visible = false;
}

function setStyle(s) {
  G.style = ['holo', 'satellite', 'night'].includes(s) ? s : 'holo';
  G.el?.querySelectorAll('.gx-t').forEach(b => b.classList.toggle('on', b.dataset.gx === G.style));
  G.el?.classList.toggle('gx-sat', G.style === 'satellite'); G.el?.classList.toggle('gx-night', G.style === 'night');
  const t = G.three;
  if (t) {
    if (G.style === 'holo') t.earth.material = t.holoMat;
    else if (G.style === 'satellite') { t.satMat.map = t.lazyTex('day', 'jarvis://asset/geo/earth-blue-marble.jpg'); t.satMat.bumpMap = t.lazyTex('bump', 'jarvis://asset/geo/earth-topology.png'); t.satMat.bumpScale = 0.9; t.satMat.needsUpdate = true; t.earth.material = t.satMat; }
    else { t.nightMat.map = t.lazyTex('night', 'jarvis://asset/geo/earth-night.jpg'); t.nightMat.needsUpdate = true; t.earth.material = t.nightMat; }
    t.glowMat.uniforms.uColor.value.set(G.style === 'holo' ? pal().rim : G.style === 'night' ? '#6f8cff' : '#7cc4ff');
    t.cities.visible = G.style !== 'night';
  }
  if (G.map) mapLayers();
}
function recolour() {
  const t = G.three; if (!t) return; const P = pal(), U = t.U;
  U.uOcean.value.set(P.ocean); U.uOcean2.value.set(P.ocean2); U.uLand.value.set(P.land); U.uLand2.value.set(P.land2); U.uBorder.value.set(P.border); U.uRim.value.set(P.rim);
  t.pulse.material.color.set(P.rim); for (const o of t.orbits) o.holder.children[0].material.color.set(P.rim);
  if (G.style === 'holo') t.glowMat.uniforms.uColor.value.set(P.rim);
  G.el.style.setProperty('--gx', P.ui);
  if (G.map && G.style === 'holo') G.el.style.setProperty('--gx-tint', P.tint);
}

/* ------------------------------------------------------------------ drawing, every frame */
function frame(now) {
  if (!G.isOpen) return;
  G.raf = requestAnimationFrame(frame);
  const t = G.three; if (!t || G.mode === 'map') { hudTick(); return; }
  const dt = clamp((now - (G.lastT || now)) / 1000, 0, 0.1); G.lastT = now;
  const { renderer, camera, stage = G.el.querySelector('.gx-stage') } = t;
  const w = stage.clientWidth, h = stage.clientHeight;
  if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio()) || renderer.domElement.height !== Math.floor(h * renderer.getPixelRatio())) { renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
  // flying somewhere
  if (G.want) {
    const f = G.want; f.t = Math.min(1, f.t + dt / f.dur); const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - (-2 * f.t + 2) ** 3 / 2;
    G.yaw = f.y0 + (f.y1 - f.y0) * e; G.pitch = f.p0 + (f.p1 - f.p0) * e;
    const hop = Math.sin(e * Math.PI) * f.lift; G.dist = f.d0 + (f.d1 - f.d0) * e + hop;
    if (f.t >= 1) { G.want = null; f.done?.(); }
  } else if (!G.drag) {
    G.yaw += G.vel.x * dt; G.pitch = clamp(G.pitch + G.vel.y * dt, -1.35, 1.35); G.vel.x *= Math.pow(0.08, dt); G.vel.y *= Math.pow(0.08, dt);
    if (G.spin && Math.abs(G.vel.x) < 0.02 && now - (G.touched || 0) > 4000) G.yaw += dt * 0.06;
  }
  G.distShown = G.distShown ? G.distShown + (G.dist - G.distShown) * (1 - Math.exp(-dt * 7)) : G.dist;
  t.world.rotation.set(G.pitch, G.yaw, 0, 'XYZ');
  camera.position.set(0, 0, G.distShown); camera.lookAt(0, 0, 0);
  // the sun sits up and to the left of you, so the lit side always faces the room
  t.sun.position.set(-3, 2.2, 4);
  t.U.uTime.value = now / 1000;
  for (const o of t.orbits) { o.a += dt * o.speed; o.sat.position.set(Math.cos(o.a) * o.r, 0, Math.sin(o.a) * o.r); }
  if (t.pulse.visible) { const k = (now / 1400) % 1; t.pulse.scale.setScalar(1 + k * 4); t.pulse.material.opacity = 0.9 * (1 - k); }
  if (t.arc && t.comet.visible) { const pts = t.arc.userData.pts; const k = (now / 2600) % 1; t.comet.position.copy(pts[Math.floor(k * (pts.length - 1))]); }
  t.stars.rotation.y = G.yaw * 0.08;
  renderer.render(t.scene, camera);
  placeLabels(); hudTick();
}
function placeLabels() {
  const t = G.three, box = G.el.querySelector('.gx-labels'); if (!t) return;
  const items = [];
  if (G.target) items.push({ p: t.tgtPin, text: G.target.name, cls: 'tgt' });
  items.push({ p: t.homePin, text: G.home.name + ' · home', cls: 'home' });
  const w = G.el.clientWidth, h = G.el.clientHeight; const cam = t.camera.position.clone().normalize();
  box.innerHTML = items.map(it => {
    const wp = it.p.getWorldPosition(new t.THREE.Vector3()); if (wp.clone().normalize().dot(cam) < 0.12) return '';
    const s = wp.clone().project(t.camera); const x = (s.x + 1) / 2 * w, y = (1 - s.y) / 2 * h;
    return `<span class="gx-lbl ${it.cls}" style="transform:translate(${x.toFixed(0)}px,${y.toFixed(0)}px)">${esc(it.text)}</span>`;
  }).join('');
}

/* ------------------------------------------------------------------ HUD */
function hudTick() {
  const now = Date.now(); if (now - (G.hudAt || 0) < 250) return; G.hudAt = now;
  const q = s => G.el.querySelector(s);
  const c = G.mode === 'map' && G.map ? (() => { const m = G.map.getCenter(); return { lat: m.lat, lon: ((m.lng + 540) % 360) - 180 }; })() : (G.three ? centreLL() : { lat: 0, lon: 0 });
  const off = G.wx?.offset ?? (G.target ? Math.round(G.target.lon / 15) * 3600 : -new Date().getTimezoneOffset() * 60);
  const local = new Date(now + off * 1000);
  const hh = String(local.getUTCHours()).padStart(2, '0'), mm = String(local.getUTCMinutes()).padStart(2, '0');
  const sign = off >= 0 ? '+' : '−', oh = String(Math.floor(Math.abs(off) / 3600)).padStart(2, '0'), om = String(Math.floor(Math.abs(off) % 3600 / 60)).padStart(2, '0');
  q('.gx-time').textContent = `${hh}:${mm}`; q('.gx-utc').textContent = `UTC${sign}${oh}:${om}`;
  q('.gx-date').textContent = local.toISOString().slice(0, 10);
  const f = v => (v >= 0 ? '＋' : '−') + Math.abs(v).toFixed(4);
  q('.gx-coord').textContent = `${f(c.lat)}, ${f(c.lon)}`;
  const km = G.mode === 'map' && G.map ? 40075 * Math.cos(c.lat * DEG) / Math.pow(2, G.map.getZoom()) * 2.2 : Math.max(0, (G.distShown || G.dist) - 1) * 6371;
  q('.gx-alt').textContent = `↥ ${km >= 100 ? Math.round(km).toLocaleString('en-GB').replace(/,/g, ' ') : km.toFixed(1)} km`;
}
async function weatherFor(p) {
  const box = G.el.querySelector('.gx-wx'); box.innerHTML = '<span class="gx-dim">Weather…</span>';
  const ask = p; G.wx = null;
  try {
    const w = await call('geo-weather', { lat: p.lat, lon: p.lon });
    if (G.target !== ask || !w) return;
    G.wx = w;
    box.innerHTML = `<b>${w.icon || ''} ${Math.round(w.temp)}°C</b><span>${esc(w.words || '')}</span><span>💧 ${w.humidity ?? '–'}%  ·  💨 ${Math.round(w.wind || 0)} km/h</span>`;
  } catch { if (G.target === ask) box.innerHTML = '<span class="gx-dim">Weather unavailable</span>'; }
}

/* ------------------------------------------------------------------ input: mouse, touch, and the hand (which arrives as pointer events) */
function hookInput(cv) {
  cv.addEventListener('pointerdown', e => { if (e.button !== 0) return; G.drag = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 }; G.want = null; G.touched = performance.now(); cv.setPointerCapture?.(e.pointerId); });
  addEventListener('pointermove', e => {
    if (!G.drag || !G.isOpen) return;
    const d = G.drag; const now = performance.now(); const k = 0.0042 * Math.min(1.4, G.dist / 3.4);
    const dx = e.clientX - d.x, dy = e.clientY - d.y; d.moved += Math.abs(dx) + Math.abs(dy);
    G.yaw += dx * k; G.pitch = clamp(G.pitch + dy * k, -1.35, 1.35);
    const dt = Math.max(0.008, (now - d.t) / 1000); G.vel.x = dx * k / dt * 0.6; G.vel.y = dy * k / dt * 0.6;
    d.x = e.clientX; d.y = e.clientY; d.t = now; G.touched = now;
  });
  addEventListener('pointerup', () => { if (G.drag) { G.drag = null; G.touched = performance.now(); } });
  cv.addEventListener('wheel', e => { e.preventDefault(); G.zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  cv.addEventListener('dblclick', e => {
    const t = G.three; const r = cv.getBoundingClientRect();
    const ray = new t.THREE.Raycaster(); ray.setFromCamera(new t.THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), t.camera);
    const hit = ray.intersectObject(t.earth)[0]; if (!hit) return;
    const ll = v2ll(t.world.worldToLocal(hit.point.clone()));
    const near = nearestCity(ll.lat, ll.lon);
    G.fly(near && near.d < 3 ? near.place : { name: `${ll.lat.toFixed(2)}, ${ll.lon.toFixed(2)}`, lat: ll.lat, lon: ll.lon, kind: 'point' }, { map: true, zoom: near && near.d < 3 ? 11 : 7 });
  });
}
function nearestCity(lat, lon) {
  let best = null, bd = 1e9;
  for (const r of G.places) { if (r[8] < 150000) continue; const d = Math.hypot(r[6] - lat, (r[7] - lon) * Math.cos(lat * DEG)); if (d < bd) { bd = d; best = r; } }
  return best ? { place: placeFrom(best, best[0]), d: bd } : null;
}

/* ------------------------------------------------------------------ the street / satellite map */
function ensureMap() { return G.mapP ||= makeMap().catch(e => { G.mapP = null; throw e; }); }   // one load, however many zoom ticks ask for it
async function makeMap() {
  if (G.map) return G.map;
  if (!document.querySelector('link[data-leaflet]')) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = './vendor/leaflet/leaflet.css'; l.dataset.leaflet = '1'; document.head.appendChild(l); }
  await loadScript('./vendor/leaflet/leaflet.js', () => !!window.L);
  const L = window.L; const box = G.el.querySelector('.gx-map');
  box.hidden = false;
  G.map = L.map(box, { zoomControl: false, attributionControl: false, worldCopyJump: true, zoomSnap: 0.25, zoomDelta: 0.75, wheelPxPerZoomLevel: 90, minZoom: 2, maxZoom: 18, fadeAnimation: true, zoomAnimation: true, inertia: true });
  G.map.on('zoomend', () => { if (G.mode === 'map' && G.map.getZoom() < 2.6 && !G.map._flying) toGlobe(); });
  G.map.on('movestart', () => { G.touched = performance.now(); });
  G.layers = {};
  mapLayers();
  return G.map;
}
function mapLayers() {
  const L = window.L; if (!L || !G.map) return;
  const want = G.style === 'satellite' ? ['sat', 'labels'] : ['street'];
  const make = {
    street: () => L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19, className: 'gx-tiles-street', crossOrigin: false }),
    sat: () => L.tileLayer('https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2021_3857/default/g/{z}/{y}/{x}.jpg', { maxNativeZoom: 15, maxZoom: 19, className: 'gx-tiles-sat' }),
    labels: () => L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', { subdomains: 'abcd', maxZoom: 19, className: 'gx-tiles-labels', pane: 'overlayPane' }),
  };
  for (const [k, layer] of Object.entries(G.layers)) if (!want.includes(k)) { G.map.removeLayer(layer); delete G.layers[k]; }
  for (const k of want) if (!G.layers[k]) { G.layers[k] = make[k](); G.layers[k].addTo(G.map); }
  G.el.classList.toggle('gx-night-map', G.style === 'night');
  G.el.style.setProperty('--gx-tint', G.style === 'holo' ? pal().tint : G.style === 'night' ? 'saturate(1.3) brightness(.95)' : 'none');
  G.el.querySelector('.gx-attrib').innerHTML = G.style === 'satellite'
    ? 'Sentinel-2 cloudless — s2maps.eu by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2021) · Labels © OpenStreetMap contributors © CARTO'
    : '© OpenStreetMap contributors © CARTO';
}
function markTarget(p) {
  const L = window.L; if (!L || !G.map) return;
  if (G.mark) G.map.removeLayer(G.mark);
  G.mark = L.marker([p.lat, p.lon], { icon: L.divIcon({ className: 'gx-mk', html: `<i></i><i></i><b>${esc(p.name)}</b>`, iconSize: [0, 0] }), interactive: false }).addTo(G.map);
}
async function toMap(p, zoom) {
  const map = await ensureMap();
  G.mode = 'map'; G.el.classList.add('gx-in-map'); G.el.querySelector('.gx-hint').textContent = 'Drag or pinch-and-move to pan · scroll or two-hand pinch to zoom · zoom right out, or press the globe, for the whole earth';
  const box = G.el.querySelector('.gx-map'); box.hidden = false;
  map.invalidateSize(false);
  const z = zoom ?? (p.kind === 'city' ? 11.5 : p.kind === 'point' ? 7 : 12);
  // start wide over the place, then dive in, the way the globe hands over
  map.setView([p.lat, p.lon], Math.min(4.5, z - 3), { animate: false });
  markTarget(p);
  requestAnimationFrame(() => box.classList.add('on'));
  await new Promise(r => setTimeout(r, 380));
  map._flying = true;
  const done = () => { map._flying = false; };
  if (p.bbox && p.kind !== 'city') { const [x0, y0, x1, y1] = p.bbox; map.flyToBounds([[y0, x0], [y1, x1]], { duration: 2.4, padding: [60, 60] }); }
  else map.flyTo([p.lat, p.lon], z, { duration: 2.6 });
  map.once('moveend', done); setTimeout(done, 3200);
}
function toGlobe() {
  if (G.mode !== 'map') return;
  const c = G.map.getCenter(); G.mode = 'globe'; G.el.classList.remove('gx-in-map'); G.el.querySelector('.gx-hint').textContent = 'Drag or pinch-and-move to spin · scroll or two-hand pinch to zoom · double-click to dive in';
  const box = G.el.querySelector('.gx-map'); box.classList.remove('on'); setTimeout(() => { if (G.mode === 'globe') box.hidden = true; }, 450);
  const a = aimAt(c.lat, c.lng); G.yaw = a.yaw; G.pitch = a.pitch; G.dist = 1.9; G.distShown = 1.5;
  G.want = { t: 0, dur: 1.1, y0: G.yaw, y1: G.yaw, p0: G.pitch, p1: G.pitch * 0.6, d0: 1.9, d1: 3.2, lift: 0 };
}

/* ------------------------------------------------------------------ the public side */
G.open = async function (opts = {}) {
  if (!G.el) build();
  const first = !G.three;
  if (!G.isOpen) {
    G.isOpen = true; G.el.hidden = false; document.body.classList.add('globe-open');
    call('tabs-state').then(v => { G.tabsWere = !!v; }).catch(() => {}).finally(() => call('tabs-show', false).catch(() => {})); window.__jarvisHolo?.pauseAll?.(true);   // web pages float above the app, so they step aside
    G.el.style.setProperty('--gx', pal().ui);
    requestAnimationFrame(() => G.el.classList.add('in'));
    if (!G.ready) G.ready = makeGlobe().catch(e => { G.el.querySelector('.gx-detail').textContent = 'The globe could not start: ' + e.message; throw e; });
    try { await G.ready; } catch { return; }
    recolour();
    if (first) { const a = aimAt(G.home.lat, G.home.lon); G.yaw = a.yaw - 0.9; G.pitch = 0.3; G.dist = 5.2; G.distShown = 6.5; G.want = { t: 0, dur: 2.2, y0: G.yaw, y1: a.yaw, p0: 0.3, p1: a.pitch * 0.55, d0: 5.2, d1: 3.4, lift: 0 }; }
    G.lastT = performance.now(); cancelAnimationFrame(G.raf); G.raf = requestAnimationFrame(frame);
  } else await G.ready;
  if (opts.style) setStyle(opts.style);
  if (opts.place) return G.go(opts.place, opts);
  if (opts.earth && G.mode === 'map') toGlobe();
};
G.close = function () {
  if (!G.isOpen) return;
  G.isOpen = false; cancelAnimationFrame(G.raf); G.el.classList.remove('in'); document.body.classList.remove('globe-open');
  setTimeout(() => { if (!G.isOpen) G.el.hidden = true; }, 380);
  window.__jarvisHolo?.pauseAll?.(false);
  if (G.tabsWere) call('tabs-show', true).catch(() => {});   // an open suit gets its page back
};
G.go = async function (query, opts = {}) {
  if (!G.isOpen) return G.open({ ...opts, place: query });
  const d = G.el.querySelector('.gx-detail'), pl = G.el.querySelector('.gx-place');
  pl.textContent = String(query).replace(/\b\w/g, c => c.toUpperCase()); d.textContent = 'Locating…';
  const p = await findPlace(query);
  if (!p) { pl.textContent = 'Not found'; d.textContent = `I couldn't find “${query}”.`; call('globe-say', { text: `I couldn't find ${query} on the map, sir.` }).catch(() => {}); return null; }
  return G.fly(p, { map: opts.map !== false, zoom: opts.zoom });
};
G.fly = async function (p, { map = true, zoom } = {}) {
  await G.ready;
  G.el.querySelector('.gx-place').textContent = p.name;
  G.el.querySelector('.gx-detail').textContent = p.detail || (p.kind === 'country' ? 'Country' : p.kind === 'region' ? 'Region' : p.kind === 'city' ? 'City' : '');
  setTarget(p); weatherFor(p);
  if (G.mode === 'map' && G.map) { markTarget(p); G.map.flyTo([p.lat, p.lon], zoom ?? (p.kind === 'city' ? 11.5 : 6), { duration: 2.4 }); return p; }
  const a = aimAt(p.lat, p.lon);
  let y1 = a.yaw; while (y1 - G.yaw > Math.PI) y1 -= Math.PI * 2; while (y1 - G.yaw < -Math.PI) y1 += Math.PI * 2;
  const close = map ? 1.55 : p.kind === 'country' || p.kind === 'region' ? 2.3 : 1.9;
  await new Promise(done => { G.want = { t: 0, dur: 2.1, y0: G.yaw, y1, p0: G.pitch, p1: a.pitch, d0: G.dist, d1: close, lift: 0.5, done }; });
  G.dist = close;
  if (map) await toMap(p, zoom);
  return p;
};
G.zoomBy = function (f) {
  if (!G.isOpen) return;
  G.touched = performance.now();
  if (G.mode === 'map' && G.map) { G.map.setZoom(clamp(G.map.getZoom() + Math.log2(f) * 1.6, 2, 18)); return; }
  G.dist = clamp(G.dist / f, 1.22, 7); G.want = null;
  if (G.dist <= 1.3 && f > 1) { const c = centreLL(); const near = nearestCity(c.lat, c.lon); toMap(near && near.d < 4 ? near.place : { name: `${c.lat.toFixed(2)}, ${c.lon.toFixed(2)}`, lat: c.lat, lon: c.lon, kind: 'point' }, 6); }
};
G.swipe = function (dir) {   // an open-hand swipe spins the globe (or pans the map) instead of changing hall
  G.touched = performance.now();
  if (G.mode === 'map' && G.map) { G.map.panBy([dir * G.el.clientWidth * 0.35, 0]); return; }
  G.want = null; G.vel.x = dir * 2.6;
};
G.button = function (k) {
  if (k === 'in') G.zoomBy(1.5); else if (k === 'out') G.zoomBy(1 / 1.5);
  else if (['holo', 'satellite', 'night'].includes(k)) setStyle(k);
  else if (k === 'spin') { G.spin = !G.spin; G.el.querySelector('[data-gx=spin]').classList.toggle('on', G.spin); }
  else if (k === 'earth') { if (G.mode === 'map') toGlobe(); G.want = { t: 0, dur: 1.4, y0: G.yaw, y1: G.yaw, p0: G.pitch, p1: 0.3, d0: G.dist, d1: 3.4, lift: 0 }; }
  else if (k === 'home') G.fly({ ...G.home, kind: 'city', detail: 'Home' }, { map: true, zoom: 12 });
  else if (k === 'close') G.close();
};
G.handle = function (m) {
  if (!m || VIEW !== 'main') return;
  if (m.cmd === 'earth') return G.open({ earth: true, style: m.style });
  if (m.cmd === 'place' && m.q) return G.open({ place: m.q, style: m.style });
  if (m.cmd === 'close') return G.close();
  if (!G.isOpen) { if (['view', 'zoom', 'spin'].includes(m.cmd)) G.open({}); else return; }
  if (m.cmd === 'view') setStyle(m.view);
  if (m.cmd === 'zoom') G.zoomBy(m.dir > 0 ? 1.8 : 1 / 1.8);
  if (m.cmd === 'spin') { G.spin = m.on !== false; G.el?.querySelector('[data-gx=spin]')?.classList.toggle('on', G.spin); }
};

if (J && VIEW === 'main') {
  try { J.on('globe', m => G.handle(m)); } catch {}
  call('geo-home').then(h => { if (h && Number.isFinite(h.lat)) { G.home = h; placeHome(); } }).catch(() => {});
  new MutationObserver(() => { if (G.isOpen) { recolour(); if (G.map) mapLayers(); } }).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
}
