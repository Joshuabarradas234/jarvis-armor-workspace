/**
 * Ask JARVIS (src/main/ask-jarvis.js): its own window, opened from anywhere with Ctrl+Alt+Space, its taskbar icon or
 * "Jarvis, let's think". Pick a project (or Everything), then Ask for a straight answer or Think together to
 * brainstorm. Each project keeps its own conversation; Save to project notes writes it into the project's folder,
 * and Start building turns it into an idea card for that suit in the Ideas room.
 */
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(globalThis.location?.search || '').get('view') || 'main';
if (J && VIEW === 'ask') {
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
  const CSS = `
:root{--c1:#7fd6e8;--c2:#2f8fbf}
*{box-sizing:border-box}
body{font:14px/1.55 "Segoe UI",system-ui,sans-serif;color:#dcecf4;background:radial-gradient(120% 80% at 20% 0%,color-mix(in srgb,var(--c2) 22%,#050b11) 0%,#050b11 55%) fixed,#050b11}
body::before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(#ffffff06 1px,transparent 1px),linear-gradient(90deg,#ffffff06 1px,transparent 1px);background-size:28px 28px;mask-image:linear-gradient(#000,transparent 70%)}
.aj{position:relative;display:flex;flex-direction:column;height:100vh}
.aj-top{display:flex;align-items:center;gap:12px;padding:12px 12px 10px 16px;-webkit-app-region:drag}
.aj-top button,.aj-top [role=tablist]{-webkit-app-region:no-drag}
.aj-orb{position:relative;width:34px;height:34px;flex:none}
.aj-orb i{position:absolute;inset:0;border-radius:50%;border:2px solid var(--c1);opacity:.85}
.aj-orb i:nth-child(2){inset:7px;border-width:1.5px;border-color:var(--c2);border-style:dashed;animation:aj-spin 9s linear infinite}
.aj-orb i:nth-child(3){inset:12px;background:radial-gradient(circle,#fff 0%,var(--c1) 45%,transparent 75%);border:0;box-shadow:0 0 14px var(--c1);animation:aj-breathe 3.2s ease-in-out infinite}
.busy .aj-orb i:nth-child(2){animation-duration:1.4s}.busy .aj-orb i:nth-child(3){animation-duration:.9s}
@keyframes aj-spin{to{transform:rotate(360deg)}}@keyframes aj-breathe{50%{opacity:.55;transform:scale(.82)}}
.aj-title{flex:1;min-width:0;display:flex;flex-direction:column;line-height:1.2}
.aj-title b{font:700 12px Consolas,monospace;letter-spacing:.32em;color:var(--c1)}
.aj-title span{color:#8fa9b8;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.aj-mode{display:flex;padding:3px;border:1px solid #ffffff1c;border-radius:999px;background:#ffffff08}
.aj-mode button{border:0;background:none;color:#9fb6c4;padding:5px 13px;border-radius:999px;font:600 12.5px "Segoe UI",system-ui,sans-serif;cursor:pointer}
.aj-mode button[aria-selected=true]{background:linear-gradient(135deg,var(--c1),var(--c2));color:#041017}
.aj-ic{width:30px;height:30px;display:grid;place-items:center;border:1px solid transparent;background:none;color:#9fb6c4;border-radius:8px;cursor:pointer}
.aj-ic:hover{background:#ffffff10;color:#fff}.aj-ic[aria-pressed=true]{color:var(--c1);border-color:color-mix(in srgb,var(--c1) 40%,transparent)}
.aj-ic svg{width:16px;height:16px}
.aj-projects{display:flex;gap:6px;overflow-x:auto;padding:2px 16px 10px;scrollbar-width:thin;scrollbar-color:#ffffff24 transparent;flex:none}
.aj-projects .lbl{align-self:center;flex:none;font:700 9.5px Consolas,monospace;letter-spacing:.12em;color:#6f8796;margin:0 2px 0 8px}
.chip{flex:none;display:flex;flex-direction:column;align-items:flex-start;gap:0;max-width:190px;padding:6px 12px 6px 10px;border:1px solid #ffffff17;border-left:3px solid var(--t1);background:#ffffff07;color:#dcecf4;border-radius:10px;cursor:pointer;text-align:left;font:600 12.5px "Segoe UI",system-ui,sans-serif}
.chip small{font-weight:400;color:#7f97a6;font-size:11px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chip[aria-pressed=true]{background:color-mix(in srgb,var(--t1) 16%,transparent);border-color:color-mix(in srgb,var(--t1) 55%,transparent)}
.aj-log{flex:1;overflow-y:auto;padding:6px 16px 12px;scroll-behavior:smooth;scrollbar-width:thin;scrollbar-color:#ffffff24 transparent}
.aj-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:14px;padding:6vh 10px 10px;color:#9fb6c4}
.aj-empty .big{width:86px;height:86px}.aj-empty .big i:nth-child(2){inset:16px}.aj-empty .big i:nth-child(3){inset:30px}
.aj-empty h2{margin:0;font:300 21px "Segoe UI",system-ui,sans-serif;color:#eaf6fb}
.aj-sugs{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-width:560px}
.aj-sugs button{border:1px solid color-mix(in srgb,var(--c1) 35%,#ffffff14);background:#ffffff08;color:#dcecf4;border-radius:999px;padding:7px 14px;font:13px "Segoe UI",system-ui,sans-serif;cursor:pointer}
.aj-sugs button:hover{background:color-mix(in srgb,var(--c1) 16%,transparent)}
.aj-msg{display:flex;gap:10px;margin:12px 0;animation:aj-in .22s ease-out}
@keyframes aj-in{from{opacity:0;transform:translateY(6px)}}
.aj-msg.me{justify-content:flex-end}
.aj-msg.me .aj-body{background:color-mix(in srgb,var(--c1) 14%,#0b1822);border:1px solid color-mix(in srgb,var(--c1) 30%,transparent);border-radius:14px 14px 4px 14px;max-width:78%;white-space:pre-wrap}
.aj-av{flex:none;width:22px;height:22px;margin-top:4px;border-radius:50%;border:2px solid var(--c1);box-shadow:0 0 10px color-mix(in srgb,var(--c1) 50%,transparent),inset 0 0 6px var(--c1)}
.aj-msg.j>div:last-child{min-width:0;flex:1}
.aj-body{padding:9px 13px;border-radius:14px 14px 14px 4px;background:#0a141df0;border:1px solid #ffffff12;overflow-wrap:anywhere}
.aj-body p{margin:0 0 7px}.aj-body p:last-child{margin-bottom:0}.aj-body h4{margin:10px 0 4px;color:var(--c1);font-size:13px;letter-spacing:.02em}.aj-body h4:first-child{margin-top:0}
.aj-body ul,.aj-body ol{margin:2px 0 8px;padding-left:20px}.aj-body li{margin:2px 0}
.aj-body code{background:#ffffff12;border-radius:4px;padding:0 4px;font:12.5px Consolas,monospace}.aj-body pre{background:#00000059;border-radius:8px;padding:8px 10px;overflow-x:auto;font:12.5px Consolas,monospace;white-space:pre}
.aj-msg.err .aj-body{border-color:#ff8a7a55;color:#ffcbc2}
.aj-acts{display:flex;gap:4px;margin-top:4px;opacity:0;transition:opacity .15s}.aj-msg:hover .aj-acts,.aj-acts:focus-within{opacity:1}
.aj-acts button{border:0;background:none;color:#7f97a6;font:12px "Segoe UI",system-ui,sans-serif;cursor:pointer;padding:2px 6px;border-radius:6px}.aj-acts button:hover{color:#fff;background:#ffffff10}
.aj-dots{display:flex;gap:5px;padding:14px 4px}.aj-dots i{width:7px;height:7px;border-radius:50%;background:var(--c1);animation:aj-dot 1.1s ease-in-out infinite}.aj-dots i:nth-child(2){animation-delay:.15s}.aj-dots i:nth-child(3){animation-delay:.3s}
@keyframes aj-dot{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-4px)}}
.aj-earlier{margin:6px 0 2px;border:1px dashed #ffffff1f;border-radius:10px;padding:6px 12px;color:#9fb6c4;font-size:12.5px}.aj-earlier summary{cursor:pointer;color:#7f97a6}
footer{flex:none;padding:8px 16px 12px;border-top:1px solid #ffffff10;background:linear-gradient(transparent,#03080ccc)}
.aj-tools{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.aj-tools button{border:1px solid #ffffff1a;background:#ffffff08;color:#bcd0dc;border-radius:8px;padding:5px 11px;font:12.5px "Segoe UI",system-ui,sans-serif;cursor:pointer}
.aj-tools button:hover:not(:disabled){border-color:color-mix(in srgb,var(--c1) 50%,transparent);color:#fff}.aj-tools button:disabled{opacity:.4;cursor:default}
.aj-tools .build{border-color:color-mix(in srgb,var(--c1) 45%,transparent);color:var(--c1)}
.aj-ask{display:flex;gap:8px;align-items:flex-end;padding:6px 6px 6px 14px;border:1px solid color-mix(in srgb,var(--c1) 35%,#ffffff1a);border-radius:14px;background:#08121bf0;box-shadow:0 0 0 0 transparent;transition:box-shadow .2s}
.aj-ask:focus-within{box-shadow:0 0 0 3px color-mix(in srgb,var(--c1) 18%,transparent)}
.aj-ask textarea{flex:1;resize:none;border:0;outline:0;background:none;color:#eaf6fb;font:14px/1.5 "Segoe UI",system-ui,sans-serif;max-height:160px;padding:6px 0}
.aj-ask textarea::placeholder{color:#6f8796}
.aj-ask button{flex:none;border:0;border-radius:10px;padding:8px 16px;background:linear-gradient(135deg,var(--c1),var(--c2));color:#041017;font:700 13px "Segoe UI",system-ui,sans-serif;cursor:pointer}.aj-ask button:disabled{opacity:.5;cursor:default}
.aj-hint{margin:7px 2px 0;color:#6f8796;font-size:11.5px;min-height:1em}.aj-hint.ok{color:#9fe3c0}.aj-hint.bad{color:#ffb2a6}
.aj-hint button{border:0;background:none;color:#9fb6c4;text-decoration:underline;cursor:pointer;font:inherit;padding:0}
::-webkit-scrollbar{width:8px;height:6px}::-webkit-scrollbar-thumb{background:#ffffff1f;border-radius:8px}`;
  const ICON = {pin: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 2h4l-.5 4 2.5 2.5H4L6.5 6z"/><path d="M8 8.5V14"/></svg>',
    room: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="3" width="6" height="5" rx="1"/><rect x="8.5" y="3" width="6" height="5" rx="1"/><rect x="5" y="9.5" width="6" height="4" rx="1"/></svg>',
    close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3.5 3.5l9 9m0-9l-9 9"/></svg>'};
  let projects = [], key = 'all', mode = 'ask', thread = {summary: '', messages: []}, busy = false, hotkey = 'Control+Alt+Space', owner = 'sir', pinned = false;
  const style = document.createElement('style'); style.textContent = CSS; document.head.appendChild(style);
  const root = document.createElement('div'); root.className = 'aj';
  root.innerHTML = `<header class="aj-top"><div class="aj-orb" aria-hidden="true"><i></i><i></i><i></i></div><div class="aj-title"><b>JARVIS</b><span data-sub>Everything</span></div>
    <div class="aj-mode" role="tablist" aria-label="How to answer"><button type="button" role="tab" data-mode="ask">Ask</button><button type="button" role="tab" data-mode="think">Think together</button></div>
    <button type="button" class="aj-ic" data-act="room" title="Open the think room on all your screens">${ICON.room}</button><button type="button" class="aj-ic" data-act="pin" aria-pressed="false" title="Keep on top of other windows">${ICON.pin}</button><button type="button" class="aj-ic" data-act="hide" title="Close (Esc)">${ICON.close}</button></header>
    <nav class="aj-projects" data-projects aria-label="Projects"></nav><main class="aj-log" data-log aria-live="polite"></main>
    <footer><div class="aj-tools"><button type="button" data-act="notes">Save to project notes</button><button type="button" class="build" data-act="build">Start building</button><button type="button" data-act="new">New conversation</button></div>
    <form class="aj-ask" data-form><textarea rows="1" data-input aria-label="Your message"></textarea><button type="submit" data-send>Send</button></form><p class="aj-hint" data-hint></p></footer>`;
  document.body.appendChild(root);
  const $ = s => root.querySelector(s), log = $('[data-log]'), input = $('[data-input]'), hint = $('[data-hint]');
  const current = () => projects.find(p => p.key === key) || null;
  const hello = () => { const h = new Date().getHours(); return `Good ${h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening'}, ${owner}.`; };
  function note(text, kind = '') { hint.className = `aj-hint ${kind}`; hint.innerHTML = text; }
  function idleHint() { note(`${esc(hotkey.replace(/CommandOrControl/g, 'Ctrl').replace(/Control/g, 'Ctrl').replace(/\+/g, ' + '))} opens me from anywhere. To keep me on the taskbar, right-click my icon there and choose Pin to taskbar.`); }
  function tint() { const t = TINT[current()?.theme || 'all'] || TINT.all; document.documentElement.style.setProperty('--c1', t[0]); document.documentElement.style.setProperty('--c2', t[1]); }
  function suggestions() {
    const p = current(), n = p?.name;
    if (!p) return mode === 'think' ? ['Help me think through a new idea', 'What should I focus on this week?', 'Where could I save time across my projects?'] : ['How is everything going?', 'What needs me today?', 'Which project is furthest behind?'];
    return mode === 'think' ? [`Brainstorm what ${n} needs next`, `Poke holes in my plan for ${n}`, `How could ${n} bring in more money?`] : [`Where is ${n} up to?`, `What should I do next on ${n}?`, 'What did we decide last time?'];
  }
  function renderProjects() {
    const nav = $('[data-projects]'), groups = [];
    for (const p of projects) { let g = groups.find(x => x.area === p.area); if (!g) groups.push(g = {area: p.area, list: []}); g.list.push(p); }
    nav.innerHTML = `<button type="button" class="chip" data-key="all" style="--t1:${TINT.all[0]}" aria-pressed="${key === 'all'}">Everything<small>all your projects</small></button>` +
      groups.map(g => `<span class="lbl">${esc(g.area)}</span>` + g.list.map(p => `<button type="button" class="chip" data-key="${esc(p.key)}" style="--t1:${(TINT[p.theme] || TINT.all)[0]}" aria-pressed="${p.key === key}" title="${esc(`${p.name} · ${p.suit} · ${p.hall}`)}">${esc(p.name)}<small>${esc(p.suit || p.hall)}</small></button>`).join('')).join('');
    nav.querySelector('[aria-pressed=true]')?.scrollIntoView({inline: 'nearest', block: 'nearest'});
  }
  function renderHead() {
    const p = current();
    $('[data-sub]').textContent = p ? `${p.name} · ${p.area} · in ${p.suit}` : 'Everything · all your projects and how they stand';
    root.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
    input.placeholder = mode === 'think' ? `Think out loud${p ? ` about ${p.name}` : ''}… JARVIS will build on it` : `Ask JARVIS anything${p ? ` about ${p.name}` : ' about your projects'}…`;
    $('[data-act=notes]').disabled = !p || busy || !thread.messages.length; $('[data-act=build]').disabled = busy || !thread.messages.length; $('[data-act=new]').disabled = busy || (!thread.messages.length && !thread.summary);
    $('[data-send]').disabled = busy; root.classList.toggle('busy', busy); tint();
  }
  const jMsg = (content, i, extra = '') => `<article class="aj-msg j ${extra}"><div class="aj-av" aria-hidden="true"></div><div><div class="aj-body">${md(content)}</div>${i >= 0 ? `<div class="aj-acts"><button type="button" data-say="${i}">Read aloud</button><button type="button" data-copy="${i}">Copy</button></div>` : ''}</div></article>`;
  function renderLog({thinking = false, error = ''} = {}) {
    const m = thread.messages;
    if (!m.length && !thread.summary && !thinking && !error) {
      log.innerHTML = `<div class="aj-empty"><div class="aj-orb big" aria-hidden="true"><i></i><i></i><i></i></div><h2>${esc(hello())} ${mode === 'think' ? "Let's think it through." : 'What are we working on?'}</h2>
        <div class="aj-sugs">${suggestions().map(s => `<button type="button" data-sug="${esc(s)}">${esc(s)}</button>`).join('')}</div></div>`;
      return;
    }
    log.innerHTML = (thread.summary ? `<details class="aj-earlier"><summary>Earlier in this conversation</summary>${md(thread.summary)}</details>` : '') +
      m.map((x, i) => x.role === 'user' ? `<article class="aj-msg me"><div class="aj-body">${esc(x.content)}</div></article>` : jMsg(x.content, i)).join('') +
      (thinking ? `<article class="aj-msg j"><div class="aj-av" aria-hidden="true"></div><div class="aj-dots" aria-label="Thinking"><i></i><i></i><i></i></div></article>` : '') +
      (error ? jMsg(error, -1, 'err') : '');
    log.scrollTop = log.scrollHeight;
  }
  const render = () => { renderProjects(); renderHead(); renderLog(); };
  async function choose(k) {
    key = projects.some(p => p.key === k) ? k : 'all';
    try { thread = await J.call('ask-thread', {key}); } catch { thread = {summary: '', messages: []}; }
    render(); idleHint(); input.focus();
  }
  async function send(text) {
    text = String(text || '').trim(); if (!text || busy) return;
    busy = true; input.value = ''; fit();
    thread = {...thread, messages: [...thread.messages, {role: 'user', content: text}]}; renderHead(); renderLog({thinking: true});
    try { const r = await J.call('ask-send', {key, mode, text}); thread = r.thread; busy = false; render(); }
    catch (e) { busy = false; thread = {...thread, messages: thread.messages.slice(0, -1)}; input.value = text; fit(); renderHead(); renderLog({error: plain(e)}); }
    input.focus();
  }
  function fit() { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; }
  root.addEventListener('click', async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.key) return choose(b.dataset.key);
    if (b.dataset.mode) { mode = b.dataset.mode; renderHead(); if (!thread.messages.length) renderLog(); input.focus(); return; }
    if (b.dataset.sug) return send(b.dataset.sug);
    if (b.dataset.say) { J.call('ask-say', {text: thread.messages[Number(b.dataset.say)]?.content || ''}).catch(() => {}); return; }
    if (b.dataset.copy) { await J.call('ask-copy', {text: thread.messages[Number(b.dataset.copy)]?.content || ''}).catch(() => {}); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); return; }
    const act = b.dataset.act;
    if (act === 'hide') return J.call('ask-hide').catch(() => {});
    if (act === 'room') return J.call('room-open', {key}).catch(err => note(esc(plain(err)), 'bad'));
    if (act === 'pin') { pinned = !pinned; b.setAttribute('aria-pressed', String(pinned)); return J.call('ask-pin', {on: pinned}).catch(() => {}); }
    if (act === 'new') { await J.call('ask-clear', {key}).catch(() => {}); thread = {summary: '', messages: []}; render(); idleHint(); input.focus(); return; }
    if (act === 'notes' || act === 'build') {
      busy = true; renderHead(); note(act === 'notes' ? 'Writing the notes into the project folder…' : 'Turning this into an idea card…');
      try {
        if (act === 'notes') { await J.call('ask-notes', {key}); note(`Saved to <b>JARVIS notes.md</b> in the ${esc(current()?.name || 'project')} folder. I'll read it whenever you ask about ${esc(current()?.name || 'it')}. <button type="button" data-act="show-notes">Show it</button>`, 'ok'); }
        else { const r = await J.call('ask-build', {key}); note(`“${esc(r.title)}” is on the board in the Ideas room${r.suit ? ` for ${esc(r.suit)}` : ''}. Open it there and press Plan to start building.`, 'ok'); }
      } catch (err) { note(esc(plain(err)), 'bad'); }
      busy = false; renderHead(); return;
    }
    if (act === 'show-notes') J.call('ask-show-notes', {key}).catch(err => note(esc(plain(err)), 'bad'));
  });
  $('[data-form]').addEventListener('submit', e => { e.preventDefault(); send(input.value); });
  input.addEventListener('input', fit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
  addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); J.call('ask-hide').catch(() => {}); } });
  async function init(open = {}) {
    try { const r = await J.call('ask-init'); projects = r.projects || []; hotkey = r.hotkey || hotkey; owner = r.address || owner; } catch {}
    if (open.mode) mode = open.mode === 'think' ? 'think' : 'ask';
    await choose(open.key || key);
    if (open.text) { if (open.send) send(open.text); else { input.value = open.text; fit(); } }
  }
  try { J.on('core', m => { if (m?.type === 'ask-open') init(m); }); } catch {}
  init();
  window.__jarvisAsk = {get key() { return key; }, get mode() { return mode; }, get busy() { return busy; }, get count() { return thread.messages.length; }};
}
