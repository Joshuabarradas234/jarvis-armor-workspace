import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
export async function check({win,js,call,sleep,until,out}){
 const results=[],save=()=>fs.writeFileSync(path.join(out,'mist-results.json'),JSON.stringify(results,null,2));
 await call('action',{action:'debug-hall'});
 for(const hall of ['ironman','batcave','spiderman']){
  if(hall!=='ironman'){await call('action',{action:'theme',id:hall});await until(()=>js(`document.querySelector('#skip-btn')?.classList.contains('on')`));await js(`document.querySelector('#skip-btn').click();true;`);await until(()=>js(`document.body.dataset.theme==='${hall}'&&!document.querySelector('.hall-transition')`));}
  await until(()=>js(`window.__jarvisSuits?.theme==='${hall}'&&window.__jarvisSuits.bays.size===7&&[...window.__jarvisSuits.bays.values()].every(b=>b.ready)`));
  await js(`(async()=>{window.__mistThree=await import('jarvis://app/vendor/three/three.module.min.js');return true;})()`);
  const ids=await js(`[...window.__jarvisSuits.bays.keys()]`);
  for(const [i,id]of ids.entries()){
   await call('action',{action:'select',id});await sleep(480);
   const effect=await js(`(()=>{const T=window.__mistThree,s=window.__jarvisSuits,b=s.bays.get('${id}'),r=s.renderer,was=b.mist.root.visible,target=new T.WebGLRenderTarget(256,512),pictures=[];r.setRenderTarget(target);r.setScissorTest(false);for(const visible of [true,false]){b.mist.root.visible=visible;r.clear();r.render(b.scene,b.camera);const a=new Uint8Array(256*512*4);r.readRenderTargetPixels(target,0,0,256,512,a);pictures.push(a);}b.mist.root.visible=was;r.setRenderTarget(null);r.setScissorTest(true);target.dispose();let pixels=0;for(let n=0;n<pictures[0].length;n+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(pictures[0][n+c]-pictures[1][n+c]);if(d>10)pixels++;}return{id:b.id,visible:was,clouds:b.mist.clouds.filter(c=>c.visible).length,quality:s.budget.quality,door:b.doors.leaves[0].leaf.position.x,pixels};})()`);
   results.push(effect);save();assert.equal(effect.visible,true);assert.ok(effect.clouds>=2);assert.ok(effect.pixels>30,'Mist must contribute visible rendered pixels');assert.ok(effect.door<-.25);
   if(i===2)fs.writeFileSync(path.join(out,hall+'-mist.png'),(await win.webContents.capturePage()).toPNG());
   await sleep(950);assert.equal(await js(`window.__jarvisSuits.bays.get('${id}').mist.root.visible`),false);
   await call('action',{action:'home'});await until(()=>js(`window.__jarvisSuits.snap.state==='ARMOR_HALL'&&window.__jarvisSuits.bays.get('${id}').doors.leaves[0].leaf.position.x===-.25`));
   assert.equal(await js(`[...window.__jarvisSuits.bays.values()].some(b=>b.mist.root.visible)`),false);
   console.log('MIST_OK',id,effect.pixels);
  }
 }
 await call('settings',{animations:false});await call('action',{action:'select',id:'sm4'});await sleep(500);assert.equal(await js(`window.__jarvisSuits.bays.get('sm4').mist.root.visible`),false);
 await call('action',{action:'home'});await until(()=>js(`window.__jarvisSuits.snap.state==='ARMOR_HALL'`));
 await call('settings',{animations:true,quality:'ultra',reduceOnBattery:false});await call('action',{action:'select',id:'sm4'});await sleep(450);assert.equal(await js(`window.__jarvisSuits.bays.get('sm4').mist.clouds.filter(c=>c.visible).length`),6);
 await call('action',{action:'home'});await sleep(100);assert.equal(await js(`window.__jarvisSuits.bays.get('sm4').mist.root.visible`),false);
 console.log('MIST_REDUCED_QUALITY_AND_CANCEL_OK');
}
