import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
export async function check({win,js,call,sleep,until,out}){
 const results=[];
 const fingerprint=id=>js(`(async()=>{const b=window.__jarvisSuits.bays.get('${id}'),meshes=[];b.model.traverse(m=>{if(m.isMesh)meshes.push(m);});return{skinned:meshes.some(m=>m.isSkinnedMesh),vertices:await Promise.all(meshes.map(async m=>[m.name,Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',m.geometry.attributes.position.array))).join(',')]))};})()`);const save=(name,v)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(v,null,2));
 await js(`window.__videoErrors=[];document.addEventListener('error',e=>{if(e.target.tagName==='VIDEO')window.__videoErrors.push({src:e.target.currentSrc,error:e.target.error?.message});},true);true;`);
 // Probe the actual Web Audio output without a microphone or changes to shipped code.
 await js(`window.__audioCheck={contexts:[],sources:0,peak:0};window.AudioContext=class extends AudioContext{constructor(...args){super(...args);const a=this.createAnalyser();a.fftSize=1024;const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(dest,...rest){if(dest===a.context.destination){connect.call(this,a);dest=a.context.destination;}return connect.call(this,dest,...rest);};const wave=new Float32Array(1024);const sample=()=>{a.getFloatTimeDomainData(wave);for(const n of wave)window.__audioCheck.peak=Math.max(window.__audioCheck.peak,Math.abs(n));requestAnimationFrame(sample);};sample();window.__audioCheck.contexts.push(this);}createBufferSource(){window.__audioCheck.sources++;return super.createBufferSource();}createOscillator(){window.__audioCheck.sources++;return super.createOscillator();}};true;`);
 for(const [theme,ids,hero]of [['ironman',['im1','im2','im3','im4','im5','im6','im7'],'im6'],['batcave',['bc1','bc2','bc3','bc8','bc5','bc6','bc7'],'bc3'],['spiderman',['sm1','sm2','sm3','sm4','sm5','sm6','sm7'],'sm4']]){
  if(theme!=='ironman')await call('action',{action:'theme',id:theme});
  if(theme==='ironman')await call('action',{action:'debug-hall'});
  else {await until(()=>js(`!!document.querySelector('.hall-transition')`),10000);await until(()=>js(`document.querySelector('.hall-transition video')?.currentTime>.2`),20000);if(theme==='spiderman')await js(`document.querySelector('#skip-btn')?.click();true;`);await until(()=>js(`!document.querySelector('.hall-transition')`),90000);}
  await until(()=>js(`window.__jarvisSuits?.theme===${JSON.stringify(theme)}&&window.__jarvisSuits.bays.size===7&&[...window.__jarvisSuits.bays.values()].every(b=>b.ready)`));
  await sleep(2200);fs.writeFileSync(path.join(out,theme+'-overview.png'),(await win.webContents.capturePage()).toPNG());
  for(const id of ids){
   const geometry=await fingerprint(id);assert.equal(geometry.skinned,false);
   await call('action',{action:'select',id});await sleep(1750);
   const state=await js(`(()=>{const s=window.__jarvisSuits,b=s.bays.get('${id}'),r=document.querySelector('.image-hall');return {id:b.id,state:s.snap.state,ready:b.ready,rig:b.rig?.kind,reactorRing:b.reactorRing?{on:b.reactorRing.visible,opacity:b.reactorRing.material.opacity}:null,signature:b.signature?{visible:b.signature.visible,opacity:b.signature.material.uniforms.opacity.value}:null,eyes:b.eyes.map(e=>({on:e.visible,opacity:e.material.opacity})),door:b.doors.leaves[0].leaf.position.x,rotation:b.pivot.rotation.toArray(),zoom:Number(r.style.getPropertyValue('--zoom-scale')),still:r.classList.contains('still'),battery:s.status.onBattery,audio:{peak:window.__audioCheck.peak,sources:window.__audioCheck.sources,states:window.__audioCheck.contexts.map(c=>c.state)},hologramPaused:document.querySelector('.ov-vid').paused}})()`);
   state.eyePixels=await js(fs.readFileSync(new URL('./eye-pixels.js',import.meta.url),'utf8').replace('export async function','async function')+'\nmeasureEyes('+JSON.stringify(id)+')');
   assert.deepEqual(await fingerprint(id),geometry,'Static model vertices must survive entry unchanged');assert.equal(state.rig,undefined);
   results.push(state);save('entries',results);console.log('ENTRY',id,JSON.stringify(state));
   assert.equal(state.still,false);assert.equal(state.state,'SUIT_SELECTED');assert.ok(state.door<-.7);assert.ok(state.eyes.every(e=>e.on&&e.opacity>.8));assert.ok(state.zoom>1.5);assert.ok(Math.abs(state.rotation[1])>.08);assert.ok(state.audio.peak>.002);assert.equal(state.hologramPaused,true);if(theme==='ironman'){assert.equal(state.reactorRing.on,true);assert.ok(state.reactorRing.opacity>.5);}if(theme!=='ironman'){assert.equal(state.signature.visible,true);assert.ok(state.signature.opacity>.1);}
   assert.ok(state.eyePixels.visible.pixels>50,'Eye surfaces must produce visible lit pixels');
   if(id===hero)fs.writeFileSync(path.join(out,theme+'-entry.png'),(await win.webContents.capturePage()).toPNG());
   await call('action',{action:'home'});await until(()=>js(`window.__jarvisSuits.snap.state==='ARMOR_HALL'&&window.__jarvisSuits.bays.get('${id}').doors.leaves[0].leaf.position.x===-.25`));
   const reset=await js(`(()=>{const s=window.__jarvisSuits,b=s.bays.get('${id}');return {state:s.snap.state,door:b.doors.leaves[0].leaf.position.x,eyes:b.eyes.every(e=>!e.visible),rotation:b.pivot.rotation.x}})()`);
   assert.equal(reset.state,'ARMOR_HALL');assert.equal(reset.door,-.25);assert.equal(reset.eyes,true);assert.equal(reset.rotation,0);
  }
  console.log('HALL_OK',theme);
 }
 await call('settings',{animations:false});await call('action',{action:'select',id:'sm4'});await sleep(500);
 const reduced=await js(`(()=>{const s=window.__jarvisSuits,b=s.bays.get('sm4');return{quiet:s.budget.quiet,door:b.doors.leaves[0].leaf.position.x,rotation:b.pivot.rotation.toArray(),eyes:b.eyes.every(e=>e.visible)}})()`);save('reduced-motion',reduced);assert.equal(reduced.quiet,true);assert.ok(reduced.rotation.slice(0,3).every(n=>n===0));assert.equal(reduced.door,-.82);assert.equal(reduced.eyes,true);
 await call('action',{action:'home'});await until(()=>js(`window.__jarvisSuits.snap.state==='ARMOR_HALL'`));await call('settings',{animations:true,master:0});
 await js('window.__audioCheck.peak=0');await call('action',{action:'select',id:'sm5'});await sleep(500);assert.equal(await js('window.__audioCheck.peak'),0);
 console.log('REDUCED_AND_MUTE_OK');
 const videoErrors=await js('window.__videoErrors');save('video-errors',videoErrors);assert.deepEqual(videoErrors,[]);
}
