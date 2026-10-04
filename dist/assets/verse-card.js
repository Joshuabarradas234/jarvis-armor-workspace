/**
 * A Bible verse in every hall: a small, faint label in the corner with the reference. Click it (or pinch it with your
 * hand) and it turns over to show the words; click again to turn it back. It shows in the hall itself, not inside a
 * suit. The words are from the World English Bible, which is in the public domain.
 */
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(globalThis.location?.search || '').get('view') || 'main';
export const VERSE = {
  ref: '1 Corinthians 13:4–8', label: '1 Cor 13:4–8', version: 'World English Bible',
  text: 'Love is patient and is kind. Love doesn’t envy. Love doesn’t brag, is not proud, doesn’t behave itself inappropriately, doesn’t seek its own way, is not provoked, takes no account of evil; doesn’t rejoice in unrighteousness, but rejoices with the truth; bears all things, believes all things, hopes all things, and endures all things. Love never fails.',
};
if (J && VIEW === 'main') {
  const CSS = `
.vc{position:fixed;left:22px;bottom:58px;z-index:30;width:126px;height:28px;padding:0;border:0;background:none;cursor:pointer;perspective:900px;opacity:.5;transition:width .55s cubic-bezier(.2,.8,.2,1),height .55s cubic-bezier(.2,.8,.2,1),opacity .3s;color:#eef7fb;text-align:left}
.vc:hover,.vc:focus-visible{opacity:1}
.vc.flip{width:352px;height:262px;opacity:1}
.vc:focus-visible{outline:none}.vc:focus-visible .vc-face{border-color:var(--accent,#7fd6e8)}
.vc-in{position:relative;width:100%;height:100%;transform-style:preserve-3d;transition:transform .75s cubic-bezier(.2,.8,.2,1)}
.vc.flip .vc-in{transform:rotateY(180deg)}
.vc-face{position:absolute;inset:0;box-sizing:border-box;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-radius:9px;display:flex}
.vc-front{align-items:center;gap:6px;padding:0 9px;background:#050b1280;border:1px solid color-mix(in srgb,var(--accent,#7fd6e8) 22%,transparent)}
.vc-front i{font:normal 13px Georgia,serif;color:var(--accent,#7fd6e8)}
.vc-front span{font:12px Georgia,"Times New Roman",serif;color:#d6e6ee;white-space:nowrap}
.vc-back{transform:rotateY(180deg);flex-direction:column;gap:7px;padding:12px 15px;overflow:auto;scrollbar-width:none;background:linear-gradient(160deg,#0c1824f0,#050b12f4);border:1px solid color-mix(in srgb,var(--accent,#7fd6e8) 45%,#ffffff1a);box-shadow:0 10px 28px #0009}
.vc-back b{font:600 13px Georgia,"Times New Roman",serif;color:var(--accent,#7fd6e8)}
.vc-back p{margin:0;font:13.5px/1.5 Georgia,"Times New Roman",serif}
.vc-back small{margin-top:auto;font:9px Consolas,monospace;letter-spacing:.14em;color:#8fb3c4;text-transform:uppercase}
@media (prefers-reduced-motion:reduce){.vc,.vc-in{transition:none}}`;
  const HALL = ['ARMOR_HALL', 'SUIT_HOVER'];
  const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s);
  const el = document.createElement('button'); el.type = 'button'; el.className = 'vc'; el.hidden = true;
  el.setAttribute('aria-pressed', 'false');
  el.innerHTML = `<div class="vc-in">
      <div class="vc-face vc-front"><i>✝</i><span>${VERSE.label}</span></div>
      <div class="vc-face vc-back"><b>${VERSE.ref}</b><p>${VERSE.text}</p><small>${VERSE.version}</small></div></div>`;
  const flip = on => { el.classList.toggle('flip', on); el.setAttribute('aria-pressed', String(on)); el.setAttribute('aria-label', on ? `${VERSE.ref}: ${VERSE.text}` : `${VERSE.ref}. Show the verse`); };
  flip(false);
  el.addEventListener('click', e => {
    e.stopPropagation(); flip(!el.classList.contains('flip'));
    if (!(e.isTrusted && e.detail === 0)) el.blur();   // after a mouse click or a pinch, let go of the keyboard, so a later Enter or Space elsewhere can't turn it over
  });
  document.body.appendChild(el);
  const show = state => { const on = HALL.includes(state); if (!on) flip(false); el.hidden = !on; };
  try { J.on('snapshot', snap => show(snap?.state)); } catch {}
  J.call('bootstrap').then(b => show(b?.snapshot?.state)).catch(() => {});
  window.__jarvisVerse = {flip, get open() { return el.classList.contains('flip'); }, get shown() { return !el.hidden; }};
}
