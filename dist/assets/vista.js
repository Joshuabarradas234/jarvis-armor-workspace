/* The third screen follows the hall. A failed or superseded load never paints over the latest view. */
import { imagePresenter } from './scene-quality.js';
const J = window.jarvis, bg = document.querySelector('.vs-bg');
const images = imagePresenter(bg);
let key = '', live = null, refreshTimer = 0;
function clock() { document.querySelector('.vs-time').textContent = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
async function refresh() {
  const ticket = images.invalidate(); let v;
  try { v = await J.call('vista-scene'); } catch { return; }
  if (!v || !images.current(ticket)) return;
  const k = [v.theme, v.scene, v.image].join('|'); if (k === key) return;
  live?.dispose(); live = null; key = '';
  document.body.dataset.theme = v.theme;
  document.documentElement.style.setProperty('--vs', v.accent || '#7fd6e8');
  document.querySelector('.vs-hall').textContent = String(v.name || '').toUpperCase();
  document.querySelector('.vs-ai').textContent = 'VIEW';
  if (!images.current(ticket)) return;
  let cfg = null;
  if (v.scene) try { const r = await fetch(v.scene); if (r.ok) cfg = await r.json(); } catch {}
  if (!images.current(ticket)) return;
  const url = cfg?.image ? 'jarvis://asset/deck/' + cfg.image : v.image;
  if (!await images.show(url, ticket)) return;
  if (cfg?.label) document.querySelector('.vs-ai').textContent = cfg.label;
  if (cfg && (cfg.boat || cfg.plane || cfg.boats || cfg.planes)) {
    try {
      const { mountScene } = await import('./deckscene.js');
      if (!images.current(ticket)) return;
      const sc = await mountScene(bg, cfg, 'jarvis://asset/deck/');
      if (images.current(ticket)) live = sc; else { sc.dispose(); return; }
    } catch (e) { console.warn('[vista]', e); }
  }
  if (images.current(ticket)) key = k;
}
if (J) {
  clock(); const timer = setInterval(clock, 5000); refresh();
  J.on('theme', () => { images.invalidate(); clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, 100); });
  J.on('deck', m => { if (m?.type === 'backdrop') refresh(); });
  addEventListener('pagehide', () => { clearInterval(timer); clearTimeout(refreshTimer); images.dispose(); live?.dispose(); });
}
