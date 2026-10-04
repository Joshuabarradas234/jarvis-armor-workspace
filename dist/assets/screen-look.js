/**
 * "Jarvis, look at my screen": the card with his answer (src/main/screen-look.js). It shows on the screen he looked at:
 * the main window for the top screen, the deck for the lower one. Ask follow-up questions about the same picture,
 * or look again. Nothing here is saved.
 */
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(location.search).get('view') || 'main';
if (J && (VIEW === 'main' || VIEW === 'console')) {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const md = src => {
    const inline = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    let html = '', open = '', code = false;
    for (const raw of String(src || '').replace(/\r/g, '').split('\n')) {
      if (/^```/.test(raw.trim())) { if (open) { html += `</${open}>`; open = ''; } html += code ? '</pre>' : '<pre>'; code = !code; continue; }
      if (code) { html += esc(raw) + '\n'; continue; }
      const l = raw.trimEnd(), ul = /^\s*[-*]\s+(.*)$/.exec(l), ol = /^\s*\d+[.)]\s+(.*)$/.exec(l), hd = /^#{1,4}\s+(.*)$/.exec(l), want = ul ? 'ul' : ol ? 'ol' : '';
      if (open && open !== want) { html += `</${open}>`; open = ''; }
      if (want) { if (!open) { html += `<${want}>`; open = want; } html += `<li>${inline((ul || ol)[1])}</li>`; continue; }
      if (hd) html += `<h6>${inline(hd[1])}</h6>`; else if (l.trim()) html += `<p>${inline(l)}</p>`;
    }
    return html + (open ? `</${open}>` : '') + (code ? '</pre>' : '');
  };
  const CSS = `
.sl-card{position:fixed;right:24px;bottom:96px;z-index:2147483000;width:min(460px,calc(100vw - 48px));max-height:min(70vh,640px);display:flex;flex-direction:column;background:#06101af2;border:1px solid color-mix(in srgb,var(--accent,#5ad) 45%,#ffffff1a);border-radius:16px;box-shadow:0 24px 70px #000b,0 0 30px color-mix(in srgb,var(--accent,#5ad) 18%,transparent);font:13.5px/1.55 "Segoe UI",system-ui,sans-serif;color:#dcecf4;animation:sl-in .25s ease-out}
@keyframes sl-in{from{opacity:0;transform:translateY(12px)}}
.sl-card header{display:flex;align-items:center;gap:10px;padding:12px 14px 8px;border-bottom:1px solid #ffffff12}
.sl-card header b{flex:1;font:700 11px Consolas,monospace;letter-spacing:.24em;color:var(--accent,#5ad)}
.sl-card header button{background:none;border:0;color:#9fb6c4;font-size:18px;cursor:pointer;padding:0 4px}
.sl-q{padding:8px 14px 0;color:#8fa9b8;font-size:12.5px}
.sl-a{overflow:auto;padding:6px 14px 10px}
.sl-a p{margin:6px 0}.sl-a ul,.sl-a ol{margin:4px 0;padding-left:20px}.sl-a h6{margin:10px 0 2px;font-size:13px;color:var(--accent,#5ad)}
.sl-a code{background:#ffffff12;padding:0 4px;border-radius:4px}.sl-a pre{background:#020609;border:1px solid #ffffff14;border-radius:8px;padding:8px 10px;overflow:auto;font:12px Consolas,monospace;white-space:pre-wrap}
.sl-wait{padding:14px;color:var(--accent,#5ad)}.sl-bad{padding:10px 14px;color:#ffb2a6}
.sl-card footer{display:flex;gap:8px;padding:10px 14px 12px;border-top:1px solid #ffffff12}
.sl-card footer input{flex:1;min-width:0;background:#020609;color:#e6f2f8;border:1px solid #ffffff22;border-radius:9px;padding:7px 10px;font:13px "Segoe UI",system-ui,sans-serif}
.sl-card footer input:focus{outline:none;border-color:var(--accent,#5ad)}
.sl-card footer button{background:#ffffff0d;color:#dcecf4;border:1px solid #ffffff26;border-radius:9px;padding:6px 10px;font:12.5px "Segoe UI",system-ui,sans-serif;cursor:pointer}
.sl-card footer button.sl-go{background:var(--accent,#5ad);color:#041017;border-color:var(--accent,#5ad);font-weight:600}`;
  let el = null, last = null;
  const mine = card => VIEW === 'main' ? card.display !== 'other' : card.display === 'other';
  function close() { el?.remove(); el = null; }
  function render(card) {
    if (!document.getElementById('sl-style')) { const s = document.createElement('style'); s.id = 'sl-style'; s.textContent = CSS; document.head.appendChild(s); }
    if (!el) { el = document.createElement('section'); el.className = 'sl-card'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'What JARVIS sees'); document.body.appendChild(el); }
    const body = card.busy ? '<div class="sl-wait">✦ Looking at your screen…</div>' : card.error ? `<div class="sl-bad">⚠ ${esc(card.error)}</div>` : `<div class="sl-a">${md(card.answer)}</div>`;
    el.innerHTML = `<header><b>👁 WHAT I SEE</b><button type="button" data-sl="close" title="Close (Esc)">×</button></header>
      ${card.question && !/^What is on my screen, and how can you help\?$/.test(card.question) ? `<div class="sl-q">“${esc(card.question)}”</div>` : ''}${body}
      ${card.busy ? '' : `<footer><input data-sl="q" maxlength="600" placeholder="Ask about this screen…" aria-label="Ask about this screen"><button type="button" class="sl-go" data-sl="ask">Ask</button><button type="button" data-sl="again" title="Take a new look">Look again</button>${card.answer ? '<button type="button" data-sl="copy">Copy</button>' : ''}</footer>`}`;
    el.onclick = e => { const b = e.target.closest('[data-sl]'); if (!b) return; act(b.dataset.sl).catch(() => {}); };
    el.querySelector('[data-sl="q"]')?.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); act('ask').catch(() => {}); } });
  }
  async function act(k) {
    if (k === 'close') return close();
    if (k === 'copy') { await navigator.clipboard.writeText(last?.answer || ''); const b = el?.querySelector('[data-sl="copy"]'); if (b) b.textContent = 'Copied'; return; }
    if (k === 'ask') { const q = el?.querySelector('[data-sl="q"]')?.value.trim(); if (!q) return; await J.call('screen-look', {question: q, follow: true}); return; }
    if (k === 'again') { close(); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); await J.call('screen-look', {question: '', follow: false}); }   // out of the picture first
  }
  try { J.on('core', m => { const card = m?.type === 'screen-look' && m.card; if (!card) return; if (card.busy) { if (VIEW === 'main' && !el) render(card); else if (el) render(card); return; } if (!mine(card)) { if (el && VIEW === 'main' && card.display === 'other') close(); return; } last = card; render(card); }); } catch {}
  addEventListener('keydown', e => { if (el && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
  window.__jarvisScreenLook = {close, get open() { return !!el; }};
}
