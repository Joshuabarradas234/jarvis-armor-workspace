/**
 * Desktop hand control's ring (src/main/desk-hands.js). This small see-through window follows your hand over every app
 * while JARVIS is closed to the tray, and runs the camera and the hand tracker (handtrack.worker.js, on this laptop
 * only; no picture leaves it). Clicks pass straight through. JARVIS moves the window; this page only reports the hand.
 */
import {DeskGestures, reachBox} from './desk-gestures.js';
const J = globalThis.window?.jarvis;
const Q = new URLSearchParams(location.search);
if (J && Q.get('view') === 'hands') {
  const G = new DeskGestures(), arc = document.querySelector('.arc'), body = document.body;
  let right = true, last = '', worker = null, video = null, ready = false, busy = false, busyAt = 0, lastT = -1, flashT = 0;
  const savedBox = () => { try { return JSON.parse(localStorage.getItem('jv.handBox') || 'null'); } catch { return null; } };   // the hall's "Calibrate hands"
  function show(o) {
    body.classList.toggle('away', !o.visible); body.classList.toggle('grab', !!o.grab); body.classList.toggle('hold', o.hold > 0 && !o.grab);
    arc.style.strokeDashoffset = String(100 - Math.round(o.hold * 100));
  }
  function send(o) {
    const key = [o.visible, o.nx.toFixed(3), o.ny.toFixed(3), o.grab, o.hold.toFixed(2)].join();
    if (key === last) return; last = key;
    show(o); J.call('desk-hand', o).catch(() => {});
  }
  /** One tracker result: the hands' points and which hand each is. */
  function frame(hands, handed) {
    const now = performance.now();
    if (!hands || !hands.length) { send(G.update(null, {now})); return; }
    if (handed?.[0]) right = handed[0] === 'Left';   // the model assumes a mirrored picture, so its "Left" is your right hand
    send(G.update(hands[0], {now, rightHand: right, box: reachBox(savedBox(), right)}));
  }
  function fail(why) { J.call('desk-hand', {error: String(why || 'Hand control could not start.').slice(0, 200)}).catch(() => {}); }
  function pump() {
    if (!ready || !video || video.readyState < 2) return;
    if (busy && performance.now() - busyAt < 1500) return;
    if (video.currentTime === lastT) return; lastT = video.currentTime;
    let f; try { f = new VideoFrame(video, {timestamp: Math.round(performance.now() * 1000)}); } catch { return; }
    busy = true; busyAt = performance.now();
    worker.postMessage({frame: f, ts: performance.now()}, [f]);
  }
  async function start() {
    const stream = await navigator.mediaDevices.getUserMedia({video: {width: 640, height: 480, frameRate: {ideal: 30}, facingMode: 'user'}, audio: false});
    video = Object.assign(document.createElement('video'), {muted: true, playsInline: true}); video.srcObject = stream; await video.play();
    worker = new Worker(new URL('./handtrack.worker.js', import.meta.url), {type: 'module'});
    worker.onmessage = e => {
      const m = e.data || {};
      if (m.ready) { ready = true; worker.postMessage({hands: 1}); return; }   // one hand is all this needs, and it is quicker
      if (m.error) return fail('The hand tracker could not start: ' + m.error);
      if (m.lm) { busy = false; frame(m.lm, m.hd); } else if (m.fail) busy = false;
    };
    worker.onerror = e => fail('The hand tracker stopped: ' + (e.message || 'error'));
    worker.postMessage({init: true, base: 'jarvis://asset/handtrack', model: 'jarvis://asset/handtrack/hand_landmarker.task'});
    setInterval(pump, 33);   // a timer, not animation frames: this window never takes the screen
  }
  try {
    J.on('hands-remote', m => {   // what happened: picked up, missed, thrown, or a window Windows would not let go of
      if (!m?.desk) return; body.dataset.flash = ''; void body.offsetWidth; body.dataset.flash = m.desk;
      clearTimeout(flashT); flashT = setTimeout(() => { body.dataset.flash = ''; }, 700);
    });
  } catch {}
  window.__deskHands = {feed: frame, get grab() { return G.grab; }};
  show({visible: false, grab: false, hold: 0});
  if (Q.get('cam') !== '0') start().catch(e => fail(e?.name === 'NotAllowedError' ? 'Camera access was blocked.' : e?.name === 'NotFoundError' ? 'No camera found.' : 'Hand control could not start: ' + (e?.message || e)));
}
