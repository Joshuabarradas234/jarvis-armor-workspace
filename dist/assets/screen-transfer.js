/** Screen geometry is in Electron DIP coordinates, so mixed DPI and negative origins work. */
export function throwTarget(displays,dx,dy,held){
 if(held<450||Math.hypot(dx,dy)<.16)return null;
 const here=displays.find(d=>d.current);if(!here?.bounds)return null;
 const centre=b=>({x:b.x+b.width/2,y:b.y+b.height/2}),a=centre(here.bounds),len=Math.hypot(dx,dy);
 return displays.filter(d=>!d.current&&d.bounds).map(d=>{const b=centre(d.bounds),x=b.x-a.x,y=b.y-a.y,dist=Math.hypot(x,y);return {d,dist,alignment:(x*dx+y*dy)/(dist*len)};}).filter(x=>x.alignment>.72).sort((a,b)=>b.alignment-a.alignment||a.dist-b.dist)[0]?.d||null;
}
const J=globalThis.window?.jarvis;
if(J&&(new URLSearchParams(location.search).get('view')||'main')==='main'){
 let drag=null,hint=null,menu=null,previous=null,wasShown=false,cancelled=false,hintTimer=0;
 const say=t=>{if(!hint){hint=document.createElement('div');hint.className='wt-throw-hint';hint.setAttribute('role','status');document.body.append(hint);}hint.textContent=t;};
 const clear=()=>{clearTimeout(hintTimer);hintTimer=0;drag=null;hint?.remove();hint=null;};
 const cancel=()=>{if(drag)cancelled=true;clear();};
 const report=e=>{say(e.message||String(e));hintTimer=setTimeout(()=>{if(!drag)clear();},3500);};
 function grab(id,x,y,now){clear();cancelled=false;const d={id,x,y,at:now,screens:[],target:null};drag=d;say('Hold the tab, move towards a screen, then release.');J.call('tabs-displays').then(s=>{if(drag===d)d.screens=s;}).catch(e=>{if(drag===d){cancel();report(e);}});}
 function move(x,y,now){if(!drag)return;drag.target=throwTarget(drag.screens,(x-drag.x)/innerWidth,(y-drag.y)/innerHeight,now-drag.at);say(drag.target?`Release to move to ${drag.target.label}`:drag.screens.length===1?'Only one screen connected — release to cancel':'Hold, move towards another screen, then release.');}
 function release(silent){if(!drag){const stopped=cancelled;cancelled=false;return stopped;}const d=drag,moved=!!d.target;clear();if(!silent&&moved)J.call('tabs-popout',{id:d.id,display:d.target.index,displayId:d.target.id}).then(ok=>{if(ok===false)throw Error('That tab has closed. Open a tab and try again.');}).catch(e=>{if(!drag)report(e);});return moved;}
 async function close(){menu?.remove();menu=null;if(wasShown)await J.call('tabs-show',true);wasShown=false;previous?.focus?.();}
 async function show(id){if(menu)return;if(window.__jarvisGestureGuide?.isOpen)await window.__jarvisGestureGuide.close();previous=document.activeElement;const [tabs,displays]=await Promise.all([J.call('tabs-list'),J.call('tabs-displays')]);wasShown=await J.call('tabs-state');if(wasShown)await J.call('tabs-show',false);
  menu=document.createElement('section');menu.className='wt-screen-menu';menu.setAttribute('role','dialog');menu.setAttribute('aria-modal','true');menu.setAttribute('aria-label','Move a JARVIS tab');
  const header=document.createElement('header'),title=document.createElement('h2'),exit=document.createElement('button');title.textContent='Move a JARVIS tab';exit.textContent='Close';exit.onclick=close;header.append(title,exit);menu.append(header);
  const text=document.createElement('p');text.textContent='Choose a tab and its destination. The same page stays open. Closing a separate window returns the tab to its suit. Screen numbers follow left-to-right, then top-to-bottom order.';menu.append(text);
  const select=document.createElement('select');select.setAttribute('aria-label','Tab to move');for(const tab of tabs){const o=document.createElement('option');o.value=tab.id;o.textContent=tab.title+(tab.popped?' (separate window)':'');o.selected=tab.id===(id||tabs.find(t=>t.active)?.id);select.append(o);}menu.append(select);
  if(!tabs.length)text.textContent='Open a suit and a web tab first. This moves JARVIS tabs; other applications keep their own windows.';
  const result=document.createElement('p');result.setAttribute('role','status');
  const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.disabled=!tabs.length;b.onclick=async()=>{b.disabled=true;try{if(await fn(select.value)===false)throw Error('That tab is no longer available. Close this list and try again.');await close();}catch(e){result.textContent=e.message;b.disabled=false;}};menu.append(b);};
  for(const d of displays)button(`${d.label}${d.current?' · this screen':''} · ${d.width} × ${d.height}`,id=>J.call('tabs-popout',{id,display:d.index,displayId:d.id}));
  button('Return to suit',id=>J.call('tabs-dock',id));menu.append(result);document.body.append(menu);select.focus();
 }
 const context=e=>{const tab=e.target.closest('.ws-tab[data-tab]');if(tab){e.preventDefault();e.stopPropagation();show(tab.dataset.tab).catch(e=>say(e.message));}};
 const key=e=>{if(e.key==='Escape'){if(menu||drag){e.preventDefault();e.stopImmediatePropagation();if(menu)close();cancel();}}else if(e.altKey&&e.shiftKey&&e.code==='KeyM'){e.preventDefault();show().catch(e=>say(e.message));}else if(menu&&e.key==='Tab'){const nodes=[...menu.querySelectorAll('button:not(:disabled),select')];if(e.shiftKey&&document.activeElement===nodes[0]){e.preventDefault();nodes.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===nodes.at(-1)){e.preventDefault();nodes[0].focus();}}};
 document.addEventListener('contextmenu',context,true);addEventListener('keydown',key,true);window.__jarvisScreens={show,grab,move,release,cancel,isDragging:()=>!!drag};
 addEventListener('pagehide',()=>{cancel();menu?.remove();document.removeEventListener('contextmenu',context,true);removeEventListener('keydown',key,true);});
}
