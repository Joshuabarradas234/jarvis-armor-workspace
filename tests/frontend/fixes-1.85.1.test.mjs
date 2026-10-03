// 1.85.1: meeting email and meeting-task dead ends, skill matching and measurement, cut-off answers,
// the revise-brief budget, backup restores and the Ctrl+R shortcut.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {MeetingWork} from '../../src/meeting/work.js';import {MeetingFollowups} from '../../src/meeting/followups.js';
import {BrainStore} from '../../src/brain/store.js';import {Approvals} from '../../src/brain/approvals.js';
import {IdeaStore} from '../../src/services/ideas.js';import {TodoStore} from '../../src/services/todos.js';import {CalendarStore} from '../../src/services/calendar.js';
import {TowerStore} from '../../src/tower/store.js';import {WorkstationStore} from '../../src/workstations/store.js';import {WorkDesk} from '../../src/brain/work-desk.js';
import {captureSkill,matchSkills,recordStats,skillStats,setSkillEnabled,skillPage} from '../../src/tower/skills.js';
import {briefOf,cutOff,reviewOf} from '../../src/tower/productivity.js';import {callApi} from '../../src/tower/engines.js';
import {workspaceKey} from '../../src/main/workspace-keys.js';import {statsHtml} from '../../dist/assets/task-skills.js';

const tmp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-fixes-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const settle=async w=>{for(let i=0;i<200;i++){await new Promise(r=>setImmediate(r));if(!w.busy)break;}};

/* ---------- meeting follow-up email ---------- */
function followups(t,send){
  const dir=tmp(t),core={approvals:new Approvals({dir}),deps:{sendMeeting:send},push(){}},f=new MeetingFollowups({dir,todos:new TodoStore(dir),core:()=>core});
  const item=f.capture({id:'m1',suitName:'Mark 5',theme:'ironman'},{markdown:'## Summary\nPlan.',actions:[]},'client@example.com');
  const approve=()=>{const {approval}=f.request('m1',{to:'client@example.com',subject:'Follow-up',text:'Thanks for the meeting.'});core.approvals.decide(approval,true,{via:'ui'});return core.approvals.get(approval).payload.input;};
  return {f,item,approve};
}
test('a meeting email the server never took goes back to a draft and can be sent after a new approval',async t=>{
  let fail=true;const {f,item,approve}=followups(t,async()=>{if(fail){const e=Error('Gmail refused the sign-in.');e.notSent=true;throw e;}});
  await assert.rejects(()=>f.send(approve()),/Not sent: Gmail refused the sign-in/);
  assert.equal(item.status,'draft');assert.equal(item.approval,undefined);
  fail=false;assert.match(await f.send(approve()),/sent to client@example\.com/);assert.equal(item.status,'sent');
});
test('an email interrupted after it went out waits for your check of Sent mail, and is never resent by itself',async t=>{
  const {f,item,approve}=followups(t,async()=>{const e=Error('Gmail closed the connection early.');e.notSent=false;throw e;});
  const p=approve();await assert.rejects(()=>f.send(p),/may have been delivered/);assert.equal(item.status,'sending');
  await assert.rejects(()=>f.send(p),/uncertain result/);assert.throws(()=>f.checked('m1','yes'),/Say whether/);
  f.checked('m1',false);assert.equal(item.status,'draft');assert.equal(item.approval,undefined);
  await assert.rejects(()=>f.send(approve()));assert.equal(item.status,'sending');
  f.checked('m1',true);assert.equal(item.status,'sent');assert.throws(()=>f.checked('m1',false),/not waiting/);
});

