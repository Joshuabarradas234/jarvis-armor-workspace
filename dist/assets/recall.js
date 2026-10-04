/**
 * Your second brain (src/brain/recall.js): ask a question, and JARVIS answers from your emails, documents, meetings,
 * ideas, plans and Tower results, with numbered sources underneath. Ctrl+Alt+F, or "Jarvis, search everything for…".
 * Click a [2] in the answer to jump to that source; meeting notes, Tower results and documents open from here.
 */
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(location.search).get('view') || 'main';
if (J && VIEW === 'main') {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const cite = h => h.replace(/\[(\d{1,2})\]/g, '<a href="#" class="rc-cite" data-rc="cite" data-n="$1">$1</a>');
  const md = src => {
    const inline = t => cite(esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>'));
    let html = '', open = '';
    for (const raw of String(src || '').replace(/\r/g, '').split('\n')) {
      const l = raw.trimEnd(), ul = /^\s*[-*]\s+(.*)$/.exec(l), ol = /^\s*\d+[.)]\s+(.*)$/.exec(l), hd = /^#{1,4}\s+(.*)$/.exec(l), want = ul ? 'ul' : ol ? 'ol' : '';
      if (open && open !== want) { html += `</${open}>`; open = ''; }
      if (want) { if (!open) { html += `<${want}>`; open = want; } html += `<li>${inline((ul || ol)[1])}</li>`; continue; }
      if (hd) html += `<h6>${inline(hd[1])}</h6>`; else if (l.trim()) html += `<p>${inline(l)}</p>`;
    }
    return html + (open ? `</${open}>` : '');
  };
  const day = ms => ms ? new Date(ms).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'}) : '';
  const ICON = {email: '✉', document: '📄', meeting: '🎙', idea: '💡', plan: '🗺', brainstorm: '✦', tower: '🏢', note: '📝', orders: '📜', todo: '☑', event: '📅', date: '🔔'};
  const CSS = `
.rc-card{position:fixed;left:50%;top:9vh;transform:translateX(-50%);z-index:2147482999;width:min(760px,calc(100vw - 48px));max-height:80vh;display:flex;flex-direction:column;background:#06101af4;border:1px solid color-mix(in srgb,var(--accent,#5ad) 45%,#ffffff1a);border-radius:18px;box-shadow:0 30px 90px #000c,0 0 40px color-mix(in srgb,var(--accent,#5ad) 16%,transparent);font:14px/1.55 "Segoe UI",system-ui,sans-serif;color:#dcecf4;animation:rc-in .25s ease-out}
@keyframes rc-in{from{opacity:0;transform:translate(-50%,-10px)}}
.rc-card header{display:flex;align-items:center;gap:10px;padding:14px 16px 10px;border-bottom:1px solid #ffffff12}
.rc-card header b{flex:1;font:700 11px Consolas,monospace;letter-spacing:.24em;color:var(--accent,#5ad)}
.rc-card header button{background:none;border:0;color:#9fb6c4;font-size:19px;cursor:pointer;padding:0 4px}
.rc-ask{display:flex;gap:8px;padding:12px 16px}
.rc-ask input{flex:1;min-width:0;background:#020609;color:#e6f2f8;border:1px solid #ffffff22;border-radius:10px;padding:9px 12px;font:14px "Segoe UI",system-ui,sans-serif}
.rc-ask input:focus{outline:none;border-color:var(--accent,#5ad)}
.rc-ask button{background:var(--accent,#5ad);color:#041017;border:0;border-radius:10px;padding:8px 14px;font:600 13px "Segoe UI",system-ui,sans-serif;cursor:pointer}
.rc-body{overflow:auto;padding:0 16px 14px}
.rc-hint{color:#8fa9b8;font-size:13px;padding:2px 0 8px}
.rc-wait{color:var(--accent,#5ad);padding:6px 0 10px}.rc-bad{color:#ffb2a6;padding:6px 0 10px}
.rc-a p{margin:6px 0}.rc-a ul,.rc-a ol{margin:4px 0;padding-left:20px}.rc-a h6{margin:10px 0 2px;font-size:13px;color:var(--accent,#5ad)}.rc-a code{background:#ffffff12;padding:0 4px;border-radius:4px}
.rc-cite{display:inline-block;min-width:16px;padding:0 4px;margin:0 1px;border-radius:6px;background:color-mix(in srgb,var(--accent,#5ad) 22%,transparent);color:#e6f6ff;font-size:11px;line-height:16px;text-align:center;text-decoration:none;vertical-align:1px}
.rc-src{margin-top:12px;border-top:1px solid #ffffff12;padding-top:8px}
.rc-src h5{margin:4px 0 6px;font:700 10.5px Consolas,monospace;letter-spacing:.2em;color:#8fa9b8}
.rc-s{display:grid;grid-template-columns:28px 1fr auto;gap:2px 8px;padding:7px 8px;border-radius:10px;border:1px solid transparent}
.rc-s.on{border-color:color-mix(in srgb,var(--accent,#5ad) 60%,transparent);background:#ffffff08}
.rc-s .n{font:700 12px Consolas,monospace;color:var(--accent,#5ad);padding-top:2px}
.rc-s .t{font-weight:600;color:#e6f2f8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rc-s .m{grid-column:2;color:#8fa9b8;font-size:12px}
.rc-s .x{grid-column:2/4;color:#b8cdd8;font-size:12.5px;white-space:pre-wrap;display:none;max-height:180px;overflow:auto;background:#020609;border-radius:8px;padding:6px 8px;margin-top:4px}
.rc-s.open .x{display:block}
.rc-s button{background:#ffffff0d;color:#dcecf4;border:1px solid #ffffff26;border-radius:8px;padding:3px 9px;font:12px "Segoe UI",system-ui,sans-serif;cursor:pointer;align-self:start}
.rc-s.dim{opacity:.62}
.rc-miss{margin-top:8px;color:#8fa9b8;font-size:12px}`;
  let el = null, card = null;
  function close() { el?.remove(); el = null; }
  function render(c) {
    card = c;
    if (!document.getElementById('rc-style')) { const s = document.createElement('style'); s.id = 'rc-style'; s.textContent = CSS; document.head.appendChild(s); }
    const fresh = !el;
    if (!el) { el = document.createElement('section'); el.className = 'rc-card'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Second brain'); document.body.appendChild(el); }
    const typed = el.querySelector('[data-rc="q"]')?.value;
    const sources = c.sources || [];
    const body = c.busy ? '<div class="rc-wait">✦ Searching your emails, documents, meetings, ideas and Tower results…</div>'
      : c.error ? `<div class="rc-bad">⚠ ${esc(c.error)}</div>`
      : c.answer ? `<div class="rc-a">${md(c.answer)}</div>` +
        (sources.length ? `<div class="rc-src"><h5>SOURCES</h5>${sources.map(s => `<div class="rc-s${s.cited === false ? ' dim' : ''}" data-n="${s.n}">
          <span class="n">${s.n}</span><span class="t" title="${esc(s.title)}">${ICON[s.kind] || '•'} ${esc(s.title)}</span>
          <span>${s.excerpt ? '<button type="button" data-rc="show">Show</button>' : ''} ${s.ref ? `<button type="button" data-rc="open" data-ref="${esc(s.ref)}">Open</button>` : ''}</span>
          <span class="m">${esc(s.label)}${s.who ? ` · ${esc(s.who)}` : ''}${s.at ? ` · ${day(s.at)}` : ''}</span><div class="x">${esc(s.excerpt)}</div></div>`).join('')}</div>` : '') +
        (c.missed?.length ? `<div class="rc-miss">Not searched: ${c.missed.map(esc).join(' · ')}</div>` : '')
      : '<div class="rc-hint">Ask about anything in your emails, documents, meeting notes, ideas, plans, Tower results, notes, calendar, bills and dates. For example: “what did we agree with the landlord?”</div>';
    el.innerHTML = `<header><b>🧠 SECOND BRAIN</b><button type="button" data-rc="close" title="Close (Esc)">×</button></header>
      <div class="rc-ask"><input data-rc="q" maxlength="600" placeholder="What would you like to find?" aria-label="Question"><button type="button" data-rc="ask">Search</button></div>
      <div class="rc-body">${c.question && !c.open ? `<div class="rc-hint">“${esc(c.question)}”</div>` : ''}${body}</div>`;
    const input = el.querySelector('[data-rc="q"]');
    if (typed) input.value = typed;
    if (fresh || c.open) setTimeout(() => input.focus(), 30);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); act('ask').catch(() => {}); } });
    el.onclick = e => { const b = e.target.closest('[data-rc]'); if (!b) return; e.preventDefault(); act(b.dataset.rc, b).catch(err => { const m = el?.querySelector('.rc-miss') || el?.querySelector('.rc-body')?.appendChild(Object.assign(document.createElement('div'), {className: 'rc-miss'})); if (m) m.textContent = String(err?.message || err).replace(/^Error invoking remote method '[^']*': (Error: )?/, ''); }); };
  }
  async function act(k, b) {
    if (k === 'close') return close();
    if (k === 'ask') { const q = el?.querySelector('[data-rc="q"]')?.value.trim(); if (!q || card?.busy) return; el.querySelector('[data-rc="q"]').value = ''; await J.call('recall', {question: q}); return; }
    if (k === 'show') { b.closest('.rc-s')?.classList.toggle('open'); return; }
    if (k === 'open') { await J.call('recall-open', {ref: b.dataset.ref}); return; }
    if (k === 'cite') {
      const row = el?.querySelector(`.rc-s[data-n="${b.dataset.n}"]`); if (!row) return;
      el.querySelectorAll('.rc-s.on').forEach(x => x.classList.remove('on')); row.classList.add('on', 'open'); row.scrollIntoView({block: 'nearest', behavior: 'smooth'});
    }
  }
  try { J.on('core', m => { if (m?.type !== 'recall' || !m.card) return; if (m.card.open && el) { el.querySelector('[data-rc="q"]')?.focus(); return; } render(m.card); }); } catch {}
  addEventListener('keydown', e => { if (el && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);
  window.__jarvisRecall = {close, get open() { return !!el; }};
}
