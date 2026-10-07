/**
 * "JARVIS 1.94.0 is ready": a small banner in the hall when a newer JARVIS is out (src/main/one-click-update.js).
 * Install downloads it, checks its fingerprint and runs the installer; JARVIS closes and opens again. Later hides it
 * until the next check. Nothing installs without this click (or the tray menu's).
 */
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(globalThis.location?.search || '').get('view') || 'main';
if (J && VIEW === 'main') {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const CSS = `
.ur{position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9000;display:flex;align-items:center;gap:12px;max-width:min(720px,calc(100vw - 40px));padding:10px 12px 10px 16px;background:#06101af2;border:1px solid color-mix(in srgb,var(--accent,#7fd6e8) 45%,#ffffff1a);border-radius:14px;box-shadow:0 10px 30px #0009;font:13.5px/1.4 "Segoe UI",system-ui,sans-serif;color:#dcecf4;animation:ur-in .3s ease-out}
@keyframes ur-in{from{opacity:0;transform:translate(-50%,-10px)}}
.ur b{color:#fff}.ur span{color:#9fb6c4;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ur button{background:#ffffff0d;color:#dcecf4;border:1px solid #ffffff26;border-radius:9px;padding:6px 12px;font:12.5px "Segoe UI",system-ui,sans-serif;cursor:pointer;white-space:nowrap}
.ur button.go{background:var(--accent,#7fd6e8);color:#041017;border-color:var(--accent,#7fd6e8);font-weight:600}
.ur .bad{color:#ffb2a6}`;
  let el = null, update = null, hiddenFor = '';
  function render(state = {}) {
    if (!document.getElementById('ur-style')) { const s = document.createElement('style'); s.id = 'ur-style'; s.textContent = CSS; document.head.appendChild(s); }
    if (!el) { el = document.createElement('section'); el.className = 'ur'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.innerHTML = state.busy ? `<b>Updating JARVIS</b><span>${esc(state.busy)}</span>`
      : `<b>JARVIS ${esc(update.latest)} is ready</b><span${state.error ? ' class="bad"' : ''} title="${esc(state.error || update.notes)}">${esc(state.error || update.notes || 'A new version is available.')}</span>
         <button type="button" class="go" data-ur="install">Install now</button><button type="button" data-ur="later">Later</button>`;
    el.onclick = async e => {
      const b = e.target.closest('[data-ur]'); if (!b) return;
      if (b.dataset.ur === 'later') { hiddenFor = update.latest; el.remove(); el = null; return; }
      render({busy: 'Starting…'});
      try { await J.call('update-install', {version: update.latest}); }
      catch (err) { render({error: String(err?.message || err).replace(/^Error invoking remote method '[^']*': (Error: )?/, '')}); }
    };
  }
  try {
    J.on('core', m => {
      if (m?.type === 'update-ready' && m.update?.update) { update = m.update; if (hiddenFor !== update.latest) render(); }
      if (m?.type === 'update-progress' && el && update) { if (m.text) render({busy: m.text}); }
    });
  } catch {}
  window.__jarvisUpdate = {get shown() { return !!el; }};
}
