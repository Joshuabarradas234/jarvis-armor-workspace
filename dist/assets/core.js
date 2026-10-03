/*
 * JARVIS v10 — JARVIS Core: the part of JARVIS that works when you are not looking.
 *  - In the hall: the Core button (top right) opens what needs your OK, the reports, what JARVIS did on his own,
 *    the schedule from your standing orders, his own updates, and a place to talk to him.
 *  - In Settings: a "JARVIS Core" tab for your phone (Twilio / WhatsApp), email, the brain, quiet hours and updates.
 */
(() => {
  'use strict';
  const J = window.jarvis; if (!J) return;
  const VIEW = new URLSearchParams(location.search).get('view') || 'main';
  if (!['main', 'settings'].includes(VIEW)) return;
  // errors from the main process arrive wrapped ("Error invoking remote method 'jarvis:call': Error: …"): keep only JARVIS's own words
  const core = (method, data = {}) => J.call('core', {method, data}).catch(e => { throw Error(String(e?.message || e).replace(/^Error invoking remote method '[^']*':\s*(Error:\s*)?/, '')); });
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const hall = () => document.body.dataset.theme || 'ironman';
  const ACCENT = {ironman: '#7fd6e8', batcave: '#f5c542', spiderman: '#ff4d4d'};
  const accent = () => ACCENT[hall()] || '#7fd6e8';
  const toast = msg => { const t = document.createElement('div'); t.className = 'hx-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.classList.add('out'), 3800); setTimeout(() => t.remove(), 4400); };
  const clock = ms => ms ? new Date(ms).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) : '';
  const when = ms => { if (!ms) return ''; const d = new Date(ms), now = new Date(); const same = d.toDateString() === now.toDateString(); const tmr = new Date(now); tmr.setDate(tmr.getDate() + 1);
    return same ? clock(ms) : d.toDateString() === tmr.toDateString() ? `tomorrow ${clock(ms)}` : d.toLocaleString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}); };
  const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 24) return `${h} h ago`; return new Date(ms).toLocaleDateString('en-GB', {day: 'numeric', month: 'short'}); };
  const money = v => '$' + (Number(v) || 0).toFixed(2);
  function md(src) {
    const lines = String(src || '').replace(/\r/g, '').split('\n'); let html = '', list = null, code = false;
    const inline = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<b>$2</b>').replace(/(^|\s)_([^_\n]+)_/g, '$1<i>$2</i>')
      .replace(/(^|\s)#(\d{1,5})\b/g, '$1<span class="jc-ref">#$2</span>');
    const flush = () => { if (list) { html += `</${list}>`; list = null; } };
    for (const l of lines) {
      if (/^```/.test(l)) { flush(); html += code ? '</pre>' : '<pre>'; code = !code; continue; }
      if (code) { html += esc(l) + '\n'; continue; }
      let m;
      if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { flush(); html += `<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`; continue; }
      if ((m = /^\s*[-*•]\s+(.*)$/.exec(l))) { if (list !== 'ul') { flush(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { if (list !== 'ol') { flush(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; continue; }
      if (!l.trim()) { flush(); continue; }
      flush(); html += `<p>${inline(l)}</p>`;
    }
    flush(); if (code) html += '</pre>'; return html;
  }
  const KIND = {update: 'Update to myself', email: 'Email', audit: 'Audit fix', settings: 'Settings', tower: 'Agent rules', orders: 'Standing orders', tool: 'Action', undo: 'Undo'};
  const ACT_ICON = {email: '✉', message: '💬', call: '📞', approvals: '✔', audit: '🛡', 'self-update': '⚙', schedule: '⏱', alarm: '⏰', numbers: '📈', tool: '•', inbox: '↩', bedtime: '🌙', chat: '•'};

  /* ------------------------------------------------------------------ styles */
  const css = document.createElement('style');
  css.textContent = `
.jc{position:fixed;inset:0;z-index:99;--ix:#7fd6e8;opacity:0;transition:opacity .25s;color:#e6f2f8;font:14px "Segoe UI",system-ui,sans-serif;display:flex;flex-direction:column;
  background:radial-gradient(ellipse at 78% 30%,color-mix(in srgb,var(--ix) 11%,#03070bf0) 0%,#020509f2 48%,#010306fa 100%);backdrop-filter:blur(8px) brightness(.45)}
.jc.in{opacity:1}
.jc button,.jc-set button{font:600 13px "Segoe UI",system-ui,sans-serif;color:#e6f2f8;background:#ffffff0a;border:1px solid color-mix(in srgb,var(--ix) 40%,#ffffff1a);border-radius:9px;padding:8px 13px;cursor:pointer}
.jc button:hover,.jc-set button:hover{background:color-mix(in srgb,var(--ix) 22%,transparent)}
.jc button:disabled,.jc-set button:disabled{opacity:.45;cursor:default}
.jc .jc-go,.jc-set .jc-go{background:color-mix(in srgb,var(--ix) 80%,#000);color:#041017;border-color:transparent;font-weight:700}
.jc .jc-go:hover,.jc-set .jc-go:hover{background:var(--ix)}
.jc .jc-no{border-color:#ff8a7a66}
.jc input,.jc textarea,.jc select{font:14px "Segoe UI",system-ui,sans-serif;color:#eaf6fb;background:#050a0fcc;border:1px solid #ffffff22;border-radius:8px;padding:8px 10px}
.jc textarea{resize:vertical;line-height:1.45}
.jc-top{display:flex;justify-content:space-between;align-items:flex-end;gap:20px;padding:24px 40px 14px;border-bottom:1px solid #ffffff12}
.jc-top p{margin:0 0 6px;font:700 10.5px Consolas,monospace;letter-spacing:.24em;color:color-mix(in srgb,var(--ix) 85%,#fff)}
.jc-top h2{margin:0;font:300 30px/1.1 "Segoe UI",system-ui,sans-serif}
.jc-top h2 small{font-size:14px;color:#9fb6c3;margin-left:10px}
.jc-chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.jc-chip{font:600 11.5px "Segoe UI",sans-serif;padding:4px 10px;border-radius:20px;background:#ffffff08;border:1px solid #ffffff1c;color:#b8ccd6}
.jc-chip.ok{border-color:color-mix(in srgb,var(--ix) 55%,transparent);color:#e8fbff}
.jc-chip.bad{border-color:#ff8a7a66;color:#ffc2b8}
.jc-warn{margin:10px 0 0;padding:7px 12px;border-radius:8px;border:1px solid #ff8a7a55;background:#ff8a7a12;color:#ffd3cb;font:500 13px/1.45 "Segoe UI",sans-serif;max-width:900px}
.jc-x{width:40px;height:40px;padding:0!important;font-size:22px!important}
.jc-tabs{display:flex;gap:6px;padding:12px 40px 0}
.jc-tabs button{border-radius:9px 9px 0 0;border-bottom:none;background:transparent;color:#9fb6c3}
.jc-tabs button.on{background:color-mix(in srgb,var(--ix) 16%,#050a0f);color:#fff;border-color:color-mix(in srgb,var(--ix) 60%,transparent)}
.jc-tabs button b{display:inline-block;min-width:18px;margin-left:6px;padding:0 5px;border-radius:9px;background:var(--ix);color:#031016;font:700 11px/18px Consolas,monospace}
.jc-body{flex:1;overflow:auto;padding:20px 40px 40px;border-top:1px solid color-mix(in srgb,var(--ix) 30%,transparent)}
.jc h3{margin:6px 0 12px;font:700 11px Consolas,monospace;letter-spacing:.2em;color:color-mix(in srgb,var(--ix) 80%,#fff);text-transform:uppercase}
.jc-cols{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:28px}
.jc-cols.rep{grid-template-columns:280px minmax(0,1fr)}
.jc-card{border:1px solid #ffffff18;border-radius:12px;background:#ffffff06;padding:14px 16px;margin-bottom:12px}
.jc-card.r-high{border-color:color-mix(in srgb,var(--ix) 55%,#ffffff18);box-shadow:0 0 22px color-mix(in srgb,var(--ix) 14%,transparent)}
.jc-card header{display:flex;gap:10px;align-items:baseline;font-size:12px;color:#9fb6c3}
.jc-card header b{font:700 15px Consolas,monospace;color:var(--ix)}
.jc-card h4{margin:6px 0 8px;font:600 15.5px "Segoe UI",sans-serif;color:#f2fbff}
.jc-card pre,.jc-diff{white-space:pre-wrap;max-height:220px;overflow:auto;margin:0 0 10px;padding:10px 12px;border-radius:8px;background:#02060acc;border:1px solid #ffffff10;font:12.5px/1.45 Cascadia Code,Consolas,monospace;color:#b9d2dc}
.jc-diff{max-height:420px}
.jc-diff .a{color:#9ef0b0}.jc-diff .d{color:#ff9d90}.jc-diff .h{color:var(--ix)}
.jc-card footer{display:flex;gap:8px;flex-wrap:wrap}
.jc-empty{color:#8ea6b2;font-size:14px;padding:18px;border:1px dashed #ffffff1c;border-radius:12px;text-align:center}
.jc-row{display:flex;gap:10px;align-items:flex-start;padding:8px 2px;border-bottom:1px solid #ffffff0c;font-size:13.5px}
.jc-row time{flex:0 0 118px;color:#8ea6b2;font:12px Consolas,monospace;padding-top:2px}
.jc-row i{flex:0 0 18px;font-style:normal;opacity:.85}
.jc-row .auto{font:700 9.5px Consolas,monospace;letter-spacing:.12em;color:var(--ix);border:1px solid color-mix(in srgb,var(--ix) 40%,transparent);border-radius:4px;padding:1px 4px;margin-left:6px}
.jc-st{font:700 10px Consolas,monospace;letter-spacing:.1em;text-transform:uppercase;padding:2px 7px;border-radius:5px;background:#ffffff10;color:#b8ccd6}
.jc-st.done,.jc-st.approved,.jc-st.installed,.jc-st.ready,.jc-st.good{background:#10483a;color:#b6f5dc}
.jc-st.denied,.jc-st.failed,.jc-st.rejected,.jc-st.bad,.jc-st.expired{background:#4a1c20;color:#ffc2b8}
.jc-list button{display:block;width:100%;text-align:left;margin-bottom:8px;background:#ffffff06}
.jc-list button.on{border-color:var(--ix);background:color-mix(in srgb,var(--ix) 14%,transparent)}
.jc-list button small{display:block;color:#8ea6b2;font-weight:400;margin-top:3px}
.jc-doc{border:1px solid #ffffff14;border-radius:12px;background:#ffffff05;padding:6px 24px 18px;line-height:1.55}
.jc-doc h3,.jc-doc h4,.jc-doc h5{font:600 16px "Segoe UI",sans-serif;letter-spacing:0;text-transform:none;color:#f2fbff;margin:16px 0 6px}
.jc-doc ul{padding-left:20px;margin:6px 0}.jc-doc p{margin:8px 0}
.jc-ref{font:700 12px Consolas,monospace;color:var(--ix)}
.jc-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.jc-table{width:100%;border-collapse:collapse;font-size:13.5px;margin-bottom:18px}
.jc-table td{padding:8px 6px;border-bottom:1px solid #ffffff0e;vertical-align:top}
.jc-table td:first-child{min-width:120px;max-width:230px;color:var(--ix);font:600 12.5px Consolas,monospace}
.jc-table td:last-child{white-space:nowrap;color:#8ea6b2;text-align:right}
.jc-form{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:8px 0 18px}
.jc-form input,.jc-form select,.jc-form button{width:auto;flex:0 0 auto;margin:0}
.jc-form input[name=when]{width:200px}
.jc-chat{display:flex;flex-direction:column;gap:10px;min-height:200px;max-height:calc(100vh - 330px);overflow:auto;padding:6px 2px 12px}
.jc-msg{max-width:78%;padding:10px 14px;border-radius:12px;line-height:1.5}
.jc-msg.me{align-self:flex-end;background:color-mix(in srgb,var(--ix) 20%,#06121a);border:1px solid color-mix(in srgb,var(--ix) 45%,transparent)}
.jc-msg.him{align-self:flex-start;background:#ffffff08;border:1px solid #ffffff16}
.jc-msg.him p{margin:4px 0}
.jc-ask{display:flex;gap:10px}.jc-ask input{flex:1}
.jc-muted{color:#8ea6b2;font-size:13px}
.jc-modal{position:absolute;inset:6% 10%;z-index:3;display:flex;flex-direction:column;gap:10px;padding:18px;border-radius:14px;background:#050b10f5;border:1px solid color-mix(in srgb,var(--ix) 45%,transparent);box-shadow:0 20px 70px #000c}
.jc-modal textarea{flex:1;font:13px/1.5 Cascadia Code,Consolas,monospace}
.qp-ico[data-core]{position:relative}
.qp-ico[data-core][data-count]::after{content:attr(data-count);position:absolute;top:-6px;right:-6px;min-width:17px;height:17px;padding:0 4px;border-radius:9px;background:#ffcf5a;color:#241a00;font:700 10px/17px Consolas,monospace;text-align:center;box-shadow:0 0 10px #ffcf5a}
/* settings tab */
.jc-set{--ix:#7fd6e8;max-width:900px}
.jc-set section{border:1px solid #ffffff14;border-radius:12px;padding:14px 18px;margin:0 0 16px;background:#ffffff04}
.jc-set h3{margin:0 0 10px;font:700 11px Consolas,monospace;letter-spacing:.2em;color:#9fdcec;text-transform:uppercase}
.jc-set .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px 16px}
.jc-set label{display:flex;flex-direction:column;gap:5px;font-size:13px;color:#b8ccd6}
.jc-set label.check{flex-direction:row;align-items:center;gap:8px}
.jc-set input,.jc-set select,.jc-set textarea{font:14px "Segoe UI",system-ui,sans-serif;color:#eaf6fb;background:#050a0fcc;border:1px solid #ffffff22;border-radius:8px;padding:8px 10px}
.jc-set .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px}
.jc-set .msg{font-size:13px;color:#9fdcec;min-height:18px}
.jc-set .msg.bad{color:#ffb2a6}
.jc-set details{margin-top:10px;font-size:13px;color:#b8ccd6;line-height:1.55}
.jc-set details summary{cursor:pointer;color:#9fdcec}
.jc-set ol{padding-left:20px;margin:8px 0}
.jc-set code{font:12.5px Consolas,monospace;color:#e8fbff}
`;
  document.head.appendChild(css);

  /* ================================================================== the hall panel */
  if (VIEW === 'main') {
    const H = {
      open: false, el: null, tab: 'needs', st: null, reportId: null, chat: [], diff: {}, sending: false,
      async show(tab, reportId) {
        if (tab) this.tab = tab; if (reportId) this.reportId = reportId;
        if (!this.open) {
          this.open = true; window.__jarvisHolo?.pauseAll?.(true);
          this.el = document.createElement('section'); this.el.className = 'jc'; this.el.style.setProperty('--ix', accent());
          document.body.appendChild(this.el); requestAnimationFrame(() => this.el.classList.add('in'));
          this.el.addEventListener('click', e => this.click(e).catch(err => toast(err.message)));
          this.el.addEventListener('submit', e => { e.preventDefault(); this.submit(e.target).catch(err => toast(err.message)); });
        }
        await this.refresh();
      },
      close() { if (!this.open) return; this.open = false; const el = this.el; this.el = null; el.classList.remove('in'); setTimeout(() => el.remove(), 260); window.__jarvisHolo?.pauseAll?.(false); },
      async refresh() { try { this.st = await core('status'); } catch (e) { this.st = null; this.err = e.message; } badge(this.st); this.render(); },
      render() {
        if (!this.el) return;
        const s = this.st;
        if (!s) { this.el.innerHTML = `<div class="jc-top"><div><p>JARVIS CORE</p><h2>Starting…</h2><p class="jc-muted">${esc(this.err || '')}</p></div><button class="jc-x" data-act="close">×</button></div>`; return; }
        const next = s.upcoming?.[0], sb = s.whatsappSandbox || {};
        const wa = !(s.phone.whatsapp || s.phone.callmebot) ? ['WhatsApp not set up', false]
          : sb.sandbox && sb.lapsed ? ['WhatsApp lapsed: rejoin the sandbox', false]
          : [`WhatsApp ✓${sb.sandbox && sb.expiresAt ? ` until ${when(sb.expiresAt)}` : ''}`, true];
        const chips = [
          [s.key ? 'Claude connected' : 'No Claude key', s.key],
          wa,
          [s.phone.calls ? 'Calls ✓' : 'Calls not set up', s.phone.calls],
          [s.email.ready ? `Email ✓${s.email.today ? ` · ${s.email.today} today` : ''}` : 'Email not connected', s.email.ready],
          [next ? `Next: ${next.kind === 'call' ? 'call' : next.kind} ${when(next.at)}` : 'Nothing scheduled', true],
          [`${money(s.spend.today)} of ${money(s.spend.budget)} today`, true],
        ];
        const nWait = s.approvals.length;
        const tabs = [['needs', 'Needs you', nWait], ['reports', 'Reports'], ['activity', 'What I did'], ['schedule', 'Schedule'], ['updates', 'My updates', s.updates.updates.filter(u => u.status === 'drafting').length ? '…' : 0], ['talk', 'Talk to me'], ['routines', 'Routines'], ['workdesk', 'Work desk']];
        this.el.innerHTML = `<div class="jc-top"><div><p>JARVIS CORE · WORKING WHILE YOU'RE AWAY</p><h2>${esc(s.config.owner.address === 'sir' ? 'At your service, sir.' : 'At your service.')}<small>${esc(s.version)}</small></h2>
          <div class="jc-chips">${chips.map(([t, ok]) => `<span class="jc-chip ${ok ? 'ok' : 'bad'}">${esc(t)}</span>`).join('')}${(!s.key || !s.phone.any) ? '<button data-act="settings">Set up…</button>' : ''}</div>
          ${sb.sandbox && sb.lapsed ? `<div class="jc-warn">⚠ Twilio's WhatsApp sandbox forgets you three days after you join, so I can't WhatsApp you. From your phone, ${esc(sb.renew || 'send the join code to +1 415 523 8886.')}</div>` : ''}</div>
          <div style="display:flex;gap:10px"><button data-act="bedtime" title="Tell JARVIS you are going to bed (the overnight report starts from now)">🌙 Goodnight</button><button class="jc-x" data-act="close" title="Close (Esc)">×</button></div></div>
          <nav class="jc-tabs">${tabs.map(([k, t, n]) => `<button data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${t}${n ? `<b>${n}</b>` : ''}</button>`).join('')}</nav>
          <div class="jc-body">${this[`view_${this.tab}`]?.(s) || ''}</div>`;
        if (this.tab === 'talk') { const c = $('.jc-chat', this.el); if (c) c.scrollTop = c.scrollHeight; $('.jc-ask input', this.el)?.focus(); }
        if (this.tab === 'reports') this.loadReport();
      },
      view_needs(s) {
        const cards = s.approvals.map(a => `<article class="jc-card r-${esc(a.risk)}"><header><b>#${a.id}</b><span class="jc-st">${esc(KIND[a.kind] || a.kind)}</span><span>${esc(ago(a.createdAt))} · ${esc(a.source || 'JARVIS')}</span></header>
          <h4>${esc(a.title)}</h4>${a.detail ? `<pre>${esc(a.detail)}</pre>` : ''}${this.diff[a.id] ? `<div class="jc-diff">${this.diff[a.id]}</div>` : ''}
          <footer><button class="jc-go" data-act="yes" data-id="${a.id}">${a.kind === 'update' ? 'Approve & install' : a.kind === 'email' ? 'Approve & send' : 'Approve'}</button><button class="jc-no" data-act="no" data-id="${a.id}">Decline</button>${a.kind === 'update' ? `<button data-act="diff" data-id="${a.id}">${this.diff[a.id] ? 'Hide the changes' : 'See the changes'}</button>` : ''}</footer></article>`).join('');
        const recent = s.recent.slice(0, 14).map(a => `<div class="jc-row"><time>#${a.id} · ${esc(ago(a.decidedAt || a.finishedAt || a.createdAt))}</time><div><span class="jc-st ${esc(a.status)}">${esc(a.status)}</span> ${esc(a.title)}${a.result ? `<div class="jc-muted">${esc(a.result)}</div>` : ''}</div></div>`).join('');
        return `<div class="jc-cols"><div><h3>Waiting for your OK</h3>${cards || '<p class="jc-empty">Nothing is waiting for you. Anything JARVIS wants to do that involves your business, other people, money or his own code will appear here — and on WhatsApp.</p>'}
          ${s.approvals.length ? `<p class="jc-muted">Approve here, or on WhatsApp with the number <b>and the code</b> from JARVIS's own “needs your OK” message (e.g. <b>YES ${s.approvals[0].id} K7M3</b>). The code means a casual “ok”, or a message the AI wrote, can never approve anything. <b>NO ${s.approvals[0].id}</b> needs no code.</p>` : ''}</div>
          <div><h3>Recently decided</h3>${recent || '<p class="jc-muted">Nothing yet.</p>'}</div></div>`;
      },
      view_reports(s) {
        if (!this.reportId && s.reports[0]) this.reportId = s.reports[0].id;
        const list = s.reports.map(r => `<button data-act="report" data-id="${r.id}" class="${r.id === this.reportId ? 'on' : ''}">${esc(r.title)}<small>${esc(when(r.at))}${r.delivered?.length ? ` · ${esc(r.delivered.map(d => d.via + (d.ok ? '' : ' ✗')).join(', '))}` : ''}</small></button>`).join('');
        return `<div class="jc-bar"><button class="jc-go" data-act="run" data-kind="report">Overnight report now</button><button data-act="run" data-kind="report" data-type="day">Summary of the day</button><button data-act="run" data-kind="audit">Run Optimize (audit)</button>
          <button data-act="send-report" data-how="whatsapp">Send this to WhatsApp</button><button data-act="send-report" data-how="call">Call me with it</button></div>
          <div class="jc-cols rep"><div class="jc-list">${list || '<p class="jc-muted">No reports yet. The first overnight report arrives with your morning call.</p>'}</div><div class="jc-doc" data-doc>${s.reports.length ? '<p class="jc-muted">Loading…</p>' : '<p class="jc-muted">Reports appear here, and as Markdown files in Documents\\JARVIS\\Reports.</p>'}</div></div>`;
      },
      async loadReport() {
        const box = $('[data-doc]', this.el); if (!box || !this.reportId) return;
        try { const r = await core('report', {id: this.reportId}); if (this.tab === 'reports' && box.isConnected) box.innerHTML = `<h3>${esc(r.title)}</h3>${md(r.text)}`; } catch (e) { box.innerHTML = `<p class="jc-muted">${esc(e.message)}</p>`; }
      },
      view_activity(s) {
        const rows = s.activity.map(a => `<div class="jc-row"><time>${esc(when(a.t))}</time><i>${ACT_ICON[a.kind] || '•'}</i><div>${esc(a.text)}${a.auto ? '<span class="auto">ON MY OWN</span>' : ''}</div></div>`).join('');
        return `<h3>Everything JARVIS did</h3>${rows || '<p class="jc-empty">Nothing yet.</p>'}`;
      },
      view_schedule(s) {
        const jobs = s.schedule.jobs.map(j => `<tr><td>${esc(j.label)}</td><td>${esc(j.text)}</td><td>${j.next ? esc(when(j.next)) : ''}</td></tr>`).join('');
        const probs = s.schedule.problems.map(p => `<div class="jc-row"><time>line ${p.line}</time><div>⚠ ${esc(p.text)}<div class="jc-muted">${esc(p.why)}</div></div></div>`).join('');
        const alarms = s.upcoming.filter(u => u.source === 'alarm').map(u => `<div class="jc-row"><time>${esc(when(u.at))}</time><div>${u.kind === 'call' ? '📞' : '💬'} ${esc(u.what)} <button data-act="alarm-cancel" data-id="${esc(u.id)}">Cancel</button></div></div>`).join('');
        return `<div class="jc-cols"><div><h3>Your standing orders</h3><p class="jc-muted">JARVIS follows <b>${esc(s.ordersFile)}</b> — the instructions for what to do without you. Edit it here or in Notepad; changes apply as soon as it is saved.</p>
          <div class="jc-bar"><button class="jc-go" data-act="orders-edit">Edit standing orders</button><button data-act="run" data-kind="email">Check email now</button><button data-act="run" data-kind="numbers">Check my numbers now</button></div>
          <table class="jc-table">${jobs || '<tr><td></td><td>No schedule lines yet.</td><td></td></tr>'}</table>${probs ? `<h3>Lines JARVIS cannot follow</h3>${probs}` : ''}
          ${s.schedule.watch.length ? `<h3>Numbers I'm watching</h3>${s.schedule.watch.map(w => { const n = (s.numbers || []).find(x => x.name === w.name); return `<div class="jc-row"><time>${esc(w.name)}</time><div>${n ? (n.error ? `⚠ ${esc(n.error)}` : `${esc(n.value)}${n.change !== null ? ` (${n.change > 0 ? '+' : ''}${n.change}%)` : ''}`) : '<span class="jc-muted">not checked yet</span>'}</div></div>`; }).join('')}` : ''}</div>
          <div><h3>Wake-up calls</h3>${alarms || '<p class="jc-muted">No one-off wake-up calls. Say “Jarvis, wake me up at 6:30”, or WhatsApp him “wake me at 6:30”.</p>'}
          <form class="jc-form" data-form="alarm"><input name="when" placeholder="06:30, or tomorrow at 7" required style="width:190px"><select name="kind"><option value="call">Call me</option><option value="whatsapp">WhatsApp me</option></select><button class="jc-go">Set</button></form>
          <h3>Next up</h3>${s.upcoming.slice(0, 8).map(u => `<div class="jc-row"><time>${esc(when(u.at))}</time><div>${u.kind === 'call' ? '📞' : u.kind === 'message' ? '💬' : '⏱'} ${esc(u.what)}</div></div>`).join('') || '<p class="jc-muted">Nothing in the next two days.</p>'}</div></div>`;
      },
      view_updates(s) {
        const u = s.updates;
        const ups = u.updates.map(x => `<div class="jc-row"><time>${esc(when(x.createdAt))}</time><div><span class="jc-st ${esc(x.status)}">${esc(x.status)}</span> ${esc(x.title)}${x.approvalId && x.status === 'ready' ? ` <span class="jc-ref">#${x.approvalId}</span>` : ''}
          ${x.why ? `<div class="jc-muted">${esc(x.why)}</div>` : ''}${x.error ? `<div class="jc-muted">⚠ ${esc(String(x.error).slice(0, 300))}</div>` : ''}${x.files?.length ? `<div class="jc-muted">${esc(x.files.map(f => f.path).join(', '))}${x.added !== undefined ? ` · +${x.added} −${x.removed}` : ''}</div>` : ''}</div></div>`).join('');
        const vs = u.versions.map(v => `<div class="jc-row"><time>${esc(when(v.created))}</time><div><span class="jc-st ${v.bad ? 'bad' : v.good ? 'good' : ''}">${v.running ? 'running' : v.current ? 'next start' : v.bad ? 'rolled back' : v.undone ? 'undone' : v.superseded ? 'set aside' : 'kept'}</span> Self-update ${esc(v.n)}: ${esc(v.title)}${ghLine(s, v)}${v.reason ? `<div class="jc-muted">${esc(v.reason)}</div>` : ''}</div></div>`).join('');
        return `<div class="jc-cols"><div><h3>How JARVIS updates himself</h3><p class="jc-muted">Every night (and whenever you ask) JARVIS looks at what isn't working or could be better, builds the change in a copy of himself, checks it, and sends it to you. <b>Nothing is installed until you say YES.</b> If an update doesn't start properly, he goes back to the previous version on his own.</p>
          <p>Running: <b>${esc(u.label)}</b>${u.pendingRestart ? ' — an approved update switches on at the next restart.' : ''}${u.safeMode ? ' (safe mode: updates are off)' : ''}</p>
          <div class="jc-bar"><button class="jc-go" data-act="run" data-kind="improve">Review yourself now</button>${u.pendingRestart ? '<button data-act="restart">Restart now to switch it on</button>' : ''}<button data-act="undo" ${u.current ? '' : 'disabled'}>Undo the last update</button><button data-act="reset-updates" ${u.current ? '' : 'disabled'}>Back to the installed version</button></div>
          <h3>Ask for a feature</h3><form data-form="feature"><textarea name="text" rows="3" style="width:100%" placeholder="e.g. When I say “Jarvis, focus music”, open my focus playlist in a tab and start focus mode for 50 minutes." required></textarea><div class="jc-form"><button class="jc-go">Build it (you'll be asked before it's installed)</button></div></form>
          <h3>Updates</h3>${ups || '<p class="jc-muted">None yet.</p>'}</div>
          <div><h3>Versions</h3>${vs || '<p class="jc-muted">Still the version you installed.</p>'}${u.events?.length ? `<h3>History</h3>${u.events.slice().reverse().map(e => `<div class="jc-row"><time>${esc(when(e.t))}</time><div>${esc(e.text)}</div></div>`).join('')}` : ''}</div></div>`;
      },
      view_talk(s) {
        const msgs = this.chat.map(m => `<div class="jc-msg ${m.me ? 'me' : 'him'}">${m.me ? esc(m.text) : md(m.text)}${m.approvals?.length ? `<div class="jc-bar" style="margin:8px 0 0">${m.approvals.map(id => `<button class="jc-go" data-act="yes" data-id="${id}">Approve #${id}</button><button data-act="no" data-id="${id}">Decline #${id}</button>`).join('')}</div>` : ''}</div>`).join('');
        return `<div class="jc-chat">${msgs || `<p class="jc-muted">Ask anything — “is anyone upset in my inbox?”, “wake me at 6:30 tomorrow”, “what did the tower do overnight?”, “add a feature that…”. The same JARVIS answers on WhatsApp and by voice (“Jarvis, …”).</p>`}${this.sending ? '<div class="jc-msg him"><p>…</p></div>' : ''}</div>
          <form class="jc-ask" data-form="chat"><input name="text" autocomplete="off" placeholder="Talk to JARVIS…" ${this.sending ? 'disabled' : ''}><button class="jc-go" ${this.sending ? 'disabled' : ''}>Send</button></form>`;
      },
      async click(e) {
        const t = e.target.closest('[data-act],[data-tab]'); if (!t) return;
        if(t.dataset.tab==='workdesk'){await this.close();return window.__jarvisWorkDesk.show();}
        if(t.dataset.tab==='routines'){this.close();return window.__jarvisRoutines.show();}
        if (t.dataset.tab) { this.tab = t.dataset.tab; this.render(); return; }
        const act = t.dataset.act, id = Number(t.dataset.id);
        if (act === 'close') return this.close();
        if (act === 'settings') return J.call('action', {action: 'settings'});
        if (act === 'bedtime') { const r = await core('run', {kind: 'bedtime'}); toast(r); return this.refresh(); }
        if (act === 'yes' || act === 'no') {
          t.disabled = true; const r = await core('decide', {id, yes: act === 'yes'}); toast(`#${id}: ${r.result}`); delete this.diff[id]; return this.refresh();
        }
        if (act === 'diff') {
          if (this.diff[id]) { delete this.diff[id]; return this.render(); }
          const d = await core('details', {id}); this.diff[id] = esc(d.diff || 'No changes to show.').split('\n').map(l => l.startsWith('+ ') ? `<span class="a">${l}</span>` : l.startsWith('- ') ? `<span class="d">${l}</span>` : /^(===|@@)/.test(l) ? `<span class="h">${l}</span>` : l).join('\n'); return this.render();
        }
        if (act === 'report') { this.reportId = t.dataset.id; return this.render(); }
        if (act === 'run') {
          const kind = t.dataset.kind; t.disabled = true; const label = t.textContent; t.textContent = 'Working…';
          try {
            const r = await core('run', {kind, type: t.dataset.type});
            if (kind === 'report' || kind === 'audit') { this.reportId = r.id; this.tab = 'reports'; if (r.summary) toast(r.summary); }
            else if (kind === 'improve') toast(r.summary);
            else if (kind === 'email') toast(r.errors?.length ? r.errors[0] : `Sorted ${r.sorted}; drafted ${r.drafted}.`);
            else if (kind === 'numbers') toast(`${r.length} number${r.length === 1 ? '' : 's'} checked.`);
          } finally { t.textContent = label; }
          return this.refresh();
        }
        if (act === 'send-report') { if (!this.reportId) return toast('Pick a report first.'); const how = t.dataset.how; t.disabled = true; await core('run', {kind: 'report', send: how, id: this.reportId}); toast(how === 'call' ? 'Calling you with this report.' : 'Sent this report to WhatsApp.'); return this.refresh(); }
        if (act === 'alarm-cancel') { await core('alarm-cancel', {id: t.dataset.id}); return this.refresh(); }
        if (act === 'github-open') { await core('github-open', {version: t.dataset.v}); return; }
        if (act === 'github-propose') { t.disabled = true; try { const r = await core('github-propose', {version: t.dataset.v}); toast(r?.url ? 'Proposed on GitHub. Merge it there when the tests pass.' : r?.message || 'Nothing to propose.'); } catch (err) { toast(err.message); } return this.refresh(); }
        if (act === 'undo') { if (!confirm('Go back to the previous version of JARVIS? He will restart.')) return; await core('undo'); toast('Restarting on the previous version…'); return; }
        if (act === 'reset-updates') { if (!confirm('Go back to the version you installed, setting aside every self-update? JARVIS will restart.')) return; await core('reset-updates'); toast('Restarting…'); return; }
        if (act === 'restart') { await core('restart'); toast('Restarting…'); return; }
        if (act === 'orders-edit') return this.editOrders();
        if (act === 'orders-save') {
          const box = $('.jc-modal textarea', this.el); const probs = await core('orders-save', {text: box.value});
          $('.jc-modal [data-msg]', this.el).textContent = probs.length ? `Saved. ${probs.length} line${probs.length === 1 ? '' : 's'} I can't follow: ${probs.map(p => `line ${p.line} (${p.why})`).join('; ')}` : 'Saved. JARVIS is following the new orders.';
          return;
        }
        if (act === 'orders-close') { $('.jc-modal', this.el)?.remove(); return this.refresh(); }
      },
      async editOrders() {
        const text = await core('orders-text');
        const m = document.createElement('div'); m.className = 'jc-modal';
        m.innerHTML = `<h3 style="margin:0">Standing orders — what JARVIS does without you</h3><p class="jc-muted" style="margin:0">Schedule lines look like <code>- 06:00 weekdays — Call me with the overnight report.</code> or <code>- Every 30 minutes (07:00–23:00) — Check my email.</code></p>
          <textarea spellcheck="false"></textarea><div style="display:flex;gap:10px;align-items:center"><button class="jc-go" data-act="orders-save">Save</button><button data-act="orders-close">Close</button><span class="jc-muted" data-msg></span></div>`;
        $('textarea', m).value = text; this.el.appendChild(m); $('textarea', m).focus();
      },
      async submit(f) {
        const form = f.dataset.form, data = Object.fromEntries(new FormData(f));
        if (form === 'chat') {
          const text = String(data.text || '').trim(); if (!text || this.sending) return;
          this.chat.push({me: true, text}); this.sending = true; this.render();
          try { const r = await core('chat', {text}); this.chat.push({text: r.text, approvals: r.approvals}); }
          catch (e) { this.chat.push({text: `⚠ ${e.message}`}); }
          finally { this.sending = false; this.chat = this.chat.slice(-40); await this.refresh(); }
          return;
        }
        if (form === 'alarm') { const a = await core('alarm-add', {when: data.when, kind: data.kind}); toast(`Set for ${when(a.at)}.`); return this.refresh(); }
        if (form === 'feature') { await core('feature', {text: data.text}); toast('Building it in a copy of myself. You will be asked before it is installed.'); f.reset(); return this.refresh(); }
      },
    };
    function badge(s) {
      const b = $('.qp-icons [data-core]'); if (!b) return;
      const n = s?.approvals?.length || 0; if (n) b.dataset.count = n; else delete b.dataset.count;
      b.title = n ? `JARVIS Core — ${n} waiting for your OK` : 'JARVIS Core — reports, approvals, schedule, updates';
    }
    const ICON = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.2" opacity=".7"/><path d="M12 1.8v2.6M12 19.6v2.6M1.8 12h2.6M19.6 12h2.6M4.8 4.8l1.8 1.8M17.4 17.4l1.8 1.8M4.8 19.2l1.8-1.8M17.4 6.6l1.8-1.8" opacity=".75"/></svg>`;
    function attach() {
      const icons = $('.qp-icons');
      if (icons && !icons.querySelector('[data-core]')) {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'qp-ico'; b.dataset.core = '1'; b.innerHTML = ICON;
        b.addEventListener('click', e => { e.stopPropagation(); H.show(); });
        icons.appendChild(b); badge(H.st);
      }
    }
    let quick = 0;
    async function poll() { try { const s = await core('status'); H.st = s; badge(s); if (H.open) H.render(); } catch {} }
    setInterval(attach, 1500); setTimeout(attach, 1000); setTimeout(poll, 3000); setInterval(() => { if (!H.open && Date.now() - quick > 50000) poll(); }, 60000);
    try {
      J.on('core', m => {
        if (!m) return;
        if (m.type === 'status') { quick = Date.now(); H.st = m.status; badge(m.status); if (H.open && !$('.jc-modal', H.el) && !(H.tab === 'talk' && document.activeElement?.closest?.('.jc-ask'))) H.render(); }
        else if (m.type === 'open') H.show(m.tab || (H.st?.approvals?.length ? 'needs' : 'reports'), m.report);
        else if (m.type === 'report') { if (H.open && H.tab === 'reports') { H.reportId = m.report.id; H.refresh(); } }
        else if (m.type === 'notice') toast(`${m.title}: ${String(m.body || '').slice(0, 160)}`);
        else if (m.type === 'chat') { H.chat.push({me: true, text: `🎙 ${m.q}`}, {text: m.a}); H.chat = H.chat.slice(-40); if (H.open && H.tab === 'talk') H.render(); }
      });
    } catch {}
    addEventListener('keydown', e => { if (e.key === 'Escape' && H.open) { const m = H.el && $('.jc-modal', H.el); if (m) { m.remove(); H.refresh(); } else H.close(); } });
    new MutationObserver(() => { if (H.el) H.el.style.setProperty('--ix', accent()); }).observe(document.body, {attributes: true, attributeFilter: ['data-theme']});
    window.__jarvisCore = H;
    return;
  }

  /* ================================================================== the Settings tab */
  const TAB = 'JARVIS Core';
  const VOICES = [['Polly.Brian-Neural', 'Brian — British, male (the JARVIS voice)'], ['Polly.Arthur-Neural', 'Arthur — British, male'], ['Google.en-GB-Neural2-B', 'Google — British, male'], ['Google.en-GB-Neural2-D', 'Google — British, male 2'], ['Polly.Amy-Neural', 'Amy — British, female'], ['Polly.Emma-Neural', 'Emma — British, female']];
  const DELIVERY = [['call', 'Call me'], ['whatsapp', 'WhatsApp me'], ['both', 'Both']];
  const sel = (name, value, opts) => `<select name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
  const chk = (name, on, label) => `<label class="check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}>${label}</label>`;
  const txt = (name, value, label, extra = '') => `<label>${label}<input name="${name}" value="${esc(value ?? '')}" ${extra}></label>`;
  const secret = (name, has, label, ph) => `<label>${label}<input type="password" name="secret:${name}" autocomplete="off" placeholder="${has ? '•••••••• saved — type to replace' : esc(ph)}"></label>`;
  async function renderSettings(content) {
    let s; try { s = await core('status'); } catch (e) { content.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
    const c = s.config, p = c.phone, em = c.email;
    content.innerHTML = `<div class="settings-heading"><p class="eyebrow">PREFERENCES / JARVIS CORE</p><h1>JARVIS Core.</h1></div>
<div class="jc-set">
<p class="muted">The part of JARVIS that works when you're away: he calls or WhatsApps you with reports and wake-up calls, sorts your email, watches your numbers, audits himself and his agents overnight, and improves himself — <b>always asking you first</b> before anything involving your business, other people, money or his own code.</p>
<form data-core-form>
<section><h3>You</h3><div class="grid">${txt('owner.name', c.owner.name, 'Your name')}${txt('owner.address', c.owner.address, 'What JARVIS calls you')}${txt('owner.phone', c.owner.phone, 'Your mobile (calls and WhatsApp)', 'placeholder="+447…"')}</div></section>
<section><h3>The brain (Claude)</h3><div class="grid">
  <label>Claude API key (shared with the tower)<input type="password" name="claudeKey" autocomplete="off" placeholder="${s.key ? '•••••••• saved — type to replace' : 'sk-ant-…'}"></label>
  <label>Model for thinking${sel('models.brain', c.models.brain, s.models.map(m => [m.id, m.name]))}</label>
  <label>Model for quick jobs (sorting email)${sel('models.fast', c.models.fast, s.models.map(m => [m.id, m.name]))}</label>
  <label>Model for writing his own code${sel('models.code', c.models.code, s.models.map(m => [m.id, m.name]))}</label>
  <label>Code engine${sel('codeEngine', c.codeEngine, [['auto', 'Automatic (Claude Code if installed)'], ['claude-code', 'Claude Code on this PC'], ['api', 'Claude API']])}</label>
  <label>Daily budget for work on his own (US$)<input type="number" name="budgetPerDay" min="0.25" max="200" step="0.25" value="${esc(c.budgetPerDay)}"></label>
</div><div class="row">${chk('enabled', c.enabled, 'JARVIS Core is on')}<button type="button" data-test="claude">Test Claude</button><span class="msg" data-msg="claude"></span></div>
<details><summary>Where do I get a Claude API key?</summary><ol><li>Go to <code>console.anthropic.com</code> → API keys → Create key.</li><li>Paste it above and press Save. It is stored encrypted on this PC and shared with the tower.</li></ol></details></section>
<section><h3>Your phone — Twilio (calls, WhatsApp, texts)</h3><div class="grid">
  ${txt('phone.twilioSid', p.twilioSid, 'Twilio Account SID', 'placeholder="AC…"')}${secret('twilioToken', s.secrets.twilioToken, 'Twilio Auth Token', 'from the Twilio Console')}
  ${txt('phone.twilioFrom', p.twilioFrom, 'Twilio phone number (for calls and texts)', 'placeholder="+44… or +1…"')}${txt('phone.whatsappFrom', p.whatsappFrom, 'WhatsApp number (the sandbox is +14155238886)')}
  <label>Voice on calls${sel('phone.voice', p.voice, VOICES)}</label>
  <label>Ring for (seconds)<input type="number" name="phone.ringSeconds" min="10" max="60" value="${esc(p.ringSeconds)}"></label>
  <label>If you don't answer, try again<input type="number" name="phone.retries" min="0" max="5" value="${esc(p.retries)}"></label>
  <label>Minutes between tries<input type="number" name="phone.retryMinutes" min="1" max="30" value="${esc(p.retryMinutes)}"></label>
</div><div class="row">${chk('phone.whatsapp', p.whatsapp, 'WhatsApp through Twilio')}${chk('phone.sms', p.sms, 'Text messages when WhatsApp can\'t get through')}${chk('phone.callmebot', p.callmebot, 'CallMeBot as a free WhatsApp backup')}</div>
<div class="grid" style="margin-top:10px">${secret('callmebotKey', s.secrets.callmebotKey, 'CallMeBot API key (optional)', 'from callmebot.com')}
  <label>Reports${sel('delivery.reports', c.delivery.reports, DELIVERY)}</label><label>Things that need your OK${sel('delivery.approvals', c.delivery.approvals, DELIVERY)}</label><label>Alerts${sel('delivery.alerts', c.delivery.alerts, DELIVERY)}</label></div>
<div class="row"><button type="button" data-test="whatsapp">Send a test WhatsApp</button><button type="button" data-test="call">Test call</button><span class="msg" data-msg="phone"></span></div>
<p class="muted" style="margin:10px 0 0">Calls are one-way: JARVIS speaks, then sends the same report to WhatsApp, where you answer (“call me in 5”, “is anyone upset?”). Anything that needs your OK arrives as <b>#12 … code K7M3</b>: reply <b>YES 12 K7M3</b> (or <b>YES ALL</b> with the code he gives), <b>NO 12</b>, or <b>DETAILS 12</b>. Your replies reach him within a few seconds.</p>
<details><summary>How to set up your phone (about 10 minutes)</summary><ol>
<li>Create a Twilio account at <code>twilio.com/try-twilio</code> and verify your mobile${c.owner.phone ? ` (${esc(c.owner.phone)})` : ' (type it under <b>You</b> above first)'}.</li>
<li>In the Twilio Console, copy the <b>Account SID</b> and <b>Auth Token</b> into the fields above.</li>
<li>For calls: Phone Numbers → Buy a number (with Voice), and enter it as the Twilio phone number. If it is not a UK number, allow calls to the United Kingdom in Voice → Settings → Geo permissions. Twilio's free trial only sends its own sample messages, so JARVIS needs the account upgraded (Console → Upgrade, pay as you go); calls and messages cost pennies each.</li>
<li>For WhatsApp: Messaging → Try it out → Send a WhatsApp message. From your phone, send the <code>join …</code> code shown there to <b>+1 415 523 8886</b>. In the sandbox settings, leave “When a message comes in” empty.</li>
<li>WhatsApp only lets JARVIS message you freely within 24 hours of your last message to him — so say <b>goodnight</b> to him on WhatsApp in the evening, and the morning report can get through. If the window has closed he falls back to CallMeBot, then a text.</li>
<li><b>The sandbox forgets you three days after you join.</b> JARVIS spots your <code>join …</code> message and, before it lapses, sends you a link that renews it in one tap. If it does lapse, he says so on the morning call and by CallMeBot or text, and shows it here. A WhatsApp sender of your own (Twilio Console → Messaging → Senders → WhatsApp senders) never lapses; enter its number above instead of the sandbox's.</li>
<li>Optional free backup: message <code>I allow callmebot to send me messages</code> to the CallMeBot number (see <code>callmebot.com</code>) and paste the key you get back.</li>
<li>Press <b>Save</b>, then <b>Send a test WhatsApp</b> and <b>Test call</b>.</li></ol></details></section>
<section><h3>Voice notes (OpenAI)</h3><div class="grid">${secret('openaiKey', s.secrets.openaiKey, 'OpenAI API key', 'sk-…')}${txt('voiceNotes.dailyLimit',c.voiceNotes.dailyLimit,'Daily transcription allowance (US$)','type="number" min="0" max="10" step="0.01"')}</div>${chk('voiceNotes.enabled',c.voiceNotes.enabled,'Send my WhatsApp voice notes to OpenAI for transcription')}<p class="muted">Ogg Opus voice notes up to five minutes. Each request reserves US$0.03 before upload, including uncertain failures; the provider may charge less. This also counts against the Core budget. Audio cannot approve requests. Audio is processed in memory, not saved by JARVIS.</p></section>
<section><h3>GitHub (your approved updates)</h3><div class="grid">${txt('github.repo', c.github?.repo, 'Repository (owner/name)')}${secret('githubToken', s.secrets.githubToken, 'GitHub key', 'github_pat_…')}</div><div class="row">${chk('github.pullRequests', c.github?.pullRequests !== false, 'Propose each approved self-update on GitHub')}<button type="button" data-test="github">Test GitHub</button><span class="msg" data-msg="github"></span></div><p class="muted">After you approve a self-update and JARVIS installs it, he uploads the same change to GitHub as a pull request (a proposed change). Nothing reaches the main code until you press <b>Merge</b> there; merging publishes the next version. JARVIS never writes to the main code himself, and his self-updates cannot change this or read the key.</p><details><summary>How to make the GitHub key (about 3 minutes)</summary><ol><li>On github.com: your picture → <b>Settings</b> → <b>Developer settings</b> → <b>Personal access tokens</b> → <b>Fine-grained tokens</b> → <b>Generate new token</b>.</li><li>Name it <b>JARVIS</b> and choose an expiry date. Under <b>Repository access</b>, choose <b>Only select repositories</b> and pick your JARVIS repository.</li><li>Under <b>Permissions → Repository permissions</b>, set <b>Contents</b> and <b>Pull requests</b> to <b>Read and write</b>. Leave everything else.</li><li>Press <b>Generate token</b>, copy it, paste it above and press <b>Save</b>. It is stored encrypted on this PC.</li></ol></details></section>
<section><h3>Routines</h3><div class="row">${chk('routines.weekly',c.routines.weekly,'Sunday review at 18:00')}${chk('routines.backup',c.routines.backup,'OneDrive settings backup at 02:00')}${chk('routines.releases',c.routines.releases,'Export each approved self-update')}</div>${txt('routines.zone',c.routines.zone,'Time zone for the weekly review and backup')}<p class="muted">Use an IANA time zone such as Europe/London. Open JARVIS Core → Routines for previews, saved backups, meeting drafts and travel. Backups catch up when JARVIS opens. Reconnect keys and passwords after restoring on another PC.</p></section>
<section><h3>Email (Gmail)</h3><div class="grid">${txt('email.address', em.address, 'Gmail address', 'placeholder="you@gmail.com"')}${secret('emailPassword', s.secrets.emailPassword, 'Gmail app password', '16 letters')}
  ${txt('email.labelPrefix', em.labelPrefix, 'Label folder in Gmail')}</div>
<div class="row">${chk('email.enabled', em.enabled, 'Read and sort my email')}${chk('email.draftReplies', em.draftReplies, 'Draft replies (saved in Gmail Drafts; never sent without my YES)')}<button type="button" data-test="email">Test connection</button><span class="msg" data-msg="email"></span></div>
<details><summary>How to make a Gmail app password</summary><ol><li>Google Account → Security → turn on 2-Step Verification.</li><li>Then Security → App passwords → create one called “JARVIS”.</li><li>Paste the 16 letters above. JARVIS labels mail under <code>${esc(em.labelPrefix)}/…</code>, saves drafts, and only ever sends after you approve.</li></ol></details></section>
<section><h3>Quiet hours and nights</h3><div class="grid"><label>Quiet from<input type="time" name="quiet.from" value="${esc(c.quiet.from)}"></label><label>Until<input type="time" name="quiet.to" value="${esc(c.quiet.to)}"></label></div>
<div class="row">${chk('quiet.on', c.quiet.on, 'No messages during quiet hours (wake-up calls and your own schedule still happen)')}${chk('keepAwake', c.keepAwake, 'Keep this PC awake overnight when calls or jobs are scheduled')}${chk('pcVoice', c.pcVoice, 'Speak on the PC too')}</div>
<p class="muted" style="margin:8px 0 0">The PC must be on (plugged in) for the night's work and the morning call. JARVIS stops Windows from sleeping while something is scheduled; closing the lid can still put it to sleep.</p></section>
<section><h3>Improving himself</h3><div class="grid"><label>Improvements to prepare per night<input type="number" name="selfImprove.maxPerNight" min="0" max="5" value="${esc(c.selfImprove.maxPerNight)}"></label>
  <label>After you approve an update${sel('selfImprove.autoRestart', c.selfImprove.autoRestart, [['idle', 'Restart when I am not using JARVIS'], ['never', 'Wait until I restart him']])}</label></div>
<div class="row">${chk('selfImprove.enabled', c.selfImprove.enabled, 'Review himself every night (the 03:00 line in the standing orders)')}</div>
<p class="muted" style="margin:8px 0 0">Running: <b>${esc(s.updates.label)}</b>. Every update is built in a copy, checked, and waits for your YES. A bad update rolls itself back; “Jarvis, undo the last update” goes back one.</p></section>
<section><h3>Standing orders</h3><p class="muted" style="margin:0 0 8px">What JARVIS does without you lives in <b>${esc(s.ordersFile)}</b>. Open JARVIS Core in the hall → Schedule to edit it, or edit it in Notepad.</p>
${s.schedule.jobs.map(j => `<div class="muted">• <b>${esc(j.label)}</b> — ${esc(j.text)}</div>`).join('')}</section>
<div class="row"><button class="jc-go primary" type="submit">Save</button><span class="msg" data-msg="save"></span></div>
</form></div>`;
    const form = $('[data-core-form]', content);
    form.addEventListener('submit', async e => {
      e.preventDefault(); const msg = $('[data-msg="save"]', content); msg.className = 'msg'; msg.textContent = 'Saving…';
      try { await save(form); msg.textContent = 'Saved.'; renderSettings(content); } catch (err) { msg.className = 'msg bad'; msg.textContent = err.message; }
    });
    content.querySelectorAll('[data-test]').forEach(b => b.addEventListener('click', async () => {
      const kind = b.dataset.test, out = $(`[data-msg="${kind === 'whatsapp' || kind === 'call' ? 'phone' : kind}"]`, content);
      out.className = 'msg'; out.textContent = 'Saving and testing…'; b.disabled = true;
      try { await save(form); out.textContent = await core('test', {kind}); } catch (err) { out.className = 'msg bad'; out.textContent = err.message; } finally { b.disabled = false; }
    }));
  }
  async function save(form) {
    const fd = new FormData(form); const patch = {};
    const set = (k, v) => { const parts = k.split('.'); let o = patch; while (parts.length > 1) { const x = parts.shift(); o = o[x] = o[x] || {}; } o[parts[0]] = v; };
    for (const el of form.querySelectorAll('input,select')) {
      if (!el.name || el.name.startsWith('secret:') || el.name === 'claudeKey') continue;
      if (el.type === 'checkbox') set(el.name, el.checked); else if (el.type === 'number') set(el.name, Number(el.value)); else set(el.name, el.value.trim());
    }
    for (const [k, v] of fd) if (k.startsWith('secret:') && String(v).trim()) await core('secret', {name: k.slice(7), value: String(v).trim()});
    const key = String(fd.get('claudeKey') || '').trim(); if (key) await J.call('tower-key', key);
    await core('save', patch);
  }
  // add the tab to the settings window's list
  function inject() {
    const nav = $('.settings-shell nav'); if (!nav || nav.querySelector(`[data-tab="${TAB}"]`)) return;
    const b = document.createElement('button'); b.dataset.tab = TAB; b.textContent = TAB;
    b.addEventListener('click', () => {
      document.querySelectorAll('.settings-shell nav [data-tab]').forEach(x => x.classList.toggle('active', x === b));
      const content = $('.settings-shell .settings-content'); if (content) renderSettings(content);
    });
    nav.insertBefore(b, nav.children[1] || null);
    if (location.hash === '#core') b.click();
  }
  new MutationObserver(inject).observe(document.body, {childList: true, subtree: true});
  setTimeout(inject, 300);
/** Where an installed self-update stands on GitHub: proposed (open it), failed (try again), or not sent yet. */
function ghLine(s, v) {
  const g = s.github?.items?.[v.id]; if (!s.github?.ready && !g) return '';
  if (g?.status === 'proposed') return ` · on GitHub as pull request #${esc(g.number)} (merging publishes ${esc(g.version)}) <button data-act="github-open" data-v="${esc(v.id)}">Open</button>`;
  if (g?.status === 'uploading') return ' · uploading to GitHub…';
  if (g?.status === 'skipped') return ` · ${esc(g.message)}`;
  if (g?.status === 'failed') return `<div class="jc-muted">GitHub: ⚠ ${esc(g.error)} <button data-act="github-propose" data-v="${esc(v.id)}">Try again</button></div>`;
  return v.superseded || v.bad || v.undone ? '' : ` <button data-act="github-propose" data-v="${esc(v.id)}">Propose on GitHub</button>`;
}
})();
