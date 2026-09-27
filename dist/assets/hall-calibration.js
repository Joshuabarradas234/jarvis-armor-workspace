import {validateHallCalibration,calibratedModules} from './hall-calibration-data.js';
const J=window.jarvis,view=new URLSearchParams(location.search).get('view')||'main';
const clone=v=>JSON.parse(JSON.stringify(v));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
if(J&&view==='main'){
  let saved={version:1,themes:{}},draft=null,active=false,theme='',id='',original=null,lastStage=null,lastHall=null,lastModules=null,history=[],eyeMode=false,drag=null,timer=0,frame=0,loading=false,trigger=null;
  const panel=document.createElement('aside');panel.className='cal-panel';panel.hidden=true;panel.setAttribute('aria-label','Hall calibration');
  const layer=document.createElement('div');layer.className='cal-layer';layer.hidden=true;document.body.append(panel,layer);
  const suits=()=>window.__jarvisSuits, hall=()=>window.__jarvisHall;
  function message(text){const e=panel.querySelector('[data-message]');if(e)e.textContent=text;}
  function map(){const back=document.querySelector('.hall-backdrop'),st=suits()?.baseStage;if(!back||!st)return null;const r=back.getBoundingClientRect(),k=Math.min(back.offsetWidth/st.w,back.offsetHeight/st.h),sx=r.width/back.offsetWidth,sy=r.height/back.offsetHeight;return {x:r.x+(back.offsetWidth-st.w*k)/2*sx,y:r.y+(back.offsetHeight-st.h*k)/2*sy,w:st.w*k*sx,h:st.h*k*sy};}
  function apply(patch){const s=suits(),h=hall();if(!s?.baseStage||!h||!original)return;s.calibrate?.(patch);
    const modules=calibratedModules(original.modules,s.stage,patch);h.modules=modules;h.theme={...original.theme};
    if(patch.hologram){const[x,y,w,height]=patch.hologram;h.theme.overlay={...original.theme.overlay,x:x*100,y:y*100,w:w*100,h:height*100};}
    lastHall=h;lastModules=h.modules;h.place();s.reconcileEntry?.();for(const p of h.labels()){const b=document.querySelector(`.bay-label[data-suit="${p.id}"]`);if(b){b.style.left=p.x+'%';b.style.top=p.y+'%';b.style.setProperty('--plaque-w',p.w+'%');}}
    if(active)drawMarkers();
  }
  function change(fn){history.push(clone(draft));if(history.length>40)history.shift();fn(draft);try{draft=validateHallCalibration(theme,draft);apply(draft);message('Preview only — save to keep these changes.');}catch(e){draft=history.pop();message(e.message);apply(draft);}drawControls();}
  function row(){return draft.bays[id]||(draft.bays[id]={});}
  function defaultsFor(){const s=suits().baseStage,b=s.bays[id],m=original.modules.find(m=>m.id===id);return {bounds:[b.x0/s.w,b.y0/s.h,b.x1/s.w,b.foot/s.h],label:[m.plaque.x/100,m.plaque.y/100,(m.plaque.w||original.theme.plaque.w)/100],fill:b.fill||.97,widthFit:b.widthFit||.96,eyeOffset:[0,0,0],eyeScale:1,pose:1};}
  function fields(){return {...defaultsFor(),...row()};}
  function fullHologram(){const o=original.theme.overlay;return draft.hologram||[o.x/100,o.y/100,o.w/100,o.h/100];}
  function fullCentre(){const m=original.modules.find(m=>m.isVehicle);return draft.centreLabel||[m.plaque.x/100,m.plaque.y/100,(m.plaque.w||original.theme.plaque.w)/100];}
  function open(){const s=suits(),h=hall();if(!s?.baseStage||!h||!original)return;theme=s.theme;id=Object.keys(s.stage.bays)[0];draft=clone(saved.themes[theme]||{bays:{}});active=true;history=[];eyeMode=false;document.body.classList.add('calibrating');panel.hidden=layer.hidden=false;drawControls();drawMarkers();panel.querySelector('select').focus();}
  function close(restore=true){if(!active)return;active=false;eyeMode=false;drag=null;suits()?.inspect?.(null);document.body.classList.remove('calibrating');panel.hidden=layer.hidden=true;if(restore)apply(saved.themes[theme]||{});trigger?.focus();}
  function drawControls(){if(!active)return;const f=fields(),names=original.modules.filter(m=>!m.isVehicle);panel.classList.toggle('cal-left',names.findIndex(m=>m.id===id)>3);
    const range=(key,label,min,max,step,value)=>`<label>${label}<input data-field="${key}" aria-label="${label}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output>${Number(value).toFixed(step<.01?3:2)}</output></label>`;
    const note=panel.querySelector('[data-message]')?.textContent||'Drag the pod, corner or label. Changes are previewed before saving.';
    panel.innerHTML=`<header><div><small>VISUAL CALIBRATION</small><h2>${esc(original.theme.name)}</h2></div><button data-do="close" aria-label="Close calibration">×</button></header>
      <label>Suit<select aria-label="Calibration suit">${names.map(m=>`<option value="${m.id}" ${m.id===id?'selected':''}>${esc(m.name)}</option>`).join('')}</select></label>
      <div class="cal-actions"><button data-do="eyes">${eyeMode?'Show full hall':'Inspect eyes'}</button><button data-do="pose">Preview entry</button></div>
      ${range('fill','Height fill',.65,.99,.01,f.fill)}${range('widthFit','Width fill',.65,.99,.01,f.widthFit)}
      <details ${eyeMode?'open':''}><summary>Eye alignment</summary><p>Drag either eye handle to move the light pair. Depth moves lights onto the lens surface.</p>
      ${range('eyeX','Eye horizontal',-.15,.15,.001,f.eyeOffset[0])}${range('eyeY','Eye vertical',-.15,.15,.001,f.eyeOffset[1])}${range('eyeZ','Eye depth',-.15,.15,.001,f.eyeOffset[2])}${range('eyeScale','Eye size',.5,1.8,.01,f.eyeScale)}</details>
      ${range('pose','Movement strength',0,1,.05,f.pose)}
      <div class="cal-actions"><button data-do="undo" ${history.length?'':'disabled'}>Undo</button><button data-do="reset-suit">Reset suit</button><button data-do="reset-hall">Reset hall</button></div>
      <div class="cal-actions"><button data-do="sound">Preview sound</button><button data-do="save" class="cal-save">Save calibration</button></div><p data-message role="status">${esc(note)}</p><small class="cal-budget"></small>`;
  }
  function marker(key,label,x,y,w,h,kind='box'){const n=document.createElement('div');n.className='cal-mark cal-'+kind;n.dataset.mark=key;n.setAttribute('aria-label',label);Object.assign(n.style,{left:x+'px',top:y+'px',width:w+'px',height:h+'px'});n.innerHTML=`<span>${esc(label)}</span>${kind==='box'?'<button data-resize aria-label="Resize '+esc(label)+'">↘</button>':''}`;layer.append(n);}
  function drawMarkers(){if(!active)return;const m=map();if(!m)return;layer.innerHTML='';
    if(eyeMode){for(const [i,p]of (suits()?.eyeHandles?.(id)||[]).entries())marker('eye'+i,'Eye '+(i+1),p.x-8,p.y-8,16,16,'eye');return;}
    const f=fields(),[x0,y0,x1,y1]=f.bounds,[lx,ly,lw]=f.label;marker('pod','Pod / drag or resize',m.x+x0*m.w,m.y+y0*m.h,(x1-x0)*m.w,(y1-y0)*m.h);
    marker('label','Suit label',m.x+(lx-lw/2)*m.w,m.y+ly*m.h-19,lw*m.w,38,'label');
    const[x,y,w,h]=fullHologram();marker('hologram','Centre hologram',m.x+(x-w/2)*m.w,m.y+(y-h/2)*m.h,w*m.w,h*m.h);
    const[cx,cy,cw]=fullCentre();marker('centre','Centre label',m.x+(cx-cw/2)*m.w,m.y+cy*m.h-19,cw*m.w,38,'label');
  }
  panel.addEventListener('change',e=>{if(e.target.matches('select')){id=e.target.value;if(eyeMode)suits()?.inspect?.(id);drawControls();drawMarkers();return;}const k=e.target.dataset.field;if(!k)return;change(()=>{const r=row();if(k.startsWith('eye')&&k!=='eyeScale'){r.eyeOffset=[...fields().eyeOffset];r.eyeOffset[{eyeX:0,eyeY:1,eyeZ:2}[k]]=Number(e.target.value);}else r[k]=Number(e.target.value);});});
  panel.addEventListener('input',e=>{if(e.target.type==='range')e.target.nextElementSibling.textContent=Number(e.target.value).toFixed(.001===Number(e.target.step)?3:2);});
  panel.addEventListener('click',async e=>{const action=e.target.closest('[data-do]')?.dataset.do;if(!action)return;
    if(action==='close')return close();if(action==='undo'){const previous=history.pop();if(previous){draft=previous;apply(draft);drawControls();}return;}
    if(action==='eyes'){eyeMode=!eyeMode;suits()?.inspect?.(eyeMode?id:null);drawControls();drawMarkers();return;}
    if(action==='pose'){suits()?.previewEntry?.(id);return;}
    if(action==='sound'){window.dispatchEvent(new CustomEvent('jarvis-mechanical-preview',{detail:{theme}}));return;}
    if(action==='reset-suit')return change(()=>{delete draft.bays[id];});
    if(action==='reset-hall')return change(()=>{draft={bays:{}};});
    if(action==='save'){try{saved=await J.call('hall-calibration-save',{theme,patch:validateHallCalibration(theme,draft)});message('Saved. Your calibrated layout will load next time.');}catch(error){message('Could not save: '+error.message);}}
  });
  layer.addEventListener('pointerdown',e=>{const mark=e.target.closest('[data-mark]');if(!mark)return;e.preventDefault();const m=map();if(!m)return;const f=fields(),p=suits()?.eyeHandles?.(id)?.[0];drag={key:mark.dataset.mark,resize:!!e.target.closest('[data-resize]'),x:e.clientX,y:e.clientY,m,before:clone(draft),f,hol:fullHologram().slice(),centre:fullCentre().slice(),eyePixels:p?.pixelsPerUnit||m.h*.4,pointer:e.pointerId};layer.setPointerCapture(e.pointerId);});
  layer.addEventListener('pointermove',e=>{if(!drag)return;const d=drag,dx=(e.clientX-d.x)/d.m.w,dy=(e.clientY-d.y)/d.m.h;draft=clone(d.before);const r=row();
    if(d.key==='pod'){let[x0,y0,x1,y1]=d.f.bounds;if(d.resize){x1=clamp(x1+dx,x0+.025,1);y1=clamp(y1+dy,y0+.08,1);}else{const x=clamp(dx,-x0,1-x1),y=clamp(dy,-y0,1-y1);x0+=x;x1+=x;y0+=y;y1+=y;}r.bounds=[x0,y0,x1,y1];}
    if(d.key==='label')r.label=[clamp(d.f.label[0]+dx,0,1),clamp(d.f.label[1]+dy,0,1),d.f.label[2]];
    if(d.key==='centre')draft.centreLabel=[clamp(d.centre[0]+dx,0,1),clamp(d.centre[1]+dy,0,1),d.centre[2]];
    if(d.key==='hologram'){let[x,y,w,h]=d.hol;if(d.resize){w=clamp(w+dx*2,.05,Math.min(x,1-x)*2);h=clamp(h+dy*2,.05,Math.min(y,1-y)*2);}else{x=clamp(x+dx,w/2,1-w/2);y=clamp(y+dy,h/2,1-h/2);}draft.hologram=[x,y,w,h];}
    if(d.key.startsWith('eye'))r.eyeOffset=[clamp(d.f.eyeOffset[0]+(e.clientX-d.x)/d.eyePixels,-.15,.15),clamp(d.f.eyeOffset[1]-(e.clientY-d.y)/d.eyePixels,-.15,.15),d.f.eyeOffset[2]];
    apply(draft);
  });
  function finishDrag(){if(!drag)return;history.push(drag.before);if(history.length>40)history.shift();drag=null;drawControls();drawMarkers();message('Preview only — save to keep these changes.');}
  layer.addEventListener('pointerup',finishDrag);layer.addEventListener('pointercancel',()=>{if(drag){draft=drag.before;drag=null;apply(draft);drawControls();}});
  const key=e=>{if(active&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}};addEventListener('keydown',key,true);
  function sync(){const s=suits(),h=hall();if(!s?.baseStage||!h||s.theme!==h.theme?.id)return;
    if(lastStage!==s.baseStage||lastHall!==h||lastModules!==h.modules){if(active)close(false);lastStage=s.baseStage;theme=s.theme;original={theme:clone(h.theme),modules:clone(h.modules)};apply(saved.themes?.[theme]||{});}
    if(!document.querySelector('[data-cal-open]')){const bar=document.querySelector('.qp-icons');if(bar){trigger=document.createElement('button');trigger.className='qp-ico';trigger.dataset.calOpen='';trigger.type='button';trigger.title='Calibrate halls, suits and holograms';trigger.setAttribute('aria-label',trigger.title);trigger.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 7h18M3 17h18M8 3v8M16 13v8"/><circle cx="8" cy="7" r="2"/><circle cx="16" cy="17" r="2"/></svg>';trigger.onclick=open;bar.append(trigger);}}
  }
  let lastDraw=0;function animate(now){if(active&&now-lastDraw>100){lastDraw=now;drawMarkers();const label=panel.querySelector('.cal-budget'),b=suits()?.budget;if(label&&b)label.textContent=`${b.quality.toUpperCase()} · ${b.fps} FPS · ${b.quiet?'STILL':'ANIMATED'}`;}frame=requestAnimationFrame(animate);}
  J.call('hall-calibration-get').then(value=>{if(value?.version===1)saved=value;loading=false;sync();}).catch(()=>{loading=false;});loading=true;
  timer=setInterval(()=>{if(!loading)sync();},500);frame=requestAnimationFrame(animate);
  addEventListener('resize',drawMarkers);addEventListener('pagehide',()=>{clearInterval(timer);cancelAnimationFrame(frame);removeEventListener('keydown',key,true);removeEventListener('resize',drawMarkers);panel.remove();layer.remove();});
}
