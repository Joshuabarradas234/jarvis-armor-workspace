/**
 * The think room (src/main/think-room.js): one window per screen. Each screen has its own tabs; the board (ideas,
 * questions, decisions, next steps, with JARVIS beside it) is a tab too. Drag a tab off this screen and let go over
 * another one to move it there, or use the little screen numbers on the tab. Everything is kept for the project.
 */
const J = globalThis.window?.jarvis;
const Q = new URLSearchParams(globalThis.location?.search || '');
if (J && Q.get('view') === 'room') {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const md = src => {
    const inline = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    let html = '', open = '', code = false;
    for (const raw of String(src || '').replace(/\r/g, '').split('\n')) {
      if (/^```/.test(raw.trim())) { if (open) { html += `</${open}>`; open = ''; } html += code ? '</pre>' : '<pre>'; code = !code; continue; }
      if (code) { html += esc(raw) + '\n'; continue; }
      const l = raw.trimEnd(), ul = /^\s*[-*•]\s+(.*)$/.exec(l), ol = /^\s*\d+[.)]\s+(.*)$/.exec(l), hd = /^#{1,4}\s+(.*)$/.exec(l), want = ul ? 'ul' : ol ? 'ol' : '';
      if (open && open !== want) { html += `</${open}>`; open = ''; }
      if (want) { if (!open) { html += `<${want}>`; open = want; } html += `<li>${inline((ul || ol)[1])}</li>`; continue; }
      if (hd) html += `<h4>${inline(hd[1])}</h4>`; else if (l.trim()) html += `<p>${inline(l)}</p>`;
    }
    return html + (open ? `</${open}>` : '') + (code ? '</pre>' : '');
  };
  const plain = e => String(e?.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  const TINT = {all: ['#7fd6e8', '#2f8fbf'], ironman: ['#f4bd4f', '#e2483a'], batcave: ['#d5dde8', '#d99a3c'], spiderman: ['#ff4d5e', '#3f7dff']};
  const COLS = [['ideas', 'Ideas', 'What could we do?'], ['questions', 'Questions', 'What do we need to find out?'], ['decisions', 'Decided', 'What have we settled?'], ['next', 'Next steps', 'What happens next?']];
  const CSS = `
:root{--c1:#7fd6e8;--c2:#2f8fbf}
*{box-sizing:border-box}
body{font:14px/1.5 "Segoe UI",system-ui,sans-serif;color:#dcecf4;background:radial-gradient(90% 70% at 15% 0%,color-mix(in srgb,var(--c2) 20%,#050b11),#050b11 60%) fixed,#050b11;user-select:none}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(#ffffff05 1px,transparent 1px),linear-gradient(90deg,#ffffff05 1px,transparent 1px);background-size:32px 32px}
.tr{position:relative;display:flex;flex-direction:column;height:100vh}
.tr-top{display:flex;align-items:center;gap:14px;padding:10px 14px 8px 16px;-webkit-app-region:drag}
.tr-top>*:not(.orb):not(.tr-name){-webkit-app-region:no-drag}
.orb{position:relative;width:30px;height:30px;flex:none}
.orb i{position:absolute;inset:0;border-radius:50%;border:2px solid var(--c1)}
.orb i:nth-child(2){inset:6px;border:1.5px dashed var(--c2);animation:tr-spin 9s linear infinite}
.orb i:nth-child(3){inset:11px;border:0;background:radial-gradient(circle,#fff,var(--c1) 45%,transparent 75%);box-shadow:0 0 14px var(--c1);animation:tr-breathe 3.2s ease-in-out infinite}
.busy .orb i:nth-child(2){animation-duration:1.3s}.busy .orb i:nth-child(3){animation-duration:.8s}
@keyframes tr-spin{to{transform:rotate(360deg)}}@keyframes tr-breathe{50%{opacity:.55;transform:scale(.8)}}
.tr-name{display:flex;flex-direction:column;line-height:1.15;min-width:0}
.tr-name b{font:700 11px Consolas,monospace;letter-spacing:.3em;color:var(--c1)}
.tr-name select{-webkit-app-region:no-drag;margin-top:2px;background:transparent;color:#eaf6fb;border:0;font:600 15px "Segoe UI",system-ui,sans-serif;padding:0;cursor:pointer;max-width:340px}
.tr-name select option{background:#0a141d}
.tr-area{color:#7f97a6;font-size:12.5px;align-self:flex-end;margin-bottom:3px}
.tr-fill{flex:1}
.tr-screens{display:flex;align-items:center;gap:5px;color:#7f97a6;font-size:12px}
.tr-screens button{width:28px;height:26px;border-radius:7px;border:1px solid #ffffff22;background:#ffffff08;color:#7f97a6;font:700 12px Consolas,monospace;cursor:pointer}
.tr-screens button[aria-pressed=true]{color:#041017;background:var(--c1);border-color:var(--c1)}
.tr-screens button.here{outline:2px solid color-mix(in srgb,var(--c1) 60%,transparent);outline-offset:2px}
.btn{border:1px solid #ffffff22;background:#ffffff0a;color:#dcecf4;border-radius:9px;padding:6px 13px;font:12.5px "Segoe UI",system-ui,sans-serif;cursor:pointer;white-space:nowrap}
.btn:hover{border-color:color-mix(in srgb,var(--c1) 55%,transparent)}.btn.go{background:linear-gradient(135deg,var(--c1),var(--c2));border-color:transparent;color:#041017;font-weight:700}
.btn.leave{color:#ffc9bf;border-color:#ff8a7a44}
.tr-strip{display:flex;align-items:center;gap:6px;padding:0 14px 8px;min-height:44px}
.tr-tabs{display:flex;gap:6px;overflow-x:auto;flex:1;min-width:0;scrollbar-width:none}
.chip{position:relative;flex:none;display:flex;align-items:center;gap:7px;max-width:230px;height:34px;padding:0 6px 0 11px;border-radius:10px;border:1px solid #ffffff17;background:#ffffff08;color:#bcd0dc;cursor:grab;font:600 12.5px "Segoe UI",system-ui,sans-serif}
.chip[aria-selected=true]{background:color-mix(in srgb,var(--c1) 15%,#0b1822);border-color:color-mix(in srgb,var(--c1) 55%,transparent);color:#fff}
.chip.board{border-left:3px solid var(--c1)}
.chip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chip .dot{width:7px;height:7px;border-radius:50%;background:var(--c1);flex:none;animation:tr-breathe 1s infinite}
.chip .mv{display:none;gap:2px}.chip:hover .mv,.chip:focus-within .mv{display:flex}
.chip .mv button,.chip .x{border:0;background:#ffffff10;color:#9fb6c4;border-radius:6px;font:700 11px Consolas,monospace;padding:3px 5px;cursor:pointer}
.chip .mv button:hover,.chip .x:hover{background:var(--c1);color:#041017}
.chip .x{background:none;font:16px/1 "Segoe UI",sans-serif;padding:2px 5px}
.chip.drag{opacity:.55;cursor:grabbing}
.tr-addr{flex:none;width:min(320px,30vw)}
.tr-addr input{width:100%;height:34px;border-radius:10px;border:1px solid #ffffff1c;background:#08121b;color:#eaf6fb;padding:0 12px;font:13px "Segoe UI",system-ui,sans-serif;outline:0}
.tr-addr input:focus{border-color:color-mix(in srgb,var(--c1) 60%,transparent)}
.tr-nav{display:none;gap:4px}.tr-nav.on{display:flex}
.tr-nav button{width:30px;height:30px;border-radius:8px;border:1px solid #ffffff17;background:#ffffff08;color:#bcd0dc;cursor:pointer;font-size:14px}
.tr-page{position:relative;flex:1;min-height:0;margin:0 14px 14px;border-radius:14px;border:1px solid #ffffff12;background:#060e15cc;overflow:hidden}
.tr-hint{position:absolute;inset:0;display:grid;place-items:center;text-align:center;color:#7f97a6;padding:30px}
.tr-hint h2{margin:0 0 8px;font:300 22px "Segoe UI",system-ui,sans-serif;color:#dcecf4}
.tr-drop{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);padding:9px 16px;border-radius:999px;background:#06101af4;border:1px solid var(--c1);color:#eaf6fb;font-size:13px;display:none;z-index:50}
.tr-drop.on{display:block}
.tr-toast{position:fixed;right:22px;bottom:22px;max-width:420px;padding:10px 14px;border-radius:12px;background:#06101af4;border:1px solid #ffffff22;color:#dcecf4;font-size:13px;opacity:0;transform:translateY(8px);transition:.2s;pointer-events:none;z-index:60}
.tr-toast.on{opacity:1;transform:none}.tr-toast.bad{border-color:#ff8a7a88;color:#ffd2ca}
.tb{position:absolute;inset:0;display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,30%);}
.tb-cols{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;padding:14px;min-height:0}
.tb-col{display:flex;flex-direction:column;min-height:0;border-radius:12px;background:#ffffff05;border:1px solid #ffffff0f;transition:border-color .15s,background .15s}
.tb-col.over{border-color:var(--c1);background:color-mix(in srgb,var(--c1) 8%,transparent)}
.tb-col h3{display:flex;align-items:center;gap:8px;margin:0;padding:11px 12px 4px;font:700 11.5px Consolas,monospace;letter-spacing:.16em;text-transform:uppercase;color:var(--c1)}
.tb-col h3 span{color:#7f97a6;letter-spacing:0}.tb-col h3 button{margin-left:auto;border:0;background:#ffffff10;color:#dcecf4;width:24px;height:24px;border-radius:7px;cursor:pointer;font-size:16px;line-height:1}
.tb-col small{padding:0 12px 8px;color:#6f8796;font-size:11.5px}
.tb-cards{flex:1;overflow-y:auto;padding:2px 10px 12px;display:flex;flex-direction:column;gap:8px;scrollbar-width:thin;scrollbar-color:#ffffff22 transparent}
.tc{padding:9px 11px 7px;border-radius:10px;background:#0c1823;border:1px solid #ffffff14;box-shadow:0 2px 8px #0005;cursor:grab;user-select:text}
.tc:hover{border-color:color-mix(in srgb,var(--c1) 40%,transparent)}
.tc.by-jarvis{border-left:3px solid color-mix(in srgb,var(--c1) 70%,transparent)}
.tc.done p{text-decoration:line-through;color:#7f97a6}
.tc p{margin:0;font-size:13.5px;line-height:1.45;overflow-wrap:anywhere}
.tc footer{display:flex;align-items:center;gap:4px;margin-top:6px;min-height:20px}
.tc footer .by{font:700 9.5px Consolas,monospace;letter-spacing:.14em;color:#6f8796;margin-right:auto}
.tc footer button{border:0;background:none;color:#6f8796;font:11.5px "Segoe UI",system-ui,sans-serif;cursor:pointer;padding:1px 5px;border-radius:5px;opacity:0;transition:opacity .12s}
.tc:hover footer button,.tc:focus-within footer button{opacity:1}.tc footer button:hover{color:#fff;background:#ffffff12}
.tc textarea{width:100%;min-height:60px;resize:vertical;border:1px solid var(--c1);border-radius:8px;background:#08121b;color:#eaf6fb;font:13.5px/1.45 "Segoe UI",system-ui,sans-serif;padding:6px 8px;outline:0}
.tc.dragging{opacity:.4}
.tb-empty{margin:4px 2px;padding:14px 10px;border:1px dashed #ffffff1c;border-radius:10px;color:#6f8796;font-size:12.5px;text-align:center}
.tb-dock{display:flex;flex-direction:column;min-height:0;border-left:1px solid #ffffff10;background:linear-gradient(#0a141dcc,#060d14ee)}
.tb-head{display:flex;align-items:center;gap:12px;padding:14px 16px 10px}
.tb-head .orb{width:44px;height:44px}.tb-head .orb i:nth-child(2){inset:9px}.tb-head .orb i:nth-child(3){inset:16px}
.tb-head b{display:block;font:600 15px "Segoe UI",system-ui,sans-serif;color:#eaf6fb}.tb-head span{color:#7f97a6;font-size:12.5px}
.tb-log{flex:1;overflow-y:auto;padding:0 16px 8px;user-select:text;scrollbar-width:thin;scrollbar-color:#ffffff22 transparent}
.tb-earlier{margin:4px 0;border:1px dashed #ffffff1f;border-radius:10px;padding:6px 10px;color:#9fb6c4;font-size:12.5px}.tb-earlier summary{cursor:pointer;color:#7f97a6}
.m{margin:10px 0}.m.me{display:flex;justify-content:flex-end}
.m .b{padding:8px 12px;border-radius:13px 13px 13px 4px;background:#0c1823;border:1px solid #ffffff12;font-size:13.5px;overflow-wrap:anywhere}
.m.me .b{border-radius:13px 13px 4px 13px;background:color-mix(in srgb,var(--c1) 14%,#0b1822);border-color:color-mix(in srgb,var(--c1) 28%,transparent);max-width:85%;white-space:pre-wrap}
.m .b p{margin:0 0 6px}.m .b p:last-child{margin:0}.m .b h4{margin:8px 0 3px;color:var(--c1);font-size:13px}.m .b ul,.m .b ol{margin:2px 0 6px;padding-left:18px}
.m .acts{display:flex;gap:4px;margin-top:3px}.m .acts button{border:0;background:none;color:#7f97a6;font:12px "Segoe UI",system-ui,sans-serif;cursor:pointer;padding:2px 6px;border-radius:6px}.m .acts button:hover{color:#fff;background:#ffffff10}
.dots{display:flex;gap:5px;padding:10px 2px}.dots i{width:7px;height:7px;border-radius:50%;background:var(--c1);animation:tr-dot 1.1s infinite}.dots i:nth-child(2){animation-delay:.15s}.dots i:nth-child(3){animation-delay:.3s}
@keyframes tr-dot{50%{opacity:1;transform:translateY(-4px)}0%,100%{opacity:.3}}
.tb-tools{display:flex;gap:6px;padding:6px 16px 0}
.tb-ask{display:flex;gap:8px;align-items:flex-end;margin:8px 16px 16px;padding:6px 6px 6px 12px;border-radius:13px;border:1px solid color-mix(in srgb,var(--c1) 35%,#ffffff1a);background:#08121bf0}
.tb-ask textarea{flex:1;resize:none;border:0;outline:0;background:none;color:#eaf6fb;font:14px/1.5 "Segoe UI",system-ui,sans-serif;max-height:140px;padding:5px 0}
.tb-ask textarea::placeholder{color:#6f8796}`;
  let S = {n: Number(Q.get('screen')) || 1, tabs: [], screens: [], cards: [], thread: {summary: '', messages: []}, busy: false, project: {name: '', theme: 'all'}, projects: [], key: ''};
  let editing = null, dragCard = null;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.className = 'tr';
  root.innerHTML = `<header class="tr-top"><div class="orb" aria-hidden="true"><i></i><i></i><i></i></div><div class="tr-name"><b>THINK ROOM</b><select data-project aria-label="Project"></select></div><span class="tr-area" data-area></span><span class="tr-fill"></span>
    <div class="tr-screens" data-screens aria-label="Screens in the room"></div><button type="button" class="btn" data-act="save">Save to project</button><button type="button" class="btn leave" data-act="leave">Leave the room</button></header>
    <nav class="tr-strip"><div class="tr-tabs" data-tabs role="tablist"></div><div class="tr-nav" data-nav><button type="button" data-nav-cmd="back" title="Back">←</button><button type="button" data-nav-cmd="forward" title="Forward">→</button><button type="button" data-nav-cmd="reload" title="Reload">⟳</button><button type="button" data-nav-cmd="external" title="Open in your browser">↗</button></div>
    <form class="tr-addr" data-addr><input data-addr-in placeholder="Open a page: an address, or search" aria-label="Open a page"></form></nav>
    <main class="tr-page" data-page></main><div class="tr-drop" data-drop>Let go over another screen to move it there</div><p class="tr-toast" data-toast role="status"></p>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s), page = $('[data-page]');
  let toastTimer = null;
  const toast = (text, bad = false) => { const t = $('[data-toast]'); t.textContent = text; t.className = `tr-toast on${bad ? ' bad' : ''}`; clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.className = 'tr-toast'; }, bad ? 6000 : 3500); };
  const call = (m, p) => J.call(m, p).catch(e => { toast(plain(e), true); throw e; });
  const active = () => S.tabs.find(t => t.active) || null;
  const boardHere = () => active()?.board;
  function tint() { const t = TINT[S.project?.theme] || TINT.all; document.documentElement.style.setProperty('--c1', t[0]); document.documentElement.style.setProperty('--c2', t[1]); }
  function renderTop() {
    const sel = $('[data-project]'); sel.innerHTML = S.projects.map(p => `<option value="${esc(p.key)}"${p.key === S.key ? ' selected' : ''}>${esc(p.name)}${p.area ? ` · ${esc(p.area)}` : ''}</option>`).join('');
    $('[data-area]').textContent = S.project?.suit ? `in ${S.project.suit}` : '';
    $('[data-screens]').innerHTML = `<span>Screens</span>` + S.screens.map(s => `<button type="button" data-scr="${s.n}" aria-pressed="${s.on}" class="${s.n === S.n ? 'here' : ''}" title="${esc(`${s.label}${s.n === S.n ? ' (this one)' : ''}: ${s.on ? 'in the room, click to leave it to Windows' : 'click to add it to the room'}`)}">${s.n}</button>`).join('');
    $('[data-act=save]').disabled = !S.project?.folder; $('[data-act=save]').title = S.project?.folder ? 'Write the board into JARVIS board.md in the project folder' : 'Give this suit a folder to save into';
    root.classList.toggle('busy', !!S.busy); tint();
  }
  function renderTabs() {
    const others = S.screens.filter(s => s.on && s.n !== S.n);
    $('[data-tabs]').innerHTML = S.tabs.map(t => `<div class="chip${t.board ? ' board' : ''}" role="tab" tabindex="0" data-tab="${esc(t.id)}" aria-selected="${!!t.active}" title="${esc(t.board ? 'The board: drag it to another screen, or use the numbers' : `${t.title}\n${t.url}`)}">${t.loading ? '<i class="dot"></i>' : ''}<span>${t.board ? '◈ Board' : esc(t.title || t.url)}</span>
      ${others.length ? `<span class="mv">${others.map(s => `<button type="button" data-move="${s.n}" title="Move to screen ${s.n}">→${s.n}</button>`).join('')}</span>` : ''}${t.board ? '' : '<button type="button" class="x" data-close title="Close the tab">×</button>'}</div>`).join('');
    $('[data-nav]').classList.toggle('on', !!active() && !active().board);
  }
  function renderPage() {
    const a = active();
    if (a?.board) { renderBoard(); return; }
    if (a) { page.innerHTML = `<div class="tr-hint"><div>Loading ${esc(a.title || a.url)}…</div></div>`; return; }
    page.innerHTML = `<div class="tr-hint"><div><h2>This screen is part of the room</h2><p>Open a page above, or drag a tab here from another screen.</p>${S.screens.some(s => s.board && s.n !== S.n) ? '<p><button type="button" class="btn" data-act="board-here">Bring the board here</button></p>' : ''}</div></div>`;
  }
  const cardHtml = c => `<article class="tc${c.by === 'jarvis' ? ' by-jarvis' : ''}${c.done ? ' done' : ''}" draggable="true" data-card="${esc(c.id)}">${editing === c.id ? `<textarea data-edit aria-label="Card text">${esc(c.text)}</textarea>` : `<p>${esc(c.text)}</p>`}
    <footer><span class="by">${c.by === 'jarvis' ? 'JARVIS' : 'YOU'}</span>${c.col === 'next' ? `<button type="button" data-c="done">${c.done ? 'Not done' : 'Done'}</button><button type="button" data-c="todo" title="Add to my to-dos">To-do</button>` : ''}<button type="button" data-c="edit">Edit</button><button type="button" data-c="del" title="Remove">×</button></footer></article>`;
  function boardCols() {
    return COLS.map(([id, label, hint]) => { const l = S.cards.filter(c => c.col === id); return `<div class="tb-col" data-col="${id}"><h3>${label} <span>${l.length || ''}</span><button type="button" data-add="${id}" title="Add a card">+</button></h3><small>${hint}</small><div class="tb-cards">${l.map(cardHtml).join('') || '<div class="tb-empty">Drop a card here, or press +</div>'}</div></div>`; }).join('');
  }
  function dockLog() {
    const m = S.thread.messages || [];
    if (!m.length && !S.thread.summary) return `<div class="m"><div class="b"><p>Think out loud, ${esc(S.address || 'sir')}. I'll build on it, and you can pin anything I say to the board.</p></div></div>`;
    return (S.thread.summary ? `<details class="tb-earlier"><summary>Earlier in this conversation</summary>${md(S.thread.summary)}</details>` : '') +
      m.map((x, i) => x.role === 'user' ? `<div class="m me"><div class="b">${esc(x.content)}</div></div>` : `<div class="m"><div class="b">${md(x.content)}</div><div class="acts"><button type="button" data-pin="${i}">Pin to board</button><button type="button" data-say="${i}">Read aloud</button></div></div>`).join('') +
      (S.busy ? '<div class="m"><div class="dots" aria-label="Thinking"><i></i><i></i><i></i></div></div>' : '');
  }
  function renderBoard({keepDock = false} = {}) {
    if (!page.querySelector('.tb')) page.innerHTML = `<div class="tb"><section class="tb-cols" data-cols></section><aside class="tb-dock"><div class="tb-head"><div class="orb" aria-hidden="true"><i></i><i></i><i></i></div><div><b>Thinking with you</b><span data-dock-sub></span></div></div>
      <div class="tb-log" data-log aria-live="polite"></div><div class="tb-tools"><button type="button" class="btn" data-act="sort">Sort the conversation onto the board</button></div>
      <form class="tb-ask" data-ask><textarea rows="1" data-ask-in placeholder="Think out loud…" aria-label="Your message"></textarea><button type="submit" class="btn go">Send</button></form></aside></div>`;
    $('[data-cols]').innerHTML = boardCols();
    $('[data-dock-sub]').textContent = S.project?.name || '';
    if (!keepDock) { const log = $('[data-log]'); log.innerHTML = dockLog(); log.scrollTop = log.scrollHeight; }
    const ed = page.querySelector('[data-edit]'); if (ed) { ed.focus(); ed.setSelectionRange(ed.value.length, ed.value.length); }
  }
  function renderDock() { if (!boardHere() || !page.querySelector('.tb')) return; const log = $('[data-log]'); log.innerHTML = dockLog(); log.scrollTop = log.scrollHeight; $('[data-act=sort]').disabled = S.busy; }
  /** Where the web page goes on this screen: the page area, or nowhere while the board or a hint shows. */
  function layout() { const a = active(), r = page.getBoundingClientRect(); J.call('room-layout', a && !a.board ? {x: r.left + 1, y: r.top + 1, width: r.width - 2, height: r.height - 2} : {x: 0, y: 0, width: 0, height: 0}).catch(() => {}); }
  new ResizeObserver(layout).observe(page);
  function render() { renderTop(); renderTabs(); renderPage(); layout(); }
  const setCards = cards => { S.cards = cards; renderBoard({keepDock: true}); return call('room-cards', {cards}); };
  const newId = () => (crypto.randomUUID?.() || String(Date.now() + Math.random())).replace(/[^\w-]/g, '').slice(0, 40);

  /* ---------- clicks ---------- */
  root.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) { const chip = e.target.closest('[data-tab]'); if (chip && !moved) call('room-tab-activate', {id: chip.dataset.tab}).catch(() => {}); return; }
    const chip = b.closest('[data-tab]');
    try {
      if (b.dataset.move) return await call('room-tab-move', {id: chip.dataset.tab, screen: Number(b.dataset.move)});
      if (b.hasAttribute('data-close')) return await call('room-tab-close', {id: chip.dataset.tab});
      if (b.dataset.navCmd) return await call('room-tab-nav', {id: active()?.id, command: b.dataset.navCmd});
      if (b.dataset.scr) { const s = S.screens.find(x => x.n === Number(b.dataset.scr)); return await call('room-screen', {screen: s.n, on: !s.on}); }
      if (b.dataset.add) { const c = {id: newId(), col: b.dataset.add, text: '…', by: 'you', at: Date.now()}; S.cards = [...S.cards, c]; editing = c.id; renderBoard({keepDock: true}); const ed = page.querySelector('[data-edit]'); if (ed) { ed.value = ''; } return; }
      if (b.dataset.pin) { const n = await call('room-pin', {index: Number(b.dataset.pin)}); toast(n ? `${n} card${n === 1 ? '' : 's'} on the board.` : 'Those are already on the board.'); return; }
      if (b.dataset.say) return void call('room-say', {index: Number(b.dataset.say)}).catch(() => {});
      if (b.dataset.c) {
        const id = b.closest('[data-card]').dataset.card, c = S.cards.find(x => x.id === id); if (!c) return;
        if (b.dataset.c === 'edit') { editing = id; return renderBoard({keepDock: true}); }
        if (b.dataset.c === 'del') return void setCards(S.cards.filter(x => x.id !== id)).catch(() => {});
        if (b.dataset.c === 'done') return void setCards(S.cards.map(x => x.id === id ? {...x, done: !x.done} : x)).catch(() => {});
        if (b.dataset.c === 'todo') { await call('room-todo', {text: c.text}); toast('Added to your to-dos.'); return; }
      }
      const act = b.dataset.act;
      if (act === 'leave') { const r = await call('room-leave'); return void r; }
      if (act === 'save') { const r = await call('room-save'); toast(`Saved to ${r.file.split(/[\\/]/).slice(-2).join(' › ')}.`); return; }
      if (act === 'sort') { b.disabled = true; const n = await call('room-sort'); toast(n ? `JARVIS put ${n} card${n === 1 ? '' : 's'} on the board.` : 'Nothing new to add to the board.'); return; }
      if (act === 'board-here') return await call('room-tab-move', {id: 'board', screen: S.n});
    } catch {}
  });
  $('[data-project]').addEventListener('change', e => call('room-open', {key: e.target.value}).catch(() => {}));
  $('[data-addr]').addEventListener('submit', e => { e.preventDefault(); const i = $('[data-addr-in]'), v = i.value.trim(); if (!v) return; call('room-tab-open', {text: v}).then(() => { i.value = ''; i.blur(); }).catch(() => {}); });
  page.addEventListener('submit', async e => {
    if (!e.target.matches('[data-ask]')) return; e.preventDefault();
    const i = e.target.querySelector('[data-ask-in]'), text = i.value.trim(); if (!text || S.busy) return;
    i.value = ''; S.thread = {...S.thread, messages: [...(S.thread.messages || []), {role: 'user', content: text}]}; S.busy = true; renderDock();
    try { await call('room-ask', {text}); } catch { i.value = text; }
  });
  page.addEventListener('keydown', e => {
    if (e.target.matches('[data-ask-in]') && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.target.form.requestSubmit(); }
    if (e.target.matches('[data-edit]')) {
      if (e.key === 'Escape') { const c = S.cards.find(x => x.id === editing); editing = null; if (c && (c.text === '…' || !c.text.trim())) S.cards = S.cards.filter(x => x.id !== c.id); renderBoard({keepDock: true}); }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.target.blur(); }
    }
  });
  page.addEventListener('focusout', e => {
    if (!e.target.matches('[data-edit]')) return;
    const id = editing, text = e.target.value.trim(); editing = null;
    setCards(text ? S.cards.map(c => c.id === id ? {...c, text} : c) : S.cards.filter(c => c.id !== id)).catch(() => {});
  });
  page.addEventListener('input', e => { if (e.target.matches('[data-ask-in]')) { e.target.style.height = 'auto'; e.target.style.height = Math.min(140, e.target.scrollHeight) + 'px'; } });
  addEventListener('keydown', e => {
    if (e.ctrlKey && e.key.toLowerCase() === 't') { e.preventDefault(); $('[data-addr-in]').focus(); }
    if (e.ctrlKey && e.key.toLowerCase() === 'w' && active() && !active().board) { e.preventDefault(); call('room-tab-close', {id: active().id}).catch(() => {}); }
  });

  /* ---------- cards: drag between columns ---------- */
  page.addEventListener('dragstart', e => { const c = e.target.closest?.('[data-card]'); if (!c) return; dragCard = c.dataset.card; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragCard); });
  page.addEventListener('dragend', () => { dragCard = null; page.querySelectorAll('.over,.dragging').forEach(x => x.classList.remove('over', 'dragging')); });
  page.addEventListener('dragover', e => { const col = e.target.closest?.('[data-col]'); if (!col || !dragCard) return; e.preventDefault(); page.querySelectorAll('.tb-col.over').forEach(x => x !== col && x.classList.remove('over')); col.classList.add('over'); });
  page.addEventListener('drop', e => {
    const col = e.target.closest?.('[data-col]'); if (!col || !dragCard) return; e.preventDefault();
    const before = e.target.closest('[data-card]')?.dataset.card, card = S.cards.find(c => c.id === dragCard); if (!card) return;
    const rest = S.cards.filter(c => c.id !== dragCard), moved_ = {...card, col: col.dataset.col}, i = before ? rest.findIndex(c => c.id === before) : -1;
    if (i >= 0) rest.splice(i, 0, moved_); else rest.push(moved_);
    setCards(rest).catch(() => {});
  });

  /* ---------- tabs: drag off this screen onto another ---------- */
  let grab = null, moved = false;
  $('[data-tabs]').addEventListener('pointerdown', e => { const chip = e.target.closest('[data-tab]'); if (!chip || e.target.closest('button') || e.button !== 0) return; grab = {id: chip.dataset.tab, x: e.clientX, y: e.clientY, chip}; moved = false; chip.setPointerCapture(e.pointerId); });
  $('[data-tabs]').addEventListener('pointermove', e => { if (!grab) return; if (!moved && Math.hypot(e.clientX - grab.x, e.clientY - grab.y) > 10) { moved = true; grab.chip.classList.add('drag'); $('[data-drop]').classList.add('on'); } });
  $('[data-tabs]').addEventListener('pointerup', e => {
    if (!grab) return; const g = grab; grab = null; g.chip.classList.remove('drag'); $('[data-drop]').classList.remove('on');
    if (!moved) return;
    const outside = e.screenX < window.screenX || e.screenY < window.screenY || e.screenX >= window.screenX + window.outerWidth || e.screenY >= window.screenY + window.outerHeight;
    if (outside) call('room-tab-drop', {id: g.id, x: e.screenX, y: e.screenY}).catch(() => {});
    setTimeout(() => { moved = false; }, 0);
  });

  /* ---------- from JARVIS ---------- */
  try {
    J.on('core', m => {
      if (m?.type !== 'room') return;
      const had = {tabs: JSON.stringify(S.tabs), board: boardHere()};
      Object.assign(S, Object.fromEntries(Object.entries(m).filter(([k]) => k !== 'type')));
      if ('key' in m || 'screens' in m) renderTop();
      if ('tabs' in m) { renderTabs(); if (JSON.stringify(S.tabs) !== had.tabs && (boardHere() !== had.board || !boardHere())) renderPage(); layout(); }
      if ('key' in m) renderPage();
      if ('cards' in m && boardHere() && !editing) renderBoard({keepDock: true});
      if ('thread' in m || 'busy' in m) { renderTop(); renderDock(); }
    });
  } catch {}
  J.call('room-init').then(m => { if (m) { Object.assign(S, m); render(); } }).catch(() => render());
  window.__jarvisRoom = {get state() { return S; }, render};
}
