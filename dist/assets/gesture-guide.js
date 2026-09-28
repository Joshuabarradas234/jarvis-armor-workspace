/* Persistent help; opening this guide never starts the camera. */
const J=globalThis.window?.jarvis,view=new URLSearchParams(globalThis.location?.search||'').get('view')||'main';
export const GESTURES=[
 ['🤏','Click or grab','Bring your thumb and index fingertip together over a button or suit, then separate them to click. Keep them together while moving to drag a floating panel or idea.','One hand · aim with the on-screen ring'],
 ['✋','Hover to click','With an open hand, keep the ring on a suit, tab or button for 1.3 seconds. The ring fills before it clicks.','Optional · switch Hover to click on or off in Hand settings'],
 ['✋ → ✊','Back to the hall','Show an open hand, then close it into a fist within about a second. If the Globe is open, this closes the Globe first.','One hand · returns from the suit'],
 ['↔','Change hall','Sweep an open hand left for the next hall, or right for the previous hall.','With the Globe open, this spins the Earth instead'],
 ['↕','Scroll a page','Aim at the page and sweep an open hand up to scroll down; sweep down to scroll up.','With the Globe open, up zooms in and down zooms out'],
 ['🤏 ↔ 🤏','Zoom with two hands','Pinch with both hands. Move them apart to zoom in, or bring them together to zoom out.','Globe or Ideas room only · not ordinary web pages'],
 ['✋','Start or stop Focus','Hold one upright, flat palm still with your fingers spread for 2 seconds. A ring fills before the 25-minute focus session starts or stops.','Move your hand away before the ring fills to cancel'],
 ['🙏','Stand down','Bring both hands together in a prayer shape and hold for about 0.8 seconds.','Hides the workspace · background JARVIS services keep running'],
 ['🤏 ↓','Send a floating page to the Deck','Grab a floating page by its title bar and flick down. On the lower Deck, grab it and flick up to send it back.','Requires a Control Deck below the main display · suit tabs use the steps above']
];
if(J&&['main','console'].includes(view)){
 let panel=null,previous=null,restoreTabs=false,opening=false;
 const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 async function close(){const restore=restoreTabs;restoreTabs=false;panel?.remove();panel=null;if(restore)await J.call('tabs-show',true).catch(()=>{});const target=previous?.isConnected?previous:document.querySelector('.hx-set,[data-guide]');target?.focus();}
 async function show(){
  if(panel||opening)return;opening=true;previous=document.activeElement;
  try{
   window.__jarvisScreens?.cancel();
   restoreTabs=view==='main'&&!!await J.call('tabs-state').catch(()=>false);
   if(restoreTabs)await J.call('tabs-show',false);
   panel=document.createElement('section');panel.className='wt-guide hg-guide';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','hg-title');
   panel.innerHTML='<header><div><small>HANDS / QUICK REFERENCE</small><h2 id="hg-title">Hand gesture guide</h2><p>Keep this open while you learn. You control when the camera starts.</p></div><button type="button" data-hg-close aria-label="Close hand gesture guide">Close</button></header><div class="hg-body"><p class="hg-start">To begin: select <strong>HANDS ON</strong>, keep your hand in view and use <strong>Hand settings ⚙ → Calibrate my reach</strong> if the ring is hard to aim. Opening this guide does not turn on the camera.</p><section class="hg-throw"><h3>Move a suit tab to another screen</h3><p>Use a steady grab and release. You do not need to throw your hand quickly.</p><ol class="hg-steps"><li><strong>1 · Pinch the tab title</strong><span>Point at its name in the suit’s tab strip. Hold thumb and index together for at least half a second.</span></li><li><strong>2 · Move towards the screen</strong><span>Keep pinching and move left, right, up or down. Watch the top of JARVIS for “Release to move to Screen …”.</span></li><li><strong>3 · Release the pinch</strong><span>Separate your fingers after the destination appears. The same live page opens on that screen.</span></li></ol><p class="hg-display" role="status" data-hg-displays></p><p class="hg-note">No destination means no move. Press <kbd>Esc</kbd> to cancel a grab; losing hand tracking for more than 0.7 seconds also cancels it. Closing the separate tab window returns it to its suit.</p><p class="hg-note">Mouse alternative: right-click a suit tab, or press <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>M</kbd>. This moves JARVIS tabs only. Screen numbers follow JARVIS’s left-to-right, then top-to-bottom order.</p><div class="hg-actions"><button type="button" data-hg-screens>Choose a screen with the mouse</button></div></section><div class="wt-catalogue">'+GESTURES.map(([symbol,title,how,scope])=>'<article><div class="hg-gesture"><span class="hg-symbol" aria-hidden="true">'+esc(symbol)+'</span><h3>'+esc(title)+'</h3></div><p>'+esc(how)+'</p><small>'+esc(scope)+'</small></article>').join('')+'</div></div>';
   document.body.append(panel);const current=panel,screenButton=panel.querySelector('[data-hg-screens]');screenButton.hidden=view!=='main';
   panel.querySelector('[data-hg-close]').onclick=close;
   screenButton.onclick=async()=>{await close();await window.__jarvisScreens?.show();};
   panel.querySelector('[data-hg-close]').focus();
   const status=panel.querySelector('[data-hg-displays]');status.textContent='Checking connected screens…';
   J.call('tabs-displays').then(screens=>{if(panel!==current)return;status.textContent=screens.length>1?screens.length+' screens connected. '+screens.map(s=>s.label+(s.current?' (this screen)':'')).join(' · '):'One screen connected. Connect another display to move tabs between screens.';}).catch(()=>{if(panel===current)status.textContent='Could not check displays. Open the guide again to retry.';});
  }catch(e){await close();throw e;}finally{opening=false;}
 }
 const key=e=>{if(!panel)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}else if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button:not([hidden]):not(:disabled)')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}};
 addEventListener('keydown',key,true);window.__jarvisGestureGuide={show,close,get isOpen(){return !!panel;}};
 addEventListener('pagehide',()=>{panel?.remove();panel=null;removeEventListener('keydown',key,true);});
}
