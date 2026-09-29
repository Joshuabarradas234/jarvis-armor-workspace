/*
 * JARVIS v9.9 — the Tower: a building of agent floors in each hall.
 * Stark Tower (Armor Hall), Wayne Enterprises (Batcave), The Daily Bugle (Web Lab).
 * Each floor is a team: a lead who plans, specialists who do the work, a reviewer who signs it off.
 */
import {briefFields,resultsHtml} from './work-tools.js';
(() => {
  'use strict';
  const J = window.jarvis; if (!J) return;
  if ((new URLSearchParams(location.search).get('view') || 'main') !== 'main') return;
  const call = (m, p) => J.call(m, p);
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hall = () => document.body.dataset.theme || 'ironman';
  const ACCENT = { ironman: '#7fd6e8', batcave: '#f5c542', spiderman: '#ff4d4d' };
  const accent = () => ACCENT[hall()] || '#7fd6e8';
  const toast = msg => { const t = document.createElement('div'); t.className = 'hx-toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.classList.add('out'), 3600); setTimeout(() => t.remove(), 4200); };
  const initials = n => String(n || '?').replace(/[^A-Za-z. ]/g, '').split(/[\s.]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const hue = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const since = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor(s / 60) % 60}m`; };
  const STATUS = { restarted:'Continued in a new run',needs_brief:'Needs your brief', needs_changes:'Needs correction', queued: 'Queued', planning: 'Planning', working: 'Working', reviewing: 'Sign-off', done: 'Done', failed: 'Problem', stopped: 'Stopped', budget: 'Budget cap' };
  const money = v => '$' + (Number(v) || 0).toFixed(2);
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* ---------- a small, safe Markdown renderer for results */
  function md(src) {
    const lines = String(src || '').replace(/\r/g, '').split('\n'); let html = '', list = null, code = false, table = [];
    const inline = t => esc(t).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>').replace(/_([^_\n]+)_/g, '<i>$1</i>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" data-ext>$1</a>').replace(/(^|\s)(https?:\/\/[^\s<]+)/g, '$1<a href="$2" data-ext>$2</a>');
    const flushList = () => { if (list) { html += `</${list}>`; list = null; } };
    const flushTable = () => { if (table.length) { const rows = table.filter(r => !/^\s*\|?\s*:?-{2,}/.test(r)); html += '<table>' + rows.map((r, i) => '<tr>' + r.replace(/^\||\|$/g, '').split('|').map(c => `<${i ? 'td' : 'th'}>${inline(c.trim())}</${i ? 'td' : 'th'}>`).join('') + '</tr>').join('') + '</table>'; table = []; } };
    for (const l of lines) {
      if (/^```/.test(l)) { flushList(); flushTable(); html += code ? '</pre>' : '<pre>'; code = !code; continue; }
      if (code) { html += esc(l) + '\n'; continue; }
      if (/^\s*\|.*\|\s*$/.test(l)) { flushList(); table.push(l.trim()); continue; } else flushTable();
      let m;
      if ((m = /^(#{1,4})\s+(.*)$/.exec(l))) { flushList(); html += `<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`; continue; }
      if ((m = /^\s*[-*]\s+(.*)$/.exec(l))) { if (list !== 'ul') { flushList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(l))) { if (list !== 'ol') { flushList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; continue; }
      if (/^>\s?/.test(l)) { flushList(); html += `<blockquote>${inline(l.replace(/^>\s?/, ''))}</blockquote>`; continue; }
      if (/^-{3,}\s*$/.test(l)) { flushList(); html += '<hr>'; continue; }
      if (!l.trim()) { flushList(); continue; }
      flushList(); html += `<p>${inline(l)}</p>`;
    }
    flushList(); flushTable(); if (code) html += '</pre>';
    return html;
  }

  const ICON_TOWER = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3"/><path d="M8.5 21V7.5L12 5l3.5 2.5V21"/><path d="M5 21V12l3.5-1.5M19 21v-9l-3.5-1.5"/><path d="M10.5 10h3M10.5 13h3M10.5 16h3" opacity=".75"/><path d="M3 21h18"/></svg>`;
  const ICON_GLOBE = `<svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.5 3.9 5.5 3.9 9s-1.3 6.5-3.9 9c-2.6-2.5-3.9-5.5-3.9-9S9.4 5.5 12 3z"/></svg>`;

  const T = {
    open: false, el: null, view: null, floorId: null, tab: 'work', runs: new Map(), engines: null, openRun: null, clock: 0,
    async showRun(theme,runId){
      const v=await call('tower-get',{theme}),r=v.runs.find(r=>r.id===runId);
      if(!r)throw Error('That result is no longer available in the recent runs. Open its folder from the Tower.');
      if(hall()!==theme)await call('action',{action:'theme',id:theme,fast:true});
      await this.show();this.view=v;for(const row of v.runs)this.runs.set(row.id,row);
      this.floorId=r.floorId;this.openRun=r.id;this.tab='work';this.renderBuilding();this.renderFloor();
    },
    async show() {
      if (this.open) return this.refresh(); this.open = true;
      window.__jarvisHolo?.pauseAll(true);
      this.el = document.createElement('section'); this.el.className = 'tw'; this.el.style.setProperty('--ix', accent());
      document.body.appendChild(this.el); requestAnimationFrame(() => this.el.classList.add('in'));
      this.el.addEventListener('click', e => this.click(e));
      this.el.addEventListener('dragover', e => { if (e.target.closest('.tw-drop')) { e.preventDefault(); e.target.closest('.tw-drop').classList.add('over'); } });
      this.el.addEventListener('dragleave', e => e.target.closest('.tw-drop')?.classList.remove('over'));
      this.el.addEventListener('drop', e => { const z = e.target.closest('.tw-drop'); if (!z) return; e.preventDefault(); z.classList.remove('over'); const paths = [...e.dataTransfer.files].map(f => J.pathFor?.(f)).filter(Boolean); if (paths.length) this.addKnowledge(paths); });
      this.el.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.tw-lobby input')) { e.preventDefault(); this.lobby(); } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.matches('.tw-task')) { e.preventDefault(); this.run(); } });
      clearInterval(this.clock); this.clock = setInterval(() => this.tick(), 1000);
      await this.refresh(true);
      call('tower-engines').then(e => { this.engines = e; this.renderHeader(); }).catch(() => {});
    },
    close() {
      if (!this.open) return; this.open = false; clearInterval(this.clock); this.closeAll(); this.floorView?.dispose(); this.floorView = null; this.inside = false; this.mount3d?.dispose(); this.mount3d = null; this.mountKey = null;
      const el = this.el; this.el = null; el.classList.remove('in'); setTimeout(() => el.remove(), 260);
      window.__jarvisHolo?.pauseAll(false);
    },
    async refresh(first) {
      try { this.view = await call('tower-get'); } catch (e) { toast(e.message); return; }
      for (const r of this.view.runs) if (!this.runs.has(r.id) || !this.view.active.includes(r.id)) this.runs.set(r.id, r);
      if (!this.floorId || !this.view.floors.some(f => f.id === this.floorId)) this.floorId = this.view.floors[0]?.id || null;
      if (first) this.layout(); else { this.renderBuilding(); this.renderFloor(); this.renderHeader(); }
    },
    floor() { return this.view?.floors.find(f => f.id === this.floorId) || null; },
    runsFor(fid) { return [...this.runs.values()].filter(r => r.floorId === fid && r.theme === this.view.theme).sort((a, b) => b.startedAt - a.startedAt); },
    liveRun(fid) { return this.runsFor(fid).find(r => ['queued', 'planning', 'working', 'reviewing'].includes(r.status)); },
    layout() {
      this.el.innerHTML = `<header class="tw-top"></header>
        <div class="tw-main"><aside class="tw-building"></aside><section class="tw-floor"></section></div>
        <div class="tw-modal" hidden></div>`;
      this.renderHeader(); this.renderBuilding(); this.renderFloor();
    },
    engineLabel() {
      const e = this.engines; if (!e) return '<span class="tw-eng">Checking engines…</span>';
      const on = [e.claudeCode?.ready && 'Claude Code', e.api?.ready && 'Claude API'].filter(Boolean);
      return on.length ? `<span class="tw-eng ok">● ${on.join(' + ')}</span>` : `<span class="tw-eng warn">● Rehearsal mode — connect Claude</span>`;
    },
    renderHeader() {
      const h = this.el && $('.tw-top', this.el); if (!h || !this.view) return;
      const v = this.view;
      h.innerHTML = `<div><p>THE TOWER · ${esc(v.name.toUpperCase())}</p><h2>${esc(v.head?.name || '')} <small>${esc(v.head?.title || '')}</small></h2></div>
        <div class="tw-top-r">${this.engineLabel()}<button type="button" data-tw="all">🏙 All towers</button><button type="button" data-tw="engines">⚙ Engines</button><button type="button" data-tw="report">📣 Report</button><button type="button" class="tw-x" data-tw="close" title="Close (Esc)">×</button></div>`;
    },
    /* the building: your tower (3D model, picture, or the stand-in) with a line from every floor to its status */
    async renderBuilding() {
      const b = this.el && $('.tw-building', this.el); if (!b || !this.view) return;
      const v = this.view;
      const key = `${v.theme}|${v.model?.url || v.model?.kind || 'stand-in'}|${(v.model?.band || []).join()}`;
      if ((!b.querySelector('.tw-3d') || this.mountKey !== key) && !this.mounting) {
        this.mounting = true; this.mount3d?.dispose(); this.mount3d = null; this.mountKey = key; this.floorView?.dispose(); this.floorView = null; this.inside = false;
        b.innerHTML = `<div class="tw-bld-head"><b>${esc(v.name)}</b><small>${v.model?.kind === 'glb' ? '3D model · drag to turn' : v.model?.kind === 'image' ? 'Your picture' : 'Stand-in tower · add your own in ⚙ Engines'}</small></div>
          <div class="tw-3d"></div>
          <div class="tw-bld-foot"><button type="button" class="tw-add" data-tw="add-floor">+ Add a floor</button>
          <div class="tw-lobby"><p>LOBBY · ${esc(v.head?.name || 'Director')} sends it to the right floor</p><div><input placeholder="Hand a task to the building…" maxlength="4000"><button type="button" data-tw="lobby">Send ↵</button></div></div></div>`;
        try {
          const { mountTower } = await import('./tower3d.js');
          if (!this.open || !b.isConnected) { this.mounting = false; if (this.open) this.renderBuilding(); return; } this.mount3d = mountTower(b.querySelector('.tw-3d'), { theme: v.theme, accent: accent(), model: v.model, onPick: id => { this.floorId = id; this.openRun = null; this.renderFloor(); this.enter(); } });
        } catch (e) { b.querySelector('.tw-3d').innerHTML = `<p class="tw-err">The 3D view could not start: ${esc(e.message)}</p>`; }
        this.mounting = false;
      }
      this.mount3d?.update(v.floors, new Map([...this.runs].filter(([, r]) => r.theme === v.theme)));
      b.querySelectorAll('.t3-tag').forEach(t => t.classList.toggle('on', t.dataset.floor === this.floorId));
      b.dataset.sel = this.floorId || '';
      this.renderInside();
    },
    /* ---------- inside a floor: the camera goes in and you see the team at their desks */
    async enter() {
      const b = this.el && $('.tw-building', this.el); if (!b || !this.floor()) return;
      if (this.inside) { this.renderInside(); return; }
      this.inside = true;
      const t3 = b.querySelector('.tw-3d'); const a = this.mount3d?.anchorOf?.(this.floorId);
      if (t3 && a) { t3.style.transformOrigin = `${a.x}px ${a.y}px`; t3.classList.add('tw-diving'); await new Promise(r => setTimeout(r, 560)); }
      await this.renderInside();
    },
    leave() {
      this.inside = false; const b = this.el && $('.tw-building', this.el); if (!b) return;
      const box = b.querySelector('.tw-floor3d'); this.floorView?.dispose(); this.floorView = null; box?.remove();
      const t3 = b.querySelector('.tw-3d'); if (t3) { t3.hidden = false; t3.classList.add('tw-surfacing'); t3.classList.remove('tw-diving'); requestAnimationFrame(() => requestAnimationFrame(() => t3.classList.remove('tw-surfacing'))); }
      this.mount3d?.pause?.(false);
      b.classList.remove('tw-in');
    },
    async renderInside() {
      const b = this.el && $('.tw-building', this.el); if (!b) return;
      const f = this.floor();
      if (!this.inside || !f) { if (this.floorView) this.leave(); return; }
      let box = b.querySelector('.tw-floor3d');
      if (!box || !this.floorView) {
        if (this.floorMounting) return; this.floorMounting = true;
        box?.remove(); box = document.createElement('div'); box.className = 'tw-floor3d fl-enter'; const t3 = b.querySelector('.tw-3d'); (t3 || b).insertAdjacentElement(t3 ? 'afterend' : 'beforeend', box);
        try {
          const { mountFloor } = await import('./floor3d.js'); if (!this.open || !box.isConnected) { this.floorMounting = false; return; }   // closed while loading: don't leave a live 3D view behind
          this.floorView = mountFloor(box, { theme: this.view.theme, accent: accent(), onExit: () => this.leave(),
            onPick: (agent, st) => {
              const run = this.liveRun(this.floorId) || this.runsFor(this.floorId)[0];
              if (!run) { toast(`${agent.name} is free. Give the floor a task and they'll get to work.`); this.tab = 'team'; this.renderFloor(); return; }
              const who = agent.role === 'lead' ? 'lead' : agent.role === 'reviewer' ? 'reviewer' : st?.step;
              if (!who) { toast(`${agent.name} isn't on this job.`); return; }
              this.openRun = run.id; this.deskCam(run.id, who);
            } });
        } catch (e) { box.innerHTML = `<p class="tw-err">The floor view could not start: ${esc(e.message)}</p>`; }
        this.floorMounting = false;
        requestAnimationFrame(() => box.classList.remove('fl-enter'));
        const t3d = b.querySelector('.tw-3d'); if (t3d) t3d.hidden = true; this.mount3d?.pause?.(true); b.classList.add('tw-in');
      }
      const run = (this.openRun && this.runs.get(this.openRun)?.floorId === f.id ? this.runs.get(this.openRun) : null) || this.liveRun(f.id) || this.runsFor(f.id)[0] || null;
      this.floorView?.update({ floor: f, run, runs: this.runsFor(f.id), tab: this.tab });
    },
    /* all three towers side by side, every floor's line and status in one view */
    async allTowers() {
      const m = $('.tw-modal', this.el); m.hidden = false; this.closeAll();
      m.innerHTML = `<div class="tw-all"><header><b>ALL TOWERS</b><span>Every floor, every hall, live</span><i></i><button type="button" data-tw="modal-close">×</button></header><div class="tw-all-row"></div></div>`;
      const row = m.querySelector('.tw-all-row'); const tok = this.deskTok; const { mountTower } = await import('./tower3d.js');
      this.allMounts = []; this.mount3d?.pause?.(true);   // the big tower behind rests while all three are up
      const views = await Promise.all(['ironman', 'batcave', 'spiderman'].map(th => call('tower-get', { theme: th }).then(v => [th, v]).catch(() => [th, null])));
      if (tok !== this.deskTok || !this.open || m.hidden) return; for (const [th, v] of views) {
        if (!v) continue;
        for (const r of v.runs) if (!this.runs.has(r.id) || !this.view?.active?.includes(r.id)) this.runs.set(r.id, r);
        const col = document.createElement('section'); col.className = 'tw-all-col'; col.style.setProperty('--ix', ({ ironman: '#7fd6e8', batcave: '#f5c542', spiderman: '#ff4d4d' })[th]);
        col.innerHTML = `<h4>${esc(v.name)}</h4><small>${esc(v.head?.name || '')}</small><div class="tw-3d"></div>`; row.appendChild(col);
        const mt = mountTower(col.querySelector('.tw-3d'), { theme: th, accent: ({ ironman: '#7fd6e8', batcave: '#f5c542', spiderman: '#ff4d4d' })[th], model: v.model, compact: true,
          onPick: async id => { if (th !== hall()) { await call('action', { action: 'theme', id: th, fast: true }).catch(() => {}); await new Promise(r => setTimeout(r, 700)); } this.closeAll(); m.hidden = true; await this.refresh(); this.floorId = id; this.tab = 'work'; this.renderBuilding(); this.renderFloor(); } });
        mt.theme = th; mt.floors = v.floors; mt.update(v.floors, new Map([...this.runs].filter(([, r]) => r.theme === th)));
        this.allMounts.push(mt);
      }
    },
    closeAll() { this.deskTok = (this.deskTok || 0) + 1; clearInterval(this.deskTimer); for (const mt of this.allMounts || []) mt.dispose(); this.allMounts = []; this.mount3d?.pause?.(false); },
    renderFloor() {
      const box = this.el && $('.tw-floor', this.el); if (!box) return;
      const f = this.floor(); if (!f) { box.innerHTML = '<p class="tw-empty">No floors yet. Add one on the left.</p>'; return; }
      const lead = f.agents.find(a => a.role === 'lead');
      const spent = this.view.spent?.[f.id] || 0, pct = clamp(spent / f.budget.perDay * 100, 0, 100);
      const next = f.handoff && this.view.floors.find(x => x.id === f.handoff);
      box.innerHTML = `<header class="tw-fh"><div><p>FLOOR ${f.number} · ${esc(f.name.toUpperCase())}</p><h3>${esc(f.name)}</h3><small>Led by ${esc(lead?.name || '—')} · ${f.agents.length} agents · ${esc(f.skills.join(' · '))}</small>
          <div class="tw-chips">${next ? `<span>↑ Hands up to ${esc(next.name)}</span>` : ''}${f.schedule.on ? `<span>🌙 Night shift ${esc(f.schedule.time)} · ${f.schedule.days.map(d => DAYS[d]).join(' ')}</span>` : ''}${f.ideaId ? `<span>💡 Linked to an idea</span>` : ''}</div></div>
        <div class="tw-fh-r"><div class="tw-budget" title="Estimated spend today, and the cap per run"><p>BUDGET TODAY <b>${money(spent)}</b> / ${money(f.budget.perDay)}</p><div class="tw-bar"><i style="width:${pct}%"></i></div><small>Per run cap ${money(f.budget.perRun)}</small></div>
          <button type="button" data-tw="folder" title="${esc(f.folder)}">📁 Floor folder</button></div></header>
        <nav class="tw-tabs">${[['work', 'Work'], ['team', 'Team'], ['brief', 'Brief & training'], ['history', 'History'], ['results', 'Results & workflows']].map(([k, n]) => `<button type="button" data-tab="${k}" class="${this.tab === k ? 'on' : ''}">${n}</button>`).join('')}</nav>
        <div class="tw-pane"></div>`;
      this.renderPane();
    },
    renderPane() {
      const pane = this.el && $('.tw-pane', this.el); const f = this.floor(); if (!pane || !f) return;
      if (this.tab === 'work') {
        const live = this.liveRun(f.id); const show = (this.openRun && this.runs.get(this.openRun)?.floorId === f.id ? this.runs.get(this.openRun) : null) || live || this.runsFor(f.id)[0];
        pane.innerHTML = `${live ? '' : `<div class="tw-ask"><textarea class="tw-task" rows="3" maxlength="4000" placeholder="Give ${esc(f.name)} a task…  (Ctrl+Enter to run)" data-resume="${['needs_brief','needs_changes'].includes(show?.status)?esc(show.id):''}">${['needs_brief','needs_changes'].includes(show?.status)?esc(show.task):''}</textarea>
          ${briefFields(f,this.view.workflows||[],show)}<div class="tw-ask-row">${f.example ? `<button type="button" class="tw-chip" data-tw="example" title="${esc(f.example)}">Try the example: ${esc(f.example.slice(0, 70))}…</button>` : '<span></span>'}
            <select class="tw-idea" title="Move an idea card along when this finishes"><option value="">💡 No linked idea</option>${(this.view.ideas || []).map(i => `<option value="${esc(i.id)}" ${f.ideaId === i.id ? 'selected' : ''}>💡 ${esc(i.title.slice(0, 40))} · ${i.progress}%</option>`).join('')}</select>
            <button type="button" class="tw-go" data-tw="run">▶ Run floor</button></div></div>`}
          <div class="tw-run">${show ? this.runHtml(show) : '<p class="tw-empty">Nothing run yet on this floor. Give it a task above, or try the example.</p>'}</div>`;
      } else if (this.tab === 'results') {pane.innerHTML=resultsHtml(this.view,f.id);
      } else if (this.tab === 'team') {
        pane.innerHTML = `<div class="tw-team">${f.agents.map((a, i) => `<article class="tw-agent" data-i="${i}" style="--ah:${hue(a.name)}">
            <div class="tw-av">${esc(initials(a.name))}</div>
            <div class="tw-ag-f"><div class="tw-row"><input name="name" value="${esc(a.name)}" maxlength="40" placeholder="Name"><input name="title" value="${esc(a.title)}" maxlength="60" placeholder="Job title">
              <select name="role">${['lead', 'specialist', 'reviewer'].map(r => `<option value="${r}" ${a.role === r ? 'selected' : ''}>${r === 'lead' ? 'Lead (plans)' : r === 'reviewer' ? 'Reviewer (signs off)' : 'Specialist'}</option>`).join('')}</select>
              <select name="engine">${[['auto', 'Engine: auto'], ['claude-code', 'Claude Code'], ['api', 'Claude API'], ['rehearsal', 'Rehearsal']].map(([k, n]) => `<option value="${k}" ${a.engine === k ? 'selected' : ''}>${n}</option>`).join('')}</select>
              <label class="tw-tog"><input type="checkbox" name="web" ${a.web ? 'checked' : ''}> Web</label><span class="tw-rank">${esc(a.rank)} · ${a.xp} XP</span><button type="button" class="tw-del" data-tw="del-agent" title="Remove">×</button></div>
              <textarea name="prompt" rows="3" maxlength="4000" placeholder="How this agent works, what it produces, its standards…">${esc(a.prompt)}</textarea></div></article>`).join('')}</div>
          <div class="tw-save-row"><button type="button" data-tw="add-agent">+ Add agent</button><span></span><button type="button" class="tw-go" data-tw="save-team">Save team</button></div>`;
      } else if (this.tab === 'brief') {
        pane.innerHTML = `<div class="tw-brief">
          <label>FLOOR <input name="number" type="number" min="1" max="200" value="${f.number}"> NAME <input name="name" value="${esc(f.name)}" maxlength="60"></label>
          <label class="tw-col">BRIEF — what this floor is for, what it produces, the standard you expect <button type="button" data-tw="upload-brief">⤒ Upload a brief (.md / .txt)</button></label>
          <textarea name="purpose" rows="6" maxlength="6000">${esc(f.purpose)}</textarea><h6>DEFAULT TASK BRIEF · used for scheduled and voice tasks</h6>${briefFields(f,[],null)}
          <label class="tw-col">SKILLS (comma separated)</label><input name="skills" value="${esc(f.skills.join(', '))}">
          <div class="tw-row"><label class="tw-tog"><input type="checkbox" name="web" ${f.tools.web ? 'checked' : ''}> Can search the web</label>
            <label>ENGINE <select name="engine">${[['auto', 'Auto (both)'], ['claude-code', 'Claude Code'], ['api', 'Claude API'], ['rehearsal', 'Rehearsal only']].map(([k, n]) => `<option value="${k}" ${f.engine === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
            <label class="tw-grow">EXAMPLE TASK <input name="example" value="${esc(f.example || '')}" maxlength="1000"></label></div>
          <div class="tw-grid3">
            <section><h6>ASSEMBLY LINE</h6><label>When done, hand the result up to <select name="handoff"><option value="">— nobody, it's finished —</option>${this.view.floors.filter(x => x.id !== f.id).map(x => `<option value="${esc(x.id)}" ${f.handoff === x.id ? 'selected' : ''}>${x.number} · ${esc(x.name)}</option>`).join('')}</select></label>
              <label>Linked idea <select name="ideaId"><option value="">— none —</option>${(this.view.ideas || []).map(i => `<option value="${esc(i.id)}" ${f.ideaId === i.id ? 'selected' : ''}>${esc(i.title.slice(0, 50))}</option>`).join('')}</select></label></section>
            <section><h6>NIGHT SHIFT</h6><label class="tw-tog"><input type="checkbox" name="sch-on" ${f.schedule.on ? 'checked' : ''}> Run on a schedule at <input name="sch-time" type="time" value="${esc(f.schedule.time)}"></label>
              <div class="tw-days">${DAYS.map((d, i) => `<label><input type="checkbox" name="sch-d" value="${i}" ${f.schedule.days.includes(i) ? 'checked' : ''}>${d}</label>`).join('')}</div>
              <textarea name="sch-task" rows="2" maxlength="2000" placeholder="The task it runs each time (the example task is used if empty)">${esc(f.schedule.task)}</textarea></section>
            <section><h6>BUDGET (estimated, USD)</h6><label>Cap per run <input name="b-run" type="number" min="0.05" max="100" step="0.05" value="${f.budget.perRun}"></label><label>Cap per day <input name="b-day" type="number" min="0.1" max="500" step="0.1" value="${f.budget.perDay}"></label>
              <p class="tw-hint">A run stops when it reaches its cap. Agents never send, post or pay for anything: those come to you as approvals.</p></section>
          </div>
          <label class="tw-col">KNOWLEDGE — files the team reads before working (brand guides, your CV, past work, notes)</label>
          <div class="tw-drop"><ul>${f.knowledge.length ? f.knowledge.map(k => `<li><span>📄 ${esc(k.name)}</span><small>${Math.max(1, Math.round(k.size / 1024))} KB</small><button type="button" data-kn="${esc(k.name)}" title="Remove">×</button></li>`).join('') : '<li class="tw-empty">Drop files here, or add them with the button.</li>'}</ul><button type="button" data-tw="add-knowledge">+ Add files</button></div>
          <label class="tw-col">LESSONS LEARNED — added from your 👍/👎 and the reviewer's notes; the team follows these</label>
          <textarea name="lessons" rows="5" maxlength="6000" placeholder="Nothing yet. Review a run to start training this floor.">${esc(f.lessons)}</textarea>
          <div class="tw-save-row"><button type="button" class="tw-del-floor" data-tw="del-floor">Delete floor</button><span></span><button type="button" class="tw-go" data-tw="save-brief">Save</button></div></div>`;
      } else {
        const list = this.runsFor(f.id);
        pane.innerHTML = list.length ? `<ul class="tw-hist">${list.map(r => `<li data-run="${esc(r.id)}"><b class="st-${r.status}">${STATUS[r.status] || r.status}</b><span>${esc(r.title)}</span><small>${new Date(r.startedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${r.endedAt ? ' · ' + since(r.endedAt - r.startedAt) : ''}${r.rehearsal ? ' · rehearsal' : ''}</small><em>${r.feedback ? (r.feedback.good ? '👍' : '👎') : ''}</em></li>`).join('')}</ul>` : '<p class="tw-empty">No runs yet.</p>';
      }
    },
    runHtml(r) {
      const f = this.floor(); const byId = id => f?.agents.find(a => a.id === id);
      const lead = f?.agents.find(a => a.role === 'lead'), rev = f?.agents.find(a => a.role === 'reviewer');
      const row = (a, title, status, extra = '', who = '') => `<div class="tw-step st-${status}" data-desk="${esc(who)}" data-run="${esc(r.id)}" title="Desk cam: see what ${esc(a?.name || '')} is doing" style="--ah:${hue(a?.name || '')}">
        <div class="tw-av ${status === 'working' || status === 'planning' || status === 'reviewing' ? 'busy' : ''}">${esc(initials(a?.name))}</div>
        <div class="tw-st-m"><b>${esc(a?.name || '')}</b> <small>${esc(a?.title || '')}${a?.rank ? ' · ' + esc(a.rank) : ''}</small><p>${esc(title)}</p>${extra}</div>
        <em>${STATUS[status] || status}</em></div>`;
      const planStatus = r.phase === 'planning' ? 'planning' : ['failed', 'stopped'].includes(r.status) && !r.steps.length ? r.status : 'done';
      const revStatus = r.status === 'needs_changes' ? 'needs_changes' : r.status === 'done' ? 'done' : r.phase === 'reviewing' ? 'reviewing' : ['failed', 'stopped'].includes(r.status) ? r.status : 'queued';
      return `<div class="tw-rh"><div><p>${esc(STATUS[r.status] || r.status).toUpperCase()}${r.rehearsal ? ' · REHEARSAL' : ''}</p><h4>${esc(r.title)}</h4></div>
          <div class="tw-rh-r"><span class="tw-cost" title="Estimated spend for this run">${money(r.cost)}</span><span class="tw-clock" data-start="${r.startedAt}" data-end="${r.endedAt || ''}">${since((r.endedAt || Date.now()) - r.startedAt)}</span>${this.view.active.includes(r.id) || ['planning', 'working', 'reviewing'].includes(r.status) ? `<button type="button" data-tw="stop" data-run="${esc(r.id)}">■ Stop</button>` : ''}<button type="button" data-tw="run-folder" data-path="${esc(r.folder)}">📁</button></div></div>
        <div class="tw-bar"><i style="width:${r.progress || 0}%"></i></div>
        ${r.from ? `<p class="tw-link">↓ Picked up from <a href="#" data-goto="${esc(r.from.runId)}">${esc(r.from.floorName)}</a></p>` : ''}${r.scheduled ? '<p class="tw-link">🌙 Night shift run</p>' : ''}
        ${r.error ? `<p class="tw-err">⚠ ${esc(r.error)}</p>` : ''}${r.note ? `<p class="tw-err">${esc(r.note)}</p>` : ''}
${r.questions?.length?`<div class="tw-err"><b>Before work starts</b><ul>${r.questions.map(q=>`<li>${esc(q)}</li>`).join('')}</ul></div>`:''}${['needs_brief','needs_changes'].includes(r.status)?`<button data-tw="revise" data-run="${esc(r.id)}">Revise this brief</button>`:''}<div class="tw-steps">
          ${row(lead, 'Plans the work and briefs the team', planStatus, '', 'lead')}
          ${r.steps.map(s => row(byId(s.agent) || { name: s.agentName }, s.title, s.status, s.live && s.status === 'working' ? `<code>${esc(s.live)}</code>` : s.error ? `<code class="bad">${esc(s.error)}</code>` : '', s.id)).join('')}
          ${row(rev, 'Checks everything, fixes it, and signs it off', revStatus, r.notes ? `<blockquote>“${esc(r.notes)}”</blockquote>` : '', 'reviewer')}
        </div>
        ${r.handedTo ? `<p class="tw-link">↑ Handed up to <a href="#" data-goto="${esc(r.handedTo.runId)}">${esc(r.handedTo.floorName)}</a> — the assembly line carries on there.</p>` : ''}
        ${(r.approvals || []).length ? `<div class="tw-appr"><h5>NEEDS YOUR APPROVAL</h5>${r.approvals.map(a => `<div class="tw-ap st-${a.status}"><span>${a.type === 'email' ? '✉' : a.type === 'post' ? '📣' : '£'}</span><div><b>${a.type === 'email' ? 'Email to ' + esc(a.to) : a.type === 'post' ? 'Post on ' + esc(a.to) : 'Spend: ' + esc(a.to)}</b><small>${esc(a.title)}</small></div>
          ${a.status === 'waiting' ? `<button type="button" class="tw-go" data-tw="approve" data-run="${esc(r.id)}" data-i="${a.i}">${a.type === 'email' ? 'Approve · open draft' : a.type === 'post' ? 'Approve · copy & open' : 'Approve'}</button><button type="button" data-tw="decline" data-run="${esc(r.id)}" data-i="${a.i}">Decline</button>` : `<em>${a.status === 'approved' ? '✓ Approved' : 'Declined'}</em>`}</div>`).join('')}</div>` : ''}
        ${r.final ? `<div class="tw-final">${r.feedback?.good&&!r.rehearsal?`<button data-tw="workflow" data-run="${esc(r.id)}">Save accepted workflow</button>`:''}<button type="button" class="tw-go" data-tw="read" data-path="${esc(r.final)}">📄 Read the final piece</button><button type="button" data-tw="openfile" data-path="${esc(r.final)}">Open file</button>
          <div class="tw-fb">${r.rehearsal?'Rehearsal — excluded from learning and results.':r.feedback ? `<span>You rated this ${r.feedback.good ? '👍' : '👎'}${r.feedback.comment ? ': “' + esc(r.feedback.comment) + '”' : ''}</span>` : `<input class="tw-fb-c" maxlength="400" placeholder="What should they keep or change next time?"><button type="button" data-tw="good" data-run="${esc(r.id)}" title="Good — keep this standard">Accept result</button><button type="button" data-tw="bad" data-run="${esc(r.id)}" title="Not good — add this as a lesson">Needs rework</button>`}</div></div>` : ''}`;
    },
    tick() {
      if (!this.el) return;
      for (const c of this.el.querySelectorAll('.tw-clock')) { const s = Number(c.dataset.start), e = Number(c.dataset.end) || Date.now(); c.textContent = since(e - s); }
    },
    onRun(run) {
      if (!run) return; this.runs.set(run.id, run);
      if (this.view) { const live = ['queued', 'planning', 'working', 'reviewing'].includes(run.status); this.view.active = this.view.active.filter(x => x !== run.id); if (live) this.view.active.push(run.id); }
      Mini.update();
      for (const mt of this.allMounts || []) if (mt.theme === run.theme) mt.update(mt.floors, new Map([...this.runs].filter(([, r]) => r.theme === run.theme)));
      if (!this.open || !this.view || run.theme !== this.view.theme) return;
      this.renderBuilding();
      if (run.floorId === this.floorId && this.tab === 'work') {
        const typing = !!document.activeElement?.closest?.('.tw-ask,.tw-fb');
        if (!typing) this.renderPane(); else { const box = $('.tw-run', this.el); if (box) box.innerHTML = this.runHtml(run); }
      }
    },
    async run() {
      const f = this.floor(); const ta = $('.tw-task', this.el); const task = ta?.value.trim();
      if (!task) { ta?.focus(); toast('Type a task for the floor first.'); return; }
      const ideaId = $('.tw-idea', this.el)?.value || '';
      const brief=Object.fromEntries([...this.el.querySelectorAll('[data-brief]')].map(el=>[el.dataset.brief,el.type==='number'?Number(el.value):el.value.trim()]));
      const workflowId=this.el.querySelector('[data-workflow]')?.value||'';
      try { const r = await call('tower-run', { floorId: f.id, task, ideaId,brief,workflowId,resumeId:ta.dataset.resume||'' }); this.openRun = r.id; this.onRun(r); this.renderPane(); }
      catch (e) { toast(e.message || String(e)); }
    },
    async lobby() {
      const inp = $('.tw-lobby input', this.el); const text = inp?.value.trim(); if (!text) { inp?.focus(); return; }
      inp.value = ''; inp.placeholder = 'Routing…';
      try { const x = await call('tower-lobby', text); toast(x.reason); this.floorId = x.floorId; this.tab = 'work'; this.openRun = x.run.id; this.onRun(x.run); this.renderBuilding(); this.renderFloor(); }
      catch (e) { toast(e.message || String(e)); }
      inp.placeholder = 'Hand a task to the building…';
    },
    async addKnowledge(paths) {
      try { const list = await call('tower-knowledge-add', { floorId: this.floorId, paths }); if (list) { this.floor().knowledge = list; this.renderPane(); toast('Added to the floor\'s knowledge.'); } }
      catch (e) { toast(e.message || String(e)); }
    },
    collectTeam() {
      const f = this.floor();
      return [...this.el.querySelectorAll('.tw-agent')].map(el => { const a = f.agents[Number(el.dataset.i)] || {}; const g = n => el.querySelector(`[name=${n}]`);
        return { ...a, name: g('name').value, title: g('title').value, role: g('role').value, engine: g('engine').value, web: g('web').checked, prompt: g('prompt').value }; });
    },
    async save(patch, msg = 'Saved.') {
      try { this.view = await call('tower-save-floor', { id: this.floorId, ...patch }); this.renderBuilding(); this.renderFloor(); toast(msg); } catch (e) { toast(e.message || String(e)); }
    },
    async viewer(pathName) {
      let text = ''; try { text = await call('tower-read', pathName); } catch (e) { toast(e.message); return; }
      const m = $('.tw-modal', this.el); m.hidden = false;
      m.innerHTML = `<div class="tw-doc"><header><b>${esc(pathName.split(/[\\/]/).pop())}</b><span></span><button type="button" data-tw="copy">Copy</button><button type="button" data-tw="openfile" data-path="${esc(pathName)}">Open file</button><button type="button" data-tw="modal-close">×</button></header><article class="tw-md">${md(text)}</article></div>`;
      m.__text = text;
    },
    /* desk cam: what one agent is doing right now, and what it has written so far */
    async deskCam(runId, who) {
      clearInterval(this.deskTimer); const tok = this.deskTok = (this.deskTok || 0) + 1;   // only the newest desk cam may paint
      const r = this.runs.get(runId); const f = this.floor(); if (!r || !f) return;
      const agent = who === 'lead' ? f.agents.find(a => a.role === 'lead') : who === 'reviewer' ? f.agents.find(a => a.role === 'reviewer') : f.agents.find(a => a.id === r.steps.find(s => s.id === who)?.agent);
      const m = $('.tw-modal', this.el); m.hidden = false;
      const paint = async () => {
        if (tok !== this.deskTok || m.hidden || !this.open) { if (tok === this.deskTok) clearInterval(this.deskTimer); return; }
        let d; try { d = await call('tower-desk', { runId, who }); } catch (e) { m.querySelector('.tw-cam-b') && (m.querySelector('.tw-cam-b').innerHTML = `<p class="tw-err">${esc(e.message)}</p>`); return; }
        const rr = this.runs.get(runId) || r; const s = rr.steps.find(x => x.id === who);
        const status = who === 'lead' ? (rr.phase === 'planning' ? 'planning' : 'done') : who === 'reviewer' ? (rr.status === 'done' ? 'done' : rr.phase === 'reviewing' ? 'reviewing' : 'queued') : s?.status;
        const draft = who === 'reviewer' && rr.final ? await call('tower-read', rr.final).catch(() => '') : d.draft;
        if (tok !== this.deskTok || m.hidden) return;   // closed or replaced while it was loading
        const keep = [...m.querySelectorAll('.tw-cam-b section')].map(x => x.scrollTop);
        m.innerHTML = `<div class="tw-doc tw-cam"><header><div class="tw-av ${['working', 'planning', 'reviewing'].includes(status) ? 'busy' : ''}" style="--ah:${hue(agent?.name || '')}">${esc(initials(agent?.name))}</div><div><b>${esc(agent?.name || '')}</b> <small>${esc(agent?.title || '')} · ${esc(agent?.rank || '')}</small><p>${esc(s?.title || (who === 'lead' ? 'Planning the work' : 'Signing it off'))} · <span class="st">${esc(STATUS[status] || status || '')}</span></p></div><span></span><button type="button" data-tw="modal-close">×</button></header>
          <div class="tw-cam-b"><section><h6>LIVE LOG</h6><ol>${(d.log || []).slice().reverse().map(x => `<li><time>${new Date(x.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>${esc(x.text)}</li>`).join('') || '<li class="tw-empty">Nothing yet.</li>'}</ol>${d.instructions ? `<h6>ITS BRIEF</h6><p class="tw-hint">${esc(d.instructions)}</p>` : ''}</section>
          <section><h6>WRITTEN SO FAR</h6><article class="tw-md">${draft ? md(draft) : '<p class="tw-empty">Nothing written yet.</p>'}</article></section></div></div>`;
        if (tok !== this.deskTok || m.hidden) return;
        m.querySelectorAll('.tw-cam-b section').forEach((x, i) => { x.scrollTop = keep[i] || 0; });
      };
      await paint(); if (tok === this.deskTok) this.deskTimer = setInterval(paint, 2000);
    },
    enginesModal() {
      const e = this.engines || {}; const s = this.view.settings; const v = this.view;
      const m = $('.tw-modal', this.el); m.hidden = false;
      m.innerHTML = `<div class="tw-doc tw-eng-m"><header><b>Engines & tower settings</b><span></span><button type="button" data-tw="modal-close">×</button></header><div class="tw-eng-b">
        <section><h5>CLAUDE CODE <em class="${e.claudeCode?.ready ? 'ok' : 'warn'}">${e.claudeCode?.ready ? '● Found ' + esc(e.claudeCode.version || '') : '● Not found'}</em></h5>
          <p>Does the hands-on work: reads the floor's knowledge files and writes documents into the floor's folder. It's fenced in: it can only open files in that floor's folder, has no command line, and can't send anything. Uses your Claude plan.</p>
          ${e.claudeCode?.ready ? '' : '<p class="tw-hint">To install: open PowerShell and run <code>irm https://claude.ai/install.ps1 | iex</code>, then run <code>claude</code> once to sign in. Then press Re-check.</p>'}
          <label>Model <select name="codeModel">${['sonnet', 'opus', 'haiku'].map(k => `<option ${s.codeModel === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label></section>
        <section><h5>CLAUDE API <em class="${e.api?.ready ? 'ok' : 'warn'}">${e.api?.ready ? '● Key saved' : '● No key'}</em></h5>
          <p>Plans the work and signs it off: fast and structured. Pay-as-you-go with an API key from console.anthropic.com. The key is stored encrypted on this computer.</p>
          <div class="tw-row"><input name="key" type="password" placeholder="${e.api?.ready ? '••••••••  (saved — paste a new one to replace)' : 'sk-ant-…'}" autocomplete="off"><button type="button" data-tw="save-key">Save key</button>${e.api?.ready ? '<button type="button" data-tw="clear-key">Remove</button>' : ''}</div>
          <div class="tw-row"><label>Planning & sign-off model <input name="plannerModel" value="${esc(s.plannerModel)}"></label><label>Worker model <input name="workerModel" value="${esc(s.workerModel)}"></label></div></section>
        <section><h5>YOUR TOWER FOR THIS HALL <em class="${v.model?.kind === 'glb' || v.model?.kind === 'image' ? 'ok' : 'warn'}">${v.model?.kind === 'glb' ? '● 3D model: ' + esc(v.model.name || '') : v.model?.kind === 'image' ? '● Picture: ' + esc(v.model.name || '') : '● Stand-in'}</em></h5>
          <p>Add the tower you want to see: a 3D model from your modelling app (.glb is best) or a picture (PNG with a see-through background works best). The floor lines are drawn from the building's edge at each floor.</p>
          <div class="tw-row"><button type="button" data-tw="model-glb">⤒ Add a 3D model (.glb)</button><button type="button" data-tw="model-image">⤒ Add a picture</button>${v.model?.kind === 'glb' || v.model?.kind === 'image' ? '<button type="button" data-tw="model-clear">Use the stand-in</button>' : ''}</div>
          <div class="tw-row"><label>Floors start at (% of height) <input name="band-b" type="number" min="0" max="90" value="${Math.round((v.model?.band?.[0] ?? 0.1) * 100)}"></label><label>…and end at <input name="band-t" type="number" min="10" max="100" value="${Math.round((v.model?.band?.[1] ?? 0.9) * 100)}"></label><button type="button" data-tw="model-band">Move floor lines</button></div></section>
        <section><h5>THE TOWER</h5><div class="tw-row"><label>Your name <input name="owner" value="${esc(v.owner)}" maxlength="60"></label><label>Business name <input name="org" value="${esc(v.org)}" maxlength="60"></label><label>Max steps per task <input name="maxSteps" type="number" min="1" max="8" value="${s.maxSteps}"></label></div>
          <p class="tw-hint">Work is saved in <code>${esc(v.root)}</code>. Agents only ever draft: nothing is sent, posted or bought without you.</p></section>
        <div class="tw-save-row"><button type="button" data-tw="recheck">↻ Re-check engines</button><button type="button" data-tw="reset">Restore example floors</button><span></span><button type="button" class="tw-go" data-tw="save-settings">Save</button></div></div></div>`;
    },
    async click(e) {
      const fl = e.target.closest('[data-floor]'); if (fl) { this.floorId = fl.dataset.floor; this.openRun = null; this.renderBuilding(); this.renderFloor(); return; }
      const tab = e.target.closest('[data-tab]'); if (tab) { this.tab = tab.dataset.tab; this.renderFloor(); if (this.inside) this.renderInside(); else this.enter(); return; }
      const kn = e.target.closest('[data-kn]'); if (kn) { try { this.floor().knowledge = await call('tower-knowledge-remove', { floorId: this.floorId, name: kn.dataset.kn }); this.renderPane(); } catch (x) { toast(x.message); } return; }
      const hist = e.target.closest('.tw-hist [data-run]'); if (hist) { this.openRun = hist.dataset.run; this.tab = 'work'; this.renderFloor(); return; }
      const step = e.target.closest('.tw-step[data-desk]'); if (step && !e.target.closest('button')) { this.deskCam(step.dataset.run, step.dataset.desk); return; }
      const go = e.target.closest('[data-goto]'); if (go) { e.preventDefault(); const r = this.runs.get(go.dataset.goto) || (await call('tower-get')).runs.find(x => x.id === go.dataset.goto); if (r) { this.runs.set(r.id, r); this.floorId = r.floorId; this.openRun = r.id; this.tab = 'work'; this.renderBuilding(); this.renderFloor(); } return; }
      const link = e.target.closest('a[data-ext]'); if (link) { e.preventDefault(); call('tower-link', link.href).catch(x => toast(x.message)); return; }
      const b = e.target.closest('[data-tw]'); if (!b) { if (e.target.classList.contains('tw-modal')) { this.closeAll(); $('.tw-modal', this.el).hidden = true; } return; }
      const k = b.dataset.tw, f = this.floor();
      try {
        if (k === 'close') return this.close();
        if (k === 'modal-close') { this.closeAll(); $('.tw-modal', this.el).hidden = true; return; }
        if (k === 'all') return this.allTowers();
        if (k === 'model-glb' || k === 'model-image') { const v = await call('tower-model-set', { kind: k === 'model-glb' ? 'glb' : 'image' }); if (v) { this.view = v; this.renderBuilding(); this.enginesModal(); toast('Your tower is in.'); } return; }
        if (k === 'model-clear') { this.view = await call('tower-model-clear'); this.renderBuilding(); this.enginesModal(); return; }
        if (k === 'model-band') { const mm = $('.tw-eng-m', this.el); this.view = await call('tower-model-band', { bottom: Number(mm.querySelector('[name=band-b]').value) / 100, top: Number(mm.querySelector('[name=band-t]').value) / 100 }); this.renderBuilding(); toast('Floor lines moved.'); return; }
        if (k === 'engines') return this.enginesModal();
        if (k === 'report') return call('tower-report');
        if (k === 'example') { const ta = $('.tw-task', this.el); ta.value = f.example; ta.focus(); return; }
        if (k === 'run') return this.run();
        if(k==='revise'){const r=this.runs.get(b.dataset.run);const ta=$('.tw-task',this.el);if(ta){ta.value=r.task;ta.dataset.resume=r.id;}for(const el of this.el.querySelectorAll('[data-brief]'))el.value=r.brief?.[el.dataset.brief]??'';ta?.focus();return;}
        if(k==='workflow'){await call('tower-workflow-save',{runId:b.dataset.run});toast('Saved from your accepted result. Use Results & workflows to start it again.');await this.refresh();return;}
        if(k==='use-workflow'){const w=this.view.workflows.find(w=>w.id===b.dataset.workflow);if(!w)return;this.floorId=w.floorId;this.tab='work';this.renderFloor();$('.tw-task',this.el).value=w.task;$('.tw-task',this.el).dataset.resume='';for(const el of this.el.querySelectorAll('[data-brief]'))el.value=w.brief?.[el.dataset.brief]??'';this.el.querySelector('[data-workflow]').value=w.id;return;}
        if(k==='remove-workflow'){await call('tower-workflow-remove',b.dataset.workflow);await this.refresh();return;}
        if (k === 'lobby') return this.lobby();
        if (k === 'stop') { await call('tower-stop', b.dataset.run); return; }
        if (k === 'folder') return call('tower-open', f.folder);
        if (k === 'run-folder' || k === 'openfile') return call('tower-open', b.dataset.path);
        if (k === 'read') return this.viewer(b.dataset.path);
        if (k === 'copy') { await navigator.clipboard.writeText($('.tw-modal', this.el).__text || ''); toast('Copied.'); return; }
        if (k === 'approve' || k === 'decline') {
          const r = this.runs.get(b.dataset.run); const i = Number(b.dataset.i); const a = r?.approvals?.[i];
          let body = ''; if (k === 'approve' && r?.final) { try { body = await call('tower-read', r.final); } catch {} }
          if (k === 'approve' && a?.type === 'post' && body) { try { await navigator.clipboard.writeText(body.replace(/\n## Approvals[\s\S]*$/, '').trim()); } catch {} }
          const res = await call('tower-approve', { runId: b.dataset.run, i, yes: k === 'approve', body: body.replace(/\n## Approvals[\s\S]*$/, '').slice(0, 1800) });
          if (a) a.status = res.status; toast(k === 'decline' ? 'Declined.' : a?.type === 'post' ? 'Approved — the post is on your clipboard; paste it in.' : a?.type === 'email' ? 'Approved — check the draft in your mail app, then press send yourself.' : 'Approved.');
          this.renderPane(); return;
        }
        if (k === 'good' || k === 'bad') { const c = $('.tw-fb-c', this.el)?.value || ''; const fb = await call('tower-feedback', { runId: b.dataset.run, good: k === 'good', comment: c }); for (const p of fb?.promoted || []) setTimeout(() => toast('⭐ ' + p), 1200); const r = this.runs.get(b.dataset.run); if (r) r.feedback = { good: k === 'good', comment: c }; toast(k === 'good' ? 'Noted — the team will keep that standard.' : 'Noted — added to the floor\'s lessons.'); await this.refresh(); return; }
        if (k === 'add-floor') { const v = await call('tower-add-floor'); this.view = v; this.floorId = v.added; this.tab = 'brief'; this.renderBuilding(); this.renderFloor(); return; }
        if (k === 'del-floor') { if (!confirm(`Delete floor ${f.number} "${f.name}"? Its folder and past work stay on your computer.`)) return; this.view = await call('tower-remove-floor', f.id); this.floorId = this.view.floors[0]?.id; this.renderBuilding(); this.renderFloor(); return; }
        if (k === 'add-agent') { const team = this.collectTeam(); team.splice(team.length - 1, 0, { name: 'New agent', title: 'Specialist', role: 'specialist', engine: 'auto', web: false, prompt: '' }); return this.save({ agents: team }, 'Agent added — fill in its role and save.'); }
        if (k === 'del-agent') { const i = Number(b.closest('.tw-agent').dataset.i); const team = this.collectTeam(); team.splice(i, 1); return this.save({ agents: team }, 'Agent removed.'); }
        if (k === 'save-team') return this.save({ agents: this.collectTeam() }, 'Team saved.');
        if (k === 'save-brief') { const p = $('.tw-brief', this.el); const g = n => p.querySelector(`[name=${n}]`);
          return this.save({ taskBrief:Object.fromEntries([...p.querySelectorAll('[data-brief]')].map(el=>[el.dataset.brief,el.type==='number'?Number(el.value):el.value.trim()])),number: Number(g('number').value), name: g('name').value, purpose: g('purpose').value, skills: g('skills').value.split(',').map(x => x.trim()).filter(Boolean), tools: { web: g('web').checked, files: true }, engine: g('engine').value, example: g('example').value, lessons: g('lessons').value,
            handoff: g('handoff').value, ideaId: g('ideaId').value, budget: { perRun: Number(g('b-run').value), perDay: Number(g('b-day').value) },
            schedule: { on: g('sch-on').checked, time: g('sch-time').value || '07:30', days: [...p.querySelectorAll('[name=sch-d]:checked')].map(x => Number(x.value)), task: g('sch-task').value, last: f.schedule.last } }, 'Floor saved.'); }
        if (k === 'upload-brief') { const v = await call('tower-brief-upload', { floorId: f.id }); if (v) { this.view = v; this.renderFloor(); toast('Brief uploaded.'); } return; }
        if (k === 'add-knowledge') return this.addKnowledge([]);
        if (k === 'save-key' || k === 'clear-key') { const inp = $('.tw-eng-m [name=key]', this.el); await call('tower-key', k === 'clear-key' ? '' : inp.value); toast(k === 'clear-key' ? 'Key removed.' : 'Key saved.'); this.engines = await call('tower-engines'); this.renderHeader(); this.enginesModal(); return; }
        if (k === 'recheck') { toast('Checking…'); this.engines = await call('tower-engines', { force: true }); this.renderHeader(); this.enginesModal(); return; }
        if (k === 'reset') { if (!confirm('Put the example floors back as they were? Floors you added yourself are kept.')) return; this.view = await call('tower-reset'); this.floorId = this.view.floors[0]?.id; this.renderBuilding(); this.renderFloor(); $('.tw-modal', this.el).hidden = true; return; }
        if (k === 'save-settings') { const m = $('.tw-eng-m', this.el); const g = n => m.querySelector(`[name=${n}]`);
          await call('tower-settings', { codeModel: g('codeModel').value, plannerModel: g('plannerModel').value.trim(), workerModel: g('workerModel').value.trim(), maxSteps: Number(g('maxSteps').value) });
          await call('tower-save-tower', { owner: g('owner').value, org: g('org').value }); await this.refresh(); $('.tw-modal', this.el).hidden = true; toast('Settings saved.'); return; }
      } catch (x) { toast(x.message || String(x)); }
    },
  };

  /* ---------- the mini tower in the hall: lit floors = agents at work */
  const Mini = {
    el: null, theme: null, floors: [],
    async load() { try { const v = await call('tower-get'); this.theme = v.theme; this.floors = v.floors.map(f => ({ id: f.id, n: f.number, name: f.name })); for (const r of v.runs) T.runs.set(r.id, r); this.name = v.name; this.update(); } catch {} },
    // no card of its own any more (the tower icon opens the tower): the icon just shows how many floors are at work
    update() {
      const ico = document.querySelector('.qp-ico[data-tower]'); if (!ico) return;
      const live = [...T.runs.values()].filter(r => r.theme === this.theme && ['queued', 'planning', 'working', 'reviewing'].includes(r.status)).length;
      if (live) ico.dataset.live = String(live); else delete ico.dataset.live;
      ico.title = `${this.name || 'The tower'}${live ? ` — ${live} floor${live > 1 ? 's' : ''} at work` : ''} (or say “Jarvis, open the tower”)`;
    },
  };

  try { J.on('tower', m => { if (m?.type === 'run') T.onRun(m.run); }); } catch {}
  try { J.on('tower-open', () => T.show()); } catch {}
  addEventListener('keydown', e => { if (e.key === 'Escape' && T.open) { const m = T.el && $('.tw-modal', T.el); if (m && !m.hidden) { T.closeAll(); m.hidden = true; } else T.close(); } });
  new MutationObserver(() => { if (Mini.theme && Mini.theme !== hall()) { Mini.theme = hall(); Mini.load(); if (T.open) { T.floorId = null; T.refresh(true); T.el.style.setProperty('--ix', accent()); } } }).observe(document.body, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  function attach() {
    const icons = $('.qp-icons');
    if (icons && !icons.querySelector('[data-tower]')) {
      const g = document.createElement('button'); g.type = 'button'; g.className = 'qp-ico'; g.dataset.globe = '1'; g.title = 'The earth (or say “Jarvis, show me the earth”)'; g.innerHTML = ICON_GLOBE;
      g.addEventListener('click', e => { e.stopPropagation(); if (window.__jarvisGlobe) window.__jarvisGlobe.open({}); else call('hologram-open', { url: 'https://www.google.com/maps/@20,0,3z', title: 'Global map' }).catch(x => toast(x.message)); });
      const t = document.createElement('button'); t.type = 'button'; t.className = 'qp-ico'; t.dataset.tower = '1'; t.title = 'The tower (or say “Jarvis, open the tower”)'; t.innerHTML = ICON_TOWER;
      t.addEventListener('click', e => { e.stopPropagation(); T.show(); });
      icons.appendChild(g); icons.appendChild(t);
    }
    Mini.update();
  }
  setInterval(attach, 1500); setTimeout(attach, 900); setTimeout(() => Mini.load(), 2500);
  window.__jarvisTower = T;
})();
