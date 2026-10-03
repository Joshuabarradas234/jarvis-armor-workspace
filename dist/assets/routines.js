const J = typeof window !== 'undefined' && window.jarvis;
if (J && (new URLSearchParams(location.search).get('view') || 'main') === 'main') {
  const api = (method, payload = {}) => J.call('core', {method, data: payload});
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let panel, state, choices = [], tab = 'home', hiddenTabs = false, busy = false, previous, opening = false;
  const say = text => { if (panel) panel.querySelector('[role=status]').textContent = text; };
  async function close() {
    if (busy || opening) return; panel?.remove(); panel = null;
    if (hiddenTabs) await J.call('tabs-show', true).catch(() => {}); hiddenTabs = false; window.__jarvisHolo?.pauseAll(false); previous?.focus?.();
  }
  async function show(which = 'home') {
    if (busy || opening) return; opening = true;
    try {
      // Load before masking native pages; an unavailable Core must never hide the workspace.
      state = await api('routines');
      if (!panel) { previous = document.activeElement; hiddenTabs = await J.call('tabs-state').catch(() => false); if (hiddenTabs) await J.call('tabs-show', false); window.__jarvisHolo?.pauseAll(true); }
    } catch (e) {
      if (hiddenTabs) await J.call('tabs-show', true).catch(() => {}); hiddenTabs = false; window.__jarvisHolo?.pauseAll(false);
      if (panel) say(e.message); else window.alert('Routines could not open: '+e.message);
      return;
    } finally { opening = false; }
    tab = which; panel?.remove();
    panel = document.createElement('section'); panel.className = 'wb-panel'; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'JARVIS routines');
    panel.innerHTML = '<header><div><small>JARVIS / EVERYDAY HELP</small><h2>Routines</h2></div><button data-close>Close</button></header><div class="wb-body"><nav class="wb-filters"></nav><div data-content></div></div><p class="wb-status" role="status"></p>';
    document.body.append(panel); panel.querySelector('[data-close]').onclick = close;
    panel.addEventListener('click', e => { const b = e.target.closest('[data-action]'); if (b) run(b.dataset.action, b).catch(err => say(err.message)); });
    panel.addEventListener('submit', e => { e.preventDefault(); if (!busy) submit(e.target).catch(err => say(err.message)); });
    draw(); panel.querySelector('button').focus();
  }
  const card = (title, body) => `<article class="wb-item"><h3>${title}</h3>${body}</article>`;
  const openFile = (file, label) => file ? `<button data-action="file" data-file="${esc(file)}">${label}</button>` : '';
  function draw() {
    panel.querySelector('nav').innerHTML = [['home','Overview'],['meetings','Meeting follow-ups'],['travel','Travel'],['backups','Backups & releases']].map(([id,label]) => `<button data-action="tab" data-tab="${id}" aria-pressed="${tab===id}">${label}</button>`).join('');
    const body = panel.querySelector('[data-content]'); choices = [];
    if (tab === 'home') body.innerHTML = card('Voice notes',`<p>${state.voiceReady ? 'Ready for WhatsApp Ogg voice notes up to five minutes.' : 'Add your OpenAI key and enable voice notes in Settings → JARVIS Core.'} Audio cannot answer approval requests.</p><p>Each note reserves US$0.03 from the daily cap. Your provider bill may be lower. Twilio charges are separate.</p><button data-action="settings">Open settings</button>`) + card('Sunday review',`<p>${state.config.weekly ? `Sunday, 18:00 · ${esc(state.config.zone)}` : 'Switched off'}. Includes accepted work, open tasks, recorded spend and the week ahead.</p><p>${state.weekly ? state.weekly.error ? esc(state.weekly.error) : `Last delivery: ${esc(state.weekly.queued?'queued for morning':state.weekly.via)}` : 'No weekly report has run yet.'}</p><button data-action="weekly">Preview this week</button>`) + card('Working while you are away','<p>JARVIS must be running and the PC awake for calls and checks. Missed backups run when JARVIS next opens. Reviews catch up for up to two days; an uncertain delivery is shown for you to check.</p>');
    if (tab === 'backups') body.innerHTML = card('Nightly settings backup', `<p>${state.config.backup ? `02:00 · ${esc(state.config.zone)}` : 'Switched off'} — ${esc(state.folder || 'Sign in to OneDrive on this PC first.')}</p><p>${state.backup?.error ? esc(state.backup.error) : state.backup?.at ? `Last verified: ${new Date(state.backup.at).toLocaleString()}` : 'No successful backup yet.'}</p><p>Includes settings, suit configuration, to-dos, notes and standing orders. Passwords, browser sign-ins, recordings, large models and original work files need separate recovery. The ZIP contains restore instructions. OneDrive handles syncing.</p><button data-action="backup">Back up now</button> ${openFile(state.backup?.file,'Open last backup')}`) + card('Releases you approve', `<p>${state.config.releases ? 'After you approve a self-update, JARVIS saves a local update ZIP, a code backup and release notes.' : 'Automatic release export is off.'} Local exports use a distinct “self” version and are not automatically published to GitHub.</p><p>These exports verify the approved files and archive size. They do not run the full developer test suite.</p><button data-action="export">Export current self-update</button>${state.releases.map(r => `<p>${esc(r.version)} · ${r.asarSize.toLocaleString()} bytes</p>${openFile(r.file,'Update ZIP')} ${openFile(r.source,'Code backup')} ${openFile(r.notes,'Release notes')}`).join('')}`);
    if (tab === 'meetings') body.innerHTML = (state.meetingsError?'<p>'+esc(state.meetingsError)+'</p>':'') + '<p>Start Meeting mode before the call and let everyone know you are recording. Notes use the captured transcript; check names, owners and dates. Follow-ups stay here until you review them.</p>' + (state.meetings.length ? state.meetings.map(m => card(esc(m.suit), `${m.actionError?`<p>To-dos need attention: ${esc(m.actionError)}</p>`:''}<p>${new Date(m.at).toLocaleString()} · ${esc(m.status)}${m.approval ? ` · approval #${m.approval}` : ''}</p>${m.error?`<p>${esc(m.error)}</p>`:''}<details><summary>Action items</summary>${m.actions.map(a=>`<p>${esc(a.task)} — ${esc(a.owner)} · ${esc(a.deadline)}</p>`).join('')||'<p>No clear actions.</p>'}</details>${m.status==='draft'?`<form data-form="meeting" data-id="${esc(m.id)}"><label>Recipient<input name="to" type="email" required value="${esc(m.to)}"></label><label>Subject<input name="subject" required value="${esc(m.subject)}"></label><label>Follow-up email<textarea name="text" rows="10" required>${esc(m.text)}</textarea></label><button class="wb-primary">Review for approval</button></form>`:m.status==='sending'?`<p>Delivery was interrupted after the email went out. Look in your Sent mail, then tell JARVIS. It is never resent automatically.</p><button data-action="checked" data-id="${esc(m.id)}" data-sent="true">It is in Sent mail</button> <button data-action="checked" data-id="${esc(m.id)}" data-sent="false">It is not in Sent mail</button>`:''}`)).join('') : '<p>No meeting follow-ups yet.</p>');
    if (tab === 'travel') {
      const t = state.trip, w = state.weather;
      body.innerHTML = card('Your travel plan', t ? `<p>${esc(t.city)} · ${esc(t.start)} to ${esc(t.end)} inclusive · ${esc(t.zone)}</p><p>Recurring wake-up calls use destination local time during this trip. The approval lists any one-off wake-up calls moved too. Other reminders and appointments keep their original times.</p><button data-action="weather">Check destination weather</button> <button data-action="stop">Review ending travel mode</button>${w ? `<p>${esc(w.city)}: ${esc(w.current?.temperature_2m)} °C, wind ${esc(w.current?.wind_speed_10m)} km/h. Checked ${new Date(w.at).toLocaleString()}.</p><p>Seven-day forecast from <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a>; forecasts do not cover later travel dates.</p>${w.daily?.time?.map((d,i)=>`<p>${esc(d)} · ${esc(w.daily.temperature_2m_min?.[i])}–${esc(w.daily.temperature_2m_max?.[i])} °C · rain ${esc(w.daily.precipitation_probability_max?.[i])}%</p>`).join('')||''}`:''}` : '<p>No travel plan is active. You can also tell JARVIS where you are going; he will ask for missing dates and confirm the change.</p>') + `<form data-form="travel"><h3>${t?'Replace':'Add'} a trip</h3><label>Destination<input name="city" placeholder="Johannesburg" autocomplete="off"></label><button type="button" data-action="locations">Find destination</button><label>Choose the city<select name="location" required><option value="">Search first</option></select></label><div class="wb-grid"><label>Arrival date<input name="start" type="date" required></label><label>Last day there<input name="end" type="date" required></label></div><label>Flight numbers to watch (optional)<input name="flights" placeholder="BA57, BA54"></label><p>Flight alerts come from new emails on your connected inbox, checked about every 15 minutes. Verify gate and departure information with the airline.</p><button class="wb-primary">Review travel plan</button></form><h3>Flight emails</h3>${state.flights.map(f=>`<p>${esc(f.subject)}<br>${esc(f.summary)} — ${esc(f.from)}</p>`).join('')||'<p>No matching flight updates yet.</p>'}`;
    }
  }
  async function guard(fn) { if (busy) return; busy = true; panel?.querySelectorAll('button').forEach(b => b.disabled = true); try { return await fn(); } finally { busy = false; panel?.querySelectorAll('button').forEach(b => b.disabled = false); } }
  async function requestReady(result) { busy = false; await close(); window.__jarvisCore?.show('needs'); return result; }
  async function run(action, b) {
    if (action === 'tab') { tab = b.dataset.tab; draw(); return; }
    if (action === 'settings') { await close(); await J.call('action',{action:'settings'}); return; }
    await guard(async () => {
      say('Working…');
      if (action === 'file') { await api('routine-open',{file:b.dataset.file}); say('Opened.'); }
      if (action === 'checked') { await api('meeting-checked',{id:b.dataset.id,sent:b.dataset.sent==='true'}); state = await api('routines'); draw(); say(b.dataset.sent==='true'?'Marked as sent.':'Back to a draft. Review it for approval again.'); }
      if (action === 'backup') { const r = await api('backup-now'); state = await api('routines'); draw(); say('Backup saved and verified: '+r.file); }
      if (action === 'weekly') { const r = await api('weekly-preview'); const pre=document.createElement('pre');pre.textContent=r.text;panel.querySelector('[data-content]').append(pre);say('Preview saved in Reports. Nothing was sent.'); }
      if (action === 'export') { const r = await api('release-export'); state = await api('routines'); draw(); say('Release ready: '+r.file); }
      if (action === 'weather') { await api('travel-weather'); state = await api('routines'); draw(); say('Weather updated.'); }
      if (action === 'stop') await requestReady(await api('travel-stop'));
      if (action === 'locations') { choices = await api('travel-locations',{name:panel.querySelector('[name=city]').value});panel.querySelector('[name=location]').innerHTML=choices.map((c,i)=>`<option value="${i}">${esc(c.city)} · ${esc(c.zone)}</option>`).join('');say(choices.length?'Choose the correct destination.':'No destination found. Try a nearby city.'); }
    });
  }
  async function submit(form) {
    await guard(async () => { const p=Object.fromEntries(new FormData(form));
      if (form.dataset.form === 'meeting') await requestReady(await api('meeting-review',{...p,id:form.dataset.id}));
      else { const location=choices[Number(p.location)];if(!location)throw Error('Find and choose a destination first.');await requestReady(await api('travel-plan',{...location,start:p.start,end:p.end,flights:p.flights})); }
    });
  }
  addEventListener('keydown', e => { if (!panel) return; if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const fields=[...panel.querySelectorAll('button:not(:disabled),input,textarea,select,a[href]')].filter(x=>x.offsetParent!==null),first=fields[0],last=fields.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}} });
  window.__jarvisRoutines = {show,close};
}
