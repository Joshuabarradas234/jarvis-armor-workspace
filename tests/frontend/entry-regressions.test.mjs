import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext,SourceTextModule,SyntheticModule} from 'node:vm';
import {createEntryMotion} from '../../dist/assets/suit-entry.js';
import {renderBudget} from '../../dist/assets/render-budget.js';
const tick=()=>new Promise(setImmediate);

test('the shipped hall preserves entry animations on battery while lowering render cost',async()=>{
 const context=createContext({}),module=new SourceTextModule(fs.readFileSync(new URL('../../dist/assets/hall-fZdHx-gJ.js',import.meta.url),'utf8'),{context});
 await module.link(()=>new SyntheticModule(['o'],function(){this.setExport('o',()=>{});},{context}));await module.evaluate();
 let still;const hall={root:{classList:{toggle(name,value){assert.equal(name,'still');still=value;}}}};
 for(const onBattery of [false,true]){module.namespace.ArmorHall.prototype.configure.call(hall,{animations:true,reduceOnBattery:true},onBattery);assert.equal(still,false);const b=renderBudget({animations:true,reduceOnBattery:true},{onBattery});assert.equal(b.quiet,false);assert.equal(b.fps,onBattery?15:30);}
 module.namespace.ArmorHall.prototype.configure.call(hall,{animations:false},true);assert.equal(still,true);
});
test('a model becoming ready late catches up to the live three-second entry',()=>{
 const motion=createEntryMotion('ironman','im1');const frame=motion.update({state:'SUIT_SELECTED',selected:'im1'},12000,false,2200);
 assert.equal(frame.door,1);assert.equal(frame.eyes,1);assert.equal(frame.stance,1);
 assert.equal(motion.update({state:'MODULE',selected:'im1'},13000).stance,1);
});

async function audioFixture({suspended=false,bootstrap}={}){
 const events={},listeners={},sources=[],contexts=[];let resolveResume;
 const param=()=>({value:0,setValueAtTime(){},setTargetAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
 const node=()=>({gain:param(),frequency:param(),Q:param(),connect(){},disconnect(){}});
 class Audio{constructor(){this.currentTime=2;this.sampleRate=1000;this.state=suspended?'suspended':'running';contexts.push(this);}createGain(){return node();}createBiquadFilter(){return node();}createBuffer(){return{getChannelData(){return new Float32Array(1000);}};}createBufferSource(){return this.source();}createOscillator(){return this.source();}source(){const n={...node(),starts:[],stops:0,start(t){this.starts.push(t);},stop(){this.stops++;}};sources.push(n);return n;}resume(){return new Promise(r=>{resolveResume=()=>{this.state='running';r();};});}close(){this.state='closed';}}
 const document={hidden:false,body:{dataset:{theme:'batcave'}},addEventListener(k,f){events[k]=f;},removeEventListener(){}};
 const J={on(k,f){listeners[k]=f;return()=>{};},call(){return bootstrap||Promise.resolve({settings:{master:.65,mechanical:.45}});}};
 const context=createContext({window:{jarvis:J},document,location:{search:'?view=main'},URLSearchParams,AudioContext:Audio,Float32Array,addEventListener(k,f){events[k]=f;},removeEventListener(){}});
 const m=new SourceTextModule(fs.readFileSync(new URL('../../dist/assets/mechanical-audio.js',import.meta.url),'utf8'),{context});await m.link(()=>{});await m.evaluate();await tick();
 return{events,listeners,sources,contexts,document,resume:()=>resolveResume?.()};
}
test('voice/native entry creates audio without a prior mouse or keyboard gesture',async()=>{
 const a=await audioFixture();a.listeners.snapshot({state:'SUIT_SELECTED',selected:'bc1'});await tick();assert.equal(a.sources.length,3);assert.equal(a.contexts[0].state,'running');assert.equal(a.sources[0].starts[0],2.1);a.events.pagehide();
});
test('first entry waits for suspended audio and duplicate snapshots do not replay it',async()=>{
 const a=await audioFixture({suspended:true});a.listeners.snapshot({state:'SUIT_SELECTED',selected:'bc1'});await tick();assert.equal(a.sources.length,0);a.listeners.snapshot({state:'SUIT_SELECTED',selected:'bc1'});a.resume();await tick();assert.equal(a.sources.length,3);a.events.pagehide();
});
test('a cancelled first entry never plays an old opening sound after audio resumes',async()=>{
 const a=await audioFixture({suspended:true});a.listeners.snapshot({state:'SUIT_SELECTED',selected:'bc1'});await tick();a.listeners.snapshot({state:'SHUTDOWN'});a.resume();await tick();assert.equal(a.sources.length,0);a.events.pagehide();
});
test('mute and hidden/page teardown cancel queued sound before it can start',async()=>{
 for(const cancel of ['mute','hidden','pagehide']){const a=await audioFixture({suspended:true});a.listeners.snapshot({state:'SUIT_SELECTED',selected:'bc1'});await tick();if(cancel==='mute')a.listeners.settings({master:0,mechanical:1});else if(cancel==='hidden'){a.document.hidden=true;a.events.visibilitychange();}else a.events.pagehide();a.resume();await tick();assert.equal(a.sources.length,0);if(cancel!=='pagehide')a.events.pagehide();}
});
test('entry arriving before bootstrap waits for the saved volume controls',async()=>{
 let resolve;const a=await audioFixture({bootstrap:new Promise(r=>resolve=r)});a.listeners.snapshot({state:'SUIT_SELECTED',selected:'bc1'});await tick();assert.equal(a.contexts.length,0);resolve({settings:{master:.65,mechanical:.45}});await tick();assert.equal(a.sources.length,3);a.events.pagehide();
});

test('the shipped general sound engine starts with muted buses silent',async()=>{
 const source=fs.readFileSync(new URL('../../dist/assets/index-DNK6LM5N.js',import.meta.url),'utf8'),start=source.indexOf('g=class{constructor'),end=source.indexOf(',_=e=>',start);assert.ok(start>0&&end>start);
 let sources=0;const connections=[],param=()=>({value:1,setTargetAtTime(){}});
 class Audio{constructor(){this.currentTime=0;this.state='running';this.destination={};}createGain(){const n={gain:param(),connect(){connections.push(n.gain.value);}};return n;}createOscillator(){sources++;return{};}}
 const context=createContext({AudioContext:Audio,window:{}}),m=new SourceTextModule('export const Sound='+source.slice(start+2,end),{context});await m.link(()=>{});await m.evaluate();
 const Sound=m.namespace.Sound,sound=new Sound({master:0,voice:0,interface:0,mechanical:0,ambience:0,music:0});sound.init();assert.ok(connections.every(n=>n===0));sound.play('hover');sound.play('launch');assert.equal(sources,0);
});
