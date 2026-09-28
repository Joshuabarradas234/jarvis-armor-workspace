const J=globalThis.window?.jarvis;
export const CAPABILITIES=[
 ['suits','Suit workspaces','Keep project links, apps, files, tasks and notes together. Click a suit, then configure it in Settings.','settings','Ready locally'],
 ['screens','Tabs across screens','Move a JARVIS tab to Screen 2 or 3 without reloading. Right-click its tab for a screen picker, or hold a pinch on its title, move towards a screen and release.','screens','Extra displays; webcam for gestures'],
 ['tower','Agent teams','Give a Tower floor a complete brief. A lead plans, specialists work, and a reviewer requests corrections before any handoff.','tower','Claude API key or Claude Code; otherwise rehearsal'],
 ['workflows','Reusable workflows and results','Accept useful Tower results, save their briefs and examples, and compare rework, time and estimated cost in Results & workflows.','results','Accepted real Tower results'],
 ['think','Think and saved ideas','Keep ideas tied to a suit or to JARVIS. Ask for a plan, approve work, then review code before applying it. Local suggestions never run work on their own.','think','Planning needs Claude; app builds need Claude Code and a source repo'],
 ['core','JARVIS Core and approvals','Chat with JARVIS, inspect what needs you, review proposed actions, reports and standing orders. Sending and code updates keep their approval checks.','core','Configure JARVIS Core in Settings'],
 ['phone','Phone and messages','Optional WhatsApp, SMS and calls through configured providers. Delivery uses outbound connections. SMS cannot approve actions.','settings','Provider account and setup; provider charges may apply'],
 ['mail','Email desk','Sort mail, prepare replies and review drafts before sending.','core','Configured mail account; approval required to send'],
 ['calendar','Calendar, tasks and reminders','Save appointments and to-dos, get a daily briefing, and schedule reminders.','calendar','Local tools; voice and phone reminders need setup'],
 ['focus','Focus sessions','Use a timed focus session and return to your work with fewer distractions.','settings','Ready locally'],
 ['meetings','Meeting notes','Capture meetings and prepare notes. Review recipients and text before sharing.','meeting','Microphone permission and transcription setup'],
 ['globe','Globe and weather','Explore places and weather in the globe.','globe','Internet for maps and weather'],
 ['hands','Voice and hand controls','Open suits by name, navigate with a pinch, scroll, zoom, and move tabs. Camera tracking stays on this computer.','settings','Microphone/webcam permission; Hands enabled'],
 ['visuals','Halls, glass and holograms','Three halls, suit entry effects, opening glass, cold mist and a rotating Batmobile. Quality and reduced-motion settings govern the effects.','settings','3D assets installed; animations enabled for mist'],
 ['calibration','Advanced visual calibration','Fine-tune pod fit, labels, eye positions and the centre hologram. Preview before saving.','calibration','Open the hall first'],
 ['maintenance','Updates, backups and diagnostics','Check for updates, export settings, inspect health, and restart without self-updates if needed.','settings','Update installation needs a restart']
];
if(J&&(new URLSearchParams(location.search).get('view')||'main')==='main'){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let panel,trigger,previous,shownTabs=false;
 function close(){panel?.remove();panel=null;if(shownTabs)J.call('tabs-show',true).catch(()=>{});shownTabs=false;previous?.focus?.();}
 async function action(id){close();
  if(id==='settings')await J.call('action',{action:'settings'});
  else if(id==='tower'||id==='results'){await window.__jarvisTower?.show();if(id==='results'){window.__jarvisTower.tab='results';window.__jarvisTower.renderFloor();}}
  else if(id==='think')window.__jarvisIdeas?.show();
  else if(id==='core')window.__jarvisCore?.show();
  else if(id==='calibration')window.__jarvisCalibration?.open();
  else if(id==='screens')window.__jarvisScreens?.show();
  else document.querySelector({meeting:'[data-meeting]',globe:'[data-globe]',calendar:'[data-qp="cal"]'}[id])?.click();
 }
 async function show(){if(panel)return;previous=document.activeElement;shownTabs=await J.call('tabs-state').catch(()=>false);if(shownTabs)await J.call('tabs-show',false);panel=document.createElement('section');panel.className='wt-guide';panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','What JARVIS can do');
  panel.innerHTML='<header><div><small>START HERE</small><h2>What JARVIS can do</h2><p>Choose a feature to see what it does and what it needs.</p></div><button data-close aria-label="Close guide">×</button></header><input type="search" aria-label="Find a feature" placeholder="Search features: email, screens, agents…"><div class="wt-catalogue"></div>';
  document.body.append(panel);const render=q=>{panel.querySelector('.wt-catalogue').innerHTML=CAPABILITIES.filter(row=>row.join(' ').toLowerCase().includes(q.toLowerCase())).map(([id,title,description,go,needs])=>`<article><h3>${esc(title)}</h3><p>${esc(description)}</p><small>${esc(needs)}</small><button data-guide-action="${go}">Open ${esc(title)}</button></article>`).join('')||'<p>No matching features. Try “tasks” or “screens”.</p>';};render('');panel.querySelector('input').oninput=e=>render(e.target.value);
  panel.onclick=e=>{if(e.target.closest('[data-close]'))close();const go=e.target.closest('[data-guide-action]')?.dataset.guideAction;if(go)action(go).catch(()=>{});};panel.querySelector('input').focus();
 }
 const key=e=>{if(!panel)return;if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();}if(e.key==='Tab'){const nodes=[...panel.querySelectorAll('button,input')],a=nodes[0],b=nodes.at(-1);if(e.shiftKey&&document.activeElement===a){e.preventDefault();b.focus();}else if(!e.shiftKey&&document.activeElement===b){e.preventDefault();a.focus();}}};addEventListener('keydown',key,true);
 async function suggestions(){const box=document.querySelector('.ix-actions');if(!box||box.querySelector('[data-suggest-control]'))return;const b=document.createElement('button');b.dataset.suggestControl='';b.title='Local JARVIS activity only. At most two ideas per day; no automatic spending or changes.';box.prepend(b);let state=await J.call('work-suggestions');const paint=()=>{b.textContent='Suggestions: '+(state.enabled?'on':'off');b.setAttribute('aria-pressed',String(state.enabled));};paint();b.onclick=async()=>{b.disabled=true;try{state=await J.call('work-suggestions-config',{enabled:!state.enabled});paint();}finally{b.disabled=false;}};}
 const sync=()=>{const bar=document.querySelector('.qp-icons');if(bar&&!bar.querySelector('[data-guide]')){trigger=document.createElement('button');trigger.className='qp-ico';trigger.dataset.guide='';trigger.type='button';trigger.textContent='?';trigger.title='What JARVIS can do';trigger.setAttribute('aria-label',trigger.title);trigger.onclick=show;bar.append(trigger);}suggestions().catch(()=>{});};
 const timer=setInterval(sync,700);sync();window.__jarvisGuide={show,close};addEventListener('pagehide',()=>{clearInterval(timer);removeEventListener('keydown',key,true);});
}
