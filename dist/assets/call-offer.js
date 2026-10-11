/**
 * "Record this call?": a small card in the top corner when a call app (Teams, Zoom, WhatsApp…) picks up your
 * microphone (src/meeting/mic-watch.js). Record starts the meeting recording, filed under your usual suit, and it
 * stops by itself when the call hangs up. It goes away by itself after 30 seconds.
 */
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(globalThis.location?.search || '').get('view') || 'main';
if (J && VIEW === 'offer') {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const CSS = `
.co{position:fixed;inset:10px;display:flex;flex-direction:column;gap:10px;padding:14px 16px;box-sizing:border-box;background:#06101af4;border:1px solid color-mix(in srgb,var(--accent,#7fd6e8) 45%,#ffffff1a);border-radius:16px;box-shadow:0 8px 24px #0009;font:13.5px/1.45 "Segoe UI",system-ui,sans-serif;color:#dcecf4;animation:co-in .25s ease-out}
@keyframes co-in{from{opacity:0;transform:translateY(-8px)}}
.co-top{display:flex;align-items:center;gap:10px}
.co-top i{font-style:normal;font-size:22px}
.co-top b{font-weight:600;font-size:14.5px;color:#fff}
.co-top small{display:block;color:#8fa9b8;font-size:12px}
.co-btns{display:flex;gap:8px;margin-top:auto}
.co button{background:#ffffff0d;color:#dcecf4;border:1px solid #ffffff26;border-radius:9px;padding:6px 12px;font:12.5px "Segoe UI",system-ui,sans-serif;cursor:pointer}
.co button.go{background:var(--accent,#7fd6e8);color:#041017;border-color:var(--accent,#7fd6e8);font-weight:600}
.co button.never{margin-left:auto;background:none;border-color:transparent;color:#8fa9b8}`;
  const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  let el = null;
  function show(o) {
    if (o.accent) document.documentElement.style.setProperty('--accent', o.accent);
    el?.remove(); el = document.createElement('section'); el.className = 'co'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Record this call?');
    el.innerHTML = `<div class="co-top"><i>📞</i><div><b>Record this ${esc(o.name === 'your browser' ? 'call' : o.name + ' call')}?</b><small>${esc(o.name === 'your browser' ? 'Your browser' : o.name)} is using your microphone. JARVIS stops recording when the call ends.</small></div></div>
      <div class="co-btns"><button type="button" class="go" data-co="record">Record</button><button type="button" data-co="later">Not now</button><button type="button" class="never" data-co="never">Never for ${esc(o.name === 'your browser' ? 'the browser' : o.name)}</button></div>`;
    el.onclick = e => { const b = e.target.closest('[data-co]'); if (!b) return; J.call('call-offer-answer', {answer: b.dataset.co}).catch(() => {}); el?.remove(); el = null; };
    document.body.appendChild(el);
  }
  try { J.on('core', m => { if (m?.type === 'call-offer' && m.offer) show(m.offer); }); } catch {}
  addEventListener('keydown', e => { if (el && e.key === 'Escape') { J.call('call-offer-answer', {answer: 'later'}).catch(() => {}); el.remove(); el = null; } });
  window.__jarvisCallOffer = {show, get open() { return !!el; }};
}
