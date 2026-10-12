/**
 * "Projects on your Desktop" (src/main/desktop-projects.js): a card in the hall that asks, one folder at a time,
 * which part of your life it is for (one hall each), then which suit. JARVIS never chooses for you. The folder moves
 * into the suit (or stays put and is linked, if you untick Move), and Put it back undoes it. Opens by itself at most
 * once a day when there is something new, or with "Jarvis, tidy my desktop" and the tray's File desktop projects.
 */
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(globalThis.location?.search || '').get('view') || 'main';
if (J && VIEW === 'main') {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const plain = e => String(e?.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  const TINT = {ironman: '#f4bd4f', batcave: '#d99a3c', spiderman: '#ff4d5e'};
  const ago = t => { if (!t) return ''; const d = Math.floor((Date.now() - t) / 864e5); return d < 1 ? 'changed today' : d === 1 ? 'changed yesterday' : d < 60 ? `changed ${d} days ago` : `changed ${Math.round(d / 30)} months ago`; };
  const CSS = `
.dp{position:fixed;top:70px;right:18px;z-index:8900;width:min(420px,calc(100vw - 36px));padding:14px 16px 14px;background:#06101af4;border:1px solid color-mix(in srgb,var(--accent,#7fd6e8) 40%,#ffffff1a);border-radius:16px;box-shadow:0 14px 40px #000a;font:13.5px/1.45 "Segoe UI",system-ui,sans-serif;color:#dcecf4;animation:dp-in .3s ease-out}
@keyframes dp-in{from{opacity:0;transform:translateY(-8px)}}
.dp header{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.dp header b{flex:1;font:700 10.5px Consolas,monospace;letter-spacing:.22em;color:var(--accent,#7fd6e8)}
.dp header span{color:#7f97a6;font-size:12px}
.dp header button{background:none;border:0;color:#9fb6c4;font-size:17px;cursor:pointer;padding:0 2px;line-height:1}
.dp-name{display:flex;align-items:baseline;gap:8px;font-size:17px;color:#fff;font-weight:600;word-break:break-word}
.dp-name small{font-size:11.5px;color:#7f97a6;font-weight:400;white-space:nowrap}
.dp p{margin:6px 0 10px;color:#a9bfcc}
.dp-areas{display:grid;gap:7px}
.dp-areas button,.dp-suits button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;padding:9px 12px;border:1px solid #ffffff1a;border-left:3px solid var(--t,#7fd6e8);border-radius:10px;background:#ffffff08;color:#eaf6fb;font:600 13.5px "Segoe UI",system-ui,sans-serif;cursor:pointer}
.dp-areas button:hover,.dp-suits button:hover{background:color-mix(in srgb,var(--t,#7fd6e8) 14%,transparent)}
.dp-areas small,.dp-suits small{margin-left:auto;font-weight:400;color:#7f97a6;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:55%}
.dp-suits{display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:260px;overflow-y:auto}
.dp-suits button{flex-direction:column;align-items:flex-start;gap:0;padding:7px 10px}.dp-suits small{margin-left:0;max-width:100%}
.dp-suits button.free small{color:#9fe3c0}
.dp-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.dp-row button{background:#ffffff0d;color:#dcecf4;border:1px solid #ffffff26;border-radius:9px;padding:6px 12px;font:12.5px "Segoe UI",system-ui,sans-serif;cursor:pointer}
.dp-row button.go{background:var(--accent,#7fd6e8);color:#041017;border-color:var(--accent,#7fd6e8);font-weight:600}
.dp label{display:flex;align-items:center;gap:8px;margin-top:10px;color:#a9bfcc;font-size:12.5px;cursor:pointer}
.dp .bad{color:#ffb2a6;margin:8px 0 0}.dp .ok{color:#9fe3c0}`;
  let el = null, data = null, i = 0, step = 'area', area = null, last = null, error = '', move = true;
  const folder = () => data?.folders?.[i] || null;
  function close() { el?.remove(); el = null; }
  function render() {
    if (!document.getElementById('dp-style')) { const s = document.createElement('style'); s.id = 'dp-style'; s.textContent = CSS; document.head.appendChild(s); }
    if (!el) { el = document.createElement('section'); el.className = 'dp'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Projects on your Desktop'); document.body.appendChild(el); }
    const f = folder(), n = data?.folders?.length || 0, bad = error ? `<p class="bad">${esc(error)}</p>` : '';
    const head = `<header><b>PROJECTS ON YOUR DESKTOP</b><span>${step === 'done' || !f ? '' : `${i + 1} of ${n}`}</span><button type="button" data-dp="close" aria-label="Close">×</button></header>`;
    if (step === 'done' && last) {
      el.innerHTML = `${head}<div class="dp-name">✓ ${esc(last.name)}</div><p class="ok">Now in <b>${esc(last.suitName)}</b>, in the ${esc(last.hall)}.</p><p>${last.moved ? `Moved to ${esc(last.to.replace(/^.*?(JARVIS Workspaces)/, '$1').replace(/\\/g, ' › '))}.` : 'Left where it is, and linked to the suit.'}</p>${bad}
        <div class="dp-row">${f ? '<button type="button" class="go" data-dp="next">Next folder</button>' : '<button type="button" class="go" data-dp="close">Done</button>'}<button type="button" data-dp="show">Show me</button><button type="button" data-dp="undo">Put it back</button></div>`;
    } else if (!f) {
      el.innerHTML = `${head}<div class="dp-name">Your Desktop is tidy</div><p>Every project folder is in a suit${data?.waiting ? `, apart from ${data.waiting} you asked me to leave for now` : ''}.</p>${bad}<div class="dp-row"><button type="button" class="go" data-dp="close">Close</button></div>`;
    } else if (step === 'suit' && area) {
      el.innerHTML = `${head}<div class="dp-name">${esc(f.name)}</div><p>Which suit in the ${esc(area.name)}?</p>
        <div class="dp-suits">${area.suits.map(s => `<button type="button" class="${s.free ? 'free' : ''}" style="--t:${TINT[area.id] || '#7fd6e8'}" data-suit="${esc(s.id)}">${esc(s.name)}<small>${s.free ? 'empty' : `has ${esc(s.folder)}`}</small></button>`).join('')}</div>
        <label><input type="checkbox" data-dp-move ${move ? 'checked' : ''}> Move it off the Desktop into the suit</label>${bad}
        <div class="dp-row"><button type="button" data-dp="back">Back</button></div>`;
    } else {
      el.innerHTML = `${head}<div class="dp-name">${esc(f.name)} <small>${esc(ago(f.modified))}</small></div><p>Which part of your life is this for?</p>
        <div class="dp-areas">${(data.halls || []).map(h => `<button type="button" style="--t:${TINT[h.id] || '#7fd6e8'}" data-area="${esc(h.id)}">${esc(h.area)}<small>${esc(h.name)}</small></button>`).join('')}</div>${bad}
        <div class="dp-row"><button type="button" data-dp="never">Not a project</button><button type="button" data-dp="later">Ask me next week</button></div>`;
    }
    el.onchange = e => { if (e.target.matches('[data-dp-move]')) move = e.target.checked; };
    el.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return; error = '';
      try {
        if (b.dataset.area) { area = data.halls.find(h => h.id === b.dataset.area); step = 'suit'; return render(); }
        if (b.dataset.suit) { b.disabled = true; last = await J.call('desk-project-file', {name: f.name, theme: area.id, suit: b.dataset.suit, move}); await load({keepLast: true}); step = 'done'; return render(); }
        const a = b.dataset.dp;
        if (a === 'close') return close();
        if (a === 'back') { step = 'area'; return render(); }
        if (a === 'next') { step = 'area'; area = null; i = 0; return render(); }
        if (a === 'never' || a === 'later') { data = await J.call('desk-project-skip', {name: f.name, never: a === 'never'}); i = 0; step = 'area'; return render(); }
        if (a === 'show') { await J.call('desk-project-show', {id: last.id}); return; }
        if (a === 'undo') { await J.call('desk-project-undo', {id: last.id}); last = null; await load(); step = 'area'; return render(); }
      } catch (err) { error = plain(err); render(); }
    };
  }
  async function load({keepLast = false} = {}) { data = await J.call('desk-projects'); i = 0; if (!keepLast) last = null; }
  async function open() { try { await load(); step = 'area'; area = null; error = ''; render(); } catch (e) { console.warn('desk projects', e); } }
  try { J.on('core', m => { if (m?.type === 'desk-projects') open(); }); } catch {}
  window.__jarvisDesk = {open, get shown() { return !!el; }, get step() { return step; }};
}
