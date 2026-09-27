import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
export async function check({win,js,call,sleep,until,out}){
 const save=(name,value)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(value,null,2));
 const shot=async name=>fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
 async function theme(id){await call('action',{action:'theme',id});await until(()=>js(`document.querySelector('#skip-btn')?.classList.contains('on')`),15000);await js(`document.querySelector('#skip-btn').click();true;`);await until(()=>js(`document.body.dataset.theme==='${id}'&&!document.querySelector('.hall-transition')`),20000);}
 await call('action',{action:'debug-hall'});
 if(process.platform==='win32'){const listeners=JSON.parse(execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',`@(Get-NetTCPConnection -State Listen -OwningProcess ${process.pid} | Select-Object LocalAddress,LocalPort) | ConvertTo-Json -Compress`],{encoding:'utf8',windowsHide:true}));const rows=[].concat(listeners);assert.ok(rows.length===1&&rows.every(x=>x.LocalAddress==='127.0.0.1'));save('listeners',rows);console.log('LOOPBACK_ONLY_OK');}
 for(const hall of ['ironman','batcave','spiderman']){
  if(hall!=='ironman')await theme(hall);
  await until(()=>js(`window.__jarvisSuits?.theme==='${hall}'&&window.__jarvisSuits.bays.size===7&&[...window.__jarvisSuits.bays.values()].every(b=>b.ready)`));
  const board=await call('board',{theme:hall}),ids=board.filter(b=>!b.isVehicle).map(b=>b.id);
  for(const [i,id]of ids.entries())await call('board-save',{theme:hall,id,patch:{status:'running',progress:i*13}});
  await until(()=>js(`document.querySelectorAll('.mission-progress[data-status=running]').length===7`));
  const cards=await js(`Array.from(document.querySelectorAll('.mission-progress')).map(p=>({id:p.closest('[data-suit]').dataset.suit,text:p.querySelector('b').textContent,indeterminate:p.classList.contains('indeterminate'),width:p.getBoundingClientRect().width,height:p.getBoundingClientRect().height,mask:getComputedStyle(p.querySelector('.mission-track')).maskImage,barWidth:p.querySelector('.mission-track i').getBoundingClientRect().width}))`);
  save(hall+'-progress',cards);await shot(hall+'-progress');assert.equal(cards.length,7);assert.ok(cards.every(c=>c.width>60&&c.height>=20&&c.mask==='none'&&c.barWidth>0),JSON.stringify(cards));assert.equal(cards.find(c=>c.id===ids[0]).text,'Working');assert.equal(cards.find(c=>c.id===ids[3]).text,'Working · 39%');
  if(hall==='batcave'){
   await until(()=>js('window.__jarvisVehicle?.ready'),90000);await sleep(400);
   const first=await js('window.__jarvisVehicle.angle');await sleep(900);const second=await js('window.__jarvisVehicle.angle');assert.ok(second-first>.15);
   const state=await js(`(()=>{const s=window.__jarvisVehicle;return{size:s.size,scale:s.model.scale.toArray(),frames:s.frames,triangles:s.renderer.info.render.triangles,budget:s.budget,videoPaused:s.host.querySelector('video').paused,canvas:s.canvas.getBoundingClientRect().toJSON()}})()`);assert.ok(state.triangles>100000);assert.ok(state.canvas.width>600&&state.canvas.height>300);assert.equal(state.scale[0],state.scale[1]);assert.equal(state.scale[1],state.scale[2]);assert.equal(state.videoPaused,true);save('batmobile',state);
   await shot('batmobile-progress');
   await call('settings',{animations:false});await sleep(450);const held=await js('window.__jarvisVehicle.angle');await sleep(500);assert.equal(await js('window.__jarvisVehicle.angle'),held);await call('settings',{animations:true});await sleep(700);assert.ok(await js('window.__jarvisVehicle.angle')>held);
   await js(`document.querySelector('[data-tower]').click();true;`);await until(()=>js(`!!document.querySelector('.tw.in')`));await sleep(300);const covered=await js('window.__jarvisVehicle.frames');await sleep(600);assert.equal(await js('window.__jarvisVehicle.frames'),covered);await js(`document.querySelector('.tw-x').click();true;`);await until(()=>js('window.__jarvisVehicle.frames>'+covered));
   const vehicle=board.find(b=>b.isVehicle);await call('action',{action:'select',id:vehicle.id});await until(()=>js(`window.__jarvisSuits.snap.state==='MODULE'`));await sleep(200);const inModule=await js('window.__jarvisVehicle.frames');await sleep(400);assert.equal(await js('window.__jarvisVehicle.frames'),inModule);await call('action',{action:'home'});await until(()=>js('window.__jarvisVehicle.frames>'+inModule));
   console.log('BATMOBILE_OK');
  }else await shot(hall+'-progress');
  for(const id of ids)await call('board-save',{theme:hall,id,patch:{status:'idle',progress:0}});
  await until(()=>js(`document.querySelectorAll('.mission-progress').length===0`));
 }
 await theme('batcave');await until(()=>js('window.__jarvisVehicle?.ready'),90000);await sleep(400);assert.ok(await js('window.__jarvisVehicle.renderer.domElement.width')>500);
 // Exercise the actual centre-console HTTP routes and actual local child agents; no paid AI or real accounts.
 const deck=new URL(await call('deck-url',{theme:'batcave'}));assert.equal(deck.hostname,'127.0.0.1');
 const api=async(route,data)=>{const url=new URL(route,deck);url.search=deck.search;const r=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});const result=await r.json();assert.equal(r.status,200);return result;};
 for(const [id,pct]of [['bc1',42],['bc2',65]]){const file=path.join(out,id+'-agent.cjs');fs.writeFileSync(file,`console.log('LOG Local verification task');setTimeout(()=>console.log('PROGRESS ${pct}'),1600);setTimeout(()=>process.stdout.write('PROGRESS 100'),5000);`);await api('/api/bay',{id,patch:{status:'done',progress:100,tasks:[],agent:'node "'+file+'"'}});await api('/api/run',{id});}
 await until(()=>js(`['bc1','bc2'].every(id=>document.querySelector('.bay-label[data-suit="'+id+'"] .mission-progress')?.classList.contains('indeterminate'))`),1300);
 await until(()=>js(`document.querySelector('.bay-label[data-suit="bc1"] .mission-state b')?.textContent==='Working · 42%'&&document.querySelector('.bay-label[data-suit="bc2"] .mission-state b')?.textContent==='Working · 65%'`),4000);await shot('live-agents');
 await until(()=>js(`['bc1','bc2'].every(id=>document.querySelector('.bay-label[data-suit="'+id+'"] .mission-progress')?.dataset.status==='done')`),7000);
 const final=await call('board',{theme:'batcave'});assert.ok(final.filter(b=>['bc1','bc2'].includes(b.id)).every(b=>b.status==='done'&&b.progress===100));save('agent-results',final.map(({id,status,progress})=>({id,status,progress})));
 await api('/api/bay',{id:'bc3',patch:{status:'blocked',progress:33}});await until(()=>js(`document.querySelector('.bay-label[data-suit="bc3"] .mission-state b')?.textContent==='Needs attention'`));
 console.log('PROGRESS_21_SUITS_AND_REAL_AGENTS_OK');
}
