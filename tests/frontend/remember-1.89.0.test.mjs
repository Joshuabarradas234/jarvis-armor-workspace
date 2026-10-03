// 1.89.0: JARVIS remembers what you tell him (and keeps call rules), bills and birthdays reminders, "tell me when it's
// done" for Tower jobs, the night shift for plan steps, and plural day names in schedule lines.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {parseDays} from '../../src/brain/util.js';import {StandingOrders,parseScheduleLine,parseCallRule,callBlocked,ordersTemplate} from '../../src/brain/orders.js';
import {Dates,nextDue,reminderText} from '../../src/brain/dates.js';import {createJarvisCore} from '../../src/brain/index.js';import {makeTools} from '../../src/brain/tools.js';
import {TowerStore} from '../../src/tower/store.js';import {TowerRunner} from '../../src/tower/orchestrator.js';import {briefGaps} from '../../src/tower/productivity.js';
import {IdeaStore} from '../../src/services/ideas.js';import {TodoStore} from '../../src/services/todos.js';import {IdeaAssistant} from '../../src/ideas/assistant.js';import {IdeaPlanner} from '../../src/ideas/planner.js';

const tmp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-189-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const at=(y,m,d,h=10,mi=0)=>new Date(y,m-1,d,h,mi).getTime();

test('plural day names are understood, so a Saturdays-only line no longer runs every day',()=>{
  assert.deepEqual(parseDays('on saturdays'),[6]);assert.deepEqual(parseDays('sundays and saturdays'),[0,6]);assert.deepEqual(parseDays('tues and thurs'),[2,4]);assert.deepEqual(parseDays('wednesdays'),[3]);
  assert.deepEqual(parseDays('thus it is'),[0,1,2,3,4,5,6]);assert.deepEqual(parseScheduleLine('- 08:30 saturdays — WhatsApp me the overnight report.').days,[6]);
});

test('call rules are read from plain sentences and block only the times they name',()=>{
  const r=parseCallRule('No calls before 08:00 on Saturdays');assert.deepEqual([r.notBefore,r.notAfter,r.days],['08:00',null,[6]]);
  assert.deepEqual(parseCallRule('No calls after 9pm').notAfter,'21:00');assert.deepEqual(parseCallRule('Never call me on Sundays').days,[0]);
  assert.equal(parseCallRule("Don't call me before 9:30 on weekdays").notBefore,'09:30');assert.equal(parseCallRule('I take my coffee black'),null);
  const rules=[r,parseCallRule('Never call me on Sundays')];
  assert.equal(callBlocked(rules,at(2026,10,3,7,30)).text,r.text);assert.equal(callBlocked(rules,at(2026,10,3,8,0)),null);assert.ok(callBlocked(rules,at(2026,10,4,15,0)));assert.equal(callBlocked(rules,at(2026,10,5,6,0)),null);
});

