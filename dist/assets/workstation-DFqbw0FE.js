import{o as e,t}from"./index-DNK6LM5N.js";function n(n,r){let i=null,a=[],o=!0,s=null,c=null;n.innerHTML=`<div class="workstation"><header class="ws-bar"><div class="ws-identity"><span class="ws-index" data-index>01</span><div><h2 data-name>Suit</h2><p data-sub></p></div></div><nav class="ws-tabs" data-tabs></nav><div class="ws-actions"><button data-setup class="ws-setup" title="Open your Screens set-up: each link in its own window, on the screen you chose">Launch setup ⧉</button><button data-launch="all" title="Open every link and app for this suit">Launch all ↗</button><button data-settings>Configure</button></div></header><section class="ws-body"><div class="ws-launchpad" data-launchpad></div><div class="ws-tabhost" data-tabhost><div class="ws-tabtools"><button data-nav="back">←</button><button data-nav="forward">→</button><button data-nav="reload">⟳</button><span data-url></span><button data-nav="external">Open in browser ↗</button></div><div class="ws-page" data-page></div></div></section></div>`;let l=e=>n.querySelector(e);function u(){return i?.folder?`Files: ${e(i.folder)}`:`No folder yet — add one in Configure or on the control deck.`}function d(){let n=i?.links||[],a=i?.apps||[];l(`[data-launchpad]`).innerHTML=`<div class="ws-columns"><div><p class="eyebrow">LINKS · ${n.length}</p>${n.length?`<div class="ws-grid">${n.map((t,n)=>`<button class="ws-tile" data-link="${n}"><span>${String(n+1).padStart(2,`0`)} / ${t.target===`inapp`?`IN JARVIS`:`BROWSER`}<em class="ws-lastscr">${__linkLastLabel(i.id,t.url)}</em></span><strong>${e(t.label)}</strong><small>${e(t.url)}</small></button>`).join(``)}</div>`:`<p class="muted">No links yet.</p>`}</div><div><p class="eyebrow">APPS · ${a.length}</p>${a.length?`<div class="ws-grid">${a.map((t,n)=>`<button class="ws-tile" data-app="${n}"><span>${String(n+1).padStart(2,`0`)} / APPLICATION</span><strong>${e(t.label)}</strong><small>${e(t.path)}</small></button>`).join(``)}</div>`:`<p class="muted">No apps yet.</p>`}<p class="small muted ws-folder-line">${u()}</p></div></div>${r.single?`<div class="ws-files" data-files></div>`:``}`,l(`[data-launchpad]`).querySelectorAll(`[data-link]`).forEach(e=>e.onclick=()=>__linkPick(e,r,i,+e.dataset.link)),l(`[data-launchpad]`).querySelectorAll(`[data-app]`).forEach(e=>e.onclick=()=>r.api(`suit-launch`,{id:i.id,what:`apps`}).catch(e=>r.notify(e.message))),r.single&&(c?.dispose(),c=t(l(`[data-files]`),r),c.setSuit(i))}function f(){let t=a.find(e=>e.active);l(`[data-tabs]`).innerHTML=`<button class="ws-tab ${o||!a.length?`active`:``}" data-launchpad-tab>◈ Launchpad</button>`+a.map(t=>`<button class="ws-tab ${t.active&&!o&&!t.popped?`active`:``} ${t.popped?`popped`:``}" data-tab="${t.id}" title="${t.popped?`Open in its own window. Click to bring it forward`:`Drag down out of the bar to put it on another screen`}"><i class="${t.loading?`loading`:``}"></i>${e((t.title||`Loading…`).slice(0,28))}<span class="ws-pop" data-pop="${t.id}" title="${t.popped?`Put back in the suit`:`Send to a screen`}">${t.popped?`⤓`:`⧉`}</span><span data-close="${t.id}" title="Close tab">×</span></button>`).join(``),l(`[data-launchpad-tab]`).onclick=()=>{o=!0,p(),f()},__tabDrag(l(`[data-tabs]`),r,a),l(`[data-tabs]`).querySelectorAll(`[data-tab]`).forEach(e=>e.onclick=t=>{if(e.__dragged){e.__dragged=!1;return}if(t.target.dataset.close){r.api(`tabs-close`,t.target.dataset.close).catch(()=>{});return}if(t.target.dataset.pop){__tabScreens(t.target,r,a.find(x=>x.id===t.target.dataset.pop));return}o=!1,r.api(`tabs-activate`,e.dataset.tab).then(p).catch(()=>{})}),l(`[data-url]`).textContent=t?.url||``,n.classList.toggle(`has-tabs`,a.length>0),l(`[data-launchpad]`).classList.toggle(`hidden`,!o&&a.length>0),l(`[data-tabhost]`).classList.toggle(`hidden`,o||!a.length)}function p(){let e=l(`[data-page]`);if(!(!o&&a.length>0&&!n.classList.contains(`hidden`)&&n.offsetParent!==null)){r.api(`tabs-show`,!1).catch(()=>{});return}let t=e.getBoundingClientRect();r.api(`tabs-layout`,{x:t.left,y:t.top,width:t.width,height:t.height}).then(()=>r.api(`tabs-show`,!0)).catch(()=>{})}l(`[data-launch]`).onclick=()=>r.api(`suit-launch`,{id:i.id,what:`all`}).then(e=>{e.errors.length&&r.notify(e.errors[0])}).catch(e=>r.notify(e.message)),l(`[data-setup]`).onclick=()=>{let b=l(`[data-setup]`);b.disabled=!0;r.api(`layout-apply`,{id:i.id}).then(e=>{e&&e.error?r.notify(e.error):e&&!e.placed?r.notify(`Nothing set up yet. Add links under Screens in Configure.`):e&&e.missing&&e.missing.length?r.notify(`Not found: ${e.missing.join(`, `)}`):0}).catch(e=>r.notify(e.message)).finally(()=>{b.disabled=!1})},l(`[data-settings]`).onclick=()=>r.action(`settings`),n.querySelectorAll(`[data-nav]`).forEach(e=>e.onclick=()=>{let t=a.find(e=>e.active);t&&r.api(`tabs-navigate`,{id:t.id,command:e.dataset.nav}).catch(e=>r.notify(e.message))});let m=r.bridge.on(`tabs`,e=>{let t=e.length>a.length;a=e,t&&(o=!1),f(),p()}),h=r.bridge.on(`launch-result`,e=>{e.id===i?.id&&e.errors?.length&&r.notify(e.errors[0])});return s=new ResizeObserver(()=>p()),s.observe(n),{open(e){i=e,l(`[data-index]`).textContent=String(e.index).padStart(2,`0`),l(`[data-name]`).textContent=e.name,l(`[data-sub]`).textContent=`${r.theme.theme.assistant.toUpperCase()} · ${e.label}`,o=!0,d(),r.api(`tabs-list`).then(e=>{a=e,f(),p()}).catch(()=>{a=[],f()})},update(){if(i){let e=r.modules.find(e=>e.id===i.id);e&&JSON.stringify(e)!==JSON.stringify(i)&&(i=e,d())}p()},control(e){e===`launch-all`&&l(`[data-launch]`).click()},hidden(){r.api(`tabs-show`,!1).catch(()=>{})},dispose(){m(),h(),s?.disconnect(),c?.dispose()}}}export{n as mountWorkstation};
/* ---- tabs onto other screens (v9.6) ---- */
function __linkKey(id,url){return `jv.linkScr.${id}.${url}`}
function __linkLast(id,url){try{return JSON.parse(localStorage.getItem(__linkKey(id,url))||`null`)}catch{return null}}
function __linkLastLabel(id,url){const v=__linkLast(id,url);return v==null?``:` · ${v===`here`?`THIS PAGE`:v===`browser`?`BROWSER`:`SCREEN `+v}`}
/* Click a link tile: pick where it opens — any screen, this page, or your normal browser. */
function __linkPick(anchor,r,suit,index){
  document.querySelector(`.ws-screenmenu`)?.remove();
  const link=suit.links[index];if(!link)return;const last=__linkLast(suit.id,link.url);
  r.api(`tabs-displays`).then(list=>{
    const m=document.createElement(`div`);m.className=`ws-screenmenu ws-linkmenu`;
    const opt=(k,b,label,sub)=>`<button type="button" data-where="${k}" class="${String(last)===String(k)?`last`:``}"><b>${b}</b>${label}<small>${String(last)===String(k)?`last used`:sub}</small></button>`;
    m.innerHTML=`<p>Open “${String(link.label).replace(/[&<>"]/g,``)}” on</p>`+list.map(d=>opt(d.index,d.index,d.label+(d.primary?` · main`:``),`${d.width}×${d.height}`)).join(``)
      +opt(`here`,`▣`,`This page`,`tab in the suit`)+opt(`browser`,`↗`,`My browser`,`Chrome / Edge`);
    document.body.appendChild(m);
    const b=anchor.getBoundingClientRect();m.style.left=Math.max(8,Math.min(b.left,innerWidth-250))+`px`;
    const h=m.offsetHeight;m.style.top=(b.bottom+6+h>innerHeight?Math.max(8,b.top-6-h):b.bottom+6)+`px`;
    m.onclick=ev=>{const k=ev.target.closest(`[data-where]`);if(!k)return;m.remove();
      const w=k.dataset.where,where=/^\d+$/.test(w)?+w:w;
      try{localStorage.setItem(__linkKey(suit.id,link.url),JSON.stringify(where))}catch{}
      const tag=anchor.querySelector(`.ws-lastscr`);if(tag)tag.textContent=__linkLastLabel(suit.id,link.url);
      r.api(`link-open-on`,{id:suit.id,index,where}).catch(e=>r.notify(e.message))};
    setTimeout(()=>document.addEventListener(`pointerdown`,function off(ev){if(!ev.target.closest(`.ws-screenmenu`)){m.remove();document.removeEventListener(`pointerdown`,off,!0)}},!0),0);
  }).catch(e=>r.notify(e.message));
}
function __tabScreens(anchor,r,tab){
  document.querySelector(`.ws-screenmenu`)?.remove();
  if(tab?.popped){r.api(`tabs-dock`,tab.id).catch(e=>r.notify(e.message));return}
  r.api(`tabs-displays`).then(list=>{
    const m=document.createElement(`div`);m.className=`ws-screenmenu`;
    m.innerHTML=`<p>Send this tab to</p>`+list.map(d=>`<button type="button" data-screen="${d.index}"><b>${d.index}</b>${d.label}${d.primary?` · main`:``}<small>${d.width}×${d.height}</small></button>`).join(``)+(list.length<2?`<p class="hint">Only one screen found.</p>`:``);
    document.body.appendChild(m);
    const b=anchor.getBoundingClientRect();m.style.left=Math.min(b.left,innerWidth-230)+`px`;m.style.top=b.bottom+6+`px`;
    m.onclick=ev=>{const k=ev.target.closest(`[data-screen]`);if(!k)return;m.remove();r.api(`tabs-popout`,{id:tab.id,display:+k.dataset.screen}).catch(e=>r.notify(e.message))};
    setTimeout(()=>document.addEventListener(`pointerdown`,function off(ev){if(!ev.target.closest(`.ws-screenmenu`)){m.remove();document.removeEventListener(`pointerdown`,off,!0)}},!0),0);
  }).catch(e=>r.notify(e.message));
}
function __tabDrag(bar,r,tabs){
  bar.querySelectorAll(`[data-tab]`).forEach(el=>{
    const tab=tabs.find(t=>t.id===el.dataset.tab);if(!tab||tab.popped)return;
    el.onpointerdown=ev=>{
      if(ev.button!==0||ev.target.dataset.close||ev.target.dataset.pop)return;
      const sx=ev.clientX,sy=ev.clientY,strip=bar.getBoundingClientRect();let ghost=null,out=!1;
      const move=e=>{
        const dx=e.clientX-sx,dy=e.clientY-sy;
        if(!ghost&&Math.hypot(dx,dy)>8){ghost=el.cloneNode(!0);ghost.classList.add(`ws-tab-ghost`);document.body.appendChild(ghost);el.classList.add(`dragging`)}
        if(ghost){ghost.style.left=e.clientX-40+`px`;ghost.style.top=e.clientY-14+`px`;out=e.clientY>strip.bottom+60||e.clientY<strip.top-40||e.clientX<0||e.clientX>innerWidth||e.clientY>innerHeight;ghost.classList.toggle(`out`,out)}
      };
      const up=e=>{
        removeEventListener(`pointermove`,move);removeEventListener(`pointerup`,up);
        el.classList.remove(`dragging`);if(ghost){ghost.remove();el.__dragged=!0;setTimeout(()=>{el.__dragged=!1},50)}
        if(out)r.api(`tabs-popout`,{id:tab.id,x:e.screenX,y:e.screenY}).catch(x=>r.notify(x.message));
      };
      addEventListener(`pointermove`,move);addEventListener(`pointerup`,up);
    };
  });
}