/* ---------- meeting work ---------- */
function meeting(t,{autoStart=true}={}){
  const dir=tmp(t),store=new BrainStore({dir,docs:dir}),tower=new TowerStore({dir,docs:dir}),workstations=new WorkstationStore({dir,configFile:path.resolve('config/themes.json')});
  const core={store,approvals:new Approvals({dir}),push(){},deps:{userDir:dir,docs:dir,tower,workstations,ideas:new IdeaStore(dir),getKey:()=>'test-key',broadcast(){}}};core.workDesk=new WorkDesk(core);
  const calls=[];let spent=0;
  core.deps.towerRunner={active:()=>[],spentToday:()=>spent,start:async(theme,floorId,task,opts)=>{calls.push(opts);if(core.fail)throw Error(core.fail);const r={id:'run'+calls.length,sourceKey:opts.sourceKey,status:'planning',theme,floorId,cost:0};tower.runs.push(r);return r;}};
  store.save({meetingWork:{autoStart}});
  const work=new MeetingWork(core);core.meetingWork=work;const cat=work.catalog(),s=cat.suits.find(s=>s.theme==='ironman'),fl=cat.floors.find(f=>f.theme==='ironman');
  const item={kind:'task',title:'Launch proposal',theme:'ironman',suitId:s.id,floorId:fl.id,confidence:.95,reason:'It fits this team',evidence:'Please prepare an internal launch proposal using the meeting notes.',
    brief:{outcome:'Prepare a launch proposal draft',audience:'Owner review',files:'Meeting excerpt only',constraints:'No prices or commitments',finished:'A draft separating facts from open questions'},questions:[]};
  return {core,work,calls,item,tower,floor:tower.floor('ironman',fl.id),setSpent:v=>{spent=v;},m:{id:'meeting1',suitName:'Example suit',transcript:'Please prepare an internal launch proposal using the meeting notes.'}};
}
test('a handoff the Tower refuses returns the allowance, waits for you, and can be retried or dismissed',async t=>{
  const f=meeting(t);f.core.fail='Floor is busy.';const m=f.work.capture(f.m,[f.item]);await settle(f.work);const p=m.tasks[0];
  assert.equal(p.status,'paused');assert.equal(p.attempted,false);assert.equal(m.reserved,0);assert.equal(f.core.store.spent(),0);assert.match(p.error,/allowance was returned/);
  await f.work.tick();assert.equal(f.calls.length,1,'never retried by itself');
  f.core.fail='';assert.match(f.work.retry({meeting:m.id,id:p.id}),/Queued again/);await settle(f.work);
  assert.equal(p.runId,'run2');assert.ok(f.core.store.spent()>0);
  const g=meeting(t);g.core.fail='Floor is busy.';const m2=g.work.capture(g.m,[g.item]);await settle(g.work);assert.equal(g.work.skip({meeting:m2.id,id:m2.tasks[0].id}),true);assert.equal(m2.tasks[0].status,'dismissed');
});
test('a task left mid-handoff by an earlier version is released, not stuck',async t=>{
  const f=meeting(t,{autoStart:false}),m=f.work.capture(f.m,[f.item]),p=m.tasks[0];
  Object.assign(p,{authorised:true,attempted:true,budget:.5,status:'needs check',error:'JARVIS stopped during handoff.'});m.reserved=.5;f.core.store.addSpend(.5,'meeting agent reservation');
  await f.work.tick();assert.equal(p.status,'paused');assert.equal(m.reserved,0);assert.equal(f.core.store.spent(),0);assert.equal(f.calls.length,0);
});
test('a floor that has used its daily budget makes the task wait without reserving anything',async t=>{
  const f=meeting(t);f.setSpent(f.floor.budget.perDay);const m=f.work.capture(f.m,[f.item]);await settle(f.work);
  assert.equal(m.tasks[0].status,'queued');assert.match(m.tasks[0].error,/daily budget/);assert.equal(f.core.store.spent(),0);assert.equal(f.calls.length,0);
});
test('finished agent work keeps only what it cost; stopped work can be retried as a new run',async t=>{
  const f=meeting(t),m=f.work.capture(f.m,[f.item]);await settle(f.work);const p=m.tasks[0],run=f.tower.runs[0];assert.ok(f.core.store.spent()>.1);
  Object.assign(run,{status:'stopped',cost:.1});await f.work.tick();assert.ok(Math.abs(f.core.store.spent()-.1)<1e-6,'only the actual cost stays spent');assert.equal(p.status,'stopped');
  f.work.retry({meeting:m.id,id:p.id});await settle(f.work);assert.equal(f.calls.length,2);assert.equal(p.runId,'run2');assert.notEqual(f.calls[1].sourceKey,f.calls[0].sourceKey);
});

/* ---------- skills ---------- */
const run=(id,task,brief,extra={})=>({id,theme:'ironman',floorId:'f1',title:task.slice(0,40),task,brief,status:'done',verdict:'APPROVED',final:'final.md',reviews:[],feedback:{good:true},endedAt:Date.now(),
  steps:[{status:'done',engine:'api',title:'Work',instructions:'Do the work carefully. '+id}],...extra});
