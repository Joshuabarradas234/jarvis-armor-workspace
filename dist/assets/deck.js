/*
 * JARVIS v9.11 — the Deck: the second screen that lights up when the keyboard comes off.
 * An extension of the hall you are in. Throw tabs and floating pages down to it (pinch + flick down, or ⤓),
 * work on them here with your hands or the mouse, and flick them back up (or ⤒) when you're done.
 */
const J = window.jarvis;
const VIEW = new URLSearchParams(location.search).get('view') || 'main';
const call = (m, p) => J.call(m, p);
const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hall = () => document.body.dataset.theme || 'ironman';
const ACCENT = { ironman: '#7fd6e8', batcave: '#f5c542', spiderman: '#ff4d4d' };
const NAMES = { ironman: ['ARMOR HALL', 'J.A.R.V.I.S.'], batcave: ['BATCAVE', 'A.L.F.R.E.D.'], spiderman: ['WEB LAB', 'K.A.R.E.N.'] };

if (J && VIEW === 'console') {
  const D = {
    el: null, theme: null, shown: true,
    build() {
      const el = document.createElement('section'); el.className = 'dk';
      el.innerHTML = `
        <div class="dk-bg"></div><div class="dk-shade"></div>
        <header class="dk-top">
          <div class="dk-id"><i></i><b class="dk-hall">ARMOR HALL</b><span>DECK · <em class="dk-ai">J.A.R.V.I.S.</em></span></div>
          <div class="dk-clock"><b class="dk-time">--:--</b><small class="dk-date"></small></div>
          <div class="dk-stats"><span>CPU <b class="dk-cpu">–</b></span><span>RAM <b class="dk-ram">–</b></span><span class="dk-batt-w">PWR <b class="dk-batt">–</b></span></div>
        </header>
        <div class="dk-empty">
          <div class="dk-chev"><i></i><i></i><i></i></div>
          <h2>Throw it down here</h2>
          <p>Pinch a tab or a floating page on the top screen and flick your hand down, or press <b>⤓</b> on it.<br>Flick back up (or press <b>⤒</b>) to send it home.</p>
        </div>
        <nav class="dk-dock">
          <button type="button" data-dk="arrange" title="Tidy the pages into a grid"><i>⊞</i>Arrange</button>
          <button type="button" data-dk="up" title="Send every page back to the top screen"><i>⤒</i>Send all up</button>
          <button type="button" data-dk="earth" title="Show the earth on the top screen"><i>◍</i>Earth</button>
          <button type="button" data-dk="backdrop" title="Use your own picture for this screen"><i>▣</i>Backdrop</button>
          <button type="button" data-dk="systems" title="System stats and suits"><i>◧</i>Systems</button>
          <button type="button" data-dk="sound" title="Background sound on or off" hidden><i>🔊</i>Sound</button>
        </nav>`;
      document.body.appendChild(el); this.el = el;
      el.addEventListener('click', e => { const b = e.target.closest('[data-dk]'); if (b) { e.stopPropagation(); this.button(b.dataset.dk, e); } });
      el.addEventListener('contextmenu', e => { if (e.target.closest('[data-dk=backdrop]')) { e.preventDefault(); this.button('backdrop-reset'); } });
      const back = document.createElement('button'); back.type = 'button'; back.className = 'dk-back'; back.textContent = '◧ Back to the deck'; back.hidden = true;
      back.addEventListener('click', () => this.show(true)); document.body.appendChild(back); this.backBtn = back;
      this.tick(); setInterval(() => this.tick(), 1000);
    },
    tick() {
      const d = new Date(); const q = s => this.el.querySelector(s);
      q('.dk-time').textContent = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
      q('.dk-date').textContent = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
      if (this.theme !== hall()) this.setTheme();
    },
    async setTheme() {
      this.theme = hall(); const [n, ai] = NAMES[this.theme] || NAMES.ironman;
      this.el.style.setProperty('--dk', ACCENT[this.theme] || '#7fd6e8');
      this.el.querySelector('.dk-hall').textContent = n; this.el.querySelector('.dk-ai').textContent = ai;
      let b = null; try { b = await call('deck-backdrop', { theme: this.theme }); if (b?.url) this.backdrop(b.url); } catch {}
      this.living(b && !b.custom ? this.theme : null);
    },
    backdrop(url) { const bg = this.el.querySelector('.dk-bg'); const img = new Image(); img.onload = () => { bg.style.backgroundImage = `url("${url}")`; bg.classList.remove('in'); void bg.offsetWidth; bg.classList.add('in'); }; img.src = url; },
    /** the backdrop's living extras (a boat on the water, background sound), when the hall's picture has them */
    async living(theme) {
      const key = theme || ''; if (this.liveKey === key) return; this.liveKey = key;
      try { this.scene?.dispose(); } catch {} this.scene = null;
      try { this.sound?.dispose(); } catch {} this.sound = null;
      this.el.querySelector('[data-dk=sound]').hidden = true;
      if (!theme) return;
      let cfg = null; try { const r = await fetch(`jarvis://asset/deck/${theme}.json`); if (r.ok) cfg = await r.json(); } catch {}
      if (!cfg || this.liveKey !== key) return;
      const { mountScene, makeSound } = await import('./deckscene.js');
      if (cfg.boat) { try { const sc = await mountScene(this.el.querySelector('.dk-bg'), cfg, 'jarvis://asset/deck/'); if (this.liveKey === key) this.scene = sc; else sc.dispose(); } catch (e) { console.warn('[deck] scene', e); } }
      if (cfg.sound && this.liveKey === key) {
        this.sound = makeSound(cfg.sound, cfg.volume ?? 0.5);
        const btn = this.el.querySelector('[data-dk=sound]'); btn.hidden = !this.sound;
        this.soundOn(this.soundPref());
      }
    },
    soundPref() { try { return localStorage.getItem('jv.deckSound') !== 'off'; } catch { return true; } },
    soundOn(on) {
      try { localStorage.setItem('jv.deckSound', on ? 'on' : 'off'); } catch {}
      if (this.sound) on ? this.sound.start() : this.sound.stop();
      const btn = this.el.querySelector('[data-dk=sound]'); if (btn) { btn.classList.toggle('off', !on); btn.innerHTML = `<i>${on ? '🔊' : '🔈'}</i>${on ? 'Sound' : 'Muted'}`; }
    },
    show(on) { this.shown = on; this.el.hidden = !on; this.backBtn.hidden = on; window.__jarvisHolo?.showScope?.('deck', on); },
    async button(k) {
      if (k === 'arrange') return this.arrange(true);
      if (k === 'up') { const n = await call('deck-send-all-up').catch(() => 0); if (!n) this.note('Nothing to send up.'); return; }
      if (k === 'earth') return call('deck-earth').catch(() => {});
      if (k === 'backdrop') { try { await call('deck-backdrop-set', { theme: this.theme }); } catch (e) { this.note(e.message); } return; }
      if (k === 'backdrop-reset') { try { await call('deck-backdrop-set', { theme: this.theme, reset: true }); this.note('Back to the built-in picture.'); } catch {} return; }
      if (k === 'systems') return this.show(false);
      if (k === 'sound') return this.soundOn(!(this.sound && this.sound.on));
    },
    note(t) { const n = document.createElement('div'); n.className = 'dk-note'; n.textContent = t; this.el.appendChild(n); setTimeout(() => n.classList.add('out'), 2600); setTimeout(() => n.remove(), 3200); },
    panels() { const H = window.__jarvisHolo; return H ? [...H.panels.values()].filter(p => p.scope === 'deck') : []; },
    /** lay the pages out: one big, two side by side, then a grid */
    slots(n) {
      const W = innerWidth, Hh = innerHeight, top = 96, bottom = 118, side = 36, gap = 22;
      const aw = W - side * 2, ah = Hh - top - bottom;
      if (n <= 1) { const w = Math.min(aw, Math.round(ah * 1.62)), h = ah; return [{ x: Math.round((W - w) / 2), y: top, w, h }]; }
      const cols = n <= 2 ? 2 : n <= 4 ? 2 : 3, rows = Math.ceil(n / cols);
      const w = Math.floor((aw - gap * (cols - 1)) / cols), h = Math.floor((ah - gap * (rows - 1)) / rows);
      return Array.from({ length: n }, (_, i) => ({ x: side + (i % cols) * (w + gap), y: top + Math.floor(i / cols) * (h + gap), w, h }));
    },
    arrange(all) {
      const list = this.panels(); const H = window.__jarvisHolo; if (!H) return;
      const slots = this.slots(list.length);
      list.forEach((p, i) => { if (!all && p.placed) return; const r = slots[i]; Object.assign(p.el.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px' }); p.placed = true; H.sync(p); });
      this.el.classList.toggle('dk-has', list.length > 0);
    },
    async adopt(m) {
      const H = window.__jarvisHolo; if (!H || !m?.id) return;
      const n = this.panels().length + 1; const r = this.slots(n)[n - 1];
      const p = await H.open({ id: m.id, url: m.url, title: m.title, scope: 'deck', rect: r });
      if (p) { p.el.classList.add('hp-landed'); setTimeout(() => p.el.classList.remove('hp-landed'), 900); }
      this.arrange(true);
      if (!this.shown) this.show(true);
    },
  };
  D.build(); D.setTheme();
  try {
    J.on('deck', m => {
      if (!m) return; const H = window.__jarvisHolo;
      if (m.type === 'adopted') D.adopt(m);
      else if (m.type === 'gone') { H?.forget(m.id); D.arrange(true); }
      else if (m.type === 'panels') { for (const it of m.list || []) { const p = H?.panels.get(it.id); if (!p) continue; if (it.title) p.title = it.title; if (it.url) p.url = it.url; H.label(p); } D.el.classList.toggle('dk-has', D.panels().length > 0); }
      else if (m.type === 'backdrop' && m.theme === D.theme && m.url) { D.backdrop(m.url); D.living(m.custom ? null : D.theme); }
    });
  } catch {}
  try { J.on('telemetry', t => {
    if (!t) return; const q = s => D.el.querySelector(s);
    if (Number.isFinite(t.cpu)) q('.dk-cpu').textContent = Math.round(t.cpu) + '%';
    if (t.memory?.total) q('.dk-ram').textContent = Math.round(100 * t.memory.used / t.memory.total) + '%';
    const b = t.battery; if (b && Number.isFinite(b.percent)) q('.dk-batt').textContent = Math.round(b.percent) + '%' + (b.charging ? ' ⚡' : ''); else q('.dk-batt-w').hidden = true;
  }); } catch {}
  // pages that were already on the deck (the window was reloaded): put their frames back
  setTimeout(async () => { try { const list = await call('panel-list'); for (const it of list || []) await D.adopt({ id: it.id, url: it.url, title: it.title }); } catch {} }, 700);
  // closing a page frame here closes the page; its slot is re-used
  setInterval(() => D.el.classList.toggle('dk-has', D.panels().length > 0), 1000);
  window.__jarvisDeck = D;
}
