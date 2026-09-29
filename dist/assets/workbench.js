const J = globalThis.window?.jarvis;
if (J && (new URLSearchParams(location.search).get('view') || 'main') === 'main') {
  const call = (action, data = {}) => J.call('workbench', {action, ...data});
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const modes = {summarise:'Summarise', research:'Research', compare:'Compare', task:'Turn into a task'};
  let modal, options, shelf, filter = 'all', previous, drag, swallowUntil = 0, opening = false;
  let masks = 0, shown = false, maskQueue = Promise.resolve(), editing = null, saving = false;
  function mask(on) {
    masks = Math.max(0, masks + (on ? 1 : -1));
    maskQueue = maskQueue.catch(() => {}).then(async () => {
      if (masks && !shown) {
        shown = {tabs: await J.call('tabs-state').catch(() => false)};
        if (shown.tabs) await J.call('tabs-show', false);
        window.__jarvisHolo?.pauseAll(true);
      } else if (!masks && shown) {
        const restore = shown; shown = false;
        if (restore.tabs) await J.call('tabs-show', true).catch(() => {});
        window.__jarvisHolo?.pauseAll(false);
      }
    });
    return maskQueue;
  }
  const notice = message => {
    const p = document.createElement('div'); p.className = 'wb-notice'; p.setAttribute('role','status'); p.textContent = message;
    document.body.append(p); setTimeout(() => p.remove(), 5000);
  };
  const fail = e => notice(e.message || String(e));
  async function close(force = false) {
    if (saving && !force) return;
    if (!modal) return;
    modal.remove(); modal = null; editing = null; await mask(false); previous?.focus?.();
  }
  async function frame(title) {
    if (modal) { modal.remove(); modal = null; editing = null; }
    else { previous = document.activeElement; await mask(true); }
    modal = document.createElement('section'); modal.className = 'wb-panel'; modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true'); modal.setAttribute('aria-labelledby','wb-title');
    modal.innerHTML = `<header><div><small>WORKSPACE / NEXT ACTION</small><h2 id="wb-title">${esc(title)}</h2></div><button data-wb-close aria-label="Close work shelf">Close</button></header><div class="wb-body"></div><p class="wb-status" role="status"></p>`;
    document.body.append(modal); modal.querySelector('[data-wb-close]').onclick = () => close(); modal.querySelector('button').focus();
    return modal.querySelector('.wb-body');
  }
  const status = t => { const p = modal?.querySelector('.wb-status'); if (p) p.textContent = t; };
  function paintShelf() {
    if (!modal?.querySelector('[data-wb-items]')) return;
    const host = modal.querySelector('[data-wb-items]'), focus = document.activeElement?.dataset.wbItem;
    const items = (shelf?.items || []).filter(i => filter === 'all' || i.kind === filter);
    host.innerHTML = items.map(i => `<article class="wb-item ${i.kind}"><span>${esc(i.kind === 'finished' ? 'Ready to review' : i.kind === 'blocked' ? 'Needs help' : i.kind === 'approval' ? 'Your decision' : 'Saved brief')}${i.theme ? ' · '+esc(options?.themes.find(t=>t.id===i.theme)?.name || i.theme) : ''}</span><h3>${esc(i.title)}</h3><p>${esc(i.detail)}</p><button data-wb-item="${esc(i.id)}">${esc(i.action)}</button></article>`).join('') || '<p class="wb-empty">Nothing waiting in this view. New results and requests will appear here.</p>';
    host.querySelectorAll('[data-wb-item]').forEach(b => b.onclick = () => openItem(b.dataset.wbItem).catch(fail));
    if (focus) [...host.querySelectorAll('button')].find(b=>b.dataset.wbItem===focus)?.focus();
    status(shelf?.error || 'Reviewing a card does not approve it or mark its work complete.');
  }
  async function refresh() {
    shelf = await call('attention');
    for (const b of document.querySelectorAll('[data-wb-open]')) { b.textContent = `Attention${shelf.items.length ? ' · '+shelf.items.length : ''}`; b.setAttribute('aria-label',`Needs my attention: ${shelf.items.length} items`); }
    paintShelf();
  }
  async function show() {
    if (opening || saving) return; opening = true;
    try {
      window.__jarvisScreens?.cancel();
      options = await call('options'); const body = await frame('Needs my attention');
      body.innerHTML = '<p>Across all three halls: decide, unblock, review, or finish a saved brief.</p><nav class="wb-filters" aria-label="Attention filters">'+Object.entries({all:'Everything',approval:'Approvals',blocked:'Needs help',finished:'Finished work',draft:'Saved briefs'}).map(([k,v])=>`<button data-filter="${k}" aria-pressed="${k===filter}">${v}</button>`).join('')+'</nav><div data-wb-items></div>';
      body.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;body.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));paintShelf();});
      await refresh();
    } catch (e) { if (modal) status(e.message); else fail(e); } finally { opening = false; }
  }
  async function openItem(id) {
    const item = shelf.items.find(i=>i.id===id); if (!item) return refresh();
    if (item.source === 'core') { await close(); window.__jarvisCore?.show('needs'); return; }
    if(item.source==='meeting-work'){await close();await window.__jarvisMeetingWork?.show();return;}
    if (item.source === 'tower') { await close(); await window.__jarvisTower.showRun(item.theme,item.runId); return; }
    if(item.source==='meeting'){await close();await window.__jarvisRoutines.show('meetings');return;}
    if (item.source === 'draft') { await editor(await call('draft',{id:item.draftId})); return; }
    const row = await call('mission',{theme:item.theme,id:item.suitId}), body = await frame(row.name+' · suit task');
    body.innerHTML = `<p>${esc(row.objective || 'No objective recorded.')}</p><p>Status: <strong>${esc(row.status)}</strong> · ${Number(row.progress)||0}%</p><ul>${(row.tasks||[]).map(t=>`<li>${t.done?'✓':'○'} ${esc(t.text)}</li>`).join('')}</ul><h3>Agent log</h3><pre>${esc((row.log||[]).map(l=>l.line||l.text||l.message||String(l)).join('\n') || 'No log recorded. Open the suit to inspect the agent’s output.')}</pre><div class="wb-actions"><button data-open-suit>Open suit</button>${row.status==='done'?'<button data-seen>I have reviewed this task</button>':''}<button data-back>Back to shelf</button></div>`;
    body.querySelector('[data-back]').onclick=show;
    body.querySelector('[data-open-suit]').onclick=async()=>{try{await close();await J.call('action',{action:'theme',id:item.theme,fast:true});await J.call('action',{action:'select',id:item.suitId});}catch(e){fail(e);}};
    const seen=body.querySelector('[data-seen]');if(seen)seen.onclick=async()=>{try{await call('seen',{id:item.id});await show();}catch(e){status(e.message);}};
  }
  async function choose(tabId, target) {
    if (opening || saving) return; opening = true;
    try {
      options = await call('options');
      const body = await frame('Give a page to a suit');
      body.innerHTML='<p>Choose an open JARVIS tab and a suit. The next screen shows exactly what you can share with its team.</p><label>Open page<select data-page>'+options.tabs.map(t=>`<option value="${esc(t.id)}" ${t.id===(tabId||options.tabs.find(t=>t.active)?.id)?'selected':''}>${esc(t.title)}</option>`).join('')+'</select></label><div class="wb-suits">'+options.themes.map(t=>`<section><h3>${esc(t.name)}</h3>${t.suits.map(s=>`<button data-suit-choice="${esc(s.id)}" data-hall="${esc(t.id)}">${esc(s.name)}</button>`).join('')}</section>`).join('')+'</div>';
      if (!options.tabs.length) { status('Open a web page inside a suit first.'); body.querySelectorAll('[data-suit-choice]').forEach(b=>b.disabled=true); }
      let capturing=false;
      const start=async(theme,suitId)=>{const id=body.querySelector('[data-page]').value;if(!id||capturing)return;capturing=true;const current=modal;body.querySelectorAll('button').forEach(b=>b.disabled=true);status('Reading visible page text…');try{const p=await call('capture',{id});if(modal!==current)return;const s=options.themes.find(t=>t.id===theme)?.suits.find(s=>s.id===suitId);if(!s)throw Error('That suit no longer exists.');await editor({theme,suitId,suitName:s.name,mode:'summarise',pages:[p],brief:{}});}catch(e){if(modal===current)status(e.message);}finally{capturing=false;if(body.isConnected)body.querySelectorAll('button').forEach(b=>b.disabled=false);}};
      body.querySelectorAll('[data-suit-choice]').forEach(b=>b.onclick=()=>start(b.dataset.hall,b.dataset.suitChoice));
      if(target&&options.tabs.some(t=>t.id===tabId))await start(target.theme,target.suitId);
    }catch(e){fail(e);}finally{opening=false;}
  }
  async function editor(d) {
    options ||= await call('options');
    const theme=options.themes.find(t=>t.id===d.theme);if(!theme)throw Error('That hall no longer exists.');
    const body=await frame(`${d.suitName} · page brief`);editing=d;
    const defaults={outcome:d.pages[0].title,audience:'Me',files:'The page excerpts below; cite their URLs.',constraints:'Draft only. No sending, purchases or changes to accounts.',finished:'A clear, useful answer with sources and any missing information called out.',budget:null,...d.brief};
    body.innerHTML=`<p>The suit keeps the work together. Choose the Tower team that will handle it. Saving a brief is free; <strong>Start with this budget</strong> begins AI work.</p><div class="wb-grid"><label>Action<select data-mode>${Object.entries(modes).map(([k,v])=>`<option value="${k}" ${d.mode===k?'selected':''}>${v}</option>`).join('')}</select></label><label>Team for this suit<select data-team>${theme.teams.map(t=>`<option value="${esc(t.id)}" ${t.id===(d.floorId||options.teams[d.theme+':'+d.suitId])?'selected':''}>${esc(t.name)}${t.engine==='rehearsal'?' · rehearsal':''}</option>`).join('')}</select></label></div><p data-team-budget></p><div data-page-previews></div><label data-compare hidden>Compare with another open page<select><option value="">Choose another page</option>${options.tabs.filter(t=>t.url!==d.pages[0].url).map(t=>`<option value="${esc(t.id)}">${esc(t.title)}</option>`).join('')}</select></label><div class="wb-grid">${Object.entries({outcome:'What do you want from this?',audience:'Who is this for?',files:'Sources and files',constraints:'Constraints',finished:'What does finished mean?'}).map(([k,label])=>`<label>${label}<textarea data-brief="${k}" maxlength="2000" rows="2">${esc(defaults[k])}</textarea></label>`).join('')}<label>Spend cap for this run (USD)<input data-budget type="number" min="0.05" max="100" step="0.05" value="${defaults.budget||''}" placeholder="Choose a cap"></label></div><p>Page excerpts are reference material. Forms, embedded frames and files are not included. Edit out private text before starting; selected text is sent to the configured AI provider. Research may use web search. “Turn into a task” creates a plan for you to review.</p><div class="wb-actions"><button data-save>Save for later</button><button class="wb-primary" data-start>Start with this budget</button>${d.id?'<button data-remove>Delete saved brief</button>':''}</div>`;
    const previews=()=>{
      body.querySelector('[data-page-previews]').innerHTML=d.pages.map((p,i)=>`<details open><summary>${esc(p.title)} · page ${i+1}</summary><p class="wb-url">${esc(p.url)}</p><label>Page text to share (up to 12,000 characters)<textarea data-excerpt="${i}" maxlength="12000" rows="5">${esc(p.text)}</textarea></label></details>`).join('');
      body.querySelectorAll('[data-excerpt]').forEach(el=>el.oninput=()=>d.pages[Number(el.dataset.excerpt)].text=el.value);
    };previews();
    const budget=()=>{const team=theme.teams.find(t=>t.id===body.querySelector('[data-team]').value);body.querySelector('[data-team-budget]').textContent=team?`${team.name}: at most $${team.budget.perRun.toFixed(2)} per run, $${team.budget.perDay.toFixed(2)} per day. A lower cap below takes priority. Without connected AI, the Tower rehearses only.`:'Choose a team.';};budget();body.querySelector('[data-team]').onchange=budget;
    const mode=()=>{d.mode=body.querySelector('[data-mode]').value;body.querySelector('[data-compare]').hidden=d.mode!=='compare';if(d.mode!=='compare'){d.pages=d.pages.slice(0,1);previews();}};mode();body.querySelector('[data-mode]').onchange=mode;
    let capture=0;
    if(d.pages.length===2)body.querySelector('[data-compare] option').textContent='Second page captured — choose here to replace';
    body.querySelector('[data-compare] select').onchange=async e=>{const n=++capture;if(!e.target.value)return;d.pages=d.pages.slice(0,1);previews();status('Reading comparison page…');try{const p=await call('capture',{id:e.target.value});if(n!==capture||editing!==d||d.mode!=='compare')return;d.pages=[d.pages[0],p];previews();status('Both pages are ready to review.');}catch(e){if(editing===d)status(e.message);}};
    const persist=async(start)=>{
      if(saving)return;saving=true;body.querySelectorAll('button').forEach(b=>b.disabled=true);
      try{
        d.floorId=body.querySelector('[data-team]').value;
        d.brief=Object.fromEntries([...body.querySelectorAll('[data-brief]')].map(el=>[el.dataset.brief,el.value.trim()]));
        const cap=body.querySelector('[data-budget]').value;d.brief.budget=cap?Number(cap):null;
        const saved=await call('save',{draft:d});Object.assign(d,saved);
        if(start){status('Starting the team…');const r=await call('start',{id:d.id});saving=false;await close();await window.__jarvisTower.showRun(r.theme,r.id);notice('Page brief handed to the selected team. Review the result in the attention shelf.');}
        else {saving=false;await show();notice('Brief saved. No AI work has started.');}
        refresh().catch(()=>{});
      }catch(e){status(e.message);}finally{saving=false;if(body.isConnected)body.querySelectorAll('button').forEach(b=>b.disabled=false);}
    };
    body.querySelector('[data-save]').onclick=()=>persist(false);body.querySelector('[data-start]').onclick=()=>persist(true);
    const remove=body.querySelector('[data-remove]');if(remove)remove.onclick=async()=>{try{await call('remove',{id:d.id});await show();}catch(e){status(e.message);}};
  }
  function grab(id,x,y) { cancelDrag(); if(modal||opening)return; drag={id,x,y,shown:false,target:null}; }
  function move(x,y) {
    const d=drag;if(!d)return false;
    if(!d.shown&&Math.hypot(x-d.x,y-d.y)>24&&options){
      d.shown=true;mask(true).catch(fail);d.tray=document.createElement('section');d.tray.className='wb-drop-tray';d.tray.setAttribute('aria-label','Drop tab onto a suit');
      d.tray.innerHTML='<strong>Give this page to a suit</strong><span>Release over a suit to choose an action. Escape cancels.</span><div class="wb-suits">'+options.themes.map(t=>`<section><h3>${esc(t.name)}</h3>${t.suits.map(s=>`<button data-drop-suit="${esc(s.id)}" data-hall="${esc(t.id)}">${esc(s.name)}</button>`).join('')}</section>`).join('')+'</div>';document.body.append(d.tray);
    }
    if(!d.shown)return false;
    const hit=document.elementFromPoint(x,y)?.closest('[data-drop-suit]');
    d.target=hit?{theme:hit.dataset.hall,suitId:hit.dataset.dropSuit}:null;
    d.tray.querySelectorAll('button').forEach(b=>b.classList.toggle('over',b===hit));return !!d.target;
  }
  function finishDrag(silent=false) {
    const d=drag;if(!d)return false;drag=null;d.tray?.remove();
    const done=d.shown?mask(false):Promise.resolve();
    if(!silent&&d.target){swallowUntil=performance.now()+600;done.then(()=>choose(d.id,d.target)).catch(fail);return true;}return false;
  }
  function cancelDrag(){finishDrag(true);}
  let mouse=null;
  const down=e=>{const t=e.target.closest('.ws-tab[data-tab]');if(!t||!e.isTrusted||e.button!==0||e.target.closest('[data-close],[data-pop]')||modal)return;mouse={x:e.clientX,y:e.clientY,moved:false};e.stopImmediatePropagation();if(window.__jarvisScreens)window.__jarvisScreens.grab(t.dataset.tab,e.clientX,e.clientY,performance.now());else grab(t.dataset.tab,e.clientX,e.clientY);};
  const pointerMove=e=>{if(!mouse)return;if(Math.hypot(e.clientX-mouse.x,e.clientY-mouse.y)>24){mouse.moved=true;e.preventDefault();if(window.__jarvisScreens)window.__jarvisScreens.move(e.clientX,e.clientY,performance.now());else move(e.clientX,e.clientY);}};
  const up=()=>{if(!mouse)return;if(mouse.moved)swallowUntil=performance.now()+600;mouse=null;if(window.__jarvisScreens)window.__jarvisScreens.release(false);else finishDrag();};
  const key=e=>{
    if(e.key==='Escape'&&(modal||drag)){e.preventDefault();e.stopImmediatePropagation();mouse=null;cancelDrag();close();}
    else if(e.altKey&&e.shiftKey&&e.code==='KeyA'){e.preventDefault();show();}
    else if(modal&&e.key==='Tab'){const nodes=[...modal.querySelectorAll('button:not(:disabled),input,textarea,select,summary')].filter(n=>n.getClientRects().length);if(!nodes.length)return;if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}
  };
  const cancelled=()=>{mouse=null;window.__jarvisScreens?.cancel();cancelDrag();};
  document.addEventListener('pointerdown',down,true);addEventListener('pointermove',pointerMove);addEventListener('pointerup',up);addEventListener('pointercancel',cancelled);addEventListener('blur',cancelled);addEventListener('keydown',key,true);
  document.addEventListener('click',e=>{if(performance.now()<swallowUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
  const sync=()=>{
    const bar=document.querySelector('.qp-icons');if(bar&&!bar.querySelector('[data-wb-open]')){const b=document.createElement('button');b.className='qp-ico wb-trigger';b.dataset.wbOpen='';b.textContent='Attention';b.title='Needs my attention · Alt+Shift+A';b.onclick=show;bar.append(b);}
    const tabs=document.querySelector('.ws-tabs');if(tabs&&!tabs.querySelector('[data-wb-page]')){const b=document.createElement('button');b.dataset.wbPage='';b.className='wb-page-button';b.textContent='Give page to suit';b.onclick=()=>choose();tabs.append(b);}
  };
  let syncing=false;
  const update=async()=>{if(syncing)return;syncing=true;try{sync();options=await call('options');await refresh();}catch{}finally{syncing=false;}};
  const timer=setInterval(update,8000),uiTimer=setInterval(sync,800);update();
  const off=['tower','board','core'].map(name=>J.on(name,()=>{refresh().catch(()=>{});}));
  window.__jarvisWorkbench={show,choose,close,grab,move,release:finishDrag,cancel:cancelDrag};
  addEventListener('pagehide',()=>{cancelled();modal?.remove();clearInterval(timer);clearInterval(uiTimer);off.forEach(f=>f());});
}
