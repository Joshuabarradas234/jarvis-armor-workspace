/*
 * JARVIS v9.13 — hand tracking on its own thread.
 * The hall sends each new camera frame here; this finds the hand points (Google's MediaPipe hand landmarker, running
 * on the processor, entirely on this laptop) and sends back just the points. The hall's own thread is left free for
 * the animations, which is what was dragging the old tracker down to about 9 frames a second.
 */
import { FilesetResolver, HandLandmarker } from '../vendor/tasks-vision/vision_bundle.mjs';
let lm = null, last = -1, hands = 2;
onmessage = async e => {
  const m = e.data || {};
  if (m.init) {
    try {
      const fs = await FilesetResolver.forVisionTasks(m.base, true);
      lm = await HandLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: m.model, delegate: 'CPU' }, runningMode: 'VIDEO', numHands: hands,
        minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      postMessage({ ready: true });
    } catch (err) { postMessage({ log: 'ERR ' + (err && err.stack || err) }); postMessage({ error: String((err && (err.message || err)) || 'start failed') }); }
    return;
  }
  if (m.hands && lm && m.hands !== hands) { hands = m.hands; try { await lm.setOptions({ numHands: hands }); } catch {} return; }
  if (m.frame) {
    if (!lm) { m.frame.close?.(); postMessage({ fail: 'not ready' }); return; }
    const t0 = performance.now(); const ts = Math.max(last + 1, Math.round(m.ts)); last = ts;
    try {
      const r = lm.detectForVideo(m.frame, ts);
      postMessage({ lm: (r.landmarks || []).map(h => h.map(p => [p.x, p.y, p.z || 0])), hd: (r.handedness || []).map(h => h[0]?.categoryName || ''), ms: performance.now() - t0, hands });
    } catch (err) { postMessage({ fail: String(err && err.message || err) }); }
    finally { try { m.frame.close(); } catch {} }
  }
};
