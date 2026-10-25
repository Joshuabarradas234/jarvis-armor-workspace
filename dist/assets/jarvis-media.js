/**
 * Settings → System → Suits, films and sounds, placed after JARVIS Link. Shows what this computer has, and on a JARVIS
 * that came without them (the Mac app) adds JARVIS-media.zip, sent from the ZenBook with Tailscale (src/main/media.js).
 */
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(globalThis.location?.search || '').get('view') || 'main';
if (J && ['main', 'settings'].includes(VIEW)) {   // the hall's Settings, or Settings in its own window
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const plain = e => String(e?.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  async function draw(box) {
    const msg = t => { const el = box.querySelector('[data-jm-msg]'); if (el) el.innerHTML = t; };
    let s; try { s = await J.call('media-status'); } catch (e) { box.innerHTML = `<p class="small muted">${esc(plain(e))}</p>`; return; }
    const here = s.platform === 'darwin' ? 'this Mac' : 'this computer', full = s.suits > 0 && s.films > 0;
    const buttons = full && s.platform !== 'darwin' ? '' : `<div class="button-row"><button type="button" data-jm="add">${s.zip ? 'Add JARVIS-media.zip from Downloads' : 'Choose JARVIS-media.zip…'}</button>${s.zip ? '<button type="button" data-jm="choose">Choose another…</button>' : ''}</div>`;
    box.innerHTML = `<p class="muted">${full ? esc(`On ${here}: ${s.suits} suits, ${s.films} films, ${s.backdrops} second-screen backdrops and ${s.clips} voice clips.`)
      : esc(`The suits, films and sounds aren't on ${here} yet. They come from your ZenBook as JARVIS-media.zip, sent with Tailscale; add it here.`)}</p>` +
      buttons + `<p class="small muted" data-jm-msg>${s.zip && !full ? 'Found it in Downloads.' : ''}</p>`;
    box.onclick = async e => {
      const b = e.target.closest('[data-jm]'); if (!b) return;
      try {
        msg('Adding them… this takes a minute.'); const r = await J.call('media-add', {choose: b.dataset.jm === 'choose'});
        if (r?.cancelled) return msg('Cancelled.');
        msg(esc(`Added ${r.files} files: ${r.suits} suits, ${r.films} films and ${r.backdrops} backdrops. JARVIS is restarting to show them.`));
      } catch (err) { msg(esc(plain(err))); }
    };
  }
  /* the Settings page is redrawn each time it opens: give every new JARVIS Link section its media section */
  const fill = () => {
    for (const link of document.querySelectorAll('[data-jarvis-link]')) {
      if (link.nextElementSibling?.hasAttribute('data-jarvis-media-head')) continue;
      const head = document.createElement('h3'), box = document.createElement('div');
      head.setAttribute('data-jarvis-media-head', ''); head.textContent = 'Suits, films and sounds'; box.setAttribute('data-jarvis-media', '');
      link.after(head, box); draw(box);
    }
  };
  new MutationObserver(fill).observe(document.documentElement, {childList: true, subtree: true});
  fill();
  window.__jarvisMedia = {fill};
}
