// 1.88.0: brainstorm and plan projects in the Ideas room; Windows wakes the PC for the next call, message or report.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {IdeaStore} from '../../src/services/ideas.js';import {TodoStore} from '../../src/services/todos.js';import {IdeaAssistant} from '../../src/ideas/assistant.js';
import {IdeaPlanner,cleanPlan,progressOf} from '../../src/ideas/planner.js';
import {WakeTimer,wakeTaskXml,parseWakeTimers,localStamp,TASK,WAKE_ARG} from '../../src/main/wake-timer.js';import {createJarvisCore} from '../../src/brain/index.js';

const tmp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-188-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};

/* ---------- the planner, with a scripted Claude ---------- */
function planner(t){
  const dir=tmp(t),ideas=new IdeaStore(dir),todos=new TodoStore(dir),asked=[],spent=[];let reply=()=>'{}',changed=0;
  const assistant=new IdeaAssistant({ideas:()=>ideas,tower:()=>({settings:()=>({plannerModel:'claude-sonnet-5'}),root:dir}),readKey:()=>'test-key',dir,broadcast:()=>{changed++;},spent:(usd,kind)=>spent.push([usd,kind]),
    api:async p=>{asked.push(p);return {text:reply(p),cost:.02};}});
  const p=new IdeaPlanner({assistant,todos:()=>todos,dir});
  return {dir,ideas,todos,assistant,p,asked,spent,setReply:f=>reply=f,changes:()=>changed};
}
const sixIdeas={questions:['How many hours a week?','What budget?','Online or local?','A fourth question'],ideas:[
  {title:'Mobile car valeting',pitch:'Clean cars at customers’ homes.',why:'Low start-up cost.',first:'Price three local competitors.',effort:'small',cost:'£150',time:'2 weeks'},
  {title:'Car detailing videos',pitch:'Short videos of before and after.',effort:'huge'},{pitch:'no title, dropped'},
  {title:'Wheel refurbishment'},{title:'Ceramic coating'},{title:'Fleet cleaning'},{title:'Valeting kits'}]};
const aPlan={goal:'Run a weekend valeting round',finished:'Ten paying customers a month',phases:[
  {name:'Check it',why:'Know the market',steps:[{title:'Price three competitors',detail:'Ring or check their sites.',who:'you',time:'1 hour',cost:'none'},{title:'Draft a price list',who:'jarvis',time:'30 minutes'}]},
  {name:'Start',steps:[{title:'Buy the kit',who:'you',cost:'£150'},{title:'Make a flyer',who:'agents'},{title:'Odd one',who:'robot'}]}],
  risks:[{risk:'Rainy weekends',fix:'Offer a rain date.'}],needs:['A car','Insurance'],total:{time:'3 weekends',cost:'about £200'},thisWeek:['Price three competitors'],questions:['Which area?']};

test('brainstorming suggests projects, asks up to three questions, keeps the last ten sessions and can go again with answers',async t=>{
  const f=planner(t);f.setReply(()=>JSON.stringify(sixIdeas));
  await assert.rejects(()=>f.p.brainstorm({topic:' '}),/Say what you would like to brainstorm/);
  const s=await f.p.brainstorm({topic:'A side business with cars',about:'Weekends only, £200'});
  assert.equal(s.questions.length,3);assert.equal(s.ideas.length,6);assert.equal(s.ideas[1].effort,'medium');assert.ok(!s.ideas.some(i=>!i.title));
  assert.match(f.asked[0].prompt,/Weekends only, £200/);assert.equal(f.asked[0].maxTokens,3500);assert.deepEqual(f.spent[0],[.02,'ideas brainstorm']);
  const again=await f.p.brainstorm({topic:'A side business with cars',answers:'Online, 5 hours',from:s.id});
  assert.match(f.asked[1].prompt,/SUGGESTED IN THIS SESSION[\s\S]*Mobile car valeting/);assert.match(f.asked[1].prompt,/Online, 5 hours/);assert.equal(again.from,s.id);
  for(let i=0;i<10;i++)await f.p.brainstorm({topic:'Topic '+i});assert.equal(f.p.sessions().length,10);
  f.setReply(()=>'no json at all');await assert.rejects(()=>f.p.brainstorm({topic:'Anything'}),/did not return any ideas/);
});

