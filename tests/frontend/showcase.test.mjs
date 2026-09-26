import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {validateHallCalibration,calibratedStage,calibratedModules} from '../../dist/assets/hall-calibration-data.js';
import {HallCalibrationStore} from '../../src/services/hall-calibration.js';
import {renderBudget,fitSuit,suitRenderScale,watchRenderBudget} from '../../dist/assets/render-budget.js';
import {SourceTextModule,createContext} from 'node:vm';
import {mechanicalCues,mechanicalGain} from '../../dist/assets/mechanical-audio.js';
import {signaturePose} from '../../dist/assets/suit-rig.js';

test('calibration saves and reloads independently of the source artwork',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-calibration-'));
  try{const store=new HallCalibrationStore(dir),patch={bays:{im1:{bounds:[.04,.3,.14,.7],eyeOffset:[.002,-.003,.001],fill:.98}},hologram:[.5,.83,.3,.22]};
    store.save('ironman',patch);assert.deepEqual(new HallCalibrationStore(dir).get().themes.ironman,patch);
    assert.throws(()=>store.save('ironman',{bays:{im1:{fill:NaN}}}));assert.deepEqual(store.get().themes.ironman,patch);
    store.reset('ironman');assert.equal(new HallCalibrationStore(dir).get().themes.ironman,undefined);
  }finally{assert.ok(dir.startsWith(path.join(os.tmpdir(),'jarvis-calibration-')));fs.rmSync(dir,{recursive:true,force:true});}
});
test('calibration rejects unknown suits, unsafe keys and invalid geometry',()=>{
  for(const patch of [{bays:{bc1:{}}},{bays:{im1:{file:'x'}}},{bays:{im1:{bounds:[.5,.4,.1,.8]}}},{bays:{im1:{bounds:[0,0,2,1]}}},{hologram:[.1,.5,.8,.3]},JSON.parse('{"__proto__":{"polluted":true}}')])assert.throws(()=>validateHallCalibration('ironman',patch));
  assert.throws(()=>validateHallCalibration('../ironman',{bays:{}}));assert.equal({}.polluted,undefined);
});
test('a malformed saved theme does not erase valid calibration for another hall',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-calibration-'));try{fs.writeFileSync(path.join(dir,'hall-calibration.json'),JSON.stringify({version:1,themes:{ironman:{bays:{im1:{fill:.98}}},batcave:{bays:{bc1:{fill:9}}}}}));const data=new HallCalibrationStore(dir).get();assert.equal(data.themes.ironman.bays.im1.fill,.98);assert.equal(data.themes.batcave,undefined);}finally{assert.ok(dir.startsWith(path.join(os.tmpdir(),'jarvis-calibration-')));fs.rmSync(dir,{recursive:true,force:true});}
});
test('normalised pod edits keep graphics, click targets and labels aligned at higher native resolution',()=>{
  const source={w:3240,h:1920,bays:{im1:{x0:100,y0:500,x1:300,y1:1300,foot:1300}}},patch={bays:{im1:{bounds:[.1,.3,.2,.7],label:[.15,.28,.09]}}};
  const stage=calibratedStage(source,patch),mods=calibratedModules([{id:'im1',name:'Custom name',plaque:{x:1,y:1}}],stage,patch);
  assert.equal(stage.bays.im1.x0,324);assert.equal(stage.bays.im1.foot,1344);assert.equal(source.bays.im1.x0,100);
  assert.deepEqual(mods[0].hotspot,{x:10,y:30,w:10,h:40});assert.deepEqual(mods[0].plaque,{x:15,y:28.000000000000004,w:9});assert.equal(mods[0].name,'Custom name');
});
test('uniform suit fit fills the available height without stretching or clipping a broad suit',()=>{
  assert.equal(fitSuit({height:300,width:180,modelWidth:.5}),291);
  const h=fitSuit({height:300,width:180,modelWidth:.8});assert.ok(Math.abs(h-216)<1e-9);assert.ok(h*.8<=180*.96);
  const turned=fitSuit({height:300,width:180,modelWidth:.5,modelDepth:.8,yaw:Math.PI/2});assert.ok(turned<=216.001);
});
test('all existing quality and frame-rate choices govern the same effects budget',()=>{
  for(const quality of ['low','medium','high','ultra'])for(const fps of [15,30,60]){const b=renderBudget({quality,fps},{},{dpr:3});assert.equal(b.fps,fps);assert.equal(b.quality,quality);assert.ok(b.dpr>=1&&b.dpr<=2.5);assert.ok(b.anisotropy>=2&&b.anisotropy<=16);}
});
test('battery reduction can be enabled or disabled and still mode disables poses',()=>{
  assert.equal(renderBudget({quality:'ultra',fps:60},{onBattery:true}).fps,15);assert.equal(renderBudget({quality:'ultra',reduceOnBattery:false},{onBattery:true}).quality,'ultra');
  assert.equal(renderBudget({animations:false}).pose,false);assert.equal(renderBudget({}, {},{reduced:true}).quiet,true);assert.equal(renderBudget({}, {onBattery:true}).videoRate,.5);
});

