import {renderBudget} from './render-budget.js';
/* Consistent control glyphs and a quiet, lifecycle-aware ambient hologram. */
const paths={
  settings:'<path d="m9 3-.7 2.1-2 .9-2-.4-1.6 2.8 1.4 1.6v2.3l-1.4 1.6 1.6 2.8 2-.4 2 .9.7 2.1h3.2l.7-2.1 2-.9 2 .4 1.6-2.8-1.4-1.6V10l1.4-1.6-1.6-2.8-2 .4-2-.9L12.2 3Z"/><circle cx="10.6" cy="11.1" r="3"/>',
  power:'<path d="M12 3v8M6.3 5.7a8 8 0 1 0 11.4 0"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  up:'<path d="M12 20V6m-6 6 6-6 6 6M4 3h16"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c5 5 5 13 0 18-5-5-5-13 0-18Z"/>',
  picture:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 4-7 5 8"/>',
  systems:'<path d="M3 13h4l3-8 4 14 3-6h4"/>',
  sound:'<path d="m4 9 4 0 5-4v14l-5-4H4ZM17 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  muted:'<path d="m4 9 4 0 5-4v14l-5-4H4Zm13 0 5 6m0-6-5 6"/>',
};
const icon=name=>`<svg class="ui-glyph" data-ui-icon="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;

export function shouldPauseAmbient({hidden=false,reduced=false,still=false,covered=false,state='ARMOR_HALL'}={}){
  return hidden||reduced||still||covered||!['ARMOR_HALL','SUIT_HOVER'].includes(state);
}

if(typeof document!=='undefined'){
  const motion=matchMedia('(prefers-reduced-motion: reduce)');let pending=0,settings={},status={};
  const off=[];if(window.jarvis){off.push(window.jarvis.on('settings',v=>{settings=v;queue();}),window.jarvis.on('status',v=>{status=v;queue();}));window.jarvis.call('bootstrap').then(b=>{settings=b.settings||{};status=b.status||{};queue();}).catch(()=>{});}
  function paint(node,name){if(node&&!node.querySelector(`[data-ui-icon="${name}"]`))node.innerHTML=icon(name);}
  function decorate(){
    for(const [selector,name,label] of [
      ['button[data-action="settings"]','settings','Open settings'],
      ['button[data-action="standdown"]','power','Stand down'],
      ['button.hx-set','settings','Hand settings'],
      ['button[data-ix="cfg"]','settings','Idea settings'],
      ['button.jc-x,button.tw-x,button.ix-x,button.bf-x','close','Close'],
    ])for(const b of document.querySelectorAll(selector)){paint(b,name);if(!b.getAttribute('aria-label'))b.setAttribute('aria-label',label);if(!b.title)b.title=label;}
    const names={arrange:'grid',up:'up',earth:'globe',backdrop:'picture',systems:'systems'};
    for(const b of document.querySelectorAll('.dk-dock [data-dk]')){
      const key=b.dataset.dk,name=key==='sound'?(b.classList.contains('off')?'muted':'sound'):names[key];
      if(name)paint(b.querySelector('i'),name);
    }
  }
  function media(){
    const root=document.querySelector('.image-hall');if(!root)return;
    const budget=renderBudget(settings,status,{reduced:motion.matches});
    const paused=shouldPauseAmbient({hidden:document.hidden,reduced:motion.matches,still:budget.quiet||root.classList.contains('still'),state:root.dataset.state,covered:!!document.querySelector('.jc.in,.tw.in,.ix-room.in,.gx.in')});
    for(const v of root.querySelectorAll('.hall-overlay .ov-vid')){
      v.playbackRate=budget.videoRate;
      if(paused||v.closest('.has-vehicle-hologram')){if(!v.paused)v.pause();}
      else if(v.paused&&v.readyState>=2&&!v.error)v.play()?.catch(()=>{});
    }
  }
  function refresh(){pending=0;decorate();media();}
  function queue(){if(!pending)pending=requestAnimationFrame(refresh);}
  const observer=new MutationObserver(changes=>{
    if(changes.some(m=>m.type==='childList'||m.oldValue!==m.target.getAttribute(m.attributeName)))queue();
  });
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-state'],attributeOldValue:true});
  const onVideo=e=>{if(e.target.matches?.('.hall-overlay .ov-vid'))media();};
  document.addEventListener('play',onVideo,true);document.addEventListener('loadeddata',onVideo,true);
  document.addEventListener('visibilitychange',media);motion.addEventListener('change',media);refresh();
  addEventListener('pagehide',()=>{observer.disconnect();for(const f of off)f?.();cancelAnimationFrame(pending);document.removeEventListener('play',onVideo,true);document.removeEventListener('loadeddata',onVideo,true);document.removeEventListener('visibilitychange',media);motion.removeEventListener('change',media);});
}