const page=o=>'Summarise the supplied page, including key facts, limitations and useful next steps.\n\nOWNER OUTCOME: '+o;
test('skills match what you asked for, not the fixed wording JARVIS wraps around page tasks',()=>{
  const data={settings:{skillPolicy:'owner'},taskSkills:[]};
  captureSkill(data,run('a',page('Kubernetes cluster pricing comparison for our hosting'),{outcome:'Kubernetes cluster pricing comparison for our hosting'}));
  captureSkill(data,run('b',page('A sourdough bread recipe with timings'),{outcome:'A sourdough bread recipe with timings'}));
  captureSkill(data,run('c','Monthly supplier invoices summary',{outcome:'Summary of supplier invoices for the month',audience:'Finance'}));
  assert.equal(matchSkills(data,'ironman','f1',page('Leeds United results this season'),{outcome:'Leeds United results this season'}).length,0);
  assert.deepEqual(matchSkills(data,'ironman','f1',"Summarise this month's supplier invoice",{outcome:'Supplier invoice summary for the month',audience:'Finance'}).map(s=>s.runId),['c']);
  // skills saved by 1.85.0 have no stored match text; they are matched the same way
  for(const s of data.taskSkills)delete s.match;
  assert.equal(matchSkills(data,'ironman','f1',page('Leeds United results this season'),{outcome:'Leeds United results this season'}).length,0);
});
test('skills rank by how their later results went, and pause themselves after repeated returns',()=>{
  const data={settings:{skillPolicy:'owner'},taskSkills:[]},brief={outcome:'Summary of supplier invoices for the month'};
  const a=captureSkill(data,run('x','Monthly supplier invoices summary',brief)),b=captureSkill(data,run('y','Monthly supplier invoices summary',brief));
  const q=()=>matchSkills(data,'ironman','f1','Monthly supplier invoices summary',brief).map(s=>s.runId);
  b.acceptedUses=3;assert.deepEqual(q(),['y','x']);
  b.reworkUses=4;assert.deepEqual(q(),['x']);assert.equal(skillPage(data,'ironman','f1').skills.find(s=>s.id===b.id).state,'suspended');
  setSkillEnabled(data,'ironman',b.id,true);assert.deepEqual(q().sort(),['x','y']);assert.equal(a.reinstated,undefined);
});
test('each floor keeps a tally of judged results with and without skills, beyond the run history',t=>{
  const data={};
  recordStats(data,{theme:'ironman',floorId:'f1',learnedSkills:['s1'],cost:.2,startedAt:0,endedAt:120000},true);
  recordStats(data,{theme:'ironman',floorId:'f1',learnedSkills:[],cost:.4,startedAt:0,endedAt:60000},false);
  recordStats(data,{theme:'ironman',floorId:'f1',rehearsal:true,learnedSkills:[]},true);
  const st=skillStats(data,'ironman','f1');
  assert.deepEqual(st.with,{results:1,accepted:1,returned:0,cost:.2,minutes:2});assert.deepEqual(st.without,{results:1,accepted:0,returned:1,cost:.4,minutes:1});
  assert.match(statsHtml(st),/Not enough results to compare yet/);assert.match(statsHtml(st),/With skills<\/th><td>1<\/td><td>100%/);
  const dir=tmp(t),store=new TowerStore({dir,docs:dir});store.recordSkillOutcome({theme:'ironman',floorId:'f1',learnedSkills:[],cost:.1},true);store.recordSkillOutcome({theme:'ironman',floorId:'f1',learnedSkills:[],cost:.1,skillOutcomeRecorded:true},false);
  assert.equal(skillStats(store.data,'ironman','f1').without.results,1);store.flush();assert.equal(skillStats(new TowerStore({dir,docs:dir}).data,'ironman','f1').without.accepted,1);
});

/* ---------- cut-off answers ---------- */
test('a cut-off answer is never approved, and a paused web search is allowed to finish',async t=>{
  assert.equal(reviewOf(cutOff('review','VERDICT: APPROVED\nNOTES: Fine.\n---\nHalf a rep'),[{status:'done'}]).verdict,'CHANGES');
  assert.match(cutOff('work','Partial'),/cut off at the length limit/);
  const real=globalThis.fetch;t.after(()=>{globalThis.fetch=real;});
  const replies=[{stop_reason:'pause_turn',content:[{type:'text',text:'First half '}],usage:{input_tokens:10,output_tokens:5}},{stop_reason:'end_turn',content:[{type:'text',text:'second half.'}],usage:{input_tokens:12,output_tokens:6}}],bodies=[];
  globalThis.fetch=async(url,o)=>{bodies.push(JSON.parse(o.body));return new Response(JSON.stringify(replies.shift()),{status:200});};
  const r=await callApi({key:'k',model:'claude-sonnet-5',system:'s',prompt:'p',web:true});
  assert.equal(r.text,'First half second half.');assert.equal(r.truncated,false);assert.equal(bodies.length,2);assert.equal(bodies[1].messages.at(-1).role,'assistant');
  assert.ok(Math.abs(r.cost-((22*3+11*15)/1e6))<1e-9,'both parts are charged');
  globalThis.fetch=async()=>new Response(JSON.stringify({stop_reason:'max_tokens',content:[{type:'text',text:'Cut'}],usage:{}}),{status:200});
  assert.equal((await callApi({key:'k',model:'claude-sonnet-5',system:'s',prompt:'p'})).truncated,true);
});

