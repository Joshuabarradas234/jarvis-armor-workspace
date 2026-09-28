/*
 * JARVIS v9.7 — hand control and the Ideas room.
 *
 * Hands: the laptop webcam feeds MediaPipe Hands, which runs entirely on this machine
 * (the model ships inside the app; no video leaves the laptop). A glowing ring follows the
 * hand (it follows the knuckles, so pinching doesn't move it). Pinch = press / grab / click, and
 * buttons pull the ring in when it is close. Open-hand swipe left/right = next/previous hall, with
 * the transition skipped. Swipe up = scroll down, swipe down = scroll up. Open hand then fist =
 * close the suit and go home. Prayer hands, held = close JARVIS down. Two-hand pinch = zoom.
 *
 * Ideas room: the assistant's particle core in the middle, your ideas floating round it as
 * glass cards you can drag (mouse or hand), each with a stage and progress, and a Claude panel.
 */
(() => {
  'use strict';
  const J = window.jarvis;
  if (!J) return;
  const VIEW = new URLSearchParams(location.search).get('view') || 'main';
  if (!['main', 'console'].includes(VIEW)) return;   // wallpaper and helper windows stay untouched
  const MAIN = VIEW === 'main';
  const call = (m, p) => J.call(m, p);
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const HALLS = ['ironman', 'batcave', 'spiderman'];
  const ACCENT = { ironman: '#7fd6e8', batcave: '#f5c542', spiderman: '#ff4d4d' };
  const ASSIST = { ironman: 'J.A.R.V.I.S.', batcave: 'A.L.F.R.E.D.', spiderman: 'K.A.R.E.N.' };
  const hall = () => document.body.dataset.theme || 'ironman';
  const accent = () => ACCENT[hall()] || '#7fd6e8';
  const store = { get(k, d) { try { const v = localStorage.getItem('jv.' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
                  set(k, v) { try { localStorage.setItem('jv.' + k, JSON.stringify(v)); } catch {} } };

  /* ------------------------------------------------------------------ voice level for the core */
  let voiceLevel = 0;
  try { J.on('voice-meter', m => { const v = Number(m?.level) || 0; voiceLevel = clamp(v / 100, 0, 1); }); } catch {}

  /* =================================================================== HANDS */
  const H = {
    on: false, ready: false, hands: null, video: null, stream: null, busy: false,
    x: innerWidth / 2, y: innerHeight / 2, sx: null, sy: null,
    pinching: false, downAt: 0, downX: 0, downY: 0, target: null, hoverChain: [],
    trail: [], coolUntil: 0, prayerSince: 0, zoomRef: null, lastSeen: 0,
  };

  const ring = document.createElement('div');
  ring.className = 'hx-ring'; ring.innerHTML = '<i></i><b></b><span></span>';
  const pip = document.createElement('canvas');
  pip.className = 'hx-pip'; pip.width = 256; pip.height = 192; pip.title = 'Hand camera (click to hide)';
  pip.addEventListener('click', () => { pip.classList.toggle('mini'); store.set('pipMini', pip.classList.contains('mini')); });
  if (store.get('pipMini', false)) pip.classList.add('mini');

  function flash(text) {
    H.lastFlash = text; const s = ring.querySelector('span'); s.textContent = text; ring.classList.remove('flash'); void ring.offsetWidth; ring.classList.add('flash');
  }

  function loadScript(src) {
    return new Promise((res, rej) => { if (window.Hands) return res(); const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(Error('Could not load ' + src)); document.head.appendChild(s); });
  }

  /* v9.13: the tracking itself runs on a thread of its own (handtrack.worker.js, Google's newer hand landmarker on the
     processor). It used to run on this window's one thread alongside every animation in the hall and only managed about
     9 frames a second, which is what made the ring lag and jump and pinches go missing. Each new camera frame is handed
     over; the hand points come back. If the worker can't start, tracking falls back to the old way. */
  let worker = null, wBusy = false, wBusyAt = 0, lastVT = -1, trackerWatch = 0;
  async function startHands() {
    if (H.on) return;
    H.on = true; syncToggle();
    const gen = H.gen = (H.gen || 0) + 1;   // switched off while starting: this start gives up and lets the camera go
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, frameRate: { ideal: 30 }, facingMode: 'user' }, audio: false });
      if (gen !== H.gen || !H.on) { stream.getTracks().forEach(t => t.stop()); return; }
      H.stream = stream;
      H.video = H.video || Object.assign(document.createElement('video'), { muted: true, playsInline: true });
      H.video.srcObject = H.stream; await H.video.play();
      if (gen !== H.gen || !H.on) return;
      if (!H.forceLocal && typeof Worker !== 'undefined' && typeof VideoFrame !== 'undefined') startWorker();
      else await startLocal();
      if (gen !== H.gen || !H.on) return;
      document.body.append(ring, pip);
      H.ready = true; store.set('handsOn', true);
      ringLoop();
    } catch (e) {
      if (gen !== H.gen) return;
      H.on = false; H.ready = false; syncToggle();
      try { H.stream?.getTracks().forEach(t => t.stop()); } catch {} H.stream = null;
      toast(e && e.name === 'NotAllowedError' ? 'Camera access was blocked.' : e && e.name === 'NotFoundError' ? 'No camera found.' : 'Hand control could not start: ' + (e?.message || e));
      console.warn('[hands]', e);
    }
  }
  function startWorker() {
    H.mode = 'worker'; H.workerReady = !!H.workerLoaded;
    if (!worker) {
      worker = new Worker(new URL('./handtrack.worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = e => onWorker(e.data);
      worker.onerror = e => { console.warn('[hands] worker', e.message || e); fallBack(); };
      worker.postMessage({ init: true, base: 'jarvis://asset/handtrack', model: 'jarvis://asset/handtrack/hand_landmarker.task' });
    }
    clearTimeout(trackerWatch);
    // a slow start is only slow (the tracker is still loading), so it is left to finish; only a real error falls back
    trackerWatch = setTimeout(() => { if (H.on && H.mode === 'worker' && !H.workerReady) flash('HANDS LOADING…'); }, 8000);
    pump();
  }
  function fallBack() {
    try { worker?.terminate(); } catch {} worker = null; H.workerLoaded = false; H.forceLocal = true;
    if (H.on && H.mode === 'worker') { H.mode = 'local'; startLocal().catch(e => console.warn('[hands] local', e)); }
  }
  async function startLocal() {
    H.mode = 'local';
    await loadScript('./vendor/hands/hands.js');
    if (!H.hands) {
      H.hands = new window.Hands({ locateFile: f => './vendor/hands/' + f });
      H.hands.setOptions({ maxNumHands: 2, modelComplexity: 1, minDetectionConfidence: 0.6, minTrackingConfidence: 0.5, selfieMode: false });
      H.hands.onResults(onResults);
    }
    loop();
  }
  // hand the worker each new camera frame, one at a time (if it is still busy with the last one, this one is skipped)
  function pump() {
    if (!H.on || H.mode !== 'worker') return;
    requestAnimationFrame(pump);
    const v = H.video; if (!worker || !H.workerReady || !v || v.readyState < 2) return;
    if (wBusy && performance.now() - wBusyAt < 1500) return;
    if (v.currentTime === lastVT) return; lastVT = v.currentTime;
    let f; try { f = new VideoFrame(v, { timestamp: Math.round(performance.now() * 1000) }); } catch { return; }
    wBusy = true; wBusyAt = performance.now();
    worker.postMessage({ frame: f, ts: performance.now() }, [f]);
  }
  function onWorker(m) {
    if (!m) return;
    if (m.log) { console.log('[hands] worker', m.log, Math.round(performance.now())); return; }
    if (m.error) { console.warn('[hands] worker', m.error); return fallBack(); }
    if (m.ready) { H.workerReady = H.workerLoaded = true; return; }
    wBusy = false;
    if (m.fail) return;
    if (!H.on) return;
    H.trackMs = (H.trackMs || m.ms) * 0.9 + m.ms * 0.1; H.maxHands = m.hands;
    // a slow laptop follows one hand only (twice the speed), except where two hands are needed: zooming the earth or the Ideas room
    const want = H.trackMs > 70 && !window.__jarvisGlobe?.isOpen && !Room.open ? 1 : 2;
    if (want !== m.hands && (!H.handsSwitchAt || performance.now() - H.handsSwitchAt > 4000)) { H.handsSwitchAt = performance.now(); worker.postMessage({ hands: want }); }
    const lmk = (m.lm || []).map(h => h.map(p => ({ x: p[0], y: p[1], z: p[2] })));
    onResults({ multiHandLandmarks: lmk, multiHandedness: (m.hd || []).map(label => ({ label })), image: H.video });
  }

  function stopHands() {
    H.on = false; H.ready = false; store.set('handsOn', false); H.gen = (H.gen || 0) + 1;
    if (H.onDeck) { H.onDeck = false; ring.classList.remove('away'); remote({ visible: false }); }
    clearTimeout(trackerWatch);
    try { H.stream?.getTracks().forEach(t => t.stop()); } catch {}
    H.stream = null; if (H.pinching) release(true); ring.remove(); pip.remove(); syncToggle();
    call('hands-ring', { show: false }).catch(() => {});
  }
  // JARVIS put away in the tray: the camera goes off, and comes back when JARVIS does
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && H.on) { stopHands(); store.set('handsOn', true); H.resume = true; }
    else if (!document.hidden && H.resume) { H.resume = false; setTimeout(() => startHands(), 600); }
  });

  let lastSend = 0;
  async function loop() {
    if (!H.on || H.mode !== 'local') return;
    const now = performance.now();
    if (!H.busy && H.video && H.video.readyState >= 2 && now - lastSend > 30) {
      H.busy = true; lastSend = now;
      const t0 = performance.now();
      try { await H.hands.send({ image: H.video }); } catch (e) { console.warn('[hands] frame', e); }
      H.busy = false;
      H.ms = (H.ms || 0) * 0.9 + (performance.now() - t0) * 0.1; H.n = (H.n || 0) + 1;
      if (!H.lite && H.n > 40 && H.ms > 90) { H.lite = true; try { H.hands.setOptions({ modelComplexity: 0 }); } catch {} }
    }
    requestAnimationFrame(loop);
  }

  /* The ring is drawn every screen frame, gliding to where the hand is, instead of hopping each time a camera frame
     arrives. It only draws: clicks and hovering use the hand position itself, so gliding adds no delay to them. */
  const R = { x: null, y: null, tx: innerWidth / 2, ty: innerHeight / 2, t: 0, raf: 0 };
  function ringTo(x, y) { R.tx = x; R.ty = y; if (R.x === null || Math.hypot(x - R.x, y - R.y) > 420) { R.x = x; R.y = y; ring.style.transform = `translate(${x}px,${y}px)`; } }
  function ringLoop() {
    if (R.raf) return;
    const step = now => {
      if (!ring.isConnected) { R.raf = 0; return; }
      R.raf = requestAnimationFrame(step);
      const dt = Math.min(0.05, R.t ? (now - R.t) / 1000 : 0.016); R.t = now;
      if (R.x === null) return;
      const k = 1 - Math.exp(-dt / 0.035);
      const nx = R.x + (R.tx - R.x) * k, ny = R.y + (R.ty - R.y) * k;
      if (Math.abs(nx - R.x) + Math.abs(ny - R.y) < 0.05) return;
      R.x = nx; R.y = ny; ring.style.transform = `translate(${nx.toFixed(1)}px,${ny.toFixed(1)}px)`;
    };
    R.raf = requestAnimationFrame(step);
  }

  const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const mid = (...p) => ({ x: p.reduce((s, q) => s + q.x, 0) / p.length, y: p.reduce((s, q) => s + q.y, 0) / p.length });
  // a finger is straight when its tip is well past its middle joint, and curled when its tip is back near the knuckle
  function extended(lm, tip, pip) { return d2(lm[0], lm[tip]) > d2(lm[0], lm[pip]) * 1.12; }
  function curled(lm, tip, mcp) { return d2(lm[0], lm[tip]) < d2(lm[0], lm[mcp]) * 1.08; }

  /* One-euro filter: holds still when the hand is still (easy to aim at a tab), keeps up when it moves fast. */
  function Euro(minCut = 1.1, beta = 0.007, dCut = 1.0) {
    let x = null, dx = 0, t = 0;
    const a = (cut, dt) => 1 / (1 + 1 / (2 * Math.PI * cut * dt));
    return (v, now) => {
      if (x === null) { x = v; t = now; return v; }
      const dt = Math.max(0.001, (now - t) / 1000); t = now;
      const d = (v - x) / dt; dx += a(dCut, dt) * (d - dx);
      const cut = minCut + beta * Math.abs(dx); x += a(cut, dt) * (v - x); return x;
    };
  }
  const fx = Euro(1.4, 0.008), fy = Euro(1.4, 0.008);

  /* ---------- where the hand has to be. The camera sits on top of the screen, so aiming at the middle of the screen
     used to mean holding your hand in front of your own face, where the tracker loses fingers. The reach box now sits
     beside you, on the side of the hand you use, and "Calibrate hands" lets you set it to wherever feels natural. */
  const DeckGeo = { present: false, side: 'below', main: null, deck: null };
  function reachBox(rightHand) {
    const c = store.get('handBox', null);
    // a saved box that is too small (the second corner caught in the same spot as the first) is ignored: it made the ring fly about
    let b = c && [c.x0, c.x1, c.y0, c.y1].every(Number.isFinite) && c.x1 - c.x0 >= 0.28 && c.y1 - c.y0 >= 0.22 ? { ...c } : rightHand === false ? { x0: 0.06, x1: 0.60, y0: 0.14, y1: 0.66 } : { x0: 0.40, x1: 0.94, y0: 0.14, y1: 0.66 };
    const below = DeckGeo.present && DeckGeo.side === 'below';
    const share = below && DeckGeo.main && DeckGeo.deck ? DeckGeo.deck.h / (DeckGeo.main.h + DeckGeo.deck.h) : 0;
    if (below && !b.deck) b.y1 = Math.min(0.97, b.y1 + (b.y1 - b.y0) * share / (1 - share) * 0.72);   // set up for one screen: reach a little lower for the second
    if (!below && b.deck) b.y1 = b.y0 + (b.y1 - b.y0) * (1 - (b.share || 0.5));
    return b;
  }
  const VIRT = () => DeckGeo.present && DeckGeo.side === 'below' && DeckGeo.main && DeckGeo.deck ? { w: innerWidth, h: innerHeight + DeckGeo.deck.h * innerWidth / DeckGeo.deck.w } : { w: innerWidth, h: innerHeight };

  /* Magnet: buttons, tabs and suits pull the ring in once it is close, so a slightly-off hand still hits them. */
  const TARGETS = '.hp-bar,button,a[href],[data-tab],[data-link],[data-suit],.ws-tile,.theme-chip,.qp-ico,.bay-label,.hotspot,.ix-card,.t3-tag,.tw-floor-card,[role=button],input,textarea,select,summary';
  // things you drag rather than click: the ring follows the hand while you hold them
  const DRAGGY = '.hp-bar,.hp-grip,.ix-card,.gx-stage,.gx-map,.t3-stage,.tw-3d canvas,[data-drag]';
  let targets = [], targetsAt = 0;
  function nearTarget(x, y) {
    const now = performance.now();
    if (now - targetsAt > 350) {
      targetsAt = now;
      targets = [...document.querySelectorAll(TARGETS)].filter(e => e.offsetParent !== null && !e.closest('.hx-pip,.hx-ring'))
        .map(e => ({ e, r: e.getBoundingClientRect() })).filter(t => t.r.width > 4 && t.r.height > 4 && t.r.bottom > 0 && t.r.top < innerHeight);
    }
    let best = null, bd = 38;
    for (const t of targets) {
      const r = t.r, dx = Math.max(r.left - x, 0, x - r.right), dy = Math.max(r.top - y, 0, y - r.bottom), dd = Math.hypot(dx, dy);
      if (dd < bd || (dd === 0 && best && r.width * r.height < best.r.width * best.r.height)) { bd = dd; best = t; }
    }
    if (!best) return null;
    const r = best.r, small = r.width < 90 && r.height < 70;
    return small ? { x: r.left + r.width / 2, y: r.top + r.height / 2, el: best.e }
                 : { x: clamp(x, r.left + 8, r.right - 8), y: clamp(y, r.top + 8, r.bottom - 8), el: best.e };
  }
  // web pages inside a suit sit above the app, so over one the pointer goes straight into the page
  function tabUnder(x, y) {
    if (!MAIN) return false;
    const host = document.querySelector('[data-tabhost]:not(.hidden)'); if (!host || host.offsetParent === null) return false;
    const page = document.querySelector('[data-page]'); if (!page || page.offsetParent === null) return false;
    const r = page.getBoundingClientRect(); return r.width > 0 && x >= r.left && x < r.right && y >= r.top && y < r.bottom;
  }

  function webUnder(x, y) { if (window.__jarvisGlobe?.isOpen) return null; const p = Holo.under(x, y); if (p) return { kind: 'panel', id: p.id }; return tabUnder(x, y) ? { kind: 'tab' } : null; }
  function webCall(web, type, x, y) { return call(web.kind === 'panel' ? 'panel-pointer' : 'tabs-pointer', { type, x, y, id: web.id }).catch(() => {}); }
  let pinchFrames = 0, openFrames = 0, ringOverTab = false;
  const handSize = lm => Math.max(d2(lm[0], lm[9]), d2(lm[5], lm[17]) * 1.3, 0.02);   // steady whichever way the hand is turned

  function onResults(r) {
    drawPip(r);
    const hands = r.multiHandLandmarks || [];
    const now = performance.now();
    window.__handsFrames = (window.__handsFrames || 0) + 1;
    window.__handsSeen = (window.__handsSeen || 0) + (hands.length ? 1 : 0);
    H.fpsT = H.fpsT || []; H.fpsT.push(now); while (H.fpsT.length && now - H.fpsT[0] > 1000) H.fpsT.shift();
    if (Calib.on) { Calib.feed(hands[0], now); return; }   // no gestures while calibrating (an open hand held still would start focus mode)
    if (!hands.length) {
      ring.classList.add('lost'); pinchFrames = 0; H.dwell = null; ring.classList.remove('dwell');
      // a pinch that loses the hand for a moment still counts; only a long loss cancels it
      if (H.pinching && now - H.lastSeen > 700) release(true);
      if (now - H.lastSeen > 900) H.trail = [];
      if (ringOverTab && now - H.lastSeen > 600) { ringOverTab = false; call('hands-ring', { show: false }).catch(() => {}); }
      if (H.onDeck && now - H.lastSeen > 600) { H.onDeck = false; ring.classList.remove('away'); remote({ visible: false }); }
      return;
    }
    H.lastSeen = now; ring.classList.remove('lost');
    const lm = hands[0];
    const lab = r.multiHandedness?.[0]?.label; H.rightHand = lab ? lab === 'Left' : H.rightHand;   // the model assumes a mirrored picture, so its "Left" is your right hand
    const size = handSize(lm);
    const up = [extended(lm, 8, 6), extended(lm, 12, 10), extended(lm, 16, 14), extended(lm, 20, 18)];
    const openHand = up.filter(Boolean).length >= 3;
    // a fist has the index tip tucked right into the palm. (Before, a pinch with the other fingers curled could pass
    // for a fist, and a pinch was ignored whenever the index finger bent over far enough to meet the thumb.)
    const indexTucked = d2(lm[0], lm[8]) < d2(lm[0], lm[5]) * 0.95;
    const pinchRatio0 = d2(lm[4], lm[8]) / size;
    // thumb and index tips actually touching is always a pinch, however curled the other fingers are
    const fist = indexTucked && curled(lm, 12, 9) && curled(lm, 16, 13) && curled(lm, 20, 17) && pinchRatio0 > 0.22;
    if (openHand) H.openAt = now;
    const pinchRatio = d2(lm[4], lm[8]) / size; H.pinchRatio = pinchRatio;
    const closeNow = !fist && pinchRatio < 0.4, apartNow = pinchRatio > 0.56 || fist;
    // two frames either way, so one shaky frame neither clicks nor lets go (one is enough when the camera is slow)
    const need = (H.fpsT || []).length < 16 ? 1 : 2;
    pinchFrames = closeNow ? pinchFrames + 1 : 0; openFrames = apartNow ? openFrames + 1 : 0;
    const pinchOn = H.pinching ? openFrames < need : pinchFrames >= need;

    // the ring follows the knuckles, not the fingertip, so pinching to click doesn't knock it off what you aimed at
    const aim = mid(lm[5], lm[5], lm[9]);
    const box = reachBox(H.rightHand); H.box = box;
    const V = VIRT();
    const nx = clamp(((1 - aim.x) - box.x0) / (box.x1 - box.x0), 0, 1), ny = clamp((aim.y - box.y0) / (box.y1 - box.y0), 0, 1);
    const vx = fx(nx * V.w, now), vy = fy(ny * V.h, now);
    H.vx = vx; H.vy = vy;

    // two hands
    if (hands.length >= 2) {
      const lm2 = hands[1];
      // prayer hands, held: close JARVIS down
      const s2 = handSize(lm2);
      const together = d2(lm[8], lm2[8]) < 0.55 * (size + s2) / 2 && d2(lm[0], lm2[0]) < 1.7 * (size + s2) / 2;
      const p2 = d2(lm2[4], lm2[8]) / s2 < 0.4;
      // two pinches brought together to zoom out are not prayer hands
      if (together && now > H.coolUntil && !(pinchOn && p2) && H.zoomRef === null) {
        if (!H.prayerSince) { H.prayerSince = now; flash('HOLD TO CLOSE JARVIS'); }
        if (now - H.prayerSince > 800) { H.prayerSince = 0; H.coolUntil = now + 3000; flash('STANDING DOWN'); if (H.pinching) release(true); if (Room.open) Room.close(); call('action', { action: 'standdown' }).catch(() => {}); return; }
      } else H.prayerSince = 0;
      // both pinching -> zoom
      if (pinchOn && p2) {
        const span = d2(mid(lm[4], lm[8]), mid(lm2[4], lm2[8]));
        const Z = window.__jarvisGlobe?.isOpen ? window.__jarvisGlobe : Room;   // the earth zooms if it is up, otherwise the Ideas room
        if (H.zoomRef === null || H.zoomRef.on !== Z) H.zoomRef = { span, z: Z.zoom, on: Z };
        else Z.setZoom(H.zoomRef.z * span / H.zoomRef.span);
        if (H.pinching) release(true);
        return;
      }
      if (H.zoomRef !== null) { H.zoomRef = null; H.coolUntil = now + 400; pinchFrames = 0; }   // the zoom ended: the hand still pinching must pinch again to click
      if (together) return;   // no clicking or swiping while the hands are together
    } else { H.prayerSince = 0; if (H.zoomRef !== null) { H.zoomRef = null; H.coolUntil = now + 400; pinchFrames = 0; } }

    // open hand -> fist: close the suit (and any page in it) and go back to the hall
    if (fist && H.openAt && now - H.openAt < 900 && now > H.coolUntil) {
      H.coolUntil = now + 1500; H.openAt = 0; H.trail = [];
      if (H.pinching) release(true);
      if (window.__jarvisGlobe?.isOpen) { flash('CLOSED'); window.__jarvisGlobe.close(); return; }   // a fist puts the earth away first
      flash('HOME'); if (Room.open) Room.close(); if (Brief.el) Brief.close();
      call('action', { action: 'home' }).catch(() => {});
      return;
    }

    // swipes: a quick sweep of an open hand. Judged on distance and speed over the last 0.7 s, so it still
    // works when a fast hand blurs and the camera misses a few frames in the middle.
    const palm = mid(lm[0], lm[5], lm[9], lm[17]);
    H.trail.push({ t: now, x: 1 - palm.x, y: palm.y, open: openHand });
    while (H.trail.length && now - H.trail[0].t > 700) H.trail.shift();
    const busy = H.pinching || (H.onDeck && pinchOn);   // pinching on the lower screen counts too
    if (!busy && now > H.coolUntil && H.trail.length >= 2) {
      const b = H.trail[H.trail.length - 1];
      const openShare = H.trail.filter(p => p.open).length / H.trail.length;
      if (openShare >= 0.6) {
        for (const a of H.trail) {
          const dt = (b.t - a.t) / 1000; if (dt < 0.08) break;
          const dx = b.x - a.x, dy = b.y - a.y;
          if (Math.abs(dx) > 0.3 && Math.abs(dx) > 1.8 * Math.abs(dy) && Math.abs(dx) / dt > 0.95) { H.coolUntil = now + 1100; H.trail = []; swipeHall(dx < 0 ? 1 : -1); return; }
          if (Math.abs(dy) > 0.26 && Math.abs(dy) > 1.8 * Math.abs(dx) && Math.abs(dy) / dt > 0.8) { H.coolUntil = now + 700; H.trail = []; scrollAt(dy < 0 ? 1 : -1); return; }
        }
      }
    }

    // pinch a floating page, then flick the hand down: it goes to the second screen. Flick up on the second screen: it comes back.
    if (pinchOn && H.pinchSince && now - H.pinchSince > 120 && hands.length === 1) {
      const b = H.trail[H.trail.length - 1];
      for (const a of H.trail) {
        const dt = (b.t - a.t) / 1000; if (dt < 0.06) break;
        const dy = b.y - a.y, dx = Math.abs(b.x - a.x);
        if (Math.abs(dy) > 0.14 && Math.abs(dy) / dt > 0.6 && dx < Math.abs(dy)) {
          if (dy > 0 && !H.onDeck && flickDown()) { H.coolUntil = now + 1200; H.trail = []; return; }
          if (dy < 0 && H.onDeck) { remote({ flick: 'up' }); H.coolUntil = now + 1200; H.trail = []; H.pinchSince = 0; return; }
        }
      }
    }

    // flat palm held up, fingers spread and still: focus mode (the ring fills over two seconds, so you can back out)
    const pts = H.trail.filter(p => now - p.t < 600);
    const still = pts.length >= 3 && Math.max(...pts.map(p => Math.hypot(p.x - pts[0].x, p.y - pts[0].y))) < 0.035;
    const allUp = up.every(Boolean) && d2(lm[4], lm[5]) > size * 0.7 && d2(lm[8], lm[20]) > size * 0.95;
    const upright = lm[8].y < lm[5].y - size * 0.45 && lm[12].y < lm[9].y - size * 0.45 && lm[20].y < lm[17].y - size * 0.25;
    if (hands.length === 1 && allUp && upright && still && !busy && now > H.coolUntil) {
      if (!H.palmSince) H.palmSince = now;
      const k = (now - H.palmSince) / 2000; ring.style.setProperty('--fp', String(Math.min(1, k))); ring.classList.add('palm');
      if (k >= 1) {
        H.palmSince = 0; ring.classList.remove('palm'); H.coolUntil = now + 3000;
        flash(Focus.state ? 'FOCUS OFF' : 'FOCUS · 25 MIN');
        (Focus.state ? call('focus-stop') : call('focus-start', { minutes: 25 })).catch(() => {});
        return;
      }
    } else if (H.palmSince) { H.palmSince = 0; ring.classList.remove('palm'); }

    H.pinchSince = pinchOn ? (H.pinchSince || now) : 0;
    // which screen is the hand pointing at?
    // Keep a grabbed suit tab on this controller until release, even below the main screen.
    const onDeck = V.h > innerHeight && vy > innerHeight && !window.__jarvisScreens?.isDragging();
    if (onDeck) {
      if (!H.onDeck) { H.onDeck = true; if (H.pinching) release(true); ring.classList.add('away'); if (ringOverTab) { ringOverTab = false; call('hands-ring', { show: false }).catch(() => {}); } }
      const k = DeckGeo.deck.w / innerWidth;
      remote({ visible: true, x: Math.round(vx * k), y: Math.round((vy - innerHeight) * k), pinch: pinchOn, open: openHand });
      return;
    }
    if (H.onDeck) { H.onDeck = false; ring.classList.remove('away'); remote({ visible: false }); }
    actuate(vx, vy, pinchOn, now, openHand);
  }

  /* The part that turns "the hand is here, pinching or not" into clicks and drags on this screen.
     The laptop screen calls it straight from the camera; the second screen calls it with what the laptop sends over. */
  function actuate(x, y, pinchOn, now, openHand) {
    if(H.pinching)window.__jarvisScreens?.move(x,y,now);
    if (H.pinching && H.lock) {
      // holding a click: the ring stays where you pinched, so the knuckles shifting as you pinch can't pull it off the suit.
      // Only a big move turns it into a drag (or, for a plain button, cancels the click).
      if (Math.hypot(x - H.downRawX, y - H.downRawY) > 130) { H.lock = false; H.dragged = true; }
      else { x = H.downX; y = H.downY; }
    } else if (H.pinching && H.inWeb && now - H.downAt < 260) { x = H.downX; y = H.downY; }
    H.rawX = x; H.rawY = y;
    const web = webUnder(x, y), overTab = !!web;
    const snap = !overTab && !(H.pinching && !H.lock) ? nearTarget(x, y) : null;
    H.x = H.pinching && H.lock ? H.downX : snap ? snap.x : x; H.y = H.pinching && H.lock ? H.downY : snap ? snap.y : y; H.snapEl = snap ? snap.el : H.snapEl && H.pinching ? H.snapEl : null;
    ringTo(H.x, H.y);
    ring.style.setProperty('--hx', accent());
    ring.classList.toggle('snap', !!snap);
    if (overTab || ringOverTab) { ringOverTab = overTab; call('hands-ring', { show: overTab, x: H.x, y: H.y, pinch: H.pinching }).catch(() => {}); }
    hover(H.x, H.y, web);
    if (pinchOn && !H.pinching && now > H.coolUntil) { H.dwell = null; ring.classList.remove('dwell'); press(web, x, y); }
    else if (!pinchOn && H.pinching) release();
    ring.classList.toggle('pinch', H.pinching);
    dwellTick(snap, now, openHand);
  }

  /* Hover to click: hold the ring still on a suit, tab or button for a moment and it clicks, with a ring that fills
     so you can see it coming. A fallback for when a pinch is hard to see (hand side-on, poor light). */
  const DWELL_MS = 1300;
  function dwellTick(snap, now, openHand) {
    if (!store.get('dwell', true) || H.pinching || !snap || !openHand || now < (H.dwellCool || 0)) { if (H.dwell) { H.dwell = null; ring.classList.remove('dwell'); } return; }
    const el = snap.el.closest(TARGETS) || snap.el;
    if (el.closest(DRAGGY) || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    if (H.dwellDone === el) return;   // already clicked this one: move off it first
    if (!H.dwell || H.dwell.el !== el || Math.hypot(H.rawX - H.dwell.x, H.rawY - H.dwell.y) > 26) { H.dwell = { el, t: now, x: H.rawX, y: H.rawY }; ring.classList.remove('dwell'); void ring.offsetWidth; ring.classList.add('dwell'); ring.style.setProperty('--dw', DWELL_MS + 'ms'); return; }
    if (now - H.dwell.t >= DWELL_MS) {
      H.dwellDone = el; H.dwell = null; ring.classList.remove('dwell'); H.dwellCool = now + 1500;
      el.click?.(); ring.classList.remove('clicked'); void ring.offsetWidth; ring.classList.add('clicked');
    }
  }
  setInterval(() => { if (H.dwellDone && (!H.snapEl || (H.snapEl.closest(TARGETS) || H.snapEl) !== H.dwellDone)) H.dwellDone = null; }, 300);

  /* ---------- the second screen */
  function remote(m) { call('hands-remote', m).catch(() => {}); }
  function flickDown() {
    if (!(DeckGeo.present && DeckGeo.side === 'below')) return false;   // one screen: a quick drag down is just a drag
    const tabEl = H.target && H.target.closest ? H.target.closest('[data-tab]') : null;
    const frame = H.target && H.target.closest ? H.target.closest('.hp') : null;
    const panelId = frame ? frame.dataset.id : H.inWeb && H.inWeb.kind === 'panel' ? H.inWeb.id : null;
    if (!panelId) return false; // suit tabs use deliberate hold, direction and release instead
    H.x = H.downX; H.y = H.downY; release(true);   // let go where it was picked up, so the strip doesn't also drop it
    flash('THROWN ↓');
    if (panelId) call('panel-throw', { id: panelId }).catch(e => toast(e.message || String(e)));
    else call('tabs-throw', { id: tabEl ? tabEl.dataset.tab : undefined }).catch(e => toast(e.message || String(e)));
    return true;
  }
  // on the second screen: the laptop's camera drives a ring here
  function onRemote(m) {
    if (!m) return;
    if (m.flick === 'up') {
      const frame = H.target && H.target.closest ? H.target.closest('.hp') : null;
      const id = frame ? frame.dataset.id : H.inWeb && H.inWeb.kind === 'panel' ? H.inWeb.id : Holo.under(H.x, H.y)?.id;
      if (H.pinching) release(true);
      if (id) { flash('THROWN ↑'); call('deck-send-up', { id }).catch(e => toast(e.message || String(e))); }
      return;
    }
    if (!m.visible) { ring.classList.add('lost'); if (H.pinching) release(true); if (ringOverTab) { ringOverTab = false; call('hands-ring', { show: false }).catch(() => {}); } return; }
    if (!ring.isConnected) document.body.appendChild(ring);
    ringLoop();
    ring.classList.remove('lost', 'away');
    actuate(clamp(m.x, 0, innerWidth - 1), clamp(m.y, 0, innerHeight - 1), !!m.pinch, performance.now(), m.open !== false);
  }
  try { J.on('deck', m => { if (m?.type === 'info') { Object.assign(DeckGeo, { present: !!m.present, side: m.side, main: m.main, deck: m.deck }); document.body.classList.toggle('deck-on', !!m.present); } }); } catch {}
  if (MAIN) call('deck-info').then(m => { if (m) { Object.assign(DeckGeo, { present: !!m.present, side: m.side, main: m.main, deck: m.deck }); document.body.classList.toggle('deck-on', !!m.present); } }).catch(() => {});
  else try { J.on('hands-remote', onRemote); } catch {}

  /* ---------- Calibrate: point at the top-left, then the bottom-right, and the reach box fits your arm */
  const Calib = {
    on: false, step: 0, el: null, samples: [], pts: [], wait: 0,
    start() {
      if (!H.on) startHands();
      this.on = true; this.step = 0; this.pts = []; this.samples = []; this.wait = 0;
      if (!this.el) { this.el = document.createElement('div'); this.el.className = 'hx-cal'; document.body.appendChild(this.el); }
      this.show();
      if (!this.keys) { this.keys = e => { if (this.on && e.key === 'Escape') { e.preventDefault(); this.stop(); } }; addEventListener('keydown', this.keys, true); }
    },
    show(hint) {
      const deck = DeckGeo.present && DeckGeo.side === 'below';
      const where = this.step === 0 ? 'TOP-LEFT corner of this screen' : deck ? 'BOTTOM-RIGHT corner of the lower screen' : 'BOTTOM-RIGHT corner of this screen';
      this.el.innerHTML = `<div class="hx-cal-card"><b>CALIBRATE HANDS · ${this.step + 1}/2</b><p>Sit how you normally sit. Hold an open hand where it feels comfortable for the <em>${where}</em>, and keep it still.</p><div class="hx-cal-bar"><i></i></div><p class="hx-cal-hint">${hint || ''}</p><button type="button" data-cal="cancel">Cancel</button><button type="button" data-cal="reset">Reset to default</button></div>
        <i class="hx-cal-dot ${this.step === 0 ? 'tl' : deck ? 'down' : 'br'}"></i>`;
      // buttons answer on press, not on click, so they work even when a hand-tracking event gets in between
      this.el.onpointerdown = e => { const b = e.target.closest('[data-cal]'); if (!b) return; e.preventDefault(); e.stopPropagation();
        if (b.dataset.cal === 'reset') { store.set('handBox', null); flash('REACH RESET'); toast('Hand reach is back to the default.'); } this.stop(); };
    },
    hint(t) { const h = this.el?.querySelector('.hx-cal-hint'); if (h && h.textContent !== t) h.textContent = t; },
    feed(lm, now) {
      const bar = this.el?.querySelector('.hx-cal-bar i'); if (!lm) { this.samples = []; if (bar) bar.style.width = '0%'; this.hint('I can\'t see your hand. Hold it up where the camera can see it.'); return; }
      if (now < this.wait) return;
      const a = mid(lm[5], lm[5], lm[9]); const p = { x: 1 - a.x, y: a.y, t: now };
      // the second corner has to be somewhere else: down and to the right of the first, not the same spot again
      if (this.step === 1) {
        const tl = this.pts[0], dx = p.x - tl.x, dy = p.y - tl.y;
        if (dx < 0.12 || dy < 0.1) { this.samples = []; if (bar) bar.style.width = '0%'; this.hint('Move your hand down and to the right.'); return; }
      }
      this.hint('');
      // judged over the last 1.5 s, so a slow camera (a frame every 200 ms) still gets there
      this.samples.push(p); while (this.samples.length && now - this.samples[0].t > 1500) this.samples.shift();
      const first = this.samples[0]; const moved = Math.max(...this.samples.map(s => Math.hypot(s.x - first.x, s.y - first.y)));
      const held = moved < 0.035 ? now - first.t : 0; if (bar) bar.style.width = Math.min(100, held / 850 * 100) + '%';
      if (held >= 850) {
        const avg = { x: this.samples.reduce((s, q) => s + q.x, 0) / this.samples.length, y: this.samples.reduce((s, q) => s + q.y, 0) / this.samples.length };
        this.pts.push(avg); this.samples = []; this.step++;
        if (this.step < 2) { flash('GOT IT'); this.wait = now + 700; this.show('Got it. Now move your hand down and to the right.'); return; }
        const [tl, br] = this.pts; const deck = DeckGeo.present && DeckGeo.side === 'below';
        let x0 = Math.min(tl.x, br.x), x1 = Math.max(tl.x, br.x), y0 = Math.min(tl.y, br.y), y1 = Math.max(tl.y, br.y);
        // never a box so small that a twitch throws the ring across the screen
        if (x1 - x0 < 0.3) { const c = (x0 + x1) / 2; x0 = c - 0.15; x1 = c + 0.15; } if (y1 - y0 < 0.24) { const c = (y0 + y1) / 2; y0 = c - 0.12; y1 = c + 0.12; }
        // near the edge of the camera, slide the box back in rather than cutting it (a cut box was too small and got ignored)
        if (x1 > 1) { x0 -= x1 - 1; x1 = 1; } if (x0 < 0) { x1 -= x0; x0 = 0; } if (y1 > 1) { y0 -= y1 - 1; y1 = 1; } if (y0 < 0) { y1 -= y0; y0 = 0; }
        const share = deck && DeckGeo.main && DeckGeo.deck ? DeckGeo.deck.h / (DeckGeo.main.h + DeckGeo.deck.h) : 0;
        store.set('handBox', { x0: clamp(x0, 0, 1), x1: clamp(x1, 0, 1), y0: clamp(y0, 0, 1), y1: clamp(y1, 0, 1), deck, share });
        flash('CALIBRATED'); this.stop();
      }
    },
    stop() { this.on = false; this.el?.remove(); this.el = null; },
  };
  window.__jarvisCalibrate = () => Calib.start();

  H.feed = r => onResults(r);
  window.__jarvisHands = H;   // lets a recorded set of hand points be replayed through the same rules

  function drawPip(r) {
    if (!pip.isConnected) return;
    const c = pip.getContext('2d'); const W = pip.width, Hh = pip.height;
    c.save(); c.translate(W, 0); c.scale(-1, 1);
    if (r.image) c.drawImage(r.image, 0, 0, W, Hh);
    c.fillStyle = 'rgba(3,8,12,.35)'; c.fillRect(0, 0, W, Hh);
    const col = accent();
    const bones = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    for (const lm of r.multiHandLandmarks || []) {
      c.strokeStyle = col; c.lineWidth = 2; c.shadowColor = col; c.shadowBlur = 6;
      for (const [a, b] of bones) { c.beginPath(); c.moveTo(lm[a].x * W, lm[a].y * Hh); c.lineTo(lm[b].x * W, lm[b].y * Hh); c.stroke(); }
      c.fillStyle = '#fff'; for (const p of lm) { c.beginPath(); c.arc(p.x * W, p.y * Hh, 2.2, 0, 7); c.fill(); }
    }
    c.restore();
    // where your hand needs to be to cover the screen(s), and what JARVIS thinks your hand is doing
    const b = H.box || reachBox(H.rightHand);
    c.strokeStyle = 'rgba(255,255,255,.3)'; c.setLineDash([4, 4]); c.strokeRect(W * b.x0, Hh * b.y0, W * (b.x1 - b.x0), Hh * (b.y1 - b.y0)); c.setLineDash([]);
    if (DeckGeo.present && DeckGeo.side === 'below' && DeckGeo.main && DeckGeo.deck) { const split = b.y0 + (b.y1 - b.y0) * DeckGeo.main.h / (DeckGeo.main.h + DeckGeo.deck.h * DeckGeo.main.w / DeckGeo.deck.w); c.strokeStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.moveTo(W * b.x0, Hh * split); c.lineTo(W * b.x1, Hh * split); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.75)'; c.font = '10px Consolas,monospace';
    const lm = (r.multiHandLandmarks || [])[0];
    const state = !lm ? 'NO HAND' : H.pinching ? 'PINCH' : H.pinchRatio != null && H.pinchRatio < 0.56 ? 'ALMOST' : 'OPEN';
    c.fillText(`${(H.fpsT || []).length} FPS${H.lite ? ' · LITE' : ''}${H.mode === 'worker' && H.maxHands === 1 ? ' · 1 HAND' : ''}${H.mode === 'local' ? ' · OLD TRACKER' : ''} · ${state}${H.onDeck ? ' · LOWER SCREEN' : ''}`, 8, Hh - 8);
  }

  /* ---------- turning hand movement into ordinary pointer events, so every screen just works */
  function at(x, y) {
    ring.style.visibility = 'hidden';
    const el = document.elementFromPoint(x, y);
    ring.style.visibility = '';
    return el;
  }
  function fire(el, type, x, y, buttons) {
    if (!el) return;
    const o = { bubbles: !/enter|leave/.test(type), cancelable: true, composed: true, clientX: x, clientY: y,
      screenX: (window.screenX || 0) + x, screenY: (window.screenY || 0) + y, button: 0, buttons, view: window };
    el.dispatchEvent(type.startsWith('pointer') ? new PointerEvent(type, { ...o, pointerId: 77, pointerType: 'mouse', isPrimary: true }) : new MouseEvent(type, o));
  }
  function chain(el) { const out = []; for (let e = el; e && e !== document.documentElement; e = e.parentElement) out.push(e); return out; }
  function hover(x, y, web) {
    if (web) webCall(web, 'move', x, y);
    const el = at(x, y); const next = chain(el);
    for (const e of H.hoverChain) if (!next.includes(e)) { fire(e, 'pointerleave', x, y, 0); fire(e, 'mouseleave', x, y, 0); }
    for (const e of next.slice().reverse()) if (!H.hoverChain.includes(e)) { fire(e, 'pointerenter', x, y, 0); fire(e, 'mouseenter', x, y, 0); }
    if (el !== H.hoverChain[0]) { fire(el, 'pointerover', x, y, 0); fire(el, 'mouseover', x, y, 0); }
    H.hoverChain = next;
    fire(el, 'pointermove', x, y, H.pinching ? 1 : 0); fire(el, 'mousemove', x, y, H.pinching ? 1 : 0);
  }
  function press(web, rawX, rawY) {
    H.pinching = true; H.downAt = performance.now(); H.downX = H.x; H.downY = H.y; H.downRawX = rawX ?? H.x; H.downRawY = rawY ?? H.y; H.inWeb = web || null; H.dragged = false;
    if (web) { webCall(web, 'down', H.x, H.y); H.target = null; H.lock = false; return; }
    H.target = H.snapEl || at(H.x, H.y);
    const grabbed=MAIN&&H.target?.closest?.('.ws-tab[data-tab]');if(grabbed)window.__jarvisScreens?.grab(grabbed.dataset.tab,H.x,H.y,H.downAt);
    // a click target holds the ring still; something you drag lets it follow the hand
    H.lock = !!H.target && !(H.target.closest && H.target.closest(DRAGGY));
    fire(H.target, 'pointerdown', H.x, H.y, 1); fire(H.target, 'mousedown', H.x, H.y, 1);
    if (H.target && /^(INPUT|TEXTAREA|SELECT)$/.test(H.target.tagName)) H.target.focus();
  }
  function release(silent) {
    if(window.__jarvisScreens?.release(silent))silent=true;
    if (H.inWeb) {
      webCall(H.inWeb, 'up', H.x, H.y);
      H.pinching = false; H.inWeb = null; H.lock = false; ring.classList.remove('pinch'); return;
    }
    const el = at(H.x, H.y) || H.target;
    fire(el, 'pointerup', H.x, H.y, 0); fire(el, 'mouseup', H.x, H.y, 0);
    const moved = Math.hypot(H.x - H.downX, H.y - H.downY);
    const clickable = H.target && (H.lock ? !H.dragged : moved < 44);
    if (!silent && clickable && performance.now() - H.downAt < 2500) {
      const t = H.target.closest(TARGETS) || H.target;
      t.click?.(); H.dwellCool = performance.now() + 1200;
      ring.classList.remove('clicked'); void ring.offsetWidth; ring.classList.add('clicked');
    }
    H.pinching = false; H.target = null; H.lock = false; ring.classList.remove('pinch');
  }

  function swipeHall(dir) {
    if (window.__jarvisGlobe?.isOpen) { flash(dir > 0 ? 'SPIN ›' : '‹ SPIN'); window.__jarvisGlobe.swipe(dir > 0 ? -1 : 1); return; }   // on the earth, a swipe spins the globe
    const i = HALLS.indexOf(hall()); const next = HALLS[(i + dir + HALLS.length) % HALLS.length];
    flash(dir > 0 ? 'NEXT HALL ›' : '‹ PREVIOUS HALL');
    if (Room.open) Room.close();
    call('action', { action: 'theme', id: next, fast: true }).catch(() => {});
    for (const t of [350, 900, 1600]) setTimeout(() => call('action', { action: 'skip' }).catch(() => {}), t);
  }

  function scrollAt(dir) {   // dir 1 = scroll down (hand moved up)
    if (window.__jarvisGlobe?.isOpen) { flash(dir > 0 ? 'ZOOM IN' : 'ZOOM OUT'); window.__jarvisGlobe.zoomBy(dir > 0 ? 1.7 : 1 / 1.7); return; }
    flash(dir > 0 ? 'SCROLL ↓' : 'SCROLL ↑');
    const amount = dir * Math.round(innerHeight * 0.6);
    const web = webUnder(H.x, H.y);
    if (web && web.kind === 'panel') { call('panel-scroll', { dy: amount, x: H.x, y: H.y }).catch(() => {}); return; }
    if (web) { call('tabs-scroll', { dy: amount, x: H.x, y: H.y }).catch(() => {}); return; }
    let el = at(H.x, H.y);
    for (; el && el !== document.body; el = el.parentElement) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 4) { el.scrollBy({ top: amount, behavior: 'smooth' }); return; }
    }
    call('tabs-scroll', { dy: amount }).catch(() => {});
  }

  /* ---------- the HANDS toggle beside VOICE */
  const toggle = document.createElement('button');
  toggle.type = 'button'; toggle.className = 'theme-chip hx-toggle';
  toggle.addEventListener('click', e => { e.stopPropagation(); H.on ? stopHands() : startHands(); });
  function syncToggle() {
    toggle.classList.toggle('on', H.on); toggle.classList.toggle('off', !H.on);
    toggle.title = H.on ? 'Hand control on (tap to stop the camera)' : 'Hand control off (tap to use the camera)';
    toggle.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5V4a1.5 1.5 0 0 1 3 0v7m0-5.5a1.5 1.5 0 0 1 3 0V12m0-3.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.2a6 6 0 0 1-4.6-2.2L4.3 15a1.6 1.6 0 0 1 2.4-2.1L8 14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>${H.on ? '' : '<path d="M3 3l18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'}</svg><span>${H.on ? 'HANDS ON' : 'HANDS OFF'}</span>`;
  }
  syncToggle();
  // the little ⚙ beside HANDS ON: calibrate your reach, hover-to-click, the camera preview
  const hset = document.createElement('button'); hset.type = 'button'; hset.className = 'theme-chip hx-set'; hset.title = 'Hand settings'; hset.setAttribute('aria-label', 'Hand settings'); hset.textContent = '⚙';
  hset.addEventListener('click', e => { e.stopPropagation(); handMenu(); });
  function handMenu() {
    document.querySelector('.hx-menu')?.remove();
    const m = document.createElement('div'); m.className = 'hx-menu';
    const r = hset.getBoundingClientRect(); m.style.left = Math.round(r.left) + 'px'; m.style.bottom = Math.round(innerHeight - r.top + 10) + 'px';
    m.innerHTML = `<button type="button" data-hm="cal">🎯 Calibrate my reach</button><button type="button" data-hm="dwell">${store.get('dwell', true) ? '✓' : '○'} Hover to click (hold still 1.3 s)</button><button type="button" data-hm="pip">${pip.classList.contains('mini') ? '○' : '✓'} Camera preview</button><button type="button" data-hm="guide">✋ Hand gesture guide</button>`;
    m.addEventListener('click', e => { const b = e.target.closest('[data-hm]'); if (!b) return; e.stopPropagation(); const k = b.dataset.hm; m.remove();
      if (k === 'cal') Calib.start(); else if (k === 'dwell') { store.set('dwell', !store.get('dwell', true)); flash(store.get('dwell', true) ? 'HOVER-CLICK ON' : 'HOVER-CLICK OFF'); }
      else if (k === 'pip') { pip.classList.toggle('mini'); store.set('pipMini', pip.classList.contains('mini')); } else if (k === 'guide') guide(); });
    document.body.appendChild(m); setTimeout(() => addEventListener('click', () => m.remove(), { once: true }), 50);
  }
  function guide() {
    window.__jarvisGestureGuide?.show().catch(e => toast(e.message || 'Could not open the gesture guide.'));
  }

  function toast(msg) {
    const t = document.createElement('div'); t.className = 'hx-toast'; t.textContent = msg; document.body.appendChild(t);
    setTimeout(() => t.classList.add('out'), 3200); setTimeout(() => t.remove(), 3800);
  }

  /* =================================================================== PARTICLE CORE (shared) */
  // A sphere of points that turns, breathes, and swells while the assistant is talking.
  function makeCore(cv, opts) {
    const c = cv.getContext('2d');
    const N = 2600, pts = [];
    for (let i = 0; i < N; i++) { const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.399963; pts.push([Math.cos(th) * r, y, Math.sin(th) * r, Math.random()]); }
    let rot = 0, lvl = 0, t0 = performance.now(), raf = 0, live = true;
    const frame = now => {
      if (!live) return;
      const o = opts();
      const dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, Hh = cv.clientHeight;
      if (!W || !Hh) { raf = requestAnimationFrame(frame); return; }
      if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, Hh);
      const t = (now - t0) / 1000;
      const talkLvl = speakingUntil > now ? 0.35 + 0.35 * Math.abs(Math.sin(t * 7.3) * Math.sin(t * 2.1 + 1)) : 0;
      lvl += (Math.max(voiceLevel, talkLvl) - lvl) * 0.15; rot += 0.0035 + lvl * 0.02;
      const cx = o.cx != null ? o.cx : W / 2, cy = o.cy != null ? o.cy : Hh / 2;
      const R = Math.min(W, Hh) * (o.size || 0.17) * (o.zoom || 1) * (1 + Math.sin(t * 1.4) * 0.02 + lvl * 0.25);
      const col = accent();
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, R * 1.7); g.addColorStop(0, col + '55'); g.addColorStop(0.45, col + '1c'); g.addColorStop(1, col + '00');
      c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 1.7, 0, 7); c.fill();
      c.globalCompositeOperation = 'lighter';
      c.strokeStyle = col; c.lineWidth = 1;
      for (const [k, a] of [[1.28, 0.28], [1.42, 0.14]]) { c.globalAlpha = a + lvl * 0.3; c.beginPath(); c.ellipse(cx, cy, R * k, R * k * 0.3, -0.18, rot * (k > 1.3 ? -1 : 1), rot * (k > 1.3 ? -1 : 1) + 4.6); c.stroke(); }
      const cs = Math.cos(rot), sn = Math.sin(rot), tilt = 0.35, ct = Math.cos(tilt), st = Math.sin(tilt);
      for (const [x, y, z, w] of pts) {
        const jit = 1 + lvl * 0.35 * Math.sin(t * 9 + w * 40);
        let X = x * cs - z * sn, Z = x * sn + z * cs, Y = y * ct - Z * st; Z = y * st + Z * ct;
        const p = 2.4 / (2.4 + Z), px = cx + X * R * jit * p, py = cy + Y * R * jit * p;
        c.globalAlpha = clamp(0.25 + (1 - Z) * 0.45, 0.08, 1);
        c.fillStyle = w > 0.93 ? '#ffffff' : col;
        const s = (w > 0.93 ? 2.4 : 1.5) * p; c.fillRect(px - s / 2, py - s / 2, s, s);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return { stop() { live = false; cancelAnimationFrame(raf); } };
  }
  let speakingUntil = 0;   // set while a caption is on screen, so the core "talks" along

  /* =================================================================== CAPTIONS */
  // Every line the assistant says also appears as a caption, the way the videos show it.
  const capEl = document.createElement('div'); capEl.className = 'jv-caption';
  let capTimer = 0;
  function caption(text, who) {
    if (!text) return;
    if (!capEl.isConnected) document.body.appendChild(capEl);
    const ms = clamp(text.length * 70, 1800, 30000);
    speakingUntil = performance.now() + ms;
    capEl.innerHTML = `<b>${esc(who || ASSIST[hall()] || 'J.A.R.V.I.S.')}</b><span></span>`;
    capEl.style.setProperty('--hx', accent());
    capEl.classList.remove('out'); capEl.classList.add('in');
    // sentence by sentence, roughly in time with the voice
    const parts = String(text).match(/[^.!?]+[.!?]*/g) || [text];
    const span = capEl.querySelector('span'); let i = 0, t = 0;
    clearTimeout(capTimer);
    const next = () => { if (i >= parts.length) { capTimer = setTimeout(() => capEl.classList.add('out'), 900); return; }
      const s = parts[i++].trim(); span.textContent = s; capTimer = setTimeout(next, clamp(s.length * 70, 1100, 9000)); };
    next();
  }
  try { J.on('caption', m => MAIN && caption(m?.text, m?.who)); } catch {}

  /* What the microphone heard, for a moment, so you can see why a command did or didn't work */
  const heardEl = document.createElement('div'); heardEl.className = 'jv-heard'; let heardT = 0;
  function showHeard(h) {
    if (!MAIN || !h || !h.text || h.why === 'own-voice') return;
    const t = String(h.text).toLowerCase(), name = String(h.name || 'jarvis').toLowerCase();
    const commandish = t.includes(name) || /^(open|show|close|go|take|run|start|launch|fly|zoom|where|search|note|focus|status)\b/.test(t);
    let cls, msg;
    if (h.handled) { cls = 'ok'; msg = `✓ “${h.text}”`; }
    else if (!commandish) return;   // everyday talk: stay quiet
    else if (h.why === 'no-match' && !t.includes(name)) { cls = 'warn'; msg = `Heard “${h.text}” — start with “${h.name}”`; }
    else if (h.why === 'no-match') { cls = 'warn'; msg = `Heard “${h.text}” — that's not a command I know`; }
    else if (h.why === 'unsure') { cls = 'warn'; msg = `Not sure I got “${h.text}” — say it again a little louder`; }
    else { cls = 'dim'; msg = `Didn't catch that`; }
    heardEl.className = 'jv-heard in ' + cls; heardEl.textContent = '🎙 ' + msg + (h.confidence && !h.handled ? `  · ${h.confidence}%` : '');
    if (!heardEl.isConnected) document.body.appendChild(heardEl);
    clearTimeout(heardT); heardT = setTimeout(() => heardEl.classList.remove('in'), h.handled ? 1800 : 3400);
  }
  try { J.on('heard', showHeard); } catch {}

  /* =================================================================== HOLO PANELS */
  // Real web pages in glass frames: drag them by the bar, resize from the corner, with a mouse or a pinch.
  const Holo = {
    panels: new Map(), layer: null, z: 10,
    ensure() {
      if (this.layer && this.layer.isConnected) return this.layer;
      this.layer = document.createElement('div'); this.layer.className = 'hp-layer'; document.body.appendChild(this.layer); return this.layer;
    },
    defaultRect(i = 0) {
      const w = Math.round(innerWidth * 0.46), h = Math.round(innerHeight * 0.58);
      return { x: Math.round((innerWidth - w) / 2 + (i % 5) * 34 - 60), y: Math.round((innerHeight - h) / 2 + (i % 5) * 28 - 40), w, h };
    },
    visibleIn(scope) { return scope === 'ideas' ? Room.open : true; },
    async open({ id, url, title = '', scope = 'hall', rect } = {}) {
      if (!/^https?:\/\//i.test(String(url || ''))) { toast('Type a web address starting with https://'); return null; }
      if (id && this.opening?.has(id)) return null; const have = id && this.panels.get(id);
      if (have) { have.url = url; have.title = title || have.title; this.label(have); this.front(have); await call('panel-open', { id, url, rect: this.bodyRect(have) }).catch(e => toast(e.message)); return have; }
      const r0 = rect || this.defaultRect(this.panels.size); const r = this.fitRect(r0.x, r0.y, r0.w, r0.h);
      const el = document.createElement('div'); el.className = 'hp'; el.style.setProperty('--hx', accent());
      el.innerHTML = `<header class="hp-bar"><i class="hp-dot"></i><b></b><span class="hp-url"></span>
        <nav><button type="button" data-hp="back" title="Back">‹</button><button type="button" data-hp="reload" title="Reload">⟳</button><button type="button" data-hp="throw" class="hp-throw" title="${MAIN ? 'Send to the lower screen (or pinch and flick down)' : 'Send back up (or pinch and flick up)'}">${MAIN ? '⤓' : '⤒'}</button><button type="button" data-hp="external" title="Open in your browser">↗</button><button type="button" data-hp="close" title="Close">×</button></nav></header>
        <div class="hp-body"><span>Loading…</span></div><i class="hp-grip" title="Drag to resize"></i>`;
      Object.assign(el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' });
      this.ensure().appendChild(el);
      const p = { id: id || null, el, url, title, scope };
      this.label(p); this.front(p, true);
      el.addEventListener('pointerdown', e => this.down(p, e));
      el.addEventListener('click', e => { const b = e.target.closest('[data-hp]'); if (!b) return; e.stopPropagation(); this.button(p, b.dataset.hp); });
      if (id) (this.opening ||= new Set()).add(id);
      try { p.id = await call('panel-open', { id: id || undefined, url, rect: this.bodyRect(p) }); }
      catch (e) { el.remove(); toast(e.message || String(e)); return null; }
      finally { if (id) this.opening.delete(id); }
      el.dataset.id = p.id; this.panels.set(p.id, p);
      if (!this.visibleIn(scope)) this.hideOne(p, true);
      if (scope === 'ideas') this.save();
      return p;
    },
    label(p) {
      p.el.querySelector('b').textContent = p.title || (() => { try { return new URL(p.url).hostname.replace(/^www\./, ''); } catch { return 'Page'; } })();
      p.el.querySelector('.hp-url').textContent = (p.url || '').replace(/^https?:\/\//, '').slice(0, 80);
    },
    // layout box, not the on-screen box: ignores the open/close animation's scale so the page lands exactly in the frame
    bodyRect(p) { const el = p.el, b = el.querySelector('.hp-body'); return { x: el.offsetLeft + el.clientLeft + b.offsetLeft, y: el.offsetTop + el.clientTop + b.offsetTop, width: b.offsetWidth, height: b.offsetHeight }; },
    sync(p) {
      if (p.syncing) return; p.syncing = true;
      requestAnimationFrame(() => { p.syncing = false; if (p.id && !p.el.hidden) call('panel-place', { id: p.id, rect: this.bodyRect(p) }).catch(() => {}); });
    },
    front(p, local) { p.el.style.zIndex = String(++this.z); if (!local && p.id) call('panel-front', p.id).catch(() => {}); },
    down(p, e) {
      if (e.button !== 0 || e.target.closest('[data-hp]')) return;
      const grip = e.target.closest('.hp-grip'), bar = e.target.closest('.hp-bar');
      this.front(p);
      if (!grip && !bar) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, r = p.el.getBoundingClientRect();
      p.el.classList.add(grip ? 'sizing' : 'moving');
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (grip) { p.el.style.width = clamp(r.width + dx, 320, innerWidth - r.left - 4) + 'px'; p.el.style.height = clamp(r.height + dy, 220, innerHeight - r.top - 4) + 'px'; }
        else { p.el.style.left = clamp(r.left + dx, -r.width + 120, innerWidth - 120) + 'px'; p.el.style.top = clamp(r.top + dy, 0, innerHeight - 60) + 'px'; }
        this.sync(p);
      };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); p.el.classList.remove('sizing', 'moving'); this.sync(p); if (p.scope === 'ideas') this.save(); };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    },
    button(p, k) {
      if (k === 'close') return this.close(p);
      if (k === 'throw') return call(MAIN ? 'panel-throw' : 'deck-send-up', { id: p.id }).catch(e => toast(e.message || String(e)));
      call('panel-nav', { id: p.id, command: k }).catch(() => {});
    },
    close(p) {
      if (!p) return; this.panels.delete(p.id); p.el.remove(); call('panel-close', p.id).catch(() => {});
      if (p.scope === 'ideas') this.save();
    },
    /** the page has gone to the other screen: drop the frame here without closing the page */
    forget(id) { const p = this.panels.get(id); if (!p) return; this.panels.delete(id); p.el.remove(); if (p.scope === 'ideas') this.save(); },
    closeHolograms() {
      const seen = [...this.panels.values()].filter(p => !p.el.hidden);
      const holo = seen.filter(p => /^holo-/.test(p.id));
      if (holo.length) return holo.forEach(p => this.close(p));
      const front = seen.sort((a, b) => (Number(b.el.style.zIndex) || 0) - (Number(a.el.style.zIndex) || 0))[0];   // "close that": the page in front
      if (front) this.close(front);
    },
    closeAllVisible() { [...this.panels.values()].filter(p => !p.el.hidden).forEach(p => this.close(p)); },
    hideOne(p, hide) { p.el.hidden = hide; call('panel-show', { id: p.id, show: !hide }).catch(() => {}); if (!hide) this.sync(p); },
    showScope(scope, show) { for (const p of this.panels.values()) if (p.scope === scope) this.hideOne(p, !show); },
    pauseAll(pause) { for (const p of this.panels.values()) if (!p.el.hidden) call('panel-show', { id: p.id, show: !pause }).catch(() => {}); },
    save() {
      // read the frame's own position, not its on-screen box: a hidden frame measures 0 × 0, and saving that
      // shrank Ideas-room pages to a tiny corner with no title bar (so no ×) the next time the room opened
      const num = (v, d) => { const n = parseFloat(v); return Number.isFinite(n) ? Math.round(n) : d; };
      const list = [...this.panels.values()].filter(p => p.scope === 'ideas').map(p => {
        const st = p.el.style, r = p.el.hidden ? null : p.el.getBoundingClientRect();
        return { id: p.id, url: p.url, title: p.title, x: num(st.left, r ? Math.round(r.left) : 80), y: num(st.top, r ? Math.round(r.top) : 80), w: num(st.width, r ? Math.round(r.width) : 720), h: num(st.height, r ? Math.round(r.height) : 480) };
      });
      store.set('ixPanels', list);
    },
    /** keep a frame big enough to use and its title bar on screen */
    fitRect(x, y, w, h) {
      w = clamp(Number(w) || 720, 360, innerWidth - 20); h = clamp(Number(h) || 480, 240, innerHeight - 20);
      return { x: clamp(Number(x) || 60, -(w - 180), innerWidth - 180), y: clamp(Number(y) || 60, 0, innerHeight - 80), w, h };
    },
    async restoreIdeas() {
      const list = store.get('ixPanels', []);
      for (const s of Array.isArray(list) ? list : []) {
        const have = this.panels.get(s.id);
        if (have) { const st = have.el.style, f = this.fitRect(parseFloat(st.left), parseFloat(st.top), parseFloat(st.width), parseFloat(st.height)); Object.assign(st, { left: f.x + 'px', top: f.y + 'px', width: f.w + 'px', height: f.h + 'px' }); this.hideOne(have, false); continue; }
        await this.open({ id: s.id, url: s.url, title: s.title, scope: 'ideas', rect: this.fitRect(s.x, s.y, s.w, s.h) });
      }
    },
    /** the top panel whose page is under a screen point (for hand control) */
    under(x, y) {
      let best = null, bz = -1;
      for (const p of this.panels.values()) {
        if (p.el.hidden) continue;
        const r = this.bodyRect(p);
        if (x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) { const z = Number(p.el.style.zIndex) || 0; if (z > bz) { bz = z; best = p; } }
      }
      return best;
    },
    overFrame(x, y) { for (const p of this.panels.values()) { if (p.el.hidden) continue; const r = p.el.getBoundingClientRect(); if (x >= r.left && x < r.right && y >= r.top && y < r.bottom) return true; } return false; },
  };
  try { J.on('panels', list => { if (!MAIN) return; for (const it of list || []) { const p = Holo.panels.get(it.id); if (!p) continue; if (it.title) p.title = it.title; if (it.url) p.url = it.url; Holo.label(p); } if ([...Holo.panels.values()].some(p => p.scope === 'ideas')) Holo.save(); }); } catch {}
  try {
    J.on('hologram', m => {
      if (!m || !MAIN) return;
      if (m.kind === 'close') return Holo.closeHolograms();
      if (m.kind === 'close-all') return Holo.closeAllVisible();
      if (m.kind === 'gone') return Holo.forget(m.id);
      if (m.kind === 'adopted') return Holo.open({ id: m.id, url: m.url, title: m.title, scope: Room.open ? 'ideas' : 'hall' });
      if (m.kind === 'calibrate') return Calib.start();
      const scope = Room.open ? 'ideas' : 'hall';
      Holo.open({ id: 'holo-' + m.kind, url: m.url, title: m.title, scope });
    });
  } catch {}
  addEventListener('resize', () => { for (const p of Holo.panels.values()) Holo.sync(p); });

  /* =================================================================== BRIEFING */
  // "Good morning, Jarvis" / "What's on the calendar today?" / "Status report": the day at a glance.
  const Brief = {
    el: null, core: null, timer: 0,
    show(d) {
      this.close(true);
      const el = document.createElement('section'); el.className = 'bf ' + (d.mode === 'status' ? 'bf-status' : ''); el.style.setProperty('--ix', accent());
      const ev = d.events || [], bays = d.bays || [], ideas = d.ideas || [], todos = d.todos || [];
      const st = { running: 'RUNNING', done: 'DONE', blocked: 'NEEDS YOU', idle: 'IDLE', queued: 'QUEUED' };
      el.innerHTML = `
        <canvas class="bf-core"></canvas>
        <header class="bf-head"><p>${esc(d.mode === 'status' ? 'STATUS REPORT' : 'DAILY BRIEFING')} · ${esc(d.date || '')} · ${esc(d.time || '')}</p><h2>${esc(d.greeting || '')}</h2>${d.weather ? `<p class="bf-wx"><b>${esc(d.weather.temp)}°</b> ${esc(d.weather.words || '')}${d.weather.place ? ' · ' + esc(d.weather.place) : ''}${Number.isFinite(d.weather.wind) ? ' · WIND ' + esc(d.weather.wind) + ' KM/H' : ''}</p>` : ''}<button type="button" class="bf-x" title="Close (Esc)">×</button></header>
        <div class="bf-name">${esc(ASSIST[hall()] || d.assistant || 'J.A.R.V.I.S.')}</div>
        <article class="bf-card bf-cal"><h4>TODAY <em>${ev.length}</em></h4>${ev.length ? `<ul>${ev.map(e => `<li class="${e.past ? 'past' : ''}"><time>${esc(e.time)}</time><span>${esc(e.title)}</span></li>`).join('')}</ul>` : '<p class="bf-empty">Your calendar is clear.</p>'}</article>
        <article class="bf-card bf-todo"><h4>TO-DO <em>${d.todoCount || 0}</em></h4>${todos.length ? `<ul>${todos.map(t => `<li><i></i><span>${esc(t)}</span></li>`).join('')}</ul>` : '<p class="bf-empty">Nothing on the list.</p>'}</article>
        <article class="bf-card bf-suits"><h4>SUITS <em>${bays.filter(b => b.status === 'running').length} RUNNING</em></h4><ul>${bays.map(b => `<li class="s-${esc(b.status)}"><span>${esc(b.name)}</span><div class="bf-bar"><i style="width:${clamp(b.progress, 0, 100)}%"></i></div><small>${st[b.status] || esc(String(b.status || '').toUpperCase())}${b.progress ? ' · ' + b.progress + '%' : ''}${b.lastAgo ? ' · USED ' + esc(String(b.lastAgo).toUpperCase()) : ''}</small></li>`).join('')}</ul></article>
        <article class="bf-card bf-ideas"><h4>IDEAS</h4>${ideas.length ? `<ul>${ideas.map(i => `<li><span>${esc(i.title)}</span><div class="bf-bar"><i style="width:${clamp(i.progress, 0, 100)}%"></i></div><small>${esc(String(i.stage).toUpperCase())} · ${i.progress}%</small></li>`).join('')}</ul>` : '<p class="bf-empty">No ideas yet. Open the lightbulb to add one.</p>'}</article>
        ${d.tower && d.tower.today && d.tower.today.length ? `<article class="bf-card bf-tower"><h4>${esc(String(d.tower.name || 'THE TOWER').toUpperCase())} · TODAY <em>${d.tower.today.length}</em></h4><ul>${d.tower.today.map(t => `<li class="t-${esc(t.status)}"><span>${t.scheduled ? '🌙 ' : ''}${esc(t.floor)}: ${esc(t.title)}</span><small>${esc(String(t.status).toUpperCase())}${t.approvals ? ' · ' + t.approvals + ' TO APPROVE' : ''}</small></li>`).join('')}</ul></article>` : ''}
        <footer class="bf-sys"><span>CPU <b>${d.system?.cpu ?? '—'}%</b></span><span>MEMORY <b>${d.system?.ram ?? '—'}%</b></span><span>SUITS <b>${bays.length}</b></span><span>OPEN TASKS <b>${d.todoCount || 0}</b></span></footer>`;
      document.body.appendChild(el); this.el = el;
      Holo.pauseAll(true);
      requestAnimationFrame(() => el.classList.add('in'));
      this.core = makeCore(el.querySelector('.bf-core'), () => ({ size: 0.2 }));
      el.addEventListener('click', e => { if (e.target.closest('.bf-x') || !e.target.closest('.bf-card,.bf-head')) this.close(); });
      caption(d.spoken, ASSIST[hall()]);
      clearTimeout(this.timer); this.timer = setTimeout(() => this.close(), clamp((d.spoken || '').length * 70 + 9000, 15000, 60000));
    },
    close(quick) {
      clearTimeout(this.timer);
      if (!this.el) return; const el = this.el; this.el = null; this.core?.stop(); this.core = null;
      Holo.pauseAll(false);
      if (quick) el.remove(); else { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }
    },
  };
  try { J.on('briefing', d => MAIN && d && Brief.show(d)); } catch {}
  addEventListener('keydown', e => { if (e.key === 'Escape' && Brief.el) Brief.close(); });

  /* =================================================================== FOCUS MODE */
  // Flat palm held up (or "Jarvis, focus mode"): notifications pause, a countdown runs on the second
  // screen, and when time's up JARVIS brings back the suit you were in.
  const Focus = {
    state: null, el: null, tick: 0, single: true,
    async init() {
      try { const b = await call('bootstrap'); this.single = b.single !== false; } catch {}
      try { J.on('focus', f => this.apply(f)); } catch {}
      try { this.apply(await call('focus-state')); } catch {}
    },
    apply(f) {
      this.state = f && f.active ? f : null;
      if (f && f.ended) this.flashEnd();
      this.render();
    },
    render() {
      const big = VIEW === 'console' || (VIEW === 'main' && this.single);
      if (!this.state) { this.el?.remove(); this.el = null; clearInterval(this.tick); return; }
      if (!this.el) {
        this.el = document.createElement('div'); this.el.className = 'fx ' + (VIEW === 'console' ? 'fx-full' : big ? 'fx-card' : 'fx-pill');
        this.el.innerHTML = VIEW === 'console' || big
          ? `<svg class="fx-ring" viewBox="0 0 200 200"><circle cx="100" cy="100" r="88"/><circle class="fx-arc" cx="100" cy="100" r="88"/></svg><p class="fx-k">FOCUS MODE</p><b class="fx-t">--:--</b><p class="fx-s"></p><nav><button type="button" data-fx="-5">−5</button><button type="button" data-fx="stop">Stop</button><button type="button" data-fx="5">+5</button></nav>`
          : `<i></i><span>FOCUS</span><b class="fx-t">--:--</b><button type="button" data-fx="stop" title="Stop focus">■</button>`;
        this.el.addEventListener('click', e => { const b = e.target.closest('[data-fx]'); if (!b) return; e.stopPropagation(); const k = b.dataset.fx; if (k === 'stop') call('focus-stop').catch(() => {}); else call('focus-add', Number(k)).catch(() => {}); });
        document.body.appendChild(this.el);
      }
      this.el.style.setProperty('--hx', accent());
      const s = this.el.querySelector('.fx-s'); if (s) s.textContent = this.state.suit ? `${this.state.suit} comes back when time's up` : 'Everything else is on hold';
      clearInterval(this.tick); const upd = () => {
        if (!this.state) return; const left = Math.max(0, this.state.until - Date.now());
        const m = Math.floor(left / 60000), sec = Math.floor(left / 1000) % 60;
        this.el.querySelector('.fx-t').textContent = `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
        const arc = this.el.querySelector('.fx-arc'); if (arc) { const tot = Math.max(1, this.state.minutes * 60000); arc.style.strokeDashoffset = String(553 * (1 - left / tot)); }
      };
      upd(); this.tick = setInterval(upd, 1000);
    },
    flashEnd() {
      const d = document.createElement('div'); d.className = 'fx-end'; d.style.setProperty('--hx', accent()); d.innerHTML = `<b>TIME'S UP</b>`;
      document.body.appendChild(d); setTimeout(() => d.classList.add('out'), 2600); setTimeout(() => d.remove(), 3400);
    },
  };

  /* =================================================================== WHERE WAS I? */
  // Opening a suit shows a one-line recap of your last visit, and a note you can leave for next time.
  const Recap = {
    last: null,
    show(r) {
      if (!r) return; this.last = r;
      let tries = 0;
      const put = () => {
        const bar = document.querySelector('.workstation .ws-bar');
        if (!bar) { if (++tries < 40) setTimeout(put, 150); return; }
        let el = bar.parentElement.querySelector('.ws-recap');
        if (!el) { el = document.createElement('div'); el.className = 'ws-recap'; bar.insertAdjacentElement('afterend', el); }
        el.style.setProperty('--hx', accent());
        el.innerHTML = `<span class="wr-k">↺ WHERE YOU WERE</span><span class="wr-line">${esc(r.line || (r.first ? 'First visit. Leave yourself a note for next time.' : 'Nothing saved from last time.'))}</span>
          <input class="wr-note" maxlength="200" placeholder="Note for next time…" value="${esc(r.note || '')}"><button type="button" class="wr-x" title="Hide">×</button>`;
        const inp = el.querySelector('.wr-note');
        const save = () => { if (inp.value === (this.last?.note || '')) return; call('suit-note', { id: r.id, note: inp.value }).then(x => { this.last = x; }).catch(e => toast(e.message)); };
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { save(); inp.blur(); } });
        inp.addEventListener('blur', save);
        el.querySelector('.wr-x').onclick = () => { el.remove(); dispatchEvent(new Event('resize')); };
        dispatchEvent(new Event('resize'));   // the web page below shifts down to make room
      };
      put();
    },
  };

  /* =================================================================== SUIT HEALTH */
  // A broken link or missing folder turns the case light amber; an agent that needs you turns it red.
  const Health = {
    data: null,
    apply(h) {
      if (h) this.data = h; if (!this.data || this.data.theme !== hall()) return;
      for (const s of this.data.suits || []) {
        const plate = document.querySelector(`.bay-label[data-suit="${CSS.escape(s.id)}"]`); if (!plate) continue;
        plate.dataset.health = s.level;
        let glow = plate.querySelector('.case-light');
        if (s.level === 'ok') { glow?.remove(); plate.removeAttribute('data-health-why'); continue; }
        if (!glow) { glow = document.createElement('i'); glow.className = 'case-light'; plate.appendChild(glow); }
        plate.dataset.healthWhy = s.reasons.join(' · ');
        plate.title = s.reasons.join('\n');
      }
    },
  };

  /* =================================================================== HALL AMBIENCE */
  // Made live in the browser, no audio files: reactor hum (Armor Hall), cave drips (Batcave),
  // city at night (Web Lab). It dips while JARVIS talks or you speak, and goes quiet in focus mode.
  let heardAt = 0;
  try { J.on('voice-meter', m => { if (m?.detected) heardAt = performance.now(); }); } catch {}
  const Amb = {
    snd: null, scene: null, on: false, duck: null, timers: [], nodes: [], hallId: '',
    install() {
      window.__jvAmbience = (snd, on) => { this.snd = snd; on ? this.start() : this.stop(); };
      new MutationObserver(() => { if (this.on && hall() !== this.hallId) { this.stop(true); this.start(); } }).observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
      setInterval(() => this.duckCheck(), 200);
    },
    ctx() { try { this.snd?.init?.(); } catch {} return this.snd?.ctx || null; },
    noise(ctx, secs = 4, brown = false) {
      const b = ctx.createBuffer(2, ctx.sampleRate * secs, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let last = 0; for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; } else d[i] = w; } }
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; return s;
    },
    verb(ctx, secs = 2.6, decay = 3) {
      const len = ctx.sampleRate * secs, b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
      const c = ctx.createConvolver(); c.buffer = b; return c;
    },
    keep(...n) { this.nodes.push(...n); return n[0]; },
    every(minS, maxS, fn) { const go = () => { if (!this.on) return; try { fn(); } catch {} this.timers.push(setTimeout(go, (minS + Math.random() * (maxS - minS)) * 1000)); }; this.timers.push(setTimeout(go, (minS + Math.random() * (maxS - minS)) * 1000)); },
    start() {
      const ctx = this.ctx(); if (!ctx || this.on) return;
      this.on = true; this.hallId = hall(); this.duckTarget = undefined;
      const out = this.keep(ctx.createGain()); out.gain.value = 0; out.connect(this.snd.buses?.ambience || ctx.destination);
      out.gain.setTargetAtTime(1, ctx.currentTime, 1.5);
      this.duck = out;
      const t = ctx.currentTime, h = this.hallId;
      if (h === 'batcave') {
        // cave: low wind and far-off water, with single drips echoing round the rock
        const n = this.keep(this.noise(ctx, 5, true)), lp = this.keep(ctx.createBiquadFilter()), g = this.keep(ctx.createGain());
        lp.type = 'lowpass'; lp.frequency.value = 420; g.gain.value = 0.55; n.connect(lp); lp.connect(g); g.connect(out); n.start();
        const lfo = this.keep(ctx.createOscillator()), lg = this.keep(ctx.createGain()); lfo.frequency.value = 0.05; lg.gain.value = 0.25; lfo.connect(lg); lg.connect(g.gain); lfo.start();
        const rv = this.keep(this.verb(ctx, 3.2, 2.4)), wet = this.keep(ctx.createGain()); wet.gain.value = 0.9; rv.connect(wet); wet.connect(out);
        this.every(0.7, 3.6, () => {
          const o = ctx.createOscillator(), e = ctx.createGain(), p = ctx.createStereoPanner(), now = ctx.currentTime, f = 900 + Math.random() * 900;
          o.type = 'sine'; o.frequency.setValueAtTime(f, now); o.frequency.exponentialRampToValueAtTime(f * 0.55, now + 0.07);
          e.gain.setValueAtTime(0, now); e.gain.linearRampToValueAtTime(0.16 * (0.4 + Math.random() * 0.6), now + 0.004); e.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);
          p.pan.value = Math.random() * 1.6 - 0.8; o.connect(e); e.connect(p); p.connect(rv); p.connect(out); o.start(now); o.stop(now + 0.3);
        });
      } else if (h === 'spiderman') {
        // city at night: a low rumble, traffic washing past, and a siren somewhere far off now and then
        const n = this.keep(this.noise(ctx, 5, true)), lp = this.keep(ctx.createBiquadFilter()), g = this.keep(ctx.createGain());
        lp.type = 'lowpass'; lp.frequency.value = 260; g.gain.value = 0.6; n.connect(lp); lp.connect(g); g.connect(out); n.start();
        const n2 = this.keep(this.noise(ctx, 4)), bp = this.keep(ctx.createBiquadFilter()), g2 = this.keep(ctx.createGain());
        bp.type = 'bandpass'; bp.frequency.value = 800; bp.Q.value = 0.6; g2.gain.value = 0.035; n2.connect(bp); bp.connect(g2); g2.connect(out); n2.start();
        const rv = this.keep(this.verb(ctx, 2.2, 2)); rv.connect(out);
        this.every(4, 11, () => {
          const s = this.noise(ctx, 4), f = ctx.createBiquadFilter(), e = ctx.createGain(), p = ctx.createStereoPanner(), now = ctx.currentTime, dir = Math.random() < 0.5 ? -1 : 1, dur = 2.5 + Math.random() * 2;
          f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(260, now); f.frequency.linearRampToValueAtTime(700 + Math.random() * 300, now + dur / 2); f.frequency.linearRampToValueAtTime(240, now + dur);
          e.gain.setValueAtTime(0, now); e.gain.linearRampToValueAtTime(0.12, now + dur / 2); e.gain.linearRampToValueAtTime(0, now + dur);
          p.pan.setValueAtTime(-0.9 * dir, now); p.pan.linearRampToValueAtTime(0.9 * dir, now + dur);
          s.connect(f); f.connect(e); e.connect(p); p.connect(out); s.start(now); s.stop(now + dur + 0.1);
        });
        this.every(35, 80, () => {
          const o = ctx.createOscillator(), e = ctx.createGain(), now = ctx.currentTime, dur = 5;
          o.type = 'triangle'; for (let i = 0; i < 10; i++) { o.frequency.setValueAtTime(i % 2 ? 960 : 720, now + i * 0.5); }
          e.gain.setValueAtTime(0, now); e.gain.linearRampToValueAtTime(0.012, now + 1.2); e.gain.linearRampToValueAtTime(0, now + dur);
          o.connect(e); e.connect(rv); o.start(now); o.stop(now + dur + 0.1);
        });
      } else {
        // armor hall: the arc reactor's low hum, air handling, and the odd soft system chirp
        for (const [f, v, type] of [[55, 0.09, 'sine'], [110, 0.04, 'sine'], [165, 0.012, 'triangle']]) {
          const o = this.keep(ctx.createOscillator()), g = this.keep(ctx.createGain()); o.type = type; o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(out); o.start(t);
          const l = this.keep(ctx.createOscillator()), lg = this.keep(ctx.createGain()); l.frequency.value = 0.07 + Math.random() * 0.08; lg.gain.value = v * 0.35; l.connect(lg); lg.connect(g.gain); l.start(t);
        }
        const n = this.keep(this.noise(ctx, 4, true)), lp = this.keep(ctx.createBiquadFilter()), g = this.keep(ctx.createGain());
        lp.type = 'lowpass'; lp.frequency.value = 320; g.gain.value = 0.3; n.connect(lp); lp.connect(g); g.connect(out); n.start(t);
        this.every(14, 32, () => {
          const o = ctx.createOscillator(), e = ctx.createGain(), now = ctx.currentTime, f = 1500 + Math.random() * 900;
          o.type = 'sine'; o.frequency.setValueAtTime(f, now); o.frequency.setValueAtTime(f * 1.25, now + 0.07);
          e.gain.setValueAtTime(0, now); e.gain.linearRampToValueAtTime(0.012, now + 0.01); e.gain.exponentialRampToValueAtTime(0.0005, now + 0.2);
          o.connect(e); e.connect(out); o.start(now); o.stop(now + 0.25);
        });
      }
    },
    stop(quick) {
      if (!this.on) return; this.on = false;
      this.timers.forEach(clearTimeout); this.timers = [];
      const ctx = this.snd?.ctx, nodes = this.nodes, out = this.duck; this.nodes = []; this.duck = null;
      if (ctx && out) out.gain.setTargetAtTime(0, ctx.currentTime, quick ? 0.08 : 0.6);
      setTimeout(() => { for (const n of nodes) { try { n.stop?.(); } catch {} try { n.disconnect(); } catch {} } }, quick ? 400 : 2500);
    },
    duckCheck() {
      const ctx = this.snd?.ctx; if (!this.on || !ctx || !this.duck) return;
      const now = performance.now();
      const target = Focus.state ? 0.25 : (speakingUntil > now || now - heardAt < 1500) ? 0.18 : 1;
      if (Math.abs((this.duckTarget ?? 1) - target) > 0.01) { this.duckTarget = target; this.duck.gain.setTargetAtTime(target, ctx.currentTime, target < 1 ? 0.12 : 0.8); }
    },
  };

  /* =================================================================== IDEAS ROOM */
  function ixmd(src) {
    const inline = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    let html = '', list = false;
    for (const raw of String(src || '').replace(/\r/g, '').split('\n')) {
      const l = raw.trimEnd(), m = /^\s*(?:[-*]|\d+[.)])\s+(.*)$/.exec(l), hd = /^#{1,4}\s+(.*)$/.exec(l);
      if (m) { if (!list) { html += '<ul>'; list = true; } html += `<li>${inline(m[1])}</li>`; continue; }
      if (list) { html += '</ul>'; list = false; }
      if (hd) html += `<h5>${inline(hd[1])}</h5>`; else if (l.trim()) html += `<p>${inline(l)}</p>`;
    }
    return html + (list ? '</ul>' : '');
  }
  const STAGES = [['spark', 'Spark'], ['designing', 'Designing'], ['building', 'Building'], ['testing', 'Testing'], ['done', 'Done']];
  const Room = {
    open: false, zoom: 1, el: null, ideas: [], coreCtl: null,
    toggle() { this.open ? this.close() : this.show(); },
    async show() {
      if (this.open) return; this.open = true;
      this.build(); document.body.appendChild(this.el); document.body.classList.add('ideas-open');
      requestAnimationFrame(() => this.el.classList.add('in'));
      const el = this.el;
      try { this.ideas = await call('ideas-list'); } catch { this.ideas = []; }
      if (!this.open || this.el !== el) return;   // closed while it was opening
      this.draw(); this.core();
      Holo.showScope('ideas', true); Holo.restoreIdeas();
    },
    close() {
      if (!this.open) return; this.open = false;
      this.coreCtl?.stop(); this.coreCtl = null; Holo.showScope('ideas', false); this.addTab(false);
      document.body.classList.remove('ideas-open');
      this.el.classList.remove('in'); const el = this.el; setTimeout(() => el.remove(), 260);
    },
    setZoom(z) { this.zoom = clamp(z, 0.6, 1.8); },
    build() {
      const el = document.createElement('section'); el.className = 'ix-room'; el.style.setProperty('--ix', accent());
      el.innerHTML = `
        <canvas class="ix-core"></canvas>
        <div class="ix-name">${ASSIST[hall()] || 'J.A.R.V.I.S.'}</div>
        <header class="ix-head"><p>IDEAS · ${esc(hall() === 'batcave' ? 'THE CAVE' : hall() === 'spiderman' ? 'WEB LAB' : 'ARMOR HALL')}</p><h2>What we're building.</h2>
          <div class="ix-actions"><button type="button" data-ix="new">+ New idea</button><button type="button" data-ix="tab">+ Tab</button><button type="button" data-ix="claude">✦ Brainstorm with Claude</button><button type="button" data-ix="cfg" title="How JARVIS works on ideas">⚙</button><button type="button" class="ix-x" data-ix="close" title="Close (Esc)">×</button></div></header>
        <div class="ix-cards"></div>
        <div class="ix-addtab" hidden></div>
        <footer class="ix-stages"></footer>
        <div class="ix-edit" hidden></div>`;
      el.addEventListener('click', e => this.onClick(e));
      el.addEventListener('pointerdown', e => this.onDown(e));
      this.el = el;
    },
    stageName(s) { return (STAGES.find(x => x[0] === s) || STAGES[0])[1]; },
    draw() {
      const box = this.el.querySelector('.ix-cards');
      box.innerHTML = this.ideas.map((d, i) => `
        <article class="ix-card st-${d.stage}" data-id="${d.id}" style="left:${d.x}%;top:${d.y}%;--ph:${(i * 0.9) % 6}s">
          <div class="ix-chip">${this.stageName(d.stage)}</div>${this.forTag(d)}${this.assistPill(d)}
          <h3>${esc(d.title)}</h3>
          <div class="ix-bar"><i style="width:${d.progress}%"></i></div>
          <div class="ix-meta"><span>${d.progress}%</span><span>${new Date(d.updated).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span></div>
          ${d.notes ? `<p>${esc(d.notes)}</p>` : ''}
        </article>`).join('') || `<div class="ix-empty">No ideas yet. Press <b>+ New idea</b>, or pinch it with your hand.</div>`;
      const counts = Object.fromEntries(STAGES.map(([k]) => [k, this.ideas.filter(d => d.stage === k).length]));
      this.el.querySelector('.ix-stages').innerHTML = STAGES.map(([k, n], i) => `<div class="st-${k}"><b>${counts[k]}</b><span>${n}</span></div>${i < STAGES.length - 1 ? '<i></i>' : ''}`).join('');
    },
    ringSpot(i) {   // new ideas land in an orbit round the core
      const a = -Math.PI / 2 + i * 2.4, rx = 30, ry = 26;
      return { x: clamp(50 + Math.cos(a) * rx, 8, 80), y: clamp(50 + Math.sin(a) * ry, 16, 80) };
    },
    async onClick(e) {
      const b = e.target.closest('[data-ix]');
      if (b) {
        const k = b.dataset.ix;
        if (k === 'close') return this.close();
        if (k === 'new') return this.edit({ title: '', stage: 'spark', progress: 0, notes: '', ...this.ringSpot(this.ideas.length) });
        if (k === 'claude') return this.claude();
        if (k === 'tab') return this.addTab(this.el.querySelector('.ix-addtab').hidden);
        if (k.startsWith('open:')) { this.addTab(false); return Holo.open({ url: b.dataset.url, title: b.dataset.title || '', scope: 'ideas' }); }
        if (await this.onAssist(k, b)) return;
        if (k === 'cancel') return this.editEl(false);
        if (k === 'delete') { const id = this.el.querySelector('.ix-edit form').dataset.id; if (id) this.ideas = await call('ideas-remove', id); this.editEl(false); return this.draw(); }
        if (k.startsWith('stage:')) { const f = this.el.querySelector('.ix-edit form'); f.elements.stage.value = k.slice(6); f.querySelectorAll('[data-ix^="stage:"]').forEach(x => x.classList.toggle('on', x === b)); return; }
      }
      const card = e.target.closest('.ix-card');
      if (card && !card.__moved) this.edit(this.ideas.find(d => d.id === card.dataset.id));
    },
    onDown(e) {
      const card = e.target.closest('.ix-card'); if (!card || e.button !== 0) return;
      const box = this.el.querySelector('.ix-cards').getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY, ox = parseFloat(card.style.left), oy = parseFloat(card.style.top);
      card.__moved = false; card.classList.add('held');
      const move = ev => {
        const dx = (ev.clientX - sx) / box.width * 100, dy = (ev.clientY - sy) / box.height * 100;
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 6) card.__moved = true;
        card.style.left = clamp(ox + dx, 0, 92) + '%'; card.style.top = clamp(oy + dy, 4, 88) + '%';
      };
      const up = async () => {
        removeEventListener('pointermove', move); removeEventListener('pointerup', up); card.classList.remove('held');
        if (card.__moved) {
          const d = this.ideas.find(x => x.id === card.dataset.id);
          if (d) { try { this.ideas = await call('ideas-save', { ...d, x: parseFloat(card.style.left), y: parseFloat(card.style.top) }); } catch {} }
          setTimeout(() => { card.__moved = false; }, 60);
        }
      };
      addEventListener('pointermove', move); addEventListener('pointerup', up);
    },
    editEl(show) { const w = this.el.querySelector('.ix-edit'); w.hidden = !show; if (!show) w.innerHTML = ''; Holo.pauseAll(!!show); return w; },
    async edit(d) {
      if (!d) return;
      let tg = { theme: hall(), hallName: '', suits: [] };
      try { tg = await call('ideas-targets'); } catch {}
      const cur = d.target?.kind === 'app' ? 'app' : d.target?.kind === 'suit' ? `suit:${d.target.theme}:${d.target.id}` : '';
      const suitOpts = tg.suits.map(x => ({ v: `suit:${tg.theme}:${x.id}`, n: x.name + (x.centre ? ' · centre bay' : '') }));
      if (cur.startsWith('suit:') && !suitOpts.some(o => o.v === cur)) suitOpts.unshift({ v: cur, n: (d.target.name || 'A suit') + ' · another hall' });
      const w = this.editEl(true);
      w.innerHTML = `<form data-id="${d.id || ''}">
        <p class="ix-k">${d.id ? 'IDEA' : 'NEW IDEA'}</p>
        <input name="title" maxlength="120" placeholder="Name the idea" value="${esc(d.title)}" autocomplete="off">
        <label class="ix-k">What is it for?</label>
        <select name="target" class="ix-for-pick">
          <option value="">Just an idea (not linked to anything)</option>
          <option value="app" ${cur === 'app' ? 'selected' : ''}>⚙ The JARVIS app itself: a new feature or a fix</option>
          <optgroup label="${esc(tg.hallName || 'This hall')}: suits">${suitOpts.map(o => `<option value="${esc(o.v)}" ${o.v === cur ? 'selected' : ''}>${esc(o.n)}</option>`).join('')}</optgroup>
        </select>
        <input type="hidden" name="stage" value="${d.stage}">
        <div class="ix-seg">${STAGES.map(([k, n]) => `<button type="button" data-ix="stage:${k}" class="st-${k} ${k === d.stage ? 'on' : ''}">${n}</button>`).join('')}</div>
        <label class="ix-k">How far along <output>${d.progress}%</output></label>
        <input type="range" name="progress" min="0" max="100" step="5" value="${d.progress}">
        <textarea name="notes" rows="5" placeholder="Notes, next steps, what we decided…">${esc(d.notes)}</textarea>
        <div class="ix-assist"></div>
        <div class="ix-row">${d.id ? '<button type="button" class="ix-del" data-ix="delete">Delete</button>' : ''}<span></span><button type="button" data-ix="cancel">Cancel</button>${d.id ? '' : '<button type="button" data-ix="save-assist">Save & get JARVIS on it</button>'}<button type="submit" class="ix-save">Save</button></div>
      </form>`;
      const f = w.querySelector('form');
      f.__names = Object.fromEntries([['app', 'JARVIS app'], ...suitOpts.map(o => [o.v, o.n.replace(/ · .*$/, '')])]);
      f.elements.progress.oninput = () => { f.querySelector('output').textContent = f.elements.progress.value + '%'; };
      f.onsubmit = async ev => { ev.preventDefault(); await this.saveForm(f, d); };
      if (d.id) this.renderAssist(d);
      setTimeout(() => f.elements.title.focus(), 30);
    },
    /** Save the editor; returns the saved idea (so "Save & get JARVIS on it" knows which one). */
    async saveForm(f, d) {
      const tv = f.elements.target.value;
      const target = tv === 'app' ? { kind: 'app' } : tv.startsWith('suit:') ? { kind: 'suit', theme: tv.split(':')[1], id: tv.split(':').slice(2).join(':'), name: f.__names[tv] || '' } : null;
      const p = { id: d.id, title: f.elements.title.value, stage: f.elements.stage.value, progress: +f.elements.progress.value, notes: f.elements.notes.value, x: d.x, y: d.y, target };
      try {
        this.ideas = await call('ideas-save', p); this.editEl(false); this.draw();
        return d.id ? this.ideas.find(x => x.id === d.id) : this.ideas.filter(x => x.title === p.title.replace(/[\r\n]+/g, ' ').trim().slice(0, 120)).sort((a, b) => b.created - a.created)[0];
      } catch (x) { toast(x.message || String(x)); return null; }
    },
    forTag(d) { const t = d.target; if (!t) return ''; return `<div class="ix-for">${t.kind === 'app' ? '⚙ JARVIS app' : esc(t.name || 'Suit')}</div>`; },
    assistPill(d) {
      const st = d.assist?.status, L = { thinking: 'JARVIS is thinking', waiting: 'Needs your OK', working: 'Being worked on', review: 'Ready to review' };
      return L[st] ? `<div class="ix-as ix-as-${st}">${L[st]}</div>` : '';
    },
    /** The JARVIS part of the editor: ask, approve, change, review. Redrawn on its own as things move. */
    renderAssist(d) {
      const box = this.el?.querySelector(`.ix-edit form[data-id="${d.id}"] .ix-assist`); if (!box) return;
      if (box.contains(document.activeElement) && document.activeElement.tagName === 'TEXTAREA') return;   // typing feedback: leave it be
      const a = d.assist, st = a?.status, kind = d.target?.kind;
      const hint = kind === 'app' ? 'JARVIS plans the change. After your OK, Claude Code builds it in a separate copy of the source, and you approve again before anything is merged.'
        : kind === 'suit' ? 'JARVIS plans it and picks the right agents in the tower. They only start after your OK.'
        : 'JARVIS thinks it through and suggests next steps.';
      let h = '';
      if (st === 'thinking') h = `<p class="ix-as-now">✦ JARVIS is thinking it through…</p>`;
      else if (st === 'waiting') h = `<p class="ix-k">JARVIS PROPOSES${a.source === 'night' ? ' · DRAFTED OVERNIGHT' : ''}</p>
          <p class="ix-as-sum">${esc(a.summary)}</p>${a.floorName ? `<p class="ix-as-note">Agents: ${esc(a.floorName)} (tower)</p>` : ''}
          <div class="ix-plan">${ixmd(a.plan)}</div>
          <div class="ix-row"><button type="button" data-ix="as-decline">Not now</button><span></span><button type="button" data-ix="as-change">Change it…</button><button type="button" class="ix-save" data-ix="as-approve">Approve</button></div>
          <div class="ix-change" hidden><textarea name="feedback" rows="3" placeholder="What should be different?"></textarea><div class="ix-row"><span></span><button type="button" data-ix="as-send">Send to JARVIS</button></div></div>`;
      else if (st === 'working') h = `<p class="ix-as-now">⏳ ${esc(a.phase || 'Working on it…')}</p>${a.runId ? '<div class="ix-row"><span></span><button type="button" data-ix="as-tower">Watch in the tower</button></div>' : ''}`;
      else if (st === 'review') h = `<p class="ix-k">READY TO REVIEW · ${esc(a.stat || '')}</p>
          ${(a.warnings || []).map(x => `<p class="ix-as-bad">⚠ ${esc(x)}</p>`).join('')}
          <div class="ix-plan">${ixmd(a.report || a.summary)}</div>
          <p class="ix-as-note">${(a.files || []).slice(0, 12).map(x => esc(x.replace(/\t/g, ' '))).join('<br>')}</p>
          <div class="ix-row"><button type="button" data-ix="as-diff">View the changes</button><span></span><button type="button" data-ix="as-decline">Discard</button><button type="button" class="ix-save" data-ix="as-approve">Merge into JARVIS</button></div>`;
      else {
        if (st === 'failed') h += `<p class="ix-as-bad">Problem: ${esc(a.error || '')}</p>`;
        if (st === 'done') h += `<p class="ix-as-ok">✓ ${esc(a.result || 'Done.')}</p>${a.resultFile ? '<div class="ix-row"><span></span><button type="button" data-ix="as-result">Open the result</button></div>' : ''}`;
        if (st === 'declined') h += '<p class="ix-as-note">You said not now.</p>';
        h += `<div class="ix-row"><button type="button" data-ix="as-go" class="ix-go">✦ ${a ? 'Ask JARVIS again' : 'Get JARVIS on it'}</button><span></span></div><p class="ix-as-note">${hint}</p>`;
      }
      box.innerHTML = h;
    },
    async onAssist(k, b) {
      const f = this.el.querySelector('.ix-edit form'), id = f?.dataset.id;
      try {
        if (k === 'cfg') { await this.config(); return true; }
        if (k === 'cfg-source') { const p = await call('ideas-choose-source'); if (p) toast('Source folder set.'); await this.config(); return true; }
        if (k === 'cfg-recheck') { await this.config(true); return true; }
        if (k === 'save-assist') { const d = this.ideas.find(x => x.id === id) || { x: 50, y: 50, ...this.ringSpot(this.ideas.length) }; const saved = await this.saveForm(f, d); if (saved) { await call('idea-assist', { id: saved.id }); toast('JARVIS is on it. The plan will wait for your OK.'); } return true; }
        if (!k.startsWith('as-') || !id) return false;
        if (k === 'as-go') { await call('idea-assist', { id }); return true; }
        if (k === 'as-change') { const c = f.querySelector('.ix-change'); c.hidden = !c.hidden; if (!c.hidden) c.querySelector('textarea').focus(); return true; }
        if (k === 'as-send') { const fb = f.querySelector('[name=feedback]').value.trim(); if (!fb) return true; f.querySelector('[name=feedback]').blur(); await call('idea-assist', { id, feedback: fb }); return true; }
        if (k === 'as-approve') { b.disabled = true; this.ideas = await call('idea-approve', { id }); this.draw(); const d = this.ideas.find(x => x.id === id); if (d) this.renderAssist(d); return true; }
        if (k === 'as-decline') { this.ideas = await call('idea-decline', { id }); this.draw(); const d = this.ideas.find(x => x.id === id); if (d) this.renderAssist(d); return true; }
        if (k === 'as-diff') { await call('idea-open', { id, what: 'diff' }); return true; }
        if (k === 'as-result') { await call('idea-open', { id, what: 'result' }); return true; }
        if (k === 'as-tower') { this.editEl(false); this.close(); window.__jarvisTower?.show(); return true; }
      } catch (x) { toast(x.message || String(x)); if (b) b.disabled = false; return true; }
      return false;
    },
    /** How JARVIS works on ideas: the source folder, Claude Code, overnight drafts. */
    async config(recheck) {
      let c; try { c = await call('ideas-config', recheck ? { recheck: true } : {}); } catch (x) { toast(x.message || String(x)); return; }
      const w = this.editEl(true);
      w.innerHTML = `<form class="ix-cfg">
        <p class="ix-k">HOW JARVIS WORKS ON IDEAS</p>
        <p class="ix-as-note">Ideas for a suit go to that hall's tower agents. Ideas for the JARVIS app are built by Claude Code in a separate copy of the source. Nothing starts, and nothing is merged, without your OK.</p>
        <label class="ix-k">JARVIS source folder</label>
        <div class="ix-row"><code class="ix-path">${esc(c.sourceRepo || 'Not found yet')}</code><button type="button" data-ix="cfg-source">Choose…</button></div>
        <label class="ix-k">Claude Code (builds app ideas)</label>
        ${c.claudeCode?.ready ? `<p class="ix-as-ok">✓ Installed (${esc(c.claudeCode.version || '')})</p>` : `<p class="ix-as-bad">Not installed yet.</p><p class="ix-as-note">Open PowerShell and run:<br><code>irm https://claude.ai/install.ps1 | iex</code><br>then run <code>claude</code> once to sign in with your Claude account, and restart JARVIS.</p>`}
        <div class="ix-row"><span></span><button type="button" data-ix="cfg-recheck">Check again</button></div>
        <label class="ix-k">Claude API key (plans)</label>
        <p class="${c.hasKey ? 'ix-as-ok' : 'ix-as-note'}">${c.hasKey ? '✓ Set in the tower' : 'Not set: plans use Claude Code instead. You can add a key in the tower (⚙ Engines).'}</p>
        <label class="ix-check"><input type="checkbox" name="nightly" ${c.nightly ? 'checked' : ''}> Work on quiet ideas overnight (up to 3 a night; the plans wait for your OK)</label>
        <div class="ix-row"><span></span><button type="button" data-ix="cancel">Close</button></div>
      </form>`;
      w.querySelector('[name=nightly]').onchange = async e => { try { await call('ideas-config', { nightly: e.target.checked }); } catch (x) { toast(x.message || String(x)); } };
    },
    onIdeas(m) {
      if (!m || !Array.isArray(m.list)) return;
      Room.badge(m.pending);
      if (!this.open || !this.el) return;
      this.ideas = m.list; this.draw();
      const f = this.el.querySelector('.ix-edit form[data-id]'); const d = f?.dataset.id && this.ideas.find(x => x.id === f.dataset.id); if (d) this.renderAssist(d);
    },
    badge(n) {
      const i = document.querySelector('.qp-ico[data-ideas] [data-ix-badge]'); if (!i) return;
      if (n === undefined) { call('ideas-list').then(l => this.badge(l.filter(x => ['waiting', 'review'].includes(x.assist?.status)).length)).catch(() => {}); return; }
      i.textContent = n ? String(n) : ''; i.hidden = !n;
      const b = i.parentElement; if (b) b.title = n ? `Ideas room: ${n} waiting for your OK` : 'Ideas room';
    },
    /* Claude as a floating panel: drag it anywhere, resize it, and it keeps its place next time */
    claude() {
      const have = Holo.panels.get('ix-claude');
      if (have && !have.el.hidden) return Holo.close(have);
      const w = Math.round(innerWidth * 0.36), h = Math.round(innerHeight * 0.74);
      Holo.open({ id: 'ix-claude', url: 'https://claude.ai/new', title: 'Claude', scope: 'ideas', rect: { x: innerWidth - w - 36, y: 120, w, h } });
    },
    /* + Tab: any web address, or one of the links saved on this hall's suits */
    async addTab(show) {
      const box = this.el?.querySelector('.ix-addtab'); if (!box) return;
      if (!show) { box.hidden = true; box.innerHTML = ''; Holo.pauseAll(false); return; }
      let links = [];
      try { const b = await call('bootstrap'); for (const m of b.modules || []) for (const l of m.links || []) if (/^https?:/i.test(l.url)) links.push({ url: l.url, title: l.label || m.name, suit: m.name }); } catch {}
      const quick = [{ url: 'https://claude.ai/new', title: 'Claude' }, { url: 'https://chatgpt.com/', title: 'ChatGPT' }, { url: 'https://www.google.com/', title: 'Google' }, { url: 'https://www.youtube.com/', title: 'YouTube' }, { url: 'https://www.figma.com/', title: 'Figma' }];
      box.innerHTML = `<form><p>OPEN A TAB IN THE IDEAS ROOM</p><div class="ix-row"><input name="url" placeholder="Paste a link or type a site, e.g. notion.so" autocomplete="off"><button type="submit" class="ix-save">Open</button></div>
        <div class="ix-chips">${quick.map(q => `<button type="button" data-ix="open:q" data-url="${esc(q.url)}" data-title="${esc(q.title)}">${esc(q.title)}</button>`).join('')}</div>
        ${links.length ? `<p>FROM YOUR SUITS</p><div class="ix-chips">${links.slice(0, 24).map(l => `<button type="button" data-ix="open:l" data-url="${esc(l.url)}" data-title="${esc(l.title)}" title="${esc(l.suit)} · ${esc(l.url)}">${esc(l.title)}</button>`).join('')}</div>` : ''}</form>`;
      box.hidden = false; Holo.pauseAll(true);
      const f = box.querySelector('form');
      f.onsubmit = ev => { ev.preventDefault(); let u = f.elements.url.value.trim(); if (!u) return; if (!/^https?:\/\//i.test(u)) u = 'https://' + u; this.addTab(false); Holo.open({ url: u, scope: 'ideas' }); };
      setTimeout(() => f.elements.url.focus(), 30);
    },
    core() {
      this.coreCtl?.stop();
      this.coreCtl = makeCore(this.el.querySelector('.ix-core'), () => ({ zoom: this.zoom }));
    },
  };
  addEventListener('keydown', e => { if (e.key === 'Escape' && Room.open) { const ed = Room.el?.querySelector('.ix-edit'); if (ed && !ed.hidden) Room.editEl(false); else Room.close(); } });
  window.__jarvisIdeas = Room; window.__jarvisHands = H;

  /* =================================================================== attach to the live UI */
  const BULB = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z"/><path d="M12 7v3M10.5 8.5h3" opacity=".7"/></svg>`;
  const RADAR = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.5" opacity=".55"/><circle cx="12" cy="12" r="4.5" opacity=".8"/><path d="M12 12l6-4.5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/></svg>`;
  function attach() {
    const icons = $('.qp-icons');
    if (icons && !icons.querySelector('[data-ideas]')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'qp-ico ix-ico'; b.dataset.ideas = '1'; b.title = 'Ideas room'; b.innerHTML = BULB;
      b.addEventListener('click', e => { e.stopPropagation(); Room.toggle(); });
      icons.appendChild(b);
    }
    if (icons && !icons.querySelector('[data-brief]')) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'qp-ico bf-ico'; b.dataset.brief = '1'; b.title = 'Daily briefing (or say “Good morning, Jarvis”)'; b.innerHTML = RADAR;
      b.addEventListener('click', e => { e.stopPropagation(); if (Brief.el) Brief.close(); else call('briefing').catch(() => {}); });
      const bulb = icons.querySelector('[data-ideas]'); bulb ? bulb.insertAdjacentElement('beforebegin', b) : icons.appendChild(b);
    }
    const bulbEl = icons && icons.querySelector('[data-ideas]');
    if (bulbEl && !bulbEl.querySelector('[data-ix-badge]')) { const i = document.createElement('i'); i.dataset.ixBadge = '1'; i.hidden = true; bulbEl.appendChild(i); Room.badge(); }
    const mic = $('[data-mic]');
    if (mic && toggle.parentElement !== mic.parentElement) mic.insertAdjacentElement('afterend', toggle);
    if (toggle.parentElement && hset.previousElementSibling !== toggle) toggle.insertAdjacentElement('afterend', hset);
    hset.hidden = false; // the guide and calibration remain available before the camera starts
  }
  Focus.init();
  window.__jarvisHolo = Holo;
  if (!MAIN) return;
  setInterval(attach, 1200); setTimeout(attach, 800);
  try { J.on('ideas', m => Room.onIdeas(m)); } catch {}
  if (store.get('handsOn', false)) setTimeout(() => startHands(), 2500);
  Amb.install(); window.__jarvisAmb = Amb; window.__jarvisHolo = Holo;
  try { J.on('health', h => Health.apply(h)); } catch {}
  setTimeout(() => call('health').then(h => Health.apply(h)).catch(() => {}), 6000);
  setInterval(() => Health.apply(), 2500);   // plates are redrawn when the hall changes
  try { J.on('recap', r => Recap.show(r)); } catch {}
  try { J.on('captured', c => c && toast(c.kind === 'idea' ? `✦ New idea: ${c.text}` : `✓ Added to your list: ${c.text}`)); } catch {}
})();
