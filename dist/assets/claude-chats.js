/**
 * Claude chats on the hall (src/main/claude-chats.js does the reading):
 *   - a card asks which suit a new Claude chat is for (you choose; "Not for a suit"; or "Later");
 *   - an open suit shows a progress card for each chat linked to it: the task, how far along, what's left, the
 *     questions waiting on you and the next steps;
 *   - while a linked chat is open, its suit's case in the hall shows a small CLAUDE badge.
 */
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(globalThis.location?.search || '').get('view') || 'main';
if (J && VIEW === 'main') {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const plain = e => String(e?.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  const ACCENT = {ironman: '#7fd6e8', batcave: '#f5c542', spiderman: '#ff4d4d'};
  const hall = () => document.body.dataset.theme || 'ironman', accent = () => ACCENT[hall()] || '#7fd6e8';
  const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return !ms ? 'not yet' : m < 2 ? 'just now' : m < 60 ? `${m} minutes ago` : m < 1440 ? `${Math.round(m / 60)} hours ago` : `${Math.round(m / 1440)} days ago`; };
  const style = document.createElement('style');
  style.textContent = `
.cc-ask{position:fixed;left:24px;bottom:96px;z-index:95;width:min(420px,calc(100vw - 48px));padding:14px 16px;background:linear-gradient(#08131ef2,#060d14f2);border:1px solid color-mix(in srgb,var(--cc) 45%,transparent);border-left:3px solid var(--cc);color:#dcecf4;font-size:13.5px;box-shadow:0 12px 40px #0009}
.cc-ask .cc-k,.ws-claude .cc-k{font:700 10px Consolas,monospace;letter-spacing:.22em;color:var(--cc)}
.cc-ask b{display:block;margin:6px 0 10px;font-size:15px;color:#fff}
.cc-ask select{width:100%;margin:4px 0 10px;padding:7px;background:#0b1822;color:#dcecf4;border:1px solid #ffffff2e}
.cc-ask .cc-row{display:flex;gap:8px;flex-wrap:wrap}
.cc-ask button,.ws-claude button{background:#ffffff0f;color:#dcecf4;border:1px solid #ffffff30;padding:6px 11px;cursor:pointer;font:inherit;font-size:12.5px}
.cc-ask button.cc-go{border-color:var(--cc);color:#fff}
.ws-claude{padding:6px 8px 6px 14px;border-bottom:1px solid #ffffff14;color:#d3e5ee;font-size:13.5px}
.ws-claude .cc-line{display:flex;align-items:center;gap:12px;cursor:pointer;min-width:0}
.ws-claude .cc-t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ws-claude .cc-live{color:#5fd38a;font-size:11.5px;white-space:nowrap}
.ws-claude .cc-bar{height:4px;background:#ffffff14;margin:8px 0}.ws-claude .cc-bar i{display:block;height:100%;background:var(--cc)}
.ws-claude .cc-more{display:none;padding:4px 0 8px}.ws-claude.open .cc-more{display:block}
.ws-claude .cc-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:6px 18px}
.ws-claude h5{margin:8px 0 3px;font:700 10px Consolas,monospace;letter-spacing:.16em;color:var(--cc)}
.ws-claude ul{margin:0;padding-left:16px}.ws-claude li{margin:2px 0}
.ws-claude .cc-foot{display:flex;gap:10px;align-items:center;margin-top:8px;color:#9fb6c4;font-size:12px}
.bay-label .cc-badge{margin-left:8px;font:700 9px Consolas,monospace;letter-spacing:.18em;color:#5fd38a;border:1px solid #5fd38a88;padding:1px 4px;animation:cc-pulse 2s infinite}
@keyframes cc-pulse{50%{opacity:.45}}`;
  document.head.appendChild(style);

  /* ---------- "Which suit is it for?" ---------- */
  let asking = null;
  async function ask(chat) {
    if (!chat?.id || asking) return; asking = chat.id;
    let halls = []; try { halls = await J.call('claude-chat-suits'); } catch {}
    const box = document.createElement('div'); box.className = 'cc-ask'; box.style.setProperty('--cc', accent());
    box.innerHTML = `<span class="cc-k">◆ NEW CLAUDE CHAT</span><b>${esc(chat.title)}</b>Which suit is it for?
      <select data-cc-suit>${halls.map(h => `<optgroup label="${esc(h.hall)}">${h.suits.map(s => `<option value="${esc(h.theme)}|${esc(s.id)}">${esc(s.name)}</option>`).join('')}</optgroup>`).join('')}</select>
      <div class="cc-row"><button type="button" class="cc-go" data-cc="link">Link it</button><button type="button" data-cc="none">Not for a suit</button><button type="button" data-cc="later">Later</button></div>`;
    document.body.appendChild(box);
    const done = () => { box.remove(); asking = null; };
    box.onclick = async e => {
      const b = e.target.closest('[data-cc]'); if (!b) return;
      try {
        if (b.dataset.cc === 'later') { await J.call('claude-chat-later', {id: chat.id}); return done(); }
        const [theme, id] = String(box.querySelector('[data-cc-suit]').value || '').split('|');
        await J.call('claude-chat-assign', {id: chat.id, suit: b.dataset.cc === 'link' && theme && id ? {theme, id} : null});
        done(); refresh();
      } catch (err) { box.querySelector('.cc-row').insertAdjacentHTML('afterend', `<p class="small">${esc(plain(err))}</p>`); }
    };
  }

  /* ---------- the progress card on an open suit ---------- */
  let suit = null; const open = new Set();
  const lis = (a, none) => a?.length ? `<ul>${a.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : `<p class="small muted">${none}</p>`;
  async function card() {
    for (const el of document.querySelectorAll('.ws-claude')) if (!suit) el.remove();
    if (!suit) return;
    let chats = []; try { chats = await J.call('suit-claude', suit); } catch { return; }
    let tries = 0;
    const put = () => {
      const bar = document.querySelector('.workstation .ws-bar');
      if (!bar) { if (++tries < 40) setTimeout(put, 150); return; }
      for (const el of bar.parentElement.querySelectorAll('.ws-claude')) el.remove();
      let after = bar.parentElement.querySelector('.ws-recap') || bar;
      for (const c of chats.slice(0, 3)) {
        const p = c.progress, el = document.createElement('div'); el.className = 'ws-claude' + (open.has(c.id) ? ' open' : ''); el.style.setProperty('--cc', accent());
        const line = p ? `${esc(p.task)} · ${p.percent}% · ${p.left.length} left${p.questions.length ? ` · ${p.questions.length} question${p.questions.length === 1 ? '' : 's'} for you` : ''}` : c.error ? `${esc(c.title)} · couldn't write the progress: ${esc(c.error)}` : `${esc(c.title)} · the progress is being written…`;
        el.innerHTML = `<div class="cc-line"><span class="cc-k">◆ CLAUDE</span><span class="cc-t">${line}</span>${c.active ? '<span class="cc-live">● open now</span>' : ''}<span class="cc-k">${open.has(c.id) ? '▴' : '▾'}</span></div>
          <div class="cc-more">${p ? `<div class="cc-bar"><i style="width:${p.percent}%"></i></div><p>${esc(p.summary)}</p>
            <div class="cc-cols"><div><h5>WHAT'S LEFT</h5>${lis(p.left, 'Nothing left.')}</div><div><h5>QUESTIONS FOR YOU</h5>${lis(p.questions, 'None right now.')}</div><div><h5>NEXT STEPS</h5>${lis(p.next, 'None set.')}</div><div><h5>DONE</h5>${lis(p.done, 'Nothing yet.')}</div></div>` : ''}
            ${c.error && p ? `<p class="small">The last update didn't work: ${esc(c.error)}</p>` : ''}<div class="cc-foot">From the chat "${esc(c.title)}" · updated ${ago(c.updatedAt)}<button type="button" data-cc="update">Update now</button><button type="button" data-cc="unlink">Unlink</button></div></div>`;
        el.querySelector('.cc-line').onclick = () => { open.has(c.id) ? open.delete(c.id) : open.add(c.id); el.classList.toggle('open'); el.querySelector('.cc-line .cc-k:last-child').textContent = open.has(c.id) ? '▴' : '▾'; dispatchEvent(new Event('resize')); };
        el.querySelector('.cc-more').onclick = async e => {
          const b = e.target.closest('[data-cc]'); if (!b) return; b.disabled = true;
          try { if (b.dataset.cc === 'update') { b.textContent = 'Updating…'; await J.call('claude-chat-update', {id: c.id}); } else await J.call('claude-chat-assign', {id: c.id, suit: null}); }
          catch (err) { b.textContent = plain(err).slice(0, 80); return; }
          card();
        };
        after.insertAdjacentElement('afterend', el); after = el;
      }
      dispatchEvent(new Event('resize'));   // the web page below moves down to make room
    };
    put();
  }

  /* ---------- the CLAUDE badge on a suit's case while its chat is open ---------- */
  async function badges() {
    let r = null; try { r = await J.call('claude-chats'); } catch { return; }
    const live = new Set((r?.chats || []).filter(c => c.active && c.suit?.theme === hall()).map(c => c.suit.id));
    for (const plate of document.querySelectorAll('.bay-label[data-suit]')) {
      const b = plate.querySelector('.cc-badge'), on = live.has(plate.dataset.suit);
      if (on && !b) plate.insertAdjacentHTML('beforeend', '<i class="cc-badge" title="A Claude chat for this suit is open">CLAUDE</i>');
      if (!on && b) b.remove();
    }
  }
  function refresh() { card(); badges(); }

  try {
    J.on('core', m => { if (m?.type === 'claude-chat-ask') ask(m.chat); else if (m?.type === 'claude-chats') refresh(); });
    J.on('snapshot', s => { const next = s?.state === 'MODULE' && s.selected ? {theme: hall(), id: s.selected} : null; if (JSON.stringify(next) !== JSON.stringify(suit)) { suit = next; card(); } });
    J.on('recap', r => { if (r?.id) { suit = {theme: r.theme || hall(), id: r.id}; card(); } });
  } catch {}
  setInterval(badges, 30000); setTimeout(badges, 4000);
  window.__jarvisClaudeChats = {ask, refresh};
}
