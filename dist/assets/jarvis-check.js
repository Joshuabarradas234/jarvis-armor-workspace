/**
 * Settings → System → This computer: a check-up of what works here (voice, permissions, hand control, media, the brain,
 * the Claude keys, graphics) and what to do about anything that doesn't. Placed after Suits, films and sounds.
 */
import {gpuName, weakGpu} from './render-budget.js';
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(globalThis.location?.search || '').get('view') || 'main';
if (J && ['main', 'settings'].includes(VIEW)) {   // the hall's Settings, or Settings in its own window
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const plain = e => String(e?.message || e).replace(/^Error invoking remote method '[^']*': (Error: )?/, '');
  const mark = ok => ok === true ? '<b style="color:#5fd38a">✓</b>' : ok === false ? '<b style="color:#ff8a65">✗</b>' : '<b class="muted">–</b>';
  async function draw(box) {
    box.innerHTML = '<p class="small muted">Checking…</p>';
    let r; try { r = await J.call('machine-check'); } catch (e) { box.innerHTML = `<p class="small muted">${esc(plain(e))}</p>`; return; }
    const quality = (await J.call('bootstrap').catch(() => ({})))?.settings?.quality || 'auto', gpu = gpuName(), weak = weakGpu(gpu);
    const rows = [...r.rows, {name: 'Graphics', ok: true, text: `${gpu || 'Unknown graphics chip'} · quality ${quality === 'auto' ? `Auto (${weak ? 'Medium, with the suit-opening effects' : 'High'} here)` : quality}.`,
      fix: weak ? (['high', 'ultra'].includes(quality) ? 'This graphics chip is small: choose Settings → Graphics → Auto (or Low) if the hall stutters.' : 'If the hall still stutters, choose Settings → Graphics → Low.') : ''}];
    const bad = rows.filter(x => x.ok === false).length;
    box.innerHTML = `<p class="muted">${bad ? `${bad} thing${bad === 1 ? '' : 's'} to sort out:` : 'Everything here is working.'}</p>` +
      `<ul style="list-style:none;padding:0;margin:0">${rows.map(x => `<li style="margin:.45em 0">${mark(x.ok)} <b>${esc(x.name)}</b>: ${esc(x.text)}${x.ok === false && x.fix ? `<br><span class="small muted">${esc(x.fix)}</span>` : x.ok === true && x.fix ? `<br><span class="small muted">${esc(x.fix)}</span>` : ''}</li>`).join('')}</ul>` +
      '<div class="button-row"><button type="button" data-jc="again">Check again</button></div>';
    box.querySelector('[data-jc=again]').onclick = () => draw(box);
  }
  /* after each Suits, films and sounds section (jarvis-media.js), or after JARVIS Link if that isn't there */
  const fill = () => {
    for (const anchor of document.querySelectorAll('[data-jarvis-media], [data-jarvis-link]')) {
      if (anchor.matches('[data-jarvis-link]') && anchor.parentElement?.querySelector('[data-jarvis-media]')) continue;
      if (anchor.nextElementSibling?.hasAttribute('data-jarvis-check-head')) continue;
      const head = document.createElement('h3'), box = document.createElement('div');
      head.setAttribute('data-jarvis-check-head', ''); head.textContent = 'This computer'; box.setAttribute('data-jarvis-check', '');
      anchor.after(head, box); draw(box);
    }
  };
  new MutationObserver(fill).observe(document.documentElement, {childList: true, subtree: true});
  fill();
  window.__jarvisCheck = {fill};
}
