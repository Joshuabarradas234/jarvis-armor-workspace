/*
 * JARVIS 1.71 — meeting mode. A button in the hall bar (or "Jarvis, start a meeting for Mark 5").
 * Records your microphone plus everything the PC plays, so Zoom, Teams, Meet, WhatsApp and phone
 * apps all work. The main process transcribes it offline as it goes, and on "End" writes the notes,
 * adds a Claude summary and emails them.
 */
(() => {
  'use strict';
  const J = window.jarvis; if (!J) return;
  if ((new URLSearchParams(location.search).get('view') || 'main') !== 'main') return;
  const call = (m, p) => J.call(m, p);
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const toast = msg => { const t = document.createElement('div'); t.className = 'hx-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.classList.add('out'), 4200); setTimeout(() => t.remove(), 4800); };
  const clean = e => String(e?.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  const pad = n => String(n).padStart(2, '0');
  const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); const h = Math.floor(s / 3600); return (h ? h + ':' : '') + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); };
  const when = t => new Date(t).toLocaleString(undefined, {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});

  const ICON = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6.5" width="12.5" height="11" rx="2.2"/><path d="M15.5 10.5l5-3v9l-5-3z"/><circle cx="7.3" cy="10.3" r="1.3" fill="currentColor" stroke="none"/></svg>`;
  const css = document.createElement('style');
  css.textContent = `
  .qp-ico[data-meeting].rec{color:#ff6b6b;border-color:#ff5a5a88}
  .qp-ico[data-meeting].rec::after{content:'';position:absolute;top:5px;right:5px;width:8px;height:8px;border-radius:50%;background:#ff4d4d;box-shadow:0 0 8px #ff4d4d;animation:mtpulse 1.2s ease-in-out infinite}
  @keyframes mtpulse{50%{opacity:.25}}
  .mt-panel{position:fixed;z-index:9990;width:min(380px,calc(100vw - 32px));max-height:calc(100vh - 140px);overflow:auto;padding:16px 16px 14px;border-radius:14px;
    background:#0a1118f0;border:1px solid #ffffff1f;box-shadow:0 18px 50px #000c;color:#dce9f2;font:13px/1.45 "Segoe UI",system-ui,sans-serif;backdrop-filter:blur(10px)}
  .mt-panel h3{margin:0 0 2px;font:600 12px Consolas,monospace;letter-spacing:.2em;text-transform:uppercase;color:var(--accent,#7fd6e8)}
  .mt-panel .mt-sub{color:#8ea7b6;font-size:12px;margin:0 0 12px}
  .mt-panel label{display:block;margin:8px 0 4px;color:#9fb6c4;font-size:12px}
  .mt-panel select,.mt-panel input{width:100%;box-sizing:border-box;background:#060b10;color:#e6f2f8;border:1px solid #ffffff24;border-radius:7px;padding:8px 9px;font:13px "Segoe UI",system-ui,sans-serif}
  .mt-panel button{cursor:pointer;border:1px solid #ffffff26;background:#101b24;color:#e6f2f8;border-radius:8px;padding:8px 12px;font:600 12px "Segoe UI",system-ui,sans-serif}
  .mt-panel button:hover{border-color:var(--accent,#7fd6e8)}
  .mt-panel .mt-go{width:100%;margin-top:12px;padding:11px;background:#15281f;border-color:#3fd68266;color:#9ff0c2;font-size:13px}
  .mt-panel .mt-stop{width:100%;margin-top:12px;padding:11px;background:#2a1414;border-color:#ff5a5a77;color:#ffb3b3;font-size:13px}
  .mt-panel .mt-row{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
  .mt-panel .mt-note{margin:10px 0 0;color:#8ea7b6;font-size:12px}
  .mt-panel .mt-warn{color:#ffcf7a}.mt-panel .mt-ok{color:#8ff0b8}.mt-panel .mt-bad{color:#ff9b9b}
  .mt-panel details{margin-top:12px;border-top:1px solid #ffffff14;padding-top:10px}
  .mt-panel summary{cursor:pointer;color:#b9ccd8;font-weight:600}
  .mt-panel .mt-live{margin-top:10px;max-height:150px;overflow:auto;background:#05090d;border:1px solid #ffffff14;border-radius:8px;padding:8px 10px;font:12px/1.5 Consolas,monospace;color:#b8cad6}
  .mt-panel .mt-live b{color:#6f8ea0;font-weight:400;margin-right:6px}
  .mt-panel .mt-past{list-style:none;margin:6px 0 0;padding:0}
  .mt-panel .mt-past li{display:flex;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid #ffffff10;font-size:12px}
  .mt-panel .mt-past li span{flex:1}.mt-panel .mt-past button{padding:4px 8px;font-size:11px}
  .mt-rec-head{display:flex;align-items:center;gap:8px;font:600 15px "Segoe UI",system-ui,sans-serif}
  .mt-rec-head i,.mt-bar i{width:10px;height:10px;border-radius:50%;background:#ff4d4d;box-shadow:0 0 10px #ff4d4d;animation:mtpulse 1.2s ease-in-out infinite}
  .mt-bar{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:9991;display:flex;align-items:center;gap:10px;padding:7px 8px 7px 14px;border-radius:22px;
    background:#1a0d0df0;border:1px solid #ff5a5a66;color:#ffd6d6;font:600 12px "Segoe UI",system-ui,sans-serif;box-shadow:0 8px 26px #000a}
  .mt-bar button{cursor:pointer;border:1px solid #ff5a5a88;background:#3a1515;color:#ffd0d0;border-radius:14px;padding:5px 12px;font:600 12px "Segoe UI",system-ui,sans-serif}
  .mt-bar[hidden],.mt-panel[hidden]{display:none}`;
  document.head.appendChild(css);

  const M = {
    info: null, panel: null, bar: null, open: false, status: '', busy: false,
    cap: null,   // the live capture: {id, ctx, streams, recorder, node, queue}
    /* ---------------- capture ---------------- */
    async startCapture(meeting) {
      if (this.cap && this.cap.id === meeting.id) return;
      await this.stopCapture(false);
      const cap = {id: meeting.id, streams: [], queue: Promise.resolve(), sources: []};
      this.cap = cap;
      try {
        const ctx = cap.ctx = new AudioContext();
        const mix = ctx.createGain();
        // your microphone
        try {
          const mic = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true, autoGainControl: true}});
          cap.streams.push(mic); ctx.createMediaStreamSource(mic).connect(mix); cap.sources.push('mic');
        } catch (e) { toast('Microphone unavailable: ' + clean(e)); }
        // everything the PC plays: the other people on the call, whatever app it is
        try {
          const id = await call('meeting-source');
          const sys = await navigator.mediaDevices.getUserMedia({
            audio: {mandatory: {chromeMediaSource: 'desktop', chromeMediaSourceId: id}},
            video: {mandatory: {chromeMediaSource: 'desktop', chromeMediaSourceId: id, maxWidth: 16, maxHeight: 16, maxFrameRate: 1}}});
          sys.getVideoTracks().forEach(t => t.stop());
          if (sys.getAudioTracks().length) { cap.streams.push(sys); ctx.createMediaStreamSource(new MediaStream(sys.getAudioTracks())).connect(mix); cap.sources.push('system'); }
        } catch (e) { toast('Could not hear the call audio, recording your microphone only (' + clean(e) + ').'); }
        if (!cap.sources.length) throw Error('No microphone or call audio could be recorded.');
        // the recording you keep (compressed), sent in 5 s pieces
        const dest = ctx.createMediaStreamDestination(); mix.connect(dest);
        const rec = cap.recorder = new MediaRecorder(dest.stream, {mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 48000});
        rec.ondataavailable = ev => { if (!ev.data.size) return; cap.queue = cap.queue.then(async () => call('meeting-audio', {id: cap.id, bytes: new Uint8Array(await ev.data.arrayBuffer())})).catch(() => {}); };
        rec.start(5000);
        // 16 kHz chunks for the speech engine
        await ctx.audioWorklet.addModule(new URL('./meeting-worklet.js', import.meta.url));
        const node = cap.node = new AudioWorkletNode(ctx, 'jarvis-chunker');
        const sink = ctx.createGain(); sink.gain.value = 0; mix.connect(node); node.connect(sink); sink.connect(ctx.destination);
        node.port.onmessage = ev => {
          const d = ev.data;
          if (d.flushed) { cap.flushed?.(); return; }
          if (!d.loud) return;                                  // silence: nothing to transcribe
          cap.queue = cap.queue.then(() => call('meeting-chunk', {id: cap.id, start: d.start, bytes: new Uint8Array(d.pcm)})).catch(() => {});
        };
        await call('meeting-capturing', {id: cap.id, sources: cap.sources});
      } catch (e) {
        await this.stopCapture(false);
        call('meeting-failed', {id: meeting.id, error: clean(e)}).catch(() => {});
        toast('Meeting not recorded: ' + clean(e));
      }
    },
    /** Hand over the last audio, then let everything go. `report`: tell the main process it may write up. */
    async stopCapture(report) {
      const cap = this.cap; if (!cap) return; this.cap = null;
      try {
        if (cap.node) await Promise.race([new Promise(r => { cap.flushed = r; cap.node.port.postMessage('flush'); }), new Promise(r => setTimeout(r, 1500))]);
        if (cap.recorder && cap.recorder.state !== 'inactive') await new Promise(r => { cap.recorder.onstop = r; cap.recorder.stop(); setTimeout(r, 2000); });
        await cap.queue;
      } catch {}
      for (const s of cap.streams) s.getTracks().forEach(t => t.stop());
      try { await cap.ctx?.close(); } catch {}
      if (report) call('meeting-flushed', {id: cap.id}).catch(() => {});
    },

    /* ---------------- screen ---------------- */
    attach() {
      const icons = $('.qp-icons');
      if (icons && !icons.querySelector('[data-meeting]')) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'qp-ico'; b.dataset.meeting = '1'; b.innerHTML = ICON;
        b.addEventListener('click', e => { e.stopPropagation(); this.toggle(); });
        const bulb = icons.querySelector('[data-ideas]'); bulb ? bulb.insertAdjacentElement('afterend', b) : icons.appendChild(b);
      }
      this.paintIcon();
    },
    paintIcon() {
      const b = $('.qp-ico[data-meeting]'); if (!b) return;
      const rec = !!this.info?.active;
      b.classList.toggle('rec', rec); b.classList.toggle('on', this.open);
      b.title = rec ? `Recording the ${this.info.meeting?.suitName} meeting (click for details)` : 'Meeting mode (or say “Jarvis, start a meeting for …”)';
    },
    async refresh() { try { this.info = await call('meeting-state'); } catch {} this.draw(); },
    toggle(force) {
      this.open = force ?? !this.open;
      if (this.open) this.refresh(); else if (this.panel) this.panel.hidden = true;
      this.paintIcon();
    },
    place() {
      const p = this.panel, b = $('.qp-ico[data-meeting]'); if (!p) return;
      const r = b && b.offsetParent ? b.getBoundingClientRect() : null;
      p.style.top = (r ? r.bottom + 12 : 80) + 'px';
      p.style.right = (r ? Math.max(16, innerWidth - r.right) : 24) + 'px';
    },
    draw() {
      this.paintIcon(); this.drawBar();
      if (!this.open) return;
      // typing in the email fields: redraw once you leave the field, not under your fingers
      const a = document.activeElement;
      if (this.panel && this.panel.contains(a) && /^(INPUT|SELECT)$/.test(a.tagName)) { if (!this.later) { this.later = true; a.addEventListener('blur', () => { this.later = false; setTimeout(() => this.draw(), 0); }, {once: true}); } return; }
      if (!this.panel) {
        this.panel = document.createElement('div'); this.panel.className = 'mt-panel';
        this.panel.addEventListener('click', e => this.onClick(e)); this.panel.addEventListener('pointerdown', e => e.stopPropagation());
        this.panel.addEventListener('input', e => { const k = e.target.matches('[data-mt-to]') ? 'to' : e.target.matches('[data-mt-from]') ? 'from' : null; if (k) (this.draft ||= {})[k] = e.target.value; });
        document.body.appendChild(this.panel);
      }
      const i = this.info; if (!i) { this.panel.innerHTML = '<p class="mt-sub">Loading…</p>'; this.panel.hidden = false; this.place(); return; }
      const keep = this.panel.querySelector('details')?.open;
      const m = i.meeting;
      let body;
      if (i.active && m) {
        const src = m.sources.includes('system') ? 'Your microphone and the call audio' : m.sources.length ? 'Your microphone only' : 'Starting…';
        const eng = m.engine?.ready ? `Transcribing offline${m.pending ? ` · ${m.pending} part${m.pending === 1 ? '' : 's'} in the queue` : ''}` : m.engine?.error ? `<span class="mt-warn">No live transcript: ${esc(m.engine.error)}</span>` : 'Starting the speech engine…';
        body = `<div class="mt-rec-head"><i></i>Recording · <span data-mt-clock>${clock(Date.now() - m.startedAt)}</span></div>
          <p class="mt-sub">${esc(m.suitName)} · ${esc(m.hallName)}<br>${src}<br>${eng}</p>
          <div class="mt-live">${m.lines.length ? m.lines.map(l => `<div><b>${esc(l.at)}</b>${esc(l.text)}</div>`).join('') : '<span>The transcript appears here as people talk.</span>'}</div>
          <button type="button" class="mt-stop" data-mt="end">■ End meeting and email the notes</button>
          <p class="mt-note">Notes go to ${esc(i.to || 'nobody yet')}${i.gmailReady ? '' : ' <span class="mt-warn">(Gmail not set up: they will be saved, not emailed)</span>'}.</p>`;
      } else if (i.ending) {
        body = `<div class="mt-rec-head">Writing up the meeting…</div><p class="mt-sub">${esc(this.status || 'Finishing the transcript…')}</p>`;
      } else {
        const pick = this.pick && i.suits.some(s => s.id === this.pick) ? this.pick : i.open || i.suits[0]?.id;
        body = `<p class="mt-sub">Record a call for one of this hall's suits: Zoom, Teams, Meet, WhatsApp or anything else on this PC. When you end it, the transcript and a summary are emailed to you.</p>
          <label>Which suit is it for?</label><select data-mt-suit>${i.suits.map(s => `<option value="${esc(s.id)}" ${s.id === pick ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
          <button type="button" class="mt-go" data-mt="start">● Start recording</button>
          ${this.status ? `<p class="mt-note">${this.status}</p>` : ''}
          <p class="mt-note">Headphones give the cleanest transcript. Let everyone on the call know it's being recorded.</p>`;
      }
      const d = this.draft || {}, val = (k, saved) => esc(d[k] !== undefined ? d[k] : saved);
      const email = `<details ${keep || (!i.gmailReady && !i.active) ? 'open' : ''}><summary>Email ${i.gmailReady ? '<span class="mt-ok">· Gmail ready</span>' : '<span class="mt-warn">· set up Gmail</span>'}</summary>
        <label>Send the notes to</label><input data-mt-to type="email" value="${val('to', i.to)}" autocomplete="off">
        <label>Send them from this Gmail address</label><input data-mt-from type="email" value="${val('from', i.from)}" placeholder="you@gmail.com" autocomplete="off">
        <label>Gmail app password${i.hasPassword || i.gmailReady ? ' (saved, leave blank to keep it)' : ''}</label><input data-mt-pass type="password" placeholder="16 letters from Google" autocomplete="off">
        <div class="mt-row"><button type="button" data-mt="save">Save</button><button type="button" data-mt="test" ${i.gmailReady ? '' : 'disabled'}>Send a test email</button><button type="button" data-mt="how">How do I get an app password?</button></div>
        <p class="mt-note">The app password is stored encrypted with Windows protection and only used to send these emails. Your normal Gmail password is never needed.</p></details>`;
      const past = i.past?.length ? `<details><summary>Recent meetings in this hall</summary><ul class="mt-past">${i.past.map(p => `<li><span>${esc(p.suitName)} · ${esc(when(p.startedAt))}<br>${p.emailed ? '<span class="mt-ok">emailed</span>' : `<span class="mt-warn">${esc(p.emailError || 'not emailed')}</span>`}</span><button type="button" data-mt="open" data-id="${esc(p.id)}">Notes</button><button type="button" data-mt="folder" data-id="${esc(p.id)}">Folder</button></li>`).join('')}</ul></details>` : '';
      this.panel.innerHTML = `<h3>Meeting mode</h3>${body}${email}${past}`;
      this.panel.hidden = false; this.place();
    },
    drawBar() {
      const i = this.info, rec = !!(i?.active && i.meeting);
      if (!this.bar) {
        this.bar = document.createElement('div'); this.bar.className = 'mt-bar'; this.bar.hidden = true;
        this.bar.addEventListener('click', e => { if (e.target.closest('[data-mt-end]')) this.end(); else this.toggle(true); });
        document.body.appendChild(this.bar);
      }
      this.bar.hidden = !rec;
      if (rec) this.bar.innerHTML = `<i></i><span>REC · ${esc(i.meeting.suitName)} · <span data-mt-clock>${clock(Date.now() - i.meeting.startedAt)}</span></span><button type="button" data-mt-end>End</button>`;
    },
    tick() { const m = this.info?.active && this.info.meeting; if (!m) return; for (const el of document.querySelectorAll('[data-mt-clock]')) el.textContent = clock(Date.now() - m.startedAt); },
    async end() {
      if (this.busy) return; this.busy = true;
      try { await call('meeting-end'); this.status = 'Finishing the transcript…'; } catch (e) { toast(clean(e)); } finally { this.busy = false; }
    },
    async onClick(e) {
      e.stopPropagation();
      const b = e.target.closest('[data-mt]'); if (!b) return;
      const act = b.dataset.mt, p = this.panel;
      try {
        if (act === 'start') { this.pick = p.querySelector('[data-mt-suit]')?.value; this.status = ''; b.disabled = true; await call('meeting-start', {id: this.pick}); }
        else if (act === 'end') { b.disabled = true; await this.end(); }
        else if (act === 'save') {
          this.info = await call('meeting-settings', {to: p.querySelector('[data-mt-to]').value, from: p.querySelector('[data-mt-from]').value, password: p.querySelector('[data-mt-pass]').value}); this.draft = null;
          toast(this.info.gmailReady ? 'Saved. Gmail is ready.' : 'Saved. Add the Gmail address and app password to email the notes.'); this.draw();
        }
        else if (act === 'test') { b.disabled = true; b.textContent = 'Sending…'; await call('meeting-test-email'); toast('Test email sent to ' + this.info.to + '.'); this.draw(); }
        else if (act === 'how') { await call('tower-link', 'https://myaccount.google.com/apppasswords'); toast('Turn on 2-Step Verification first, then create an app password named "JARVIS" and paste the 16 letters here.'); }
        else if (act === 'open' || act === 'folder') await call('meeting-open', {id: b.dataset.id, what: act === 'folder' ? 'folder' : 'transcript'});
      } catch (x) { toast(clean(x)); this.draw(); }
    },
    onEvent(ev) {
      if (!ev) return;
      if (ev.info) this.info = ev.info;
      if (ev.type === 'state' && this.info) { const st = ev.state; this.info = {...this.info, active: st.active, ending: st.ending, meeting: st.meeting}; }
      if (ev.type === 'start' && ev.meeting) { this.status = ''; this.startCapture(ev.meeting); }
      if (ev.type === 'stop') { this.status = 'Finishing the transcript…'; this.stopCapture(true); }
      if (ev.type === 'status') this.status = ev.text || '';
      if (ev.type === 'ask') { this.status = 'Pick the suit this meeting is for, then press Start.'; this.toggle(true); }
      if (ev.type === 'failed') { this.status = `<span class="mt-bad">${esc(ev.error || 'The recording did not start.')}</span>`; this.stopCapture(false); }
      if (ev.type === 'done') {
        this.status = ev.emailed ? `<span class="mt-ok">Notes emailed to ${esc(ev.to)}.</span>` : `<span class="mt-warn">Saved, not emailed: ${esc(ev.emailError || '')}</span>`;
        toast(ev.emailed ? `Meeting notes emailed to ${ev.to}.` : 'Meeting saved. ' + (ev.emailError || ''));
        this.refresh(); return;
      }
      this.draw();
    },
  };
  try { J.on('meeting', ev => M.onEvent(ev)); } catch {}
  document.addEventListener('pointerdown', e => { if (M.open && !e.target.closest('.mt-panel,.qp-ico[data-meeting],.mt-bar')) M.toggle(false); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape' && M.open) M.toggle(false); });
  addEventListener('resize', () => M.place());
  setInterval(() => M.attach(), 1500); setTimeout(() => { M.attach(); M.refresh(); }, 1000);
  setInterval(() => M.tick(), 1000);
  window.__jarvisMeeting = M;
})();