test('Remember is a section of the standing orders: lines are added, found, kept apart from other sections and forgotten',t=>{
  const dir=tmp(t);assert.match(ordersTemplate(),/## Remember/);
  const o=new StandingOrders({docs:dir});fs.mkdirSync(path.dirname(o.file),{recursive:true});fs.writeFileSync(o.file,'# Standing orders\n\n## About me\n- I like tea\n\n## Facts about my business\n- Tea shop opens at 9\n');   // an older file, without the section
  o.addLine('remember','No calls before 08:00 on Saturdays','test');o.addLine('remember','I like tea in the morning','test');
  let p=o.parse(true);assert.deepEqual(p.sections.remember.map(x=>x.text),['No calls before 08:00 on Saturdays','I like tea in the morning']);assert.equal(p.callRules.length,1);assert.equal(p.sections.about.length,1);
  o.removeLine('tea','test','remember');p=o.parse(true);assert.deepEqual(p.sections.remember.map(x=>x.text),['No calls before 08:00 on Saturdays']);assert.equal(p.sections.about[0].text,'I like tea');
  assert.throws(()=>o.removeLine('opens at 9','test','remember'),/No line like that/);
});

test('bills and birthdays fall due on the right day, even at month ends and on 29 February',()=>{
  assert.equal(new Date(nextDue({repeat:'monthly',day:31},at(2026,2,10))).getDate(),28);assert.equal(new Date(nextDue({repeat:'monthly',day:5},at(2026,10,6))).getMonth(),10);
  assert.equal(new Date(nextDue({repeat:'yearly',day:29,month:2},at(2027,1,1))).getDate(),28);assert.equal(nextDue({repeat:'once',day:1,month:1,year:2026},at(2026,10,3)),null);
  const when=new Date(at(2026,10,10));assert.equal(reminderText({kind:'birthday',name:'Mum',year:1966,repeat:'yearly'},when,7),"🎂 Mum's birthday is on Saturday 10 October, in 7 days (turning 60). Time for a card or a present.");
  assert.equal(reminderText({kind:'bill',name:'Council tax',amount:'£152'},when,0),'💷 Council tax (£152) is due today.');assert.equal(reminderText({kind:'other',name:'MOT'},when,1),'📅 MOT is tomorrow.');
});

test('reminders come once inside the days-ahead window and once on the day',t=>{
  const d=new Dates({dir:tmp(t)});d.add({name:'Council tax',kind:'bill',day:6,amount:'£152'});d.add({name:'Mum',kind:'birthday',day:10,month:10,ahead:7});d.add({name:'Dentist',kind:'other',repeat:'once',day:20,month:10,year:2026,ahead:0});
  assert.throws(()=>d.add({name:'',day:1}),/Give it a name/);assert.throws(()=>d.add({name:'X',kind:'birthday',day:31,month:2}),/does not exist/);
  let due=d.due(at(2026,10,3));assert.deepEqual(due.map(x=>x.left),[3,7]);d.markSent(due);assert.equal(d.due(at(2026,10,4)).length,0);   // JARVIS off on the exact day: still sent once
  due=d.due(at(2026,10,6,9));assert.equal(due[0].key,'2026-10-06:day');d.markSent(due);assert.equal(d.due(at(2026,10,6,18)).length,0);
  assert.equal(d.due(at(2026,10,19)).length,0);assert.equal(d.due(at(2026,10,20)).length,1);   // no warning ahead: only on the day
  assert.equal(d.remove('council').name,'Council tax');assert.equal(d.list(at(2026,10,3))[0].name,'Mum');
});

/* ---------- JARVIS Core: call rules, reminders and Tower jobs you asked to hear about ---------- */
function core(t){
  const dir=tmp(t),sent=[],rang=[];
  const c=createJarvisCore({userDir:dir,docs:dir,appVersion:'1.89.0',boot:{asarRoot:dir,root:dir,base:'1.89.0'},log(){},notify(){},broadcast(){},getKey:()=>'',pcAwake:()=>true,say(){},crypt:{available:()=>false},isIdle:()=>true,keepAwake(){},settings:{get:()=>({})}});
  t.after(()=>c.dispose());c.store.save({quiet:{on:false,from:'22:30',to:'06:30'}});
  Object.assign(c.phone,{ready:()=>({calls:true,any:true,whatsapp:true}),deliver:async text=>{sent.push(text);return {ok:true,via:'whatsapp'};},call:async p=>{rang.push(p);return {sid:'CA'+rang.length,status:'queued'};},waitCall:()=>new Promise(()=>{}),oneWay:x=>x,sandbox:()=>({})});
  return {c,dir,sent,rang};
}
test('a call rule turns calls JARVIS makes on his own into WhatsApps, but a wake-up call you set still rings',async t=>{
  const {c,sent,rang}=core(t);c.orders.addLine('remember','No calls after 00:00','test');   // forbids every call, at any time
  const rep={id:'r1',kind:'overnight',text:'The overnight report.',data:{sections:['Quiet night.']}};
  await c.ringReport(rep,{jobId:'job1'});assert.equal(rang.length,0);assert.match(sent.at(-1),/The overnight report/);
  await c.ringReport(rep,{alarmId:'a1',purpose:'wake'});assert.equal(rang.length,1);
  const tools=makeTools(c),callMe=tools.find(x=>x.name==='call_me');
  assert.match(await callMe.run({message:'Hi'},{mode:'agent'}),/Not calling: he said “No calls after 00:00”/);assert.equal(rang.length,1);
  assert.equal(await callMe.run({message:'Hi'},{mode:'user'}),'Calling now.');assert.equal(rang.length,2);
  const remember=tools.find(x=>x.name==='remember');assert.equal(remember.level,'user');assert.match(await remember.run({thing:'Never call me on Sundays'},{}),/keep to that/);assert.equal(c.status().remember.rules.length,2);
});

test('bills and birthdays reach you in one WhatsApp, once, and the screens and tools see them',async t=>{
  const {c,sent}=core(t),tools=makeTools(c),now=new Date();
  await tools.find(x=>x.name==='date_add').run({name:'Council tax',kind:'bill',day:new Date(Date.now()+2*864e5).getDate(),amount:'£152'});
  await tools.find(x=>x.name==='date_add').run({name:'Mum',kind:'birthday',day:now.getDate(),month:now.getMonth()+1});
  c.remindDates(new Date(new Date().setHours(10,0,0,0)));await new Promise(r=>setTimeout(r,20));
  assert.equal(sent.length,1);assert.match(sent[0],/Mum's birthday today/);assert.match(sent[0],/Council tax \(£152\) is due/);
  c.remindDates(new Date(new Date().setHours(11,0,0,0)));assert.equal(sent.length,1);
  assert.equal(c.status().dates.length,2);assert.equal((await c.api('date-remove',{id:'Mum'})).name,'Mum');
  const early=core(t);early.c.dates.add({name:'Rent',kind:'bill',day:new Date().getDate()});early.c.remindDates(new Date(new Date().setHours(8,0,0,0)));assert.equal(early.sent.length,0);   // not before 09:00
});

test('a Tower job you asked about rings and WhatsApps you when it ends; in quiet hours it waits as a WhatsApp',async t=>{
  const {c,sent,rang}=core(t);
  await c.towerTell({status:'done',floorName:'Research',title:'Market check',notify:'call'});assert.equal(rang.length,1);assert.match(sent.at(-1),/Research has finished “Market check”/);
  await c.towerTell({status:'budget',floorName:'Research',title:'Market check',notify:'message'});assert.equal(rang.length,1);assert.match(sent.at(-1),/budget cap/);
  assert.equal(await c.towerTell({status:'stopped',floorName:'R',title:'x',notify:'call'}),null);assert.equal(await c.towerTell({status:'done',floorName:'R',title:'x',notify:''}),null);
  c.store.save({quiet:{on:true,from:'00:00',to:'23:59'}});const before=sent.length;await c.towerTell({status:'done',floorName:'Research',title:'Late job',notify:'call'});
  assert.equal(rang.length,1);assert.equal(sent.length,before);assert.match(c.store.state.outbox.at(-1).text,/Late job/);
});

test('the notify choice stays with a run, can be changed while it works, and travels up an assembly line with its plan step',async t=>{
  const dir=tmp(t),store=new TowerStore({dir,docs:dir}),floors=store.tower('ironman').floors;floors[0].engine='api';floors[0].handoff=floors[1].id;
  const runner=new TowerRunner({store,getKey:()=>'k'});runner.engines=async()=>({api:{ready:true},claudeCode:{ready:false}});
  const sp=floors[0].agents.find(a=>a.role==='specialist');let hold=null;
  runner.ask=async(r,p)=>{r.calls++;r.cost+=.01;if(p.kind==='plan')return JSON.stringify({steps:[{agent:sp.id,title:'Do it',instructions:'Do it well.',after:[]}]});if(p.kind==='work'){if(r.floorId===floors[0].id&&!hold)await new Promise(res=>hold=res);return 'Work';}return 'VERDICT: APPROVED\nNOTES: Fine.\n---\nFinal';};
  const brief={outcome:'X',audience:'Y',files:'None',constraints:'None',finished:'Done'};
  const r=await runner.start('ironman',floors[0].id,'A task',{brief,notify:'message',planStep:'idea1:p1s1'});assert.equal(r.notify,'message');
  for(let i=0;i<100&&!hold;i++)await new Promise(res=>setTimeout(res,5));assert.equal(runner.tellMe(r.id,'call'),true);assert.equal(store.runs.find(x=>x.id===r.id).notify,'call');hold();
  for(let i=0;i<300;i++){await new Promise(res=>setTimeout(res,5));if(store.runs.find(x=>x.id===r.id)?.handedTo)break;}
  const next=store.runs.find(x=>x.id===store.runs.find(y=>y.id===r.id).handedTo.runId);assert.equal(next.notify,'call');assert.equal(next.planStep,'idea1:p1s1');
  for(const id of [...runner.live.keys()])runner.stop(id);assert.equal(runner.tellMe('nope','call'),false);
});

/* ---------- the night shift for plan steps ---------- */
test('a plan step goes to the agents tonight with a complete brief, wakes the PC at 01:00, and its draft comes back to the step',async t=>{
  const dir=tmp(t),ideas=new IdeaStore(dir),starts=[],live=new Map();
  const assistant=new IdeaAssistant({ideas:()=>ideas,tower:()=>({settings:()=>({plannerModel:'m'}),root:dir}),readKey:()=>'k',dir,broadcast(){}});
  const floors=[{id:'f1',name:'Research'},{id:'f2',name:'Design'}],tower={tower:()=>({floors}),floor:(theme,id)=>{const f=floors.find(x=>x.id===id);if(!f)throw Error('Choose a floor.');return f;}};
  const runner={live,start:async(theme,floorId,task,opts)=>{starts.push({theme,floorId,task,opts});return {id:'run'+starts.length,status:'planning'};}};
  const p=new IdeaPlanner({assistant,todos:()=>new TodoStore(dir),dir,runner:()=>runner,tower:()=>tower,activeTheme:()=>'ironman'});
  ideas.save({title:'Valeting',stage:'designing',progress:0,notes:'Weekend car cleaning.'});const id=ideas.list()[0].id;
  ideas.setProject(id,{goal:'Ten customers',phases:[{id:'p1',name:'Start',why:'Get going',steps:[{id:'p1s1',title:'Write the flyer',detail:'One page with prices.',who:'agents'},{id:'p1s2',title:'Draft a price list',who:'jarvis'},{id:'p1s3',title:'Buy kit',who:'you',done:true}]}]});
  assert.deepEqual(p.floors(id).floors.map(f=>f.name),['Research','Design']);
  await p.queueNight(id,'p1s1',{floorId:'f1'});await p.queueNight(id,'p1s2',{floorId:'f1'});assert.throws(()=>p.queueNight(id,'p1s3',{floorId:'f1'}),/already done/);assert.throws(()=>p.queueNight(id,'p1s1',{floorId:'f1'}),/already with the agents/);
  const up=p.upcoming(at(2026,10,3,22));assert.equal(new Date(up[0].at).getHours(),1);assert.match(up[0].what,/2 plan steps/);
  assert.equal(await p.nightShift(new Date(at(2026,10,3,22))),0);
  assert.equal(await p.nightShift(new Date(at(2026,10,4,2))),1);   // one at a time on a floor
  const s=starts[0];assert.equal(s.floorId,'f1');assert.equal(s.opts.planStep,`${id}:p1s1`);assert.deepEqual(briefGaps(s.opts.brief),[]);assert.match(s.opts.input,/Weekend car cleaning/);assert.match(s.opts.brief.constraints,/never send, publish, buy/);
  assert.equal(ideas.get(id).project.phases[0].steps[0].night.status,'running');assert.throws(()=>p.cancelNight(id,'p1s1'),/have started/);
  live.set('run1',{run:{theme:'ironman',floorId:'f1'}});assert.equal(await p.nightShift(new Date(at(2026,10,4,3))),0);live.clear();
  p.runFinished({planStep:`${id}:p1s1`,status:'done',handedTo:{runId:'run9',floorName:'Design'}});assert.equal(ideas.get(id).project.phases[0].steps[0].night.runId,'run9');
  p.runFinished({id:'run9',planStep:`${id}:p1s1`,status:'done',final:path.join(dir,'FINAL.md')});const n=ideas.get(id).project.phases[0].steps[0].night;assert.equal(n.status,'ready');assert.match(n.file,/FINAL\.md/);
  p.cancelNight(id,'p1s2');assert.equal(ideas.get(id).project.phases[0].steps[1].night,null);assert.deepEqual(p.upcoming(),[]);
  runner.start=async()=>{throw Error('Research is already working on something.');};await p.queueNight(id,'p1s2',{floorId:'f1',now:true});assert.match(ideas.get(id).project.phases[0].steps[1].night.error,/already working/);
});
