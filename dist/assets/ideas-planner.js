/**
 * Ideas room: brainstorm projects with JARVIS, then plan one out step by step (src/ideas/planner.js).
 *   💡 Brainstorm  say what you are thinking about; JARVIS asks a few questions and suggests six projects
 *   ◎ The wall    each project in progress is a glowing ring round the core; the arc is how far along it is
 *   📋 Plan it out phases and steps (who does each, rough time and cost), risks, what you need, this week's actions;
 *                  every step can be explained in detail, ticked off, or copied into your to-dos
 * Opened from the Ideas room (window.__jarvisPlanner). It only writes text: nothing is sent, bought or started.
 */
const J = globalThis.window?.jarvis;
if (J && (new URLSearchParams(location.search).get('view') || 'main') === 'main') {
  const call = (m, p) => J.call(m, p);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const clean = m => String(m?.message || m || '').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const md = src => {   // headings, lists, bold and code: enough for JARVIS's explanations
    const inline = t => esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    let html = '', open = '';
    for (const raw of String(src || '').replace(/\r/g, '').split('\n')) {
      const l = raw.trimEnd(), ul = /^\s*[-*]\s+(.*)$/.exec(l), ol = /^\s*\d+[.)]\s+(.*)$/.exec(l), hd = /^#{1,4}\s+(.*)$/.exec(l), want = ul ? 'ul' : ol ? 'ol' : '';
      if (open && open !== want) { html += `</${open}>`; open = ''; }
      if (want) { if (!open) { html += `<${want}>`; open = want; } html += `<li>${inline((ul || ol)[1])}</li>`; continue; }
      if (hd) html += `<h6>${inline(hd[1])}</h6>`; else if (l.trim()) html += `<p>${inline(l)}</p>`;
    }
    return html + (open ? `</${open}>` : '');
  };
  const WHO = {you: 'You', jarvis: 'JARVIS', agents: 'Agents'};
  const steps = p => (p?.phases || []).flatMap(x => x.steps);
  const CSS = `
.ixp{position:absolute;inset:0;z-index:9;display:grid;place-items:center;background:#010407cc;font:13.5px/1.5 "Segoe UI",system-ui,sans-serif;color:#dcecf4}
.ixp-box{width:min(980px,94vw);max-height:90vh;display:flex;flex-direction:column;background:#071018f2;border:1px solid color-mix(in srgb,var(--ix,#5ad) 35%,#ffffff14);border-radius:16px;box-shadow:0 30px 80px #000a}
.ixp-top{display:flex;align-items:flex-start;gap:14px;padding:18px 22px 10px;border-bottom:1px solid #ffffff12}
.ixp-top h3{margin:2px 0 0;font:600 20px "Segoe UI",system-ui,sans-serif;color:#eef7fb}
.ixp-k{margin:0;font:600 11px Consolas,monospace;letter-spacing:.2em;color:var(--ix,#5ad);text-transform:uppercase}
.ixp-top .ixp-grow{flex:1}
.ixp main{overflow:auto;padding:16px 22px 20px}
.ixp textarea{width:100%;box-sizing:border-box;background:#050a0f;color:#e6f2f8;border:1px solid #ffffff1f;border-radius:9px;padding:10px 12px;font:13.5px/1.5 "Segoe UI",system-ui,sans-serif;resize:vertical;margin:4px 0 10px}
.ixp textarea:focus{outline:none;border-color:var(--ix,#5ad)}
.ixp button{padding:8px 14px;border-radius:9px;border:1px solid #ffffff26;background:#ffffff0c;color:#dcecf4;font:13px "Segoe UI",system-ui,sans-serif;cursor:pointer}
.ixp button:hover{border-color:var(--ix,#5ad)}
.ixp button:disabled{opacity:.5;cursor:default}
.ixp button.ixp-go{background:var(--ix,#5ad);color:#041017;border-color:var(--ix,#5ad);font-weight:600}
.ixp button.ixp-small{padding:4px 10px;font-size:12px}
.ixp-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.ixp-row .ixp-grow{flex:1}
.ixp-note{color:#8fa9b8;font-size:12.5px;margin:4px 0}
.ixp-bad{color:#ffb2a6}
.ixp-ok{color:#a6ff84}
.ixp-wait{color:var(--ix,#5ad);margin:10px 0}
.ixp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin:12px 0}
.ixp-card{background:#050b11;border:1px solid #ffffff17;border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:6px}
.ixp-card h4{margin:0;font:600 15px "Segoe UI",system-ui,sans-serif;color:#eef7fb}
.ixp-card p{margin:0}
.ixp-chips{display:flex;gap:6px;flex-wrap:wrap}
.ixp-chip{padding:2px 8px;border-radius:999px;font:600 10.5px Consolas,monospace;letter-spacing:.06em;border:1px solid color-mix(in srgb,var(--ix,#5ad) 45%,transparent);color:var(--ix,#5ad)}
.ixp-chip.you{color:#ffd27a;border-color:#ffd27a66}.ixp-chip.jarvis{color:#7fe3ff;border-color:#7fe3ff66}.ixp-chip.agents{color:#c9a6ff;border-color:#c9a6ff66}
.ixp-q{background:#050b11;border:1px solid #ffffff14;border-radius:12px;padding:10px 14px;margin:10px 0}
.ixp-q ul,.ixp-how ul,.ixp-how ol,.ixp-list{margin:4px 0;padding-left:20px}
.ixp-bar{height:6px;border-radius:6px;background:#ffffff14;overflow:hidden;margin:6px 0 2px}.ixp-bar i{display:block;height:100%;background:var(--ix,#5ad)}
.ixp-phase{border:1px solid #ffffff14;border-radius:12px;margin:12px 0;overflow:hidden}
.ixp-phase>header{padding:10px 14px;background:#ffffff07}
.ixp-phase>header b{font-size:14.5px;color:#eef7fb}
.ixp-step{display:grid;grid-template-columns:24px 1fr;gap:4px 10px;padding:10px 14px;border-top:1px solid #ffffff0d}
.ixp-step input{margin:3px 0 0;width:17px;height:17px;accent-color:var(--ix,#5ad)}
.ixp-step.done .ixp-title{text-decoration:line-through;color:#8fa9b8}
.ixp-title{font-weight:600;color:#eef7fb}
.ixp-step .ixp-row{margin-top:4px}
.ixp-how{grid-column:2;background:#050a0f;border:1px solid #ffffff14;border-radius:9px;padding:8px 12px;margin-top:6px;color:#c9dbe6}
.ixp-how h6{margin:8px 0 2px;font-size:13px;color:var(--ix,#5ad)}.ixp-how p{margin:4px 0}
.ixp-two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:760px){.ixp-two{grid-template-columns:1fr}}
.ixp-past{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.ixp-past button{text-align:left}
.ixp-wall{position:absolute;left:50%;top:50%;width:min(86vmin,88vh);height:min(86vmin,88vh);transform:translate(-50%,-50%);z-index:4;pointer-events:none;overflow:visible}
.ixp-wall circle{fill:none}
.ixp-track{stroke:currentColor;stroke-opacity:.13;stroke-width:1.1}
.ixp-arc{stroke:currentColor;stroke-width:1.9;stroke-linecap:round;filter:drop-shadow(0 0 2.2px currentColor);transition:stroke-dasharray 1.4s cubic-bezier(.2,.8,.2,1);animation:ixp-glow 4s ease-in-out infinite}
.ixp-lab{fill:currentColor;font:600 3.1px "Segoe UI",system-ui,sans-serif;letter-spacing:.06px;pointer-events:all;cursor:pointer;opacity:.9}
.ixp-lab:hover{opacity:1;text-decoration:underline}
@keyframes ixp-glow{50%{stroke-opacity:.72}}
@media (prefers-reduced-motion:reduce){.ixp-arc{animation:none;transition:none}}`;

  let el = null, view = null, busy = false;
  const room = () => document.querySelector('.ix-room');
  const host = () => room() || document.body;
  function mount(kicker, title) {
    if (!document.getElementById('ixp-style')) { const s = document.createElement('style'); s.id = 'ixp-style'; s.textContent = CSS; document.head.appendChild(s); }
    el?.remove(); el = document.createElement('section'); el.className = 'ixp'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', title);
    el.innerHTML = `<div class="ixp-box"><div class="ixp-top"><div class="ixp-grow"><p class="ixp-k">${esc(kicker)}</p><h3>${esc(title)}</h3></div><button type="button" data-p="close" title="Close (Esc)">×</button></div><main></main><p class="ixp-note" role="status" style="padding:0 22px 12px"></p></div>`;
    el.addEventListener('click', e => { if (e.target === el) return close(); const b = e.target.closest('[data-p]'); if (b) act(b).catch(x => say(clean(x), true)); });
    el.addEventListener('change', e => { const c = e.target.closest('[data-tick]'); if (c) tick(c).catch(x => say(clean(x), true)); });
    host().appendChild(el); window.__jarvisHolo?.pauseAll(true);
    return el.querySelector('main');
  }
  function close() { if (!el) return; el.remove(); el = null; view = null; window.__jarvisHolo?.pauseAll(!!document.querySelector('.ix-edit:not([hidden])')); }
  function say(text, bad) { const s = el?.querySelector('[role=status]'); if (s) { s.textContent = text || ''; s.className = 'ixp-note' + (bad ? ' ixp-bad' : ''); } }
  async function guard(button, waiting, fn) {
    if (busy) return; busy = true; const all = [...(el?.querySelectorAll('button') || [])]; all.forEach(b => b.disabled = true);
    const was = button?.textContent; if (button && waiting) button.textContent = waiting; say(waiting ? `${waiting} This usually takes under a minute.` : '');
    try { return await fn(); } finally { busy = false; all.forEach(b => { if (b.isConnected) b.disabled = false; }); if (button?.isConnected && waiting) button.textContent = was; }
  }

  /* ---------------- brainstorm ---------------- */
  async function brainstorm(session) {
    const main = mount('Ideas · brainstorm', 'What shall we come up with?');
    view = {kind: 'brainstorm', session: session || null};
    let past = []; try { past = await call('ideas-brainstorms'); } catch {}
    view.past = past;
    drawBrainstorm(main);
  }
  function drawBrainstorm(main = el?.querySelector('main')) {
    if (!main) return;
    const s = view.session;
    main.innerHTML = `<label class="ixp-k" for="ixp-topic">What do you want to brainstorm?</label>
      <textarea id="ixp-topic" name="topic" rows="3" maxlength="1500" placeholder="For example: a side business I could run in the evenings; ways to get more clients; a YouTube channel about cars">${esc(s?.topic || '')}</textarea>
      <label class="ixp-k" for="ixp-about">About you (optional)</label>
      <textarea id="ixp-about" name="about" rows="2" maxlength="1500" placeholder="Time you have, money to start, skills, what matters to you. For example: 5 hours a week, £200, good with design">${esc(s?.about || '')}</textarea>
      <div class="ixp-row"><button type="button" class="ixp-go" data-p="bs-go">✦ Brainstorm</button>${s ? '<button type="button" data-p="bs-more">More ideas like these</button>' : ''}<span class="ixp-grow"></span></div>
      ${s ? resultsHtml(s) : `<p class="ixp-note">JARVIS suggests six projects that fit what you tell him, with a first step for each. Add the ones you like to the room, or have him plan one out step by step.</p>${pastHtml()}`}`;
    setTimeout(() => main.querySelector('[name=topic]')?.focus(), 30);
  }
  function resultsHtml(s) {
    const q = s.questions?.length ? `<div class="ixp-q"><p class="ixp-k">To sharpen these, JARVIS asks</p><ul>${s.questions.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
      <textarea name="answers" rows="2" maxlength="2000" placeholder="Answer any of them here"></textarea><div class="ixp-row"><button type="button" data-p="bs-answer">✦ Go again with my answers</button></div></div>` : '';
    const cards = s.ideas.map((i, n) => { const added = (s.adopted || []).includes(n); return `<article class="ixp-card"><h4>${esc(i.title)}</h4><p>${esc(i.pitch)}</p>
      ${i.why ? `<p class="ixp-note">${esc(i.why)}</p>` : ''}${i.first ? `<p><b>First step:</b> ${esc(i.first)}</p>` : ''}
      <div class="ixp-chips"><span class="ixp-chip">${esc(i.effort)} effort</span>${i.cost ? `<span class="ixp-chip">${esc(i.cost)}</span>` : ''}${i.time ? `<span class="ixp-chip">${esc(i.time)}</span>` : ''}</div>
      <div class="ixp-row">${added ? '<span class="ixp-ok">✓ In your Ideas room</span>' : `<button type="button" class="ixp-small" data-p="bs-add" data-i="${n}">+ Add to Ideas</button><button type="button" class="ixp-small ixp-go" data-p="bs-plan" data-i="${n}">📋 Add and plan it</button>`}</div></article>`; }).join('');
    return `${q}<div class="ixp-grid">${cards}</div>`;
  }
  function pastHtml() {
    if (!view.past?.length) return '';
    return `<p class="ixp-k" style="margin-top:14px">Earlier brainstorms</p><div class="ixp-past">${view.past.slice(0, 6).map(p => `<button type="button" data-p="bs-open" data-id="${esc(p.id)}">${esc(p.topic.slice(0, 90))} <span class="ixp-note">· ${new Date(p.at).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'})} · ${p.ideas.length} ideas</span></button>`).join('')}</div>`;
  }

  /* ---------------- plan ---------------- */
  async function plan(id) {
    let ideas = []; try { ideas = await call('ideas-list'); } catch (x) { return; }
    const idea = ideas.find(i => i.id === id); if (!idea) return;
    const main = mount('Ideas · project plan', idea.title);
    view = {kind: 'plan', idea}; drawPlan(main);
  }
  function drawPlan(main = el?.querySelector('main')) {
    if (!main) return;
    const idea = view.idea, p = idea.project, all = steps(p), done = all.filter(s => s.done).length;
    if (!p) {
      main.innerHTML = `<p>JARVIS will write a step-by-step plan for <b>${esc(idea.title)}</b>: the phases in order, small steps in each, who does what, rough time and cost, what could go wrong, and what to do this week.</p>
        <p class="ixp-note">He uses the idea's notes${idea.target ? ' and what it is for' : ''}. You can tick steps off as you go, ask how to do any step, and copy steps into your to-dos.</p>
        <label class="ixp-k" for="ixp-fb">Anything he should know first? (optional)</label><textarea id="ixp-fb" name="feedback" rows="2" maxlength="2000" placeholder="For example: I can only work on it at weekends, and I want it running by Christmas"></textarea>
        <div class="ixp-row"><button type="button" class="ixp-go" data-p="plan-go">✦ Write the plan</button></div>`;
      return;
    }
    const pct = all.length ? Math.round(done / all.length * 100) : 0;
    main.innerHTML = `${p.goal ? `<p><b>Goal:</b> ${esc(p.goal)}</p>` : ''}${p.finished ? `<p class="ixp-note"><b>Finished means:</b> ${esc(p.finished)}</p>` : ''}
      <p style="margin:8px 0 0">${done} of ${all.length} steps done</p>${p.total?.time || p.total?.cost ? `<p class="ixp-note">Rough total: ${[p.total.time, p.total.cost].filter(Boolean).map(x => esc(x.replace(/^(about|rough(ly)?(\s+(guess|estimate|total))?)\s*:\s*/i, ''))).join(' · ')}</p>` : ''}
      <div class="ixp-bar"><i style="width:${pct}%"></i></div>
      ${p.questions?.length ? `<div class="ixp-q"><p class="ixp-k">Decide first</p><ul>${p.questions.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${p.thisWeek?.length ? `<div class="ixp-q"><p class="ixp-k">This week</p><ul>${p.thisWeek.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
      ${p.phases.map((ph, n) => `<section class="ixp-phase"><header><b>${n + 1}. ${esc(ph.name)}</b>${ph.why ? `<div class="ixp-note">${esc(ph.why)}</div>` : ''}</header>
        ${ph.steps.map(s => `<div class="ixp-step ${s.done ? 'done' : ''}"><input type="checkbox" data-tick="${esc(s.id)}" ${s.done ? 'checked' : ''} aria-label="Done: ${esc(s.title)}">
          <div><span class="ixp-title">${esc(s.title)}</span> <span class="ixp-chip ${esc(s.who)}">${WHO[s.who] || 'You'}</span>${s.time ? ` <span class="ixp-note">· ${esc(s.time)}</span>` : ''}${s.cost && !/^(none|£?0|free)$/i.test(s.cost) ? ` <span class="ixp-note">· ${esc(s.cost)}</span>` : ''}
            ${s.detail ? `<div class="ixp-note" style="color:#b9ccd8">${esc(s.detail)}</div>` : ''}
            <div class="ixp-row"><button type="button" class="ixp-small" data-p="how" data-step="${esc(s.id)}">${s.howTo ? (view.open === s.id ? 'Hide how-to' : 'How do I do this?') : '✦ How do I do this?'}</button>${s.done ? '' : s.todo ? '<span class="ixp-note">✓ In your to-dos</span>' : `<button type="button" class="ixp-small" data-p="todo" data-step="${esc(s.id)}">+ To-do</button>`}${nightHtml(s)}</div></div>
          ${s.howTo && view.open === s.id ? `<div class="ixp-how">${md(s.howTo)}<div class="ixp-row"><span class="ixp-grow"></span><button type="button" class="ixp-small" data-p="how-again" data-step="${esc(s.id)}">Explain it differently</button></div></div>` : ''}</div>`).join('')}</section>`).join('')}
      <div class="ixp-two">${p.risks?.length ? `<div class="ixp-q"><p class="ixp-k">What could go wrong</p><ul>${p.risks.map(r => `<li><b>${esc(r.risk)}</b>${r.fix ? ` ${esc(r.fix)}` : ''}</li>`).join('')}</ul></div>` : '<div></div>'}
        ${p.needs?.length ? `<div class="ixp-q"><p class="ixp-k">What you will need</p><ul>${p.needs.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}</div>
      <div class="ixp-row" style="margin-top:12px"><button type="button" data-p="todo-phase">+ Next phase's steps to my to-dos</button><span class="ixp-grow"></span><button type="button" data-p="rethink">Rethink the plan…</button></div>
      <div data-rethink hidden><textarea name="feedback" rows="2" maxlength="2000" placeholder="What should be different? For example: cheaper, faster, or without a website"></textarea><div class="ixp-row"><span class="ixp-grow"></span><button type="button" class="ixp-go" data-p="plan-go">✦ Rewrite the plan</button></div></div>
      <p class="ixp-note">Planned ${new Date(p.at).toLocaleString('en-GB', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}. Ticking steps moves the idea's progress.</p>`;
  }
  /** Steps JARVIS or the agents could do: hand them to a Tower floor tonight (01:00-05:00), or now. */
  function nightHtml(s) {
    const n = s.night, at = `data-step="${esc(s.id)}"`;
    if (s.done || (!n && !['agents', 'jarvis'].includes(s.who))) return '';
    if (n?.status === 'queued') return `<span class="ixp-note">🌙 Queued for tonight · ${esc(n.floorName)}</span><button type="button" class="ixp-small" data-p="night-cancel" ${at}>Cancel</button>`;
    if (n?.status === 'running') return `<span class="ixp-note">⏳ ${esc(n.floorName)} is working on it</span><button type="button" class="ixp-small" data-p="night-open" ${at}>Watch</button>`;
    if (n?.status === 'ready') return `<span class="ixp-ok">✓ The agents' draft is ready</span><button type="button" class="ixp-small ixp-go" data-p="night-open" ${at}>Open it</button>`;
    const fail = n?.status === 'failed' ? `<span class="ixp-bad">⚠ ${esc(n.error)}</span>` : '';
    if (view.night === s.id) return `${fail}<select data-floor aria-label="Which floor">${(view.floors?.floors || []).map(f => `<option value="${esc(f.id)}" ${f.id === n?.floorId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select><button type="button" class="ixp-small ixp-go" data-p="night-go" data-now="0" ${at}>🌙 Tonight</button><button type="button" class="ixp-small" data-p="night-go" data-now="1" ${at}>Start now</button><span class="ixp-note">Uses that floor's budget.</span>`;
    return `${fail}<button type="button" class="ixp-small" data-p="night-pick" ${at}>🌙 ${n ? 'Try again with the agents' : 'Give to the agents'}</button>`;
  }
  async function tick(c) {
    const id = view?.idea?.id; if (!id || busy) return;
    busy = true; try { view.idea = await call('idea-step', {id, step: c.dataset.tick, done: c.checked}); } finally { busy = false; }
    const y = el.querySelector('main').scrollTop; drawPlan(); el.querySelector('main').scrollTop = y;
  }

  /* ---------------- buttons ---------------- */
  async function act(b) {
    const k = b.dataset.p, main = el?.querySelector('main'), keep = () => { const y = main.scrollTop; drawPlan(); main.scrollTop = y; };
    if (k === 'close') return close();
    if (k === 'bs-go' || k === 'bs-more' || k === 'bs-answer') {
      const topic = main.querySelector('[name=topic]').value.trim(), about = main.querySelector('[name=about]').value.trim();
      if (!topic) { say('Say what you would like to brainstorm first.', true); return; }
      const answers = k === 'bs-answer' ? main.querySelector('[name=answers]')?.value.trim() : '', from = k === 'bs-go' ? '' : view.session?.id || '';
      if (k === 'bs-answer' && !answers) { say('Type an answer first.', true); return; }
      await guard(b, 'JARVIS is thinking…', async () => { view.session = await call('ideas-brainstorm', {topic, about, answers, from}); drawBrainstorm(); say('Here are some ideas. Add the ones you like.'); });
      return;
    }
    if (k === 'bs-open') { view.session = view.past.find(p => p.id === b.dataset.id) || null; drawBrainstorm(); return; }
    if (k === 'bs-add' || k === 'bs-plan') {
      const r = await guard(b, k === 'bs-add' ? 'Adding…' : '', () => call('ideas-adopt', {session: view.session.id, index: Number(b.dataset.i)}));
      if (!r) return; view.session = r.session;
      if (k === 'bs-plan' && r.id) { await plan(r.id); return; }
      drawBrainstorm(); say('Added to your Ideas room.'); return;
    }
    if (k === 'plan-go') {
      const feedback = main.querySelector('[name=feedback]')?.value.trim() || '';
      await guard(b, view.idea.project ? 'JARVIS is rewriting the plan…' : 'JARVIS is writing the plan…', async () => { view.idea = await call('idea-plan', {id: view.idea.id, feedback}); drawPlan(); main.scrollTop = 0; say('Plan ready. Tick steps off as you go.'); });
      return;
    }
    if (k === 'rethink') { const r = main.querySelector('[data-rethink]'); r.hidden = !r.hidden; if (!r.hidden) r.querySelector('textarea').focus(); return; }
    const id = view?.idea?.id, stepId = b.dataset.step;
    if (k === 'how' || k === 'how-again') {
      const s = steps(view.idea.project).find(x => x.id === stepId);
      if (k === 'how' && s?.howTo) { view.open = view.open === stepId ? null : stepId; keep(); return; }
      await guard(b, 'JARVIS is working it out…', async () => { const step = await call('idea-howto', {id, step: stepId, again: k === 'how-again'}); Object.assign(s, step); view.open = stepId; keep(); say(''); });
      return;
    }
    if (k === 'night-pick') {
      if (!view.floors) view.floors = await call('idea-night-floors', {id});
      if (!view.floors.floors.length) { say('That hall has no Tower floors yet. Add one in the Tower first.', true); return; }
      view.night = stepId; keep(); return;
    }
    if (k === 'night-go') {
      const floorId = b.parentElement.querySelector('[data-floor]')?.value, now = b.dataset.now === '1';
      await guard(b, now ? 'Handing it over…' : '', async () => { await call('idea-night', {id, step: stepId, floorId, now}); view.idea = (await call('ideas-list')).find(i => i.id === id) || view.idea; view.night = null; keep();
        const st = steps(view.idea.project).find(x => x.id === stepId)?.night;
        say(st?.status === 'failed' ? st.error : now ? 'The agents have started. Watch it in the Tower.' : 'Queued. The agents start after 01:00, and JARVIS wakes the PC for it if Windows allows.', st?.status === 'failed'); });
      return;
    }
    if (k === 'night-cancel') { await call('idea-night-cancel', {id, step: stepId}); view.idea = (await call('ideas-list')).find(i => i.id === id) || view.idea; keep(); say('Taken off tonight\'s list.'); return; }
    if (k === 'night-open') { const n = steps(view.idea.project).find(x => x.id === stepId)?.night; if (!n?.runId) return; close(); window.__jarvisIdeas?.close?.(); window.__jarvisTower?.showRun(n.theme, n.runId); return; }
    if (k === 'todo' || k === 'todo-phase') {
      const ids = k === 'todo' ? [stepId] : (view.idea.project.phases.find(ph => ph.steps.some(s => !s.done))?.steps || []).filter(s => !s.done).map(s => s.id);
      if (!ids.length) { say('Every step is done.', false); return; }
      const r = await guard(b, '', () => call('idea-todos', {id, steps: ids}));
      if (r) { for (const s of steps(view.idea.project)) if (ids.includes(s.id)) s.todo = true; keep(); say(`${r.added} step${r.added === 1 ? '' : 's'} added to your to-dos.`); }
    }
  }
  try { J.on('ideas', m => {
    if (!el || view?.kind !== 'plan' || busy || !Array.isArray(m?.list) || el.contains(document.activeElement) && /^(TEXTAREA|SELECT|INPUT)$/.test(document.activeElement.tagName)) return;
    const i = m.list.find(x => x.id === view.idea.id); if (!i || JSON.stringify(i.project) === JSON.stringify(view.idea.project)) return;
    view.idea = i; const main = el.querySelector('main'), y = main.scrollTop; drawPlan(); main.scrollTop = y;
  }); } catch {}
  /* ---------------- the project wall ---------------- */
  const STAGE = {spark: '#ffd166', designing: '#b18cff', building: '#5fd4ff', testing: '#ff9f5f', done: '#a6ff84'};
  /** Up to five projects in progress, newest first, as rings round the Ideas room's core. Click a name to open its plan. */
  function wall(room, ideas) {
    if (!room) return;
    let svg = room.querySelector('.ixp-wall');
    const list = (ideas || []).filter(i => i.stage !== 'done' && (i.progress > 0 || i.project)).sort((a, b) => b.updated - a.updated).slice(0, 5);
    if (!list.length) { svg?.remove(); return; }
    if (!document.getElementById('ixp-style')) { const st = document.createElement('style'); st.id = 'ixp-style'; st.textContent = CSS; document.head.appendChild(st); }
    const fresh = !svg;
    if (fresh) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'ixp-wall'); svg.setAttribute('viewBox', '-100 -100 200 200'); svg.setAttribute('aria-label', 'Projects in progress'); room.appendChild(svg); }
    const old = new Map([...svg.querySelectorAll('.ixp-arc')].map(a => [a.dataset.id, a.style.strokeDasharray]));
    svg.innerHTML = list.map((i, k) => {
      const r = 62 + k * 6, len = 2 * Math.PI * r, pct = Math.max(0, Math.min(100, Number(i.progress) || 0)), title = i.title.length > 34 ? i.title.slice(0, 33) + '…' : i.title;
      const dash = `${(len * pct / 100).toFixed(2)} ${len.toFixed(2)}`, from = old.get(i.id) || `0 ${len.toFixed(2)}`;
      return `<g style="color:${STAGE[i.stage] || STAGE.building}"><title>${esc(i.title)}: ${pct}%${i.project ? '' : ' (no plan yet)'}</title>
        <circle class="ixp-track" r="${r}"/><circle class="ixp-arc" data-id="${esc(i.id)}" data-to="${dash}" r="${r}" transform="rotate(-90)" style="stroke-dasharray:${from}"/>
        <path id="ixp-ring-${k}" d="M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0" fill="none"/>
        <text class="ixp-lab" data-id="${esc(i.id)}" dy="-1.4"><textPath href="#ixp-ring-${k}" startOffset="${3 + k * 2}%">${esc(title)} · ${pct}%</textPath></text></g>`;
    }).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => { for (const a of svg.querySelectorAll('.ixp-arc')) a.style.strokeDasharray = a.dataset.to; }));
    for (const t of svg.querySelectorAll('.ixp-lab')) t.addEventListener('click', e => { e.stopPropagation(); const i = list.find(x => x.id === t.dataset.id); if (!i) return; if (i.project) plan(i.id); else window.__jarvisIdeas?.edit(i); });
  }
  addEventListener('keydown', e => { if (el && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } }, true);
  window.__jarvisPlanner = {brainstorm, plan, close, wall, get open() { return !!el; }};
}