test('a brainstorm idea becomes a card, and a plan lands on the idea with phases, owners, risks and this week’s actions',async t=>{
  const f=planner(t);f.setReply(()=>JSON.stringify(sixIdeas));const s=await f.p.brainstorm({topic:'Cars'});
  const {id}=f.p.adopt({session:s.id,index:0});const idea=f.ideas.get(id);
  assert.equal(idea.title,'Mobile car valeting');assert.equal(idea.stage,'spark');assert.match(idea.notes,/First step: Price three local competitors/);assert.deepEqual(f.p.sessions()[0].adopted,[0]);
  f.setReply(()=>JSON.stringify(aPlan));const planned=await f.p.plan(id);
  assert.equal(planned.stage,'designing');assert.equal(planned.project.phases.length,2);assert.equal(planned.project.phases[1].steps[2].who,'you');assert.equal(planned.project.risks[0].fix,'Offer a rain date.');
  assert.equal(f.asked.at(-1).maxTokens,7000);assert.match(f.asked.at(-1).prompt,/First step: Price three local competitors/);
  assert.equal(new IdeaStore(f.dir).get(id).project.goal,'Run a weekend valeting round');   // kept on disk with the idea
  f.ideas.save({...f.ideas.get(id),notes:'edited by hand'});assert.ok(f.ideas.get(id).project);   // saving from the editor keeps the plan
});

test('steps can be ticked, explained once and again, copied to to-dos, and survive a rewrite of the plan',async t=>{
  const f=planner(t);f.ideas.save({title:'Valeting',stage:'spark',progress:0,notes:''});const id=f.ideas.list()[0].id;f.setReply(()=>JSON.stringify(aPlan));await f.p.plan(id);
  let idea=f.p.step(id,'p1s1',true);assert.equal(idea.progress,20);assert.equal(idea.stage,'building');
  f.setReply(()=>'## Before you start\n1. List three valeters near you.');const step=await f.p.howTo(id,'p1s1');assert.match(step.howTo,/List three valeters/);
  const calls=f.asked.length;await f.p.howTo(id,'p1s1');assert.equal(f.asked.length,calls);await f.p.howTo(id,'p1s1',{again:true});assert.equal(f.asked.length,calls+1);
  assert.match(f.asked.at(-1).prompt,/THE STEP AFTER: Draft a price list/);
  assert.throws(()=>f.p.toTodos(id,['p1s1']),/not done yet/);assert.equal(f.p.toTodos(id,['p1s2','p2s1']).added,2);f.p.toTodos(id,['p1s2']);
  assert.equal(f.todos.list().length,2);assert.match(f.todos.list()[0].text,/Draft a price list \(Valeting\)/);
  f.setReply(()=>JSON.stringify({...aPlan,phases:[aPlan.phases[0],{name:'Launch',steps:[{title:'Open bookings'}]}]}));idea=await f.p.plan(id,'Make it simpler');
  const kept=idea.project.phases[0].steps[0];assert.equal(kept.done,true);assert.match(kept.howTo,/List three valeters/);assert.equal(idea.project.feedback,'Make it simpler');assert.equal(progressOf(idea.project),33);
  assert.match(f.asked.at(-1).prompt,/\[done\] Price three competitors[\s\S]*Make it simpler/);
});

test('one plan at a time per idea, and a reply with no usable plan changes nothing',async t=>{
  const f=planner(t);f.ideas.save({title:'Shop',stage:'spark',progress:0,notes:''});const id=f.ideas.list()[0].id;
  let release;f.setReply(()=>JSON.stringify(aPlan));f.assistant.api=async()=>{await new Promise(r=>release=r);return {text:JSON.stringify(aPlan),cost:0};};
  const first=f.p.plan(id);await new Promise(r=>setImmediate(r));await assert.rejects(()=>f.p.plan(id),/already planning this idea/);release();await first;
  f.assistant.api=async()=>({text:'{"phases":[]}',cost:0});await assert.rejects(()=>f.p.plan(id,'again'),/did not return a usable plan/);assert.equal(f.ideas.get(id).project.phases.length,2);
  assert.deepEqual(cleanPlan({phases:[{name:'x',steps:[{title:'a',who:'robot'}]}]}).phases[0].steps[0].who,'you');
});

