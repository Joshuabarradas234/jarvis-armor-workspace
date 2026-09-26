/*
 * JARVIS v9.18 — the third screen: a view of the hall you are in. For the Batcave it is the cave, with the boat
 * rocking in the water and the plane parked on its pad by the big screen, turning slowly. Other halls show their
 * second-screen picture. It follows you when you change hall, and it is only there when a third screen is connected
 * (and "Third screen view" is ticked in the tray menu).
 */
const J = window.jarvis;
const bg = document.querySelector('.vs-bg');
let key = '', live = null;
function clock() { const d = new Date(); document.querySelector('.vs-time').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }
async function refresh() {
  let v = null; try { v = await J.call('vista-scene'); } catch { return; }
  if (!v) return;
  document.documentElement.style.setProperty('--vs', v.accent || '#f5c542');
  document.querySelector('.vs-hall').textContent = String(v.name || '').toUpperCase();
  document.querySelector('.vs-ai').textContent = 'VIEW';
  const k = [v.theme, v.scene, v.image].join('|'); if (k === key) return; key = k;
  try { live?.dispose(); } catch {} live = null;
  let cfg = null; if (v.scene) { try { cfg = await (await fetch(v.scene)).json(); } catch {} }
  if (cfg?.label) document.querySelector('.vs-ai').textContent = cfg.label;
  const url = cfg?.image ? `jarvis://asset/deck/${cfg.image}` : v.image;
  const img = new Image(); img.src = url; try { await img.decode(); } catch {}
  if (k !== key) return;
  bg.classList.remove('in'); void bg.offsetWidth; bg.style.backgroundImage = `url("${url}")`; bg.classList.add('in');
  if (cfg && (cfg.boat || cfg.plane || cfg.boats || cfg.planes)) {
    try { const { mountScene } = await import('./deckscene.js'); const sc = await mountScene(bg, cfg, 'jarvis://asset/deck/'); if (k === key) live = sc; else sc.dispose(); } catch (e) { console.warn('[vista]', e); }
  }
}
if (J) {
  clock(); setInterval(clock, 5000);
  refresh();
  try { J.on('theme', () => setTimeout(refresh, 300)); } catch {}
  try { J.on('deck', m => { if (m?.type === 'backdrop') refresh(); }); } catch {}
}
