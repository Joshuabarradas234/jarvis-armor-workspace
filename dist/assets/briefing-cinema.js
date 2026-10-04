/**
 * The cinematic morning briefing (src/main/briefing-cinema.js): full screen, film bars, and one scene per part of the
 * day, each appearing as JARVIS starts its line. His voice drives it (a bookmark before each line); without a voice it
 * moves on by itself. Esc or a click ends it and stops him talking. Top screen only.
 */
const J = globalThis.window?.jarvis;
const VIEW = new URLSearchParams(location.search).get('view') || 'main';
if (J && VIEW === 'main') {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const ASSIST = {ironman: 'J.A.R.V.I.S.', batcave: 'A.L.F.R.E.D.', spiderman: 'K.A.R.E.N.'};
  const pad = n => String(n).padStart(2, '0');
  const CSS = `
.bc{position:fixed;inset:0;z-index:2147482990;overflow:hidden;background:radial-gradient(ellipse at 50% 46%,#0b2230 0%,#050c12 55%,#010305 100%);color:#e4f3fa;font-family:"Segoe UI",system-ui,sans-serif;opacity:0;transition:opacity .9s ease;cursor:default;--ac:var(--accent,#7fd6e8)}
.bc.in{opacity:1}.bc.out{opacity:0;transition:opacity 1.1s ease}
.bc::before{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,#ffffff05 0 1px,transparent 1px 3px),linear-gradient(90deg,color-mix(in srgb,var(--ac) 7%,transparent) 1px,transparent 1px) 0 0/6vw 6vw,linear-gradient(0deg,color-mix(in srgb,var(--ac) 7%,transparent) 1px,transparent 1px) 0 0/6vw 6vw;mask:radial-gradient(ellipse at center,#000 30%,transparent 75%);pointer-events:none}
.bc::after{content:"";position:absolute;inset:0;box-shadow:inset 0 0 22vw #000d;pointer-events:none}
.bc-bar{position:absolute;left:0;right:0;height:10vh;background:#000;z-index:3;display:flex;align-items:center;padding:0 4vw;transition:transform 1.1s cubic-bezier(.2,.8,.2,1)}
.bc-bar.top{top:0;transform:translateY(-100%);justify-content:space-between;font:600 max(11px,.8vw)/1 Consolas,monospace;letter-spacing:.35em;color:color-mix(in srgb,var(--ac) 80%,#fff)}
.bc-bar.bot{bottom:0;transform:translateY(100%);flex-direction:column;justify-content:center;gap:1.2vh}
.bc.in .bc-bar{transform:none}
.bc-sub{max-width:72vw;text-align:center;font:400 max(15px,1.35vw)/1.4 "Segoe UI",system-ui,sans-serif;color:#f4fbff;text-shadow:0 2px 8px #000;min-height:1.4em;transition:opacity .35s}
.bc-prog{display:flex;gap:.5vw;width:min(520px,40vw)}.bc-prog i{flex:1;height:2px;background:#ffffff1f;border-radius:2px;overflow:hidden;position:relative}
.bc-prog i.done::after,.bc-prog i.on::after{content:"";position:absolute;inset:0;background:var(--ac);box-shadow:0 0 8px var(--ac)}.bc-prog i.on::after{animation:bc-fill var(--d,6s) linear forwards;transform-origin:left}
@keyframes bc-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
.bc-rings{position:absolute;left:50%;top:50%;width:min(86vh,70vw);aspect-ratio:1;transform:translate(-50%,-50%);opacity:.32;z-index:1;transition:transform 1.2s cubic-bezier(.2,.8,.2,1),opacity 1.2s}
.bc-rings.pulse{animation:bc-pulse 1.1s ease-out}
@keyframes bc-pulse{0%{opacity:.6;filter:drop-shadow(0 0 18px var(--ac))}100%{opacity:.32}}
.bc-rings circle{fill:none;stroke:var(--ac);transform-origin:50% 50%}
.bc-r1{animation:bc-spin 60s linear infinite}.bc-r2{animation:bc-spin 38s linear infinite reverse}.bc-r3{animation:bc-spin 90s linear infinite}.bc-r4{animation:bc-spin 22s linear infinite reverse}
@keyframes bc-spin{to{transform:rotate(360deg)}}
.bc-stage{position:absolute;inset:10vh 0;z-index:2}
.bc-scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.4vh;padding:0 6vw;opacity:0;transform:translateY(3vh) scale(.98);filter:blur(10px);transition:opacity .9s ease,transform 1.1s cubic-bezier(.2,.8,.2,1),filter .9s ease}
.bc-scene.on{opacity:1;transform:none;filter:none}.bc-scene.gone{opacity:0;transform:translateY(-3vh) scale(1.02);filter:blur(8px)}
.bc-tag{font:600 max(11px,.85vw)/1 Consolas,monospace;letter-spacing:.5em;color:var(--ac);display:flex;align-items:center;gap:1.2vw}
.bc-tag::before,.bc-tag::after{content:"";height:1px;width:0;background:linear-gradient(90deg,transparent,var(--ac));transition:width 1.2s .3s ease}.bc-tag::after{background:linear-gradient(90deg,var(--ac),transparent)}
.bc-scene.on .bc-tag::before,.bc-scene.on .bc-tag::after{width:8vw}
.bc-huge{font:200 min(17vw,30vh)/.9 "Segoe UI",system-ui,sans-serif;letter-spacing:-.02em;color:#fff;text-shadow:0 0 40px color-mix(in srgb,var(--ac) 50%,transparent)}
.bc-big{font:300 min(5.4vw,9vh)/1.05 "Segoe UI",system-ui,sans-serif;color:#fff;text-align:center}
.bc-mid{font:300 max(16px,1.8vw)/1.3 "Segoe UI",system-ui,sans-serif;color:#cfe6f0;text-align:center}
.bc-small{font:500 max(11px,.85vw)/1.4 Consolas,monospace;letter-spacing:.2em;color:#8fb3c4;text-transform:uppercase}
.bc-row{display:flex;gap:2.4vw;justify-content:center;align-items:stretch;flex-wrap:wrap;max-width:88vw}
.bc-card{background:linear-gradient(160deg,#ffffff0d,#ffffff03);border:1px solid color-mix(in srgb,var(--ac) 30%,#ffffff12);border-radius:1.2vw;padding:2vh 1.6vw;min-width:12vw;max-width:30vw;opacity:0;transform:translateY(2vh);transition:opacity .7s ease,transform .8s cubic-bezier(.2,.8,.2,1);backdrop-filter:blur(6px)}
.bc-scene.on .bc-card{opacity:1;transform:none}
.bc-stat{text-align:center}.bc-stat b{display:block;font:200 min(7vw,12vh)/1 "Segoe UI",system-ui,sans-serif;color:#fff}.bc-stat span{font:600 max(10px,.75vw)/1 Consolas,monospace;letter-spacing:.3em;color:var(--ac)}
.bc-stat.warn b{color:#ffb4a2}
.bc-line{display:flex;gap:1vw;align-items:baseline;font-size:max(13px,1.05vw);color:#dcecf4}.bc-line em{font-style:normal;color:var(--ac);font-family:Consolas,monospace;font-size:.85em;white-space:nowrap}
.bc-time{position:relative;display:flex;gap:0;justify-content:center;width:84vw;margin-top:4vh}
.bc-time::before{content:"";position:absolute;left:0;right:0;top:3.1vh;height:1px;background:linear-gradient(90deg,transparent,var(--ac),transparent);transform:scaleX(0);transition:transform 1.4s ease}
.bc-scene.on .bc-time::before{transform:none}
.bc-ev{flex:1;display:flex;flex-direction:column;align-items:center;gap:1.2vh;text-align:center;opacity:0;transform:translateY(2vh);transition:opacity .7s,transform .8s cubic-bezier(.2,.8,.2,1);max-width:20vw}
.bc-scene.on .bc-ev{opacity:1;transform:none}
.bc-ev time{font:600 max(13px,1.1vw)/1 Consolas,monospace;color:#fff}.bc-ev i{width:1.1vh;height:1.1vh;border-radius:50%;background:var(--ac);box-shadow:0 0 12px var(--ac)}.bc-ev span{font-size:max(13px,1.1vw);color:#dcecf4}
.bc-ev.past{opacity:.38!important}.bc-ev.past i{background:#7a8b94;box-shadow:none}
.bc-ring{width:min(9vw,15vh);aspect-ratio:1}.bc-ring circle{fill:none;stroke-width:5}.bc-ring .bg{stroke:#ffffff17}.bc-ring .fg{stroke:var(--ac);stroke-linecap:round;transition:stroke-dashoffset 1.8s cubic-bezier(.2,.8,.2,1) .4s;filter:drop-shadow(0 0 5px var(--ac))}
.bc-ring text{fill:#fff;font:300 22px "Segoe UI",system-ui,sans-serif;text-anchor:middle;dominant-baseline:central}
.bc-skip{position:absolute;right:3vw;top:50%;transform:translateY(-50%);z-index:4;background:none;border:1px solid #ffffff2a;color:#9fb6c4;border-radius:2vw;padding:.6vh 1.1vw;font:600 max(10px,.7vw) Consolas,monospace;letter-spacing:.25em;cursor:pointer}
.bc-skip:hover{color:#fff;border-color:var(--ac)}
@media (prefers-reduced-motion:reduce){.bc-r1,.bc-r2,.bc-r3,.bc-r4{animation:none}.bc-scene{filter:none;transform:none}}`;

  let el = null, run = null, audio = null;
  /* a soft swell when it opens and a light tick between scenes; quiet, and only when the hall's interface sounds are on */
  function tone(kind, vol) {
    if (!(vol > 0)) return;
    try {
      audio ||= new AudioContext(); const a = audio, t = a.currentTime, g = a.createGain(); g.connect(a.destination);
      const o = a.createOscillator(); o.connect(g);
      if (kind === 'open') { o.type = 'sine'; o.frequency.setValueAtTime(55, t); o.frequency.exponentialRampToValueAtTime(110, t + 2.4); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16 * vol, t + 1.2); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2); o.start(t); o.stop(t + 3.3);
        const o2 = a.createOscillator(), g2 = a.createGain(); o2.type = 'triangle'; o2.frequency.setValueAtTime(220, t + .8); o2.frequency.exponentialRampToValueAtTime(330, t + 2.6); g2.gain.setValueAtTime(0, t + .8); g2.gain.linearRampToValueAtTime(0.035 * vol, t + 1.6); g2.gain.exponentialRampToValueAtTime(0.0001, t + 3.4); o2.connect(g2); g2.connect(a.destination); o2.start(t + .8); o2.stop(t + 3.5); }
      else { o.type = 'sine'; o.frequency.setValueAtTime(kind === 'close' ? 660 : 1320, t); g.gain.setValueAtTime(0.05 * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'close' ? 1.4 : .12)); o.start(t); o.stop(t + 1.5); }
    } catch {}
  }
  const ring = (pct, label) => { const r = 42, c = 2 * Math.PI * r; return `<svg class="bc-ring" viewBox="0 0 100 100"><circle class="bg" cx="50" cy="50" r="${r}"/><circle class="fg" cx="50" cy="50" r="${r}" stroke-dasharray="${c}" stroke-dashoffset="${c}" data-off="${c * (1 - Math.max(0, Math.min(100, pct)) / 100)}" transform="rotate(-90 50 50)"/><text x="50" y="50">${esc(label)}</text></svg>`; };
  const delay = i => `style="transition-delay:${0.35 + i * 0.22}s"`;
  const count = n => `<b data-count="${Number(n) || 0}">0</b>`;
  const ICON = {birthday: '🎂', bill: '💷', other: '📌'};
  function sceneHtml(s, n, total) {
    const d = s.data || {}, tag = `<div class="bc-tag">${pad(n + 1)} · ${esc(s.title)}</div>`;
    switch (s.id) {
      case 'open': return `${tag}<div class="bc-huge">${esc(d.time || '')}</div><div class="bc-mid">${esc(d.date || '')}</div>`;
      case 'weather': return `${tag}<div class="bc-row" style="align-items:center;gap:3vw"><div class="bc-huge" style="font-size:min(12vw,20vh)">${esc(d.icon || '')}</div><div class="bc-huge"><span data-count="${Number(d.temp) || 0}">0</span>°</div></div><div class="bc-mid">${esc(d.words || '')}${d.place ? ' · ' + esc(d.place) : ''}</div>${Number.isFinite(d.wind) ? `<div class="bc-small">Wind ${esc(d.wind)} km/h</div>` : ''}`;
      case 'night': return `${tag}<div class="bc-row">${(d.done || []).map((r, i) => `<div class="bc-card" ${delay(i)}><div class="bc-small">🌙 ${esc(r.floor || 'Tower')}</div><div class="bc-mid" style="text-align:left">${esc(r.title)}</div><div class="bc-small" style="color:var(--ac)">Finished</div></div>`).join('')}${(d.waiting || []).length ? `<div class="bc-card bc-stat" ${delay((d.done || []).length)}>${count(d.waiting.length)}<span>WAITING FOR YOUR OK</span></div>` : ''}</div>`;
      case 'mail': return `${tag}<div class="bc-row"><div class="bc-card bc-stat" ${delay(0)}>${count(d.count)}<span>NEW</span></div><div class="bc-card bc-stat" ${delay(1)}>${count((d.reply || []).length)}<span>NEED A REPLY</span></div>${d.unhappy ? `<div class="bc-card bc-stat warn" ${delay(2)}>${count(d.unhappy)}<span>UNHAPPY</span></div>` : ''}</div>${(d.reply || []).length ? `<div class="bc-card" ${delay(3)} style="max-width:60vw;display:flex;flex-direction:column;gap:1vh">${d.reply.map(m => `<div class="bc-line"><em>${esc(m.from)}</em><span>${esc(m.subject)}</span></div>`).join('')}</div>` : ''}`;
      case 'today': { const ev = d.events || []; return `${tag}${ev.length ? `<div class="bc-time">${ev.slice(0, 6).map((e, i) => `<div class="bc-ev${e.past ? ' past' : ''}" ${delay(i)}><time>${esc(e.time)}</time><i></i><span>${esc(e.title)}</span></div>`).join('')}</div>` : '<div class="bc-big">Clear skies on the calendar</div>'}`; }
      case 'dates': return `${tag}<div class="bc-row">${(d.dates || []).map((x, i) => `<div class="bc-card bc-stat" ${delay(i)}><span style="font-size:max(18px,1.8vw);letter-spacing:0">${ICON[x.kind] || '📌'}</span><b style="font-size:min(4.6vw,8vh)">${x.daysLeft <= 0 ? 'Today' : x.daysLeft === 1 ? 'Tomorrow' : `${x.daysLeft} days`}</b><div class="bc-mid">${esc(x.name)}</div>${x.amount ? `<div class="bc-small">${esc(x.amount)}</div>` : ''}</div>`).join('')}</div>`;
      case 'work': { const t = d.todos || {count: 0, first: []}; return `${tag}<div class="bc-row" style="align-items:center">${t.count ? `<div class="bc-card" ${delay(0)} style="min-width:24vw"><div class="bc-small">To-do · ${t.count}</div>${t.first.slice(0, 4).map(x => `<div class="bc-line" style="margin-top:1vh"><em>▸</em><span>${esc(x)}</span></div>`).join('')}</div>` : ''}${(d.projects || []).map((p, i) => `<div class="bc-card bc-stat" ${delay(i + 1)}>${ring(p.progress, p.progress + '%')}<div class="bc-mid" style="margin-top:1vh">${esc(p.title)}</div>${p.next ? `<div class="bc-small" style="text-transform:none;letter-spacing:.05em">Next: ${esc(p.next)}</div>` : ''}</div>`).join('')}${(d.blocked || []).length ? `<div class="bc-card bc-stat warn" ${delay(4)}>${count(d.blocked.length)}<span>NEED YOU</span><div class="bc-small">${esc(d.blocked.join(' · '))}</div></div>` : ''}</div>`; }
      case 'close': return `<div class="bc-tag">${esc(run?.name || '')}</div><div class="bc-big">Ready when you are.</div>`;
      default: return `${tag}<div class="bc-mid">${esc(s.line)}</div>`;
    }
  }
  function countUp(root) {
    for (const b of root.querySelectorAll('[data-count]')) {
      const to = Number(b.dataset.count) || 0, t0 = performance.now() + 350, len = 1100;
      const step = now => { const k = Math.max(0, Math.min(1, (now - t0) / len)); b.textContent = String(Math.round(to * (1 - (1 - k) ** 3))); if (k < 1 && el) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    setTimeout(() => { for (const c of root.querySelectorAll('.bc-ring .fg')) c.style.strokeDashoffset = c.dataset.off; }, 60);
  }
  /** Go to scene i. Marks only move forwards, so a late one cannot pull the film back. */
  function show(i) {
    if (!el || !run || i <= run.at || i >= run.scenes.length) return;
    run.at = i; clearTimeout(run.timer);
    const s = run.scenes[i], stage = el.querySelector('.bc-stage');
    stage.querySelectorAll('.bc-scene.on').forEach(x => { x.classList.remove('on'); x.classList.add('gone'); setTimeout(() => x.remove(), 1100); });
    const sc = document.createElement('div'); sc.className = 'bc-scene'; sc.innerHTML = sceneHtml(s, i, run.scenes.length); stage.appendChild(sc);
    requestAnimationFrame(() => requestAnimationFrame(() => { sc.classList.add('on'); countUp(sc); }));
    const sub = el.querySelector('.bc-sub'); sub.style.opacity = 0; setTimeout(() => { if (el) { sub.textContent = s.line; sub.style.opacity = 1; } }, 250);
    const ms = run.voiced ? s.line.length * 110 + 4000 : s.line.length * 62 + 2600;   // with a voice this is only a safety net: his bookmarks normally come first
    el.querySelectorAll('.bc-prog i').forEach((p, k) => { p.className = k < i ? 'done' : k === i ? 'on' : ''; if (k === i) p.style.setProperty('--d', `${ms / 1000}s`); });
    const rings = el.querySelector('.bc-rings'); rings.classList.remove('pulse'); void rings.offsetWidth; rings.classList.add('pulse');
    rings.style.transform = `translate(-50%,-50%) scale(${1 + (i % 2 ? 0.06 : 0)}) rotate(${i * 24}deg)`;
    tone(i === run.scenes.length - 1 ? 'close' : 'tick', run.sound);
    run.timer = setTimeout(() => { if (i < run.scenes.length - 1) show(i + 1); else finish(1800); }, ms);
  }
  function finish(wait = 2200) {
    if (!run || run.ending) return; run.ending = true; clearTimeout(run.timer);
    if (run.at < run.scenes.length - 1) show(run.scenes.length - 1), clearTimeout(run.timer);
    setTimeout(() => close(), wait);
  }
  function close(stop) {
    if (stop && run?.voiced) J.call('briefing-stop').catch(() => {});
    if (run) clearTimeout(run.timer);
    run = null; if (!el) return; const old = el; el = null;
    old.classList.add('out'); setTimeout(() => old.remove(), 1200);
  }
  function start(m) {
    if (el) { const old = el; el = null; old.remove(); }
    if (!document.getElementById('bc-style')) { const s = document.createElement('style'); s.id = 'bc-style'; s.textContent = CSS; document.head.appendChild(s); }
    const name = ASSIST[document.body.dataset.theme] || String(m.assistant || 'J.A.R.V.I.S.').toUpperCase();
    run = {id: m.id, scenes: m.scenes || [], voiced: !!m.voiced, sound: Number(m.sound) || 0, at: -1, timer: 0, name, ending: false};
    el = document.createElement('section'); el.className = 'bc'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Morning briefing');
    const now = new Date();
    el.innerHTML = `<div class="bc-bar top"><span>${esc(name)} · ${now.getHours() < 12 ? 'MORNING' : 'DAILY'} BRIEFING</span><span>${pad(now.getHours())}:${pad(now.getMinutes())}</span></div>
      <svg class="bc-rings" viewBox="0 0 200 200"><circle class="bc-r1" cx="100" cy="100" r="96" stroke-width=".5" stroke-dasharray="2 4"/><circle class="bc-r2" cx="100" cy="100" r="84" stroke-width="1.2" stroke-dasharray="40 14 4 14"/><circle class="bc-r3" cx="100" cy="100" r="70" stroke-width=".4"/><circle class="bc-r4" cx="100" cy="100" r="58" stroke-width="2" stroke-dasharray="1 6"/></svg>
      <div class="bc-stage"></div><button type="button" class="bc-skip" title="End the briefing (Esc)">SKIP ›</button>
      <div class="bc-bar bot"><div class="bc-sub"></div><div class="bc-prog">${run.scenes.map(() => '<i></i>').join('')}</div></div>`;
    el.addEventListener('click', () => close(true));
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el?.classList.add('in')));
    tone('open', run.sound);
    if (!run.voiced) setTimeout(() => show(0), 900);   // with a voice, his first bookmark starts the first scene
    else run.timer = setTimeout(() => show(0), 2500);   // ...or this, if it never comes
  }
  try {
    J.on('briefing', m => {
      if (m?.mode !== 'cinema') return;
      if (m.start) return start(m);
      if (!run || m.id !== run.id) return;
      if (Number.isInteger(m.mark)) { run.marked = true; show(m.mark); }
      if (m.end && !run.marked) {   // the voice stopped before its first line (an old speech script, or no voice): carry on without it
        run.voiced = false; clearTimeout(run.timer); const i = run.at;
        if (i < 0) show(0); else run.timer = setTimeout(() => { if (i < run.scenes.length - 1) show(i + 1); else finish(1800); }, 3000);
        return;
      }
      if (m.end) finish(run.at >= run.scenes.length - 1 ? 2600 : 1600);
    });
  } catch {}
  addEventListener('keydown', e => { if (el && e.key === 'Escape') { e.stopPropagation(); close(true); } }, true);
  window.__jarvisCinema = {close, get open() { return !!el; }, get scene() { return run?.at ?? -1; }};
}