/* ---------- waking the PC ---------- */
test('the wake task wakes the computer at local time, runs JARVIS with --jarvis-wake and escapes the path',()=>{
  const at=new Date(2026,9,3,22,46,0).getTime(),xml=wakeTaskXml(at,'C:\\Apps\\A&B\\JARVIS.exe');
  assert.match(xml,/<WakeToRun>true<\/WakeToRun>/);assert.match(xml,/<StartBoundary>2026-10-03T22:46:00<\/StartBoundary>/);assert.equal(localStamp(at),'2026-10-03T22:46:00');
  assert.match(xml,/<Command>C:\\Apps\\A&amp;B\\JARVIS\.exe<\/Command>/);assert.match(xml,new RegExp(`<Arguments>${WAKE_ARG}</Arguments>`));assert.match(xml,/<DisallowStartIfOnBatteries>false/);assert.match(xml,/<LogonType>InteractiveToken/);
  assert.deepEqual(parseWakeTimers('Current AC Power Setting Index: 0x00000001\r\n    Current DC Power Setting Index: 0x00000002'),{mains:'on',battery:'important only'});
  assert.deepEqual(parseWakeTimers(''),{mains:'unknown',battery:'unknown'});
});

test('the wake timer creates, moves and removes one task in your account, and does nothing off Windows',async t=>{
  const dir=tmp(t),runs=[];let bom=null;
  const w=new WakeTimer({dir,platform:'win32',exe:'C:\\JARVIS.exe',exec:async(cmd,args)=>{runs.push([cmd,...args]);if(args[0]==='/Create')bom=fs.readFileSync(args[5]).subarray(0,2).toString('hex');if(args[0]==='/Delete'&&runs.length===1)throw Error('ERROR: The system cannot find the file specified.');return '';},execSync:(...a)=>runs.push(['sync',...a[1]])});
  assert.equal(await w.clear(),true);   // nothing there yet is fine
  await w.set(Date.now()+3600e3);assert.deepEqual(runs[1].slice(0,5),['schtasks.exe','/Create','/F','/TN',TASK]);assert.equal(bom,'fffe');assert.equal(fs.existsSync(path.join(dir,'wake-task.xml')),false);
  await w.set(null);assert.deepEqual(runs[2],['schtasks.exe','/Delete','/F','/TN',TASK]);w.clearNow();assert.equal(runs.length,3);   // already gone: no second delete on quit
  await w.set(Date.now()+60e3);w.clearNow();assert.deepEqual(runs.at(-1),['sync','/Delete','/F','/TN',TASK]);
  const off=new WakeTimer({dir,platform:'linux',exec:async()=>{throw Error('should not run');}});assert.equal(await off.set(Date.now()+1e6),false);assert.equal(await off.timers(),null);
});

test('JARVIS Core keeps the wake task two minutes before the next call, and stays up after Windows wakes the PC',async t=>{
  const dir=tmp(t),wakes=[],awake=[];
  const core=createJarvisCore({userDir:dir,docs:dir,appVersion:'1.88.0',boot:{asarRoot:dir,root:dir,base:'1.88.0'},log(){},notify(){},broadcast(){},getKey:()=>'',pcAwake:()=>true,say(){},crypt:{available:()=>false},isIdle:()=>true,
    keepAwake:on=>awake.push(on),settings:{get:()=>({})},wakeAt:async at=>{wakes.push(at);return true;},wakeTimers:async()=>({mains:'on',battery:'off'})});
  t.after(()=>core.dispose());core.store.save({keepAwake:false});
  const at=Date.now()+45*60000;core.store.addAlarm({at,kind:'call',note:'Gym'});
  await core.tick();await new Promise(r=>setTimeout(r,20));
  assert.equal(wakes.at(-1),at-2*60000);assert.equal(core.store.state.wake.what,'Gym');assert.deepEqual(core.status().wake.timers,{mains:'on',battery:'off'});
  await core.tick();assert.equal(wakes.length,1);   // unchanged: Windows is not asked again
  core.store.save({wakePc:false});await core.tick();await new Promise(r=>setTimeout(r,20));assert.equal(wakes.at(-1),null);assert.equal(core.store.state.wake,null);
  core.woke('test');assert.equal(awake.at(-1),true);
});
