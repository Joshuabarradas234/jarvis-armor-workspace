/**
 * Settings → System → JARVIS Link and Move JARVIS, in the hall's own Settings page (the index bundle leaves an empty
 * <div data-jarvis-link> after Backup; this fills it whenever the page is drawn). Sign in to JARVIS Server on the
 * Mac mini (src/main/link.js), move JARVIS's brain there, or sign out; or move everything by file instead.
 */
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(globalThis.location?.search || '').get('view') || 'main';
if (J && ['main', 'settings'].includes(VIEW)) {   // the hall's Settings, or Settings in its own window
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const plain = e => String(e?.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  let step = '';
  async function draw(box) {
    const msg = t => { const el = box.querySelector('[data-jl-msg]'); if (el) el.innerHTML = t; };
    let s; try { s = await J.call('link-status'); } catch (e) { box.innerHTML = `<p class="small muted">${esc(plain(e))}</p>`; return; }
    if (s.role === 'client') {
      const sv = s.server || {};
      box.innerHTML = `<p class="muted">Signed in to <b>${esc(s.name || s.host)}</b>, ${s.state === 'connected' ? 'connected' : 'connecting'}. JARVIS Core runs there${sv.version ? ` (JARVIS ${esc(sv.version)})` : ''}${sv.error ? `. ${esc(sv.error)}` : ''}.${sv.claudeKey === false ? ' The Mac has no Claude key yet: add it in JARVIS Core.' : ''}</p>` +
        `<div class="button-row">${s.moved ? '' : '<button type="button" data-jl="move">Move JARVIS\'s brain to the Mac…</button>'}<button type="button" data-jl="out">Sign out…</button></div>` +
        `<p class="small muted" data-jl-msg>${s.moved ? esc(`His brain was moved there on ${new Date(s.moved).toLocaleString()}.`) : 'Move sends everything JARVIS knows from this computer to the Mac, and switches the brain off here.'}</p>`;
    } else {
      box.innerHTML = `<p class="muted">Let a computer that stays on (your Mac mini, running JARVIS Server) run JARVIS's brain, so this one stays light. Both need Tailscale, signed in with the same account.</p>` +
        `<div class="button-row"><button type="button" data-jl="find">Find my Mac</button></div>` +
        `<label class="small">The Mac<select data-jl-host><option value="">Press Find my Mac</option></select></label>` +
        `<label class="small">Pairing code (shown on the Mac)<input data-jl-code maxlength="6" autocomplete="off" spellcheck="false" placeholder="ABC123"></label>` +
        `<div class="button-row"><button type="button" data-jl="in">Sign in</button></div><p class="small muted" data-jl-msg></p>` +
        `<h3>Move JARVIS by file</h3><p class="muted">Or carry everything he knows in one file (passwords and keys stay behind).</p>` +
        `<div class="button-row"><button type="button" data-jl="export">Save everything to move…</button><button type="button" data-jl="plan">Bring JARVIS over…</button></div>`;
    }
    box.onclick = async e => {
      const b = e.target.closest('[data-jl]'); if (!b) return; const act = b.dataset.jl;
      try {
        if (act === 'find') {
          msg('Looking…'); const r = await J.call('link-peers'), sel = box.querySelector('[data-jl-host]'); if (r.error) return msg(esc(r.error));
          sel.innerHTML = r.peers.length ? r.peers.map(p => `<option value="${esc(p.host)}" data-name="${esc(p.name)}">${esc(p.name)} (${esc(p.os || '?')}${p.online ? '' : ', offline'})</option>`).join('') : '<option value="">No other computers on your Tailscale network</option>';
          msg(r.peers.length ? 'Choose the Mac, then type the code it shows.' : 'Sign in to Tailscale on the Mac with the same account.');
        }
        if (act === 'in') {
          const sel = box.querySelector('[data-jl-host]'), code = box.querySelector('[data-jl-code]').value.trim();
          if (!sel.value) return msg('Press Find my Mac and choose it first.'); if (code.length < 6) return msg('Type the 6-character code shown on the Mac.');
          msg('Signing in…'); const r = await J.call('link-signin', {host: sel.value, name: sel.selectedOptions[0]?.dataset.name || '', code});
          msg(esc(`Signed in to ${r.server}. JARVIS is restarting; then come back here and choose Move JARVIS's brain to the Mac.`));
        }
        if (act === 'move') {
          if (step !== 'move') { step = 'move'; return msg('This copies everything JARVIS knows to the Mac (passwords and keys stay behind) and switches the brain off on this computer. <button type="button" data-jl="move">Move it now</button>'); }
          step = ''; msg('Moving JARVIS\'s brain…'); const r = await J.call('link-move');
          msg(esc(`Done: ${r.files} files and ${r.documents} documents are on the Mac, and JARVIS Core starts there. Add your keys in JARVIS Core (Claude, Twilio, Gmail): they go to the Mac.`)); setTimeout(() => draw(box), 4000);
        }
        if (act === 'out') {
          if (step !== 'out') { step = 'out'; return msg('Signing out brings JARVIS Core back to this computer, with the data it had when you moved it. Switch it on in JARVIS Core if you want it here. <button type="button" data-jl="out">Sign out now</button>'); }
          step = ''; await J.call('link-signout'); msg('Signed out. JARVIS is restarting.');
        }
        if (act === 'export') { msg('Saving…'); const r = await J.call('move-export', {pause: true}); msg(r?.saved ? esc(`Saved ${r.files} files and ${r.documents} documents to ${r.path}.${r.paused ? ' JARVIS Core is now off on this computer.' : ''}`) : 'Cancelled.'); }
        if (act === 'plan') {
          msg('Reading…'); const p = await J.call('move-plan'); if (!p?.chosen) return msg('Cancelled.'); const missing = p.folders.filter(x => !x.found);
          msg(esc(`From JARVIS ${p.version}: ${p.files} files and ${p.documents} documents, ${p.folders.length} project folders${missing.length ? `, ${missing.length} not on this computer yet` : ''}. JARVIS will restart with it; what it replaces is kept.`) + ' <button type="button" data-jl="apply">Bring it over</button>');
        }
        if (act === 'apply') { msg('Bringing JARVIS over…'); const r = await J.call('move-apply'); msg(esc(`Done: ${r.files} files and ${r.documents} documents. JARVIS is restarting.`)); }
      } catch (err) { msg(esc(plain(err))); }
    };
  }
  /* the Settings page is redrawn each time it opens: fill every new empty spot */
  const fill = () => { for (const box of document.querySelectorAll('[data-jarvis-link]:not([data-jl-ready])')) { box.setAttribute('data-jl-ready', ''); draw(box); } };
  new MutationObserver(fill).observe(document.documentElement, {childList: true, subtree: true});
  fill();
  window.__jarvisLink = {fill};
}
