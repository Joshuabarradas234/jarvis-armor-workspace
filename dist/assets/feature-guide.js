const J=globalThis.window?.jarvis;
export const CAPABILITIES=[
 ['meeting-work','Meeting work','Match transcript-backed tasks to suits and Tower floors, save ideas and proposal drafts, and queue reviewed internal agent work.','meeting-work','Recorded meeting; complete briefs; Claude API for agent work; optional automatic start'],
 ['studio','Product Studio','Photograph a product or import a picture, describe a scene and request a reviewed five or ten second video. Save and preview clips locally.','studio','Separate Higgsfield API credentials and paid credits; every generation needs approval'],
 ['work','Work menu','Find your suits, tabs and tools with Ctrl+K. Use familiar browser shortcuts and optional shorter suit transitions.','work','Open a suit for tabs; switching suits restores addresses, not unsaved forms'],
 ['proposals','Proposal drafter','Turn your bullet points into an editable branded proposal or quote, then export a PDF for review. Missing prices and terms stay marked to confirm.','proposals','Your branding and Claude key; nothing is sent automatically'],
 ['files','Ask your files','Search a chosen Documents folder and answer with checked excerpts, file names and page or paragraph locations.','files','PDF, DOCX, TXT, Markdown or CSV; Claude key for answers'],
 ['voices','Voice personalities','JARVIS is dry and precise, Alfred formal and caring, Karen upbeat. Your installed voices and volume settings stay in use.','brand','Chat inside a hall; toggle in Work desk'],
 ['trophies','Trophy wall','Retire owner-accepted Tower projects to dated suit displays and export a local portfolio page.','trophies','A real reviewed result you accepted'],
 ['photos','Photo drop','Save WhatsApp receipts, whiteboards and business cards locally. Optional paid reading files expenses, contacts and evidenced to-dos.','photos','Connected WhatsApp; enable Claude photo reading if wanted'],
 ['voice-notes','WhatsApp voice notes','Send an Ogg voice note up to five minutes. JARVIS transcribes it and shows what he heard. Audio cannot approve requests.','routines','OpenAI key, paid transcription allowance and connected WhatsApp'],
 ['weekly','Sunday review','At 18:00 on Sunday, see accepted work, open tasks, recorded spend, email work and the coming week. Preview it without sending.','routines','JARVIS running; a working message provider'],
 ['travel','Travel mode','Confirm a destination and full dates. Wake-up calls follow its local time, with destination weather and alerts from matching flight emails.','travel','Approve the time changes; connect email for flight alerts'],
 ['self-releases','Automatic release packages','Approved self-updates produce a local update ZIP, code backup and plain-English release notes. Find them in Routines.','backups','An approved self-update; local exports are not GitHub publications'],
 ['reactions','Suit reactions','Hulkbuster turns red for an angry customer email. Mark One glows after a successful build or an approved update is packaged. Reduced motion uses steady lights.','routines','Suit models; connected email for customer reactions'],
 ['attention','Needs my attention','Review finished work, blocked tasks, approval requests and saved page briefs across all three halls.','attention','Ready locally'],
 ['pagework','Drop a tab onto a suit','Drag a tab title onto a suit in the destination tray. Review the page text, choose a team and set a budget before starting.','pagework','An open JARVIS tab; connected AI for real work'],
 ['snap','Snap windows into place','Drag a floating page title to a side or corner; release on the preview for half or quarter screen. Escape cancels. Detached tabs also have a layout picker.','screens','JARVIS floating pages and detached tabs'],
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
 ['meetings','Meeting notes','Record a call, save decisions and action items, add the actions to to-dos, then review its follow-up email. Supported call-ended screens finish recording; otherwise press End.','meeting','Microphone permission and transcription setup'],
 ['globe','Globe and weather','Explore places and weather in the globe.','globe','Internet for maps and weather'],
 ['hands','Voice and hand controls','See the hand signals for clicking, scrolling, focus and moving tabs. Voice controls are in Settings. Camera tracking stays on this computer.','gestures','Microphone/webcam permission; Hands enabled'],
 ['visuals','Halls, glass and holograms','Three halls, suit entry effects, opening glass, cold mist and a rotating Batmobile. Quality and reduced-motion settings govern the effects.','settings','3D assets installed; animations enabled for mist'],
 ['calibration','Advanced visual calibration','Fine-tune pod fit, labels, eye positions and the centre hologram. Preview before saving.','calibration','Open the hall first'],
 ['maintenance','Updates, backups and diagnostics','Nightly OneDrive settings backups at 02:00, recovery instructions, update checks and diagnostics. Missed backups catch up at launch.','settings','Update installation needs a restart']
];
if(J&&(new URLSearchParams(location.search).get('view')||'main')==='main'){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let panel,trigger,previous,shownTabs=false;
 async function close(){panel?.remove();panel=null;const restore=shownTabs;shownTabs=false;if(restore)await J.call('tabs-show',true).catch(()=>{});previous?.focus?.();}
 async function action(id){await close();
  if(id==='settings')await J.call('action',{action:'settings'});
  else if(id==='tower'||id==='results'){await window.__jarvisTower?.show();if(id==='results'){window.__jarvisTower.tab='results';window.__jarvisTower.renderFloor();}}
  else if(id==='think')window.__jarvisIdeas?.show();
  else if(['routines','travel','backups'].includes(id))window.__jarvisRoutines?.show(id==='routines'?'home':id);
  else if(['proposals','files','brand','trophies','photos'].includes(id))await window.__jarvisWorkDesk?.show(id);
  else if(id==='meeting-work')window.__jarvisMeetingWork?.show();
  else if(id==='studio')window.__jarvisProductStudio?.show();
  else if(id==='work')window.__jarvisWorkMenu?.show();
  else if(id==='core')window.__jarvisCore?.show();
  else if(id==='calibration')window.__jarvisCalibration?.open();
  else if(id==='attention')await window.__jarvisWorkbench?.show();
  else if(id==='pagework')await window.__jarvisWorkbench?.choose();
  else if(id==='screens')window.__jarvisScreens?.show();
  else if(id==='gestures')await window.__jarvisGestureGuide?.show();
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
