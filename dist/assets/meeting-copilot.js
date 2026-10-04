/**
 * The live meeting co-pilot on the lower screen (src/meeting/copilot.js). While a meeting is recorded it shows what
 * you could say next, running notes (points, what was agreed, who does what, open questions) and the transcript as it
 * arrives, and you can ask about the meeting so far. Pages on the deck move aside to make room for it.
 */
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(location.search).get('view') || 'main';
if (J && VIEW === 'console') {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const CSS = `
.mc{position:fixed;right:20px;top:96px;bottom:118px;width:min(520px,36vw);z-index:90;display:flex;flex-direction:column;background:#050d15f0;border:1px solid color-mix(in srgb,var(--accent,#7fd6e8) 40%,#ffffff14);border-radius:18px;box-shadow:0 20px 60px #000a;font:13.5px/1.5 "Segoe UI",system-ui,sans-serif;color:#dcecf4;overflow:hidden;animation:mc-in .35s ease-out}
@keyframes mc-in{from{opacity:0;transform:translateX(24px)}}
.mc.flash{animation:mc-flash 1.2s ease-out}@keyframes mc-flash{0%{box-shadow:0 0 0 2px var(--accent,#7fd6e8),0 0 40px var(--accent,#7fd6e8)}100%{box-shadow:0 20px 60px #000a}}
.mc header{display:flex;align-items:center;gap:10px;padding:12px 14px 6px}
.mc header b{font:700 11px Consolas,monospace;letter-spacing:.22em;color:var(--accent,#7fd6e8);flex:1}
.mc .live{display:inline-flex;align-items:center;gap:6px;font:700 10.5px Consolas,monospace;letter-spacing:.18em;color:#ff8a7a}
.mc .live i{width:8px;height:8px;border-radius:50%;background:#ff5a4a;box-shadow:0 0 10px #ff5a4a;animation:mc-pulse 1.4s ease-in-out infinite}@keyframes mc-pulse{50%{opacity:.35}}
.mc .live.off{color:#8fa9b8}.mc .live.off i{background:#8fa9b8;box-shadow:none;animation:none}
.mc .clock{font:600 13px Consolas,monospace;color:#fff}
.mc header button,.mc .mc-foot button{background:#ffffff0d;color:#dcecf4;border:1px solid #ffffff26;border-radius:9px;padding:4px 10px;font:12px "Segoe UI",system-ui,sans-serif;cursor:pointer}
.mc header button.end{border-color:#ff8a7a88;color:#ffb4a8}
.mc .sub{padding:0 14px 8px;color:#8fa9b8;font-size:12px;border-bottom:1px solid #ffffff10}
.mc .body{flex:1;overflow:auto;padding:10px 14px;min-height:0}
.mc h5{margin:12px 0 4px;font:700 10px Consolas,monospace;letter-spacing:.2em;color:#8fa9b8}
.mc .say{background:color-mix(in srgb,var(--accent,#7fd6e8) 12%,transparent);border:1px solid color-mix(in srgb,var(--accent,#7fd6e8) 45%,transparent);border-radius:12px;padding:8px 12px}
.mc .say h5{margin-top:2px;color:var(--accent,#7fd6e8)}.mc .say li{color:#f2fbff}
.mc ul{margin:2px 0;padding-left:18px}.mc li{margin:2px 0}
.mc .act small{color:#8fa9b8}
.mc .empty{color:#7f99a8;font-size:12.5px}
.mc details{margin-top:10px}.mc summary{cursor:pointer;font:700 10px Consolas,monospace;letter-spacing:.2em;color:#8fa9b8}
.mc .tx{max-height:220px;overflow:auto;margin-top:6px;padding:6px 8px;background:#02070c;border-radius:8px;font-size:12.5px;color:#b8cdd8}
.mc .tx p{margin:2px 0}.mc .tx em{font-style:normal;color:#6f8a99;font-family:Consolas,monospace;font-size:11px;margin-right:6px}
.mc .ask{display:flex;gap:8px;padding:10px 14px;border-top:1px solid #ffffff10}
.mc .ask input{flex:1;min-width:0;background:#02070c;color:#e6f2f8;border:1px solid #ffffff22;border-radius:9px;padding:7px 10px;font:13px "Segoe UI",system-ui,sans-serif}
.mc .ask input:focus{outline:none;border-color:var(--accent,#7fd6e8)}
.mc .ask button{background:var(--accent,#7fd6e8);color:#041017;border:0;border-radius:9px;padding:6px 12px;font:600 12.5px "Segoe UI",system-ui,sans-serif;cursor:pointer}
.mc .answer{margin-top:8px;padding:8px 10px;border-left:3px solid var(--accent,#7fd6e8);background:#ffffff08;border-radius:0 8px 8px 0}
.mc .answer q{display:block;color:#8fa9b8;font-size:12px;margin-bottom:2px}
.mc .mc-foot{display:flex;align-items:center;gap:8px;padding:6px 14px 10px;color:#7f99a8;font-size:11.5px}
.mc .mc-foot span{flex:1}.mc .bad{color:#ffb2a6}`;
  const S = {el: null, id: null, meeting: null, lines: [], copilot: null, answer: null, status: '', ended: false, timer: 0, follow: true};
  const width = () => S.el ? S.el.getBoundingClientRect().width + 36 : 0;
  window.__jarvisCopilot = {inset: width, get open() { return !!S.el; }};
  const relayout = () => { try { window.__jarvisDeck?.arrange?.(true); } catch {} };
  const clockOf = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  function open() {
    if (S.el) return;
    if (!document.getElementById('mc-style')) { const s = document.createElement('style'); s.id = 'mc-style'; s.textContent = CSS; document.head.appendChild(s); }
    S.el = document.createElement('section'); S.el.className = 'mc'; S.el.setAttribute('aria-label', 'Meeting co-pilot'); document.body.appendChild(S.el);
    S.el.addEventListener('click', e => { const b = e.target.closest('[data-mc]'); if (b) act(b.dataset.mc).catch(() => {}); });
    S.el.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('[data-mc-q]')) { e.preventDefault(); act('ask').catch(() => {}); } });
    clearInterval(S.timer); S.timer = setInterval(tick, 1000);
    render(); relayout();
  }
  function close() { clearInterval(S.timer); S.el?.remove(); S.el = null; Object.assign(S, {id: null, meeting: null, lines: [], copilot: null, answer: null, status: '', ended: false}); relayout(); }
  function tick() {
    const c = S.el?.querySelector('.clock'); if (c && S.meeting?.startedAt && !S.ended) c.textContent = clockOf(Date.now() - S.meeting.startedAt);
    const u = S.el?.querySelector('[data-mc-updated]'); if (u && S.copilot?.updatedAt) u.textContent = `Notes updated ${clockOf(Date.now() - S.copilot.updatedAt)} ago`;
  }
  const section = (title, items, fmt = esc) => items?.length ? `<h5>${title}</h5><ul>${items.map(x => `<li>${fmt(x)}</li>`).join('')}</ul>` : '';
  function render() {
    if (!S.el) return;
    const n = S.copilot?.notes || {}, m = S.meeting || {}, typed = S.el.querySelector('[data-mc-q]')?.value || '';
    const tx = S.el.querySelector('.tx'), atBottom = !tx || tx.scrollHeight - tx.scrollTop - tx.clientHeight < 30;
    const sources = (m.sources || []).map(x => x === 'mic' ? 'your microphone' : 'the call sound').join(' and ');
    const anything = n.summary?.length || n.decisions?.length || n.actions?.length || n.questions?.length;
    S.el.innerHTML = `<header><span class="live${S.ended ? ' off' : ''}"><i></i>${S.ended ? 'ENDED' : 'LIVE'}</span><b>MEETING CO-PILOT</b><span class="clock">${m.startedAt ? clockOf((S.ended ? (m.endedAt || Date.now()) : Date.now()) - m.startedAt) : ''}</span>
        ${S.ended ? '<button type="button" data-mc="close">Close</button>' : '<button type="button" class="end" data-mc="end" title="End the meeting and write the summary">End</button>'}</header>
      <div class="sub">${esc(m.suitName || 'Meeting')}${sources && !S.ended ? ` · listening to ${esc(sources)}` : ''}${m.pending && !S.ended ? ` · ${m.pending} part${m.pending === 1 ? '' : 's'} being transcribed` : ''}${S.status ? ` · ${esc(S.status)}` : ''}</div>
      <div class="body">
        ${n.suggest?.length && !S.ended ? `<div class="say">${section('YOU COULD SAY', n.suggest)}</div>` : ''}
        ${anything ? section('SO FAR', n.summary) + section('AGREED', n.decisions) + section('WHO DOES WHAT', n.actions, a => `${esc(a.task)}${a.owner || a.due ? ` <small>· ${esc([a.owner, a.due].filter(Boolean).join(' · '))}</small>` : ''}`) + section('OPEN QUESTIONS', n.questions)
          : `<p class="empty">${S.lines.length ? 'Notes start once there is a little more talk.' : 'Listening. The first lines appear after about 20 seconds of talk.'}</p>`}
        ${S.answer ? `<div class="answer"><q>${esc(S.answer.q)}</q>${S.answer.busy ? '…' : esc(S.answer.a)}</div>` : ''}
        <details${S.follow ? ' open' : ''}><summary>TRANSCRIPT · ${S.lines.length} LINES</summary><div class="tx">${S.lines.slice(-80).map(l => `<p><em>${esc(l.at)}</em>${esc(l.text)}</p>`).join('') || '<p class="empty">Nothing yet.</p>'}</div></details>
      </div>
      ${S.ended ? '' : '<div class="ask"><input data-mc-q maxlength="400" placeholder="Ask about the meeting so far…" aria-label="Ask about the meeting"><button type="button" data-mc="ask">Ask</button></div>'}
      <div class="mc-foot"><span>${S.copilot?.error ? `<span class="bad">${esc(S.copilot.error)}</span>` : S.copilot?.busy ? 'Updating the notes…' : S.copilot?.updatedAt ? '<span data-mc-updated></span>' : 'Notes are written from the transcript as it comes in.'}</span>
        ${S.copilot?.cost ? `<small>$${S.copilot.cost.toFixed(2)}</small>` : ''}${S.ended ? '' : '<button type="button" data-mc="refresh" title="Bring the notes up to date now">Update</button>'}</div>`;
    const input = S.el.querySelector('[data-mc-q]'); if (input && typed) input.value = typed;
    S.el.querySelector('details')?.addEventListener('toggle', e => { S.follow = e.target.open; });
    const t2 = S.el.querySelector('.tx'); if (t2 && atBottom) t2.scrollTop = t2.scrollHeight;
    tick();
  }
  async function act(k) {
    if (k === 'close') return close();
    if (k === 'end') { const b = S.el?.querySelector('[data-mc="end"]'); if (b?.dataset.sure !== '1') { if (b) { b.dataset.sure = '1'; b.textContent = 'End now?'; setTimeout(() => { if (b.isConnected) { b.dataset.sure = ''; b.textContent = 'End'; } }, 4000); } return; } await J.call('meeting-end'); return; }
    if (k === 'refresh') { await J.call('meeting-copilot-refresh'); return; }
    if (k === 'ask') {
      const input = S.el?.querySelector('[data-mc-q]'), q = input?.value.trim(); if (!q) return; input.value = '';
      S.answer = {q, busy: true}; render();
      try { const r = await J.call('meeting-copilot-ask', {question: q}); S.answer = {q, a: r?.answer || ''}; }
      catch (e) { S.answer = {q, a: String(e?.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '')}; }
      render();
    }
  }
  async function sync() {
    try {
      const r = await J.call('meeting-copilot'); if (!r) return;
      const info = await J.call('meeting-state').catch(() => null);
      S.id = r.id; S.lines = r.lines || []; S.copilot = r.copilot; if (info?.meeting) S.meeting = info.meeting;
      open(); render();
    } catch {}
  }
  try {
    J.on('meeting', m => {
      if (!m) return;
      if (m.type === 'start') { close(); S.id = m.meeting?.id || null; S.meeting = m.meeting || null; open(); return; }
      if (m.type === 'state') {
        const mt = m.state?.meeting;
        if (mt && !S.el && m.state.active) { sync(); return; }
        if (mt && S.el) { S.meeting = {...S.meeting, ...mt, lines: undefined}; render(); }
        return;
      }
      if (m.type === 'transcript') {
        if (!S.el) { sync(); return; }
        if (m.from !== S.lines.length) { sync(); return; }   // missed an update: fetch the whole transcript again
        S.lines.push(...(m.lines || [])); render(); return;
      }
      if (m.type === 'copilot') { if (S.el && (!S.id || m.copilot?.id === S.id)) { S.copilot = m.copilot; render(); } return; }
      if (m.type === 'copilot-focus') { if (!S.el) sync(); else { S.el.classList.remove('flash'); void S.el.offsetWidth; S.el.classList.add('flash'); } return; }
      if (m.type === 'stop') { if (S.el) { S.status = 'ending the meeting'; render(); } return; }
      if (m.type === 'status') { if (S.el) { S.status = m.text || ''; render(); } return; }
      if (m.type === 'done') { if (S.el) { S.ended = true; if (S.meeting) S.meeting.endedAt = Date.now(); S.status = m.draft ? 'saved, with a follow-up email draft to review' : 'saved'; render(); } return; }
      if (m.type === 'failed') { if (S.el) { S.ended = true; S.status = m.error || 'the recording did not start'; render(); setTimeout(close, 10000); } }
    });
  } catch {}
  sync();
}