test('close-up supersampling sharpens geometry on a 1× display while keeping a bounded GPU buffer',()=>{
  for(const [quality,maxPixels]of Object.entries({low:1200000,medium:2200000,high:4200000,ultra:8300000})){const b=renderBudget({quality},{},{dpr:1}),scale=suitRenderScale(b,1920,1080,true);assert.ok(1920*1080*scale*scale<=maxPixels+1);if(quality==='low')assert.equal(scale,suitRenderScale(b,1920,1080,false));else assert.ok(scale>suitRenderScale(b,1920,1080,false));}
});
test('mechanical effects honour both volume controls and cues fit inside entry/return',()=>{
  assert.equal(mechanicalGain({master:0,mechanical:1}),0);assert.equal(mechanicalGain({master:1,mechanical:0}),0);assert.equal(mechanicalGain({master:.5,mechanical:.4}),.2);
  for(const theme of ['ironman','batcave','spiderman']){assert.ok(mechanicalCues(theme).every(c=>c.at+c.duration<3));assert.ok(mechanicalCues(theme,true).every(c=>c.at+c.duration<=.7));}
});
test('signature poses articulate different chains and return exactly to rest',()=>{
  for(const t of ['ironman','batcave','spiderman'])assert.ok(Object.values(signaturePose(t,0)).every(x=>x===0));
  assert.ok(signaturePose('spiderman',1).knee>.5);assert.equal(signaturePose('batcave',1).knee,0);assert.ok(signaturePose('ironman',1).shoulder<-.5);assert.ok(signaturePose('batcave',1).elbow<-.7);
});

test('shared graphics subscriptions hydrate, follow live settings and battery status, and detach',async()=>{
  const oldMatch=globalThis.matchMedia,oldDpr=globalThis.devicePixelRatio,events={};let detached=0;
  globalThis.matchMedia=()=>({matches:false});globalThis.devicePixelRatio=2;
  try{const watched=watchRenderBudget({on(k,f){events[k]=f;return()=>detached++;},async call(){return{settings:{quality:'ultra',fps:60},status:{onBattery:false}};}});await Promise.resolve();assert.equal(watched.get().quality,'ultra');events.status({onBattery:true});assert.equal(watched.get().fps,15);events.settings({quality:'medium',fps:30,reduceOnBattery:false,animations:false});assert.equal(watched.get().quality,'medium');assert.equal(watched.get().quiet,true);watched.dispose();assert.equal(detached,2);}finally{globalThis.matchMedia=oldMatch;globalThis.devicePixelRatio=oldDpr;}
});

test('mechanical audio schedules once per entry, cancels on return/mute/hidden and releases listeners',async()=>{
  const events={},listeners={},sources=[],gainValues=[];let removed=0,closed=0;
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(v){gainValues.push(v);}});
  const node=()=>({connect(){},disconnect(){},frequency:param(),gain:param(),Q:param()});
  class Audio{constructor(){this.sampleRate=1000;this.currentTime=5;this.state='running';}createGain(){return node();}createBiquadFilter(){return node();}createOscillator(){return this.source();}createBufferSource(){return this.source();}source(){const s={...node(),starts:[],stops:[],start(t){this.starts.push(t);},stop(t){this.stops.push(t);}};sources.push(s);return s;}createBuffer(c,n){return{getChannelData(){return new Float32Array(n);}};}async close(){closed++;}}
  const document={hidden:false,body:{dataset:{theme:'ironman'}},addEventListener(k,f){events[k]=f;},removeEventListener(){removed++;}};
  const bridge={on(k,f){listeners[k]=f;return()=>removed++;},async call(){return{settings:{master:.5,mechanical:.4}};}};
  const context=createContext({window:{jarvis:bridge},document,location:{search:''},URLSearchParams,AudioContext:Audio,Float32Array,addEventListener(k,f){events[k]=f;},removeEventListener(){removed++;}});
  const module=new SourceTextModule(fs.readFileSync(new URL('../../dist/assets/mechanical-audio.js',import.meta.url),'utf8'),{context});await module.link(()=>{});await module.evaluate();await Promise.resolve();await events.pointerdown();
  listeners.snapshot({state:'SUIT_SELECTED',selected:'im1'});assert.equal(sources.length,3);assert.ok(Math.abs(gainValues.at(-1)-.2)<1e-10);assert.equal(sources[0].starts[0],5.1);
  listeners.snapshot({state:'SUIT_SELECTED',selected:'im1'});assert.equal(sources.length,3);
  listeners.snapshot({state:'RETURNING',selected:'im1'});assert.equal(sources.length,5);assert.equal(sources[0].stops.length,2);
  listeners.settings({master:0,mechanical:1});assert.equal(sources[3].stops.length,2);listeners.snapshot({state:'SUIT_SELECTED',selected:'im2'});assert.equal(sources.length,5);
  listeners.settings({master:1,mechanical:1});document.hidden=true;events.visibilitychange();listeners.snapshot({state:'SUIT_SELECTED',selected:'im3'});assert.equal(sources.length,5);events.pagehide();assert.equal(closed,1);assert.equal(removed,6);
});