/* ---------- revise-brief budget ---------- */
test('an empty budget keeps the floor cap instead of becoming five cents',()=>{
  for(const b of [0,'',null,undefined,-1,NaN])assert.equal(briefOf({budget:b}).budget,null);
  assert.equal(briefOf({budget:2}).budget,2);assert.equal(briefOf({budget:.01}).budget,.05);
  assert.match(fs.readFileSync('dist/assets/tower.js','utf8'),/el\.dataset\.brief==='budget'\?\(r\.brief\?\.budget\|\|this\.floor\(\)\?\.budget\?\.perRun/);
});

/* ---------- backup restore ---------- */
test('a restored backup reaches everything holding the to-do list, calendar and ideas',t=>{
  const dir=tmp(t),todos=new TodoStore(dir),calendar=new CalendarStore(dir),ideas=new IdeaStore(dir),holder={todos,calendar,ideas};
  todos.add('Old task');
  fs.writeFileSync(path.join(dir,'todos.json'),JSON.stringify([{id:'r1',text:'Restored task',done:false,created:1}]));
  fs.writeFileSync(path.join(dir,'calendar.json'),JSON.stringify([{id:'e1',title:'Restored meeting',start:'2026-10-05T09:00:00.000Z'}]));
  fs.writeFileSync(path.join(dir,'ideas.json'),JSON.stringify([{id:'i1',title:'Restored idea',notes:'',created:1}]));
  todos.reload();calendar.reload();ideas.reload();
  assert.deepEqual(holder.todos.list().map(x=>x.text),['Restored task']);assert.deepEqual(holder.calendar.list().map(x=>x.title),['Restored meeting']);assert.deepEqual(holder.ideas.list().map(x=>x.title),['Restored idea']);
  holder.todos.add('New task');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'todos.json'),'utf8')).map(x=>x.text).sort(),['New task','Restored task']);
  const ws=new WorkstationStore({dir,configFile:path.resolve('config/themes.json')});assert.equal(ws.reload({dir,configFile:path.resolve('config/themes.json')}),ws);
  const main=fs.readFileSync('src/main/main.js','utf8');assert.match(main,/todos\.reload\(\)/);assert.doesNotMatch(main,/todos=new TodoStore\(userDir\);\}/);
});

/* ---------- Ctrl+R ---------- */
test('Electron\'s built-in menu is off; Ctrl+R and F5 reload the web page you are on',()=>{
  const k=(key,extra={})=>({type:'keyDown',key,...extra});
  assert.equal(workspaceKey(k('r',{control:true})),'reload');assert.equal(workspaceKey(k('F5')),'reload');
  for(const x of [k('r'),k('F5',{control:true}),k('F5',{type:'keyUp'}),k('F5',{alt:true}),k('r',{control:true,alt:true})])assert.equal(workspaceKey(x),null);
  const main=fs.readFileSync('src/main/main.js','utf8');assert.match(main,/Menu\.setApplicationMenu\(null\)/);assert.match(main,/command==='reload'\)tabs\.navigate\(id,'reload'\)/);
});

/* ---------- 1.85.2: suit shortcuts and the live wallpaper ---------- */
test('suit shortcuts no longer ask Windows for Win+1 to 7, which its taskbar owns',()=>{
  const main=fs.readFileSync('src/main/main.js','utf8');
  assert.doesNotMatch(main,/Super\+\$\{n\}/);assert.match(main,/for\(const k of \[`Control\+Alt\+\$\{n\}`\]\)/);
});
test('a desktop with no place for the live wallpaper is not retried in a loop',()=>{
  const w=fs.readFileSync('src/display/windows.js','utf8');
  assert.match(w,/const noRoom=\/WorkerW not found\/i\.test\(e\.message\);if\(noRoom\)this\.wallpaperBlocked=true;/);
  assert.match(w,/w\.on\('closed',\(\)=>\{if\(!this\.rebuilding&&!this\.stopped&&!w\.failed&&!this\.wallpaperBlocked/);
  assert.match(w,/if\(!this\.settings\(\)\.wallpaper\)this\.wallpaperBlocked=false;/);
  assert.match(w,/if\(this\.wallpaperBlocked\)break;/);
});

/* ---------- 1.85.3: the modern Windows speech engine ---------- */
test('the modern speech engine adds its phrase list through the collection interface, not a direct Add call',()=>{
  const ps=fs.readFileSync('scripts/windows/listen.ps1','utf8');
  const calls=ps.split('\n').filter(l=>/\.Constraints\.Add\(/.test(l)&&!/^\s*#/.test(l));
  assert.equal(calls.length,1,'only the guarded attempt inside Add-Constraint remains');assert.match(calls[0],/try \{ \$recognizer\.Constraints\.Add\(\$constraint\); return \} catch \{\}/);
  assert.match(ps,/ICollection\[Windows\.Media\.SpeechRecognition\.ISpeechRecognitionConstraint\]/);
  assert.equal((ps.match(/Add-Constraint \$/g)||[]).length,2,'the self-check and the live engine both use it');
});
