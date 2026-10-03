// 1.87.0: Tower runs continue where they stopped, budgets hold across parallel steps and hand-offs, agents write only
// in their run's folder, paid tools need their own code, and small fixes (settings recovery, backups, times, cards).
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {TowerStore} from '../../src/tower/store.js';import {TowerRunner} from '../../src/tower/orchestrator.js';import {fenceFile,fenceRule} from '../../src/tower/engines.js';
import {makeTools} from '../../src/brain/tools.js';import {Approvals} from '../../src/brain/approvals.js';import {BrainStore} from '../../src/brain/store.js';
import {parseWhen,readJsonKeep,writeJsonKeep} from '../../src/brain/util.js';import {Travel} from '../../src/brain/travel.js';import {Routines} from '../../src/brain/routines.js';
import {SettingsStore} from '../../src/settings/store.js';import {WorkstationStore} from '../../src/workstations/store.js';import {attentionItems,Workbench} from '../../src/control/workbench.js';
import {MeetingWork} from '../../src/meeting/work.js';import {ProductStudio} from '../../src/brain/product-studio.js';

const tmp=t=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-187-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;};
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const brief={outcome:'A client proposal',audience:'The client',files:'Current notes',constraints:'Use supplied prices',finished:'Check scope and price'};
const approved='VERDICT: APPROVED\nNOTES: Checked.\n---\nFinal piece';

/* ---------- a Tower with two workers and a scripted engine ---------- */
function tower(t,{perRun=2,perDay=20}={}){
  const dir=tmp(t),store=new TowerStore({dir,docs:dir}),floors=store.tower('ironman').floors,floor=floors[0];
  floor.handoff='';floor.engine='api';floor.budget={perRun,perDay};
  const [a,b]=floor.agents.filter(x=>x.role==='specialist');
  const runner=new TowerRunner({store,getKey:()=>'test-key'});runner.engines=async()=>({api:{ready:true},claudeCode:{ready:false}});
  const calls=[];let script=()=>{};
  runner.ask=async(r,p)=>{if(r.cost>=r.budget.perRun){const e=Error('Budget cap reached');e.budget=true;throw e;}calls.push(p);r.calls++;r.cost+=.01;const forced=script(p,r);if(forced instanceof Error)throw forced;if(forced!==undefined)return forced;
    if(p.kind==='plan')return JSON.stringify({steps:[{agent:a.id,title:'Research',instructions:'Gather the facts.',after:[]},{agent:b.id,title:'Write',instructions:'Write it up.',after:[a.id]}]});
    if(p.kind==='work')return p.agent.id===a.id?'Facts from research':'Written piece';return approved;};
  const settle=async id=>{for(let n=0;n<400&&runner.live.has(id);n++)await wait(5);assert.equal(runner.live.has(id),false);return store.runs.find(x=>x.id===id);};
  return {dir,store,floor,floors,a,b,runner,calls,settle,setScript:f=>script=f};
}

test('a failed run continues in the same folder: finished steps are read back and only the rest is done again',async t=>{
  const f=tower(t);let down=true;f.setScript(p=>{if(down&&p.kind==='work'&&p.agent.id===f.b.id)return Error('Network down');if(down&&p.kind==='review')return Error('API down');});
  const first=await f.settle((await f.runner.start('ironman',f.floor.id,'Prepare a client proposal',{brief})).id);
  assert.equal(first.status,'failed');assert.deepEqual(first.steps.map(s=>s.status),['done','failed']);assert.match(first.steps[0].instructions,/Gather the facts/);
  down=false;f.calls.length=0;
  const again=await f.runner.continue(first.id);assert.equal(again.id,first.id);assert.match(again.note,/1 finished step kept/);
  const done=await f.settle(first.id);
  assert.equal(done.status,'done');assert.equal(done.folder,first.folder);assert.equal(done.resumed,1);assert.ok(fs.existsSync(done.final));
  assert.deepEqual(f.calls.map(p=>p.kind),['work','review']);   // no new plan, and the finished research step was not redone
  assert.equal(f.calls[0].agent.id,f.b.id);assert.match(f.calls[0].prompt,/Facts from research/);
  await assert.rejects(()=>f.runner.continue(first.id),/Only a run that stopped, failed or reached its budget/);
});

test('continuing is refused for meeting work, rehearsals, a moved folder and a spent budget; a higher task budget lets it go on',async t=>{
  const f=tower(t,{perRun:2});f.setScript((p,r)=>{r.cost+=.01;});   // 2 cents a call against a 5-cent task budget
  const first=await f.settle((await f.runner.start('ironman',f.floor.id,'Prepare a client proposal',{brief:{...brief,budget:.05}})).id);
  assert.equal(first.status,'budget');assert.deepEqual(first.steps.map(s=>s.status),['done','done']);
  await assert.rejects(()=>f.runner.continue(first.id),/used about \$0\.06 of its \$0\.05 budget/);
  await assert.rejects(()=>f.runner.continue(first.id,{budget:500}),/between \$0\.05 and \$100/);
  const r=await f.runner.continue(first.id,{budget:1});assert.equal(r.budget.perRun,1);assert.equal((await f.settle(first.id)).status,'done');
  const runs=f.store.runs;runs.push({...first,id:'mw',meetingWork:true,status:'failed'},{...first,id:'reh',rehearsal:true,status:'failed'},{...first,id:'gone',folder:path.join(f.dir,'elsewhere'),status:'stopped'});
  await assert.rejects(()=>f.runner.continue('mw'),/meeting work plan/);await assert.rejects(()=>f.runner.continue('reh'),/rehearsal/);await assert.rejects(()=>f.runner.continue('gone'),/folder has moved or gone/);
  runs.push({...first,id:'cap',status:'budget',cost:2,brief:{...brief,budget:null}});await assert.rejects(()=>f.runner.continue('cap'),/Raise “per run” on the Brief tab/);
});

test('a changed team makes the lead plan again; a run continued on a later day counts only today’s spend',async t=>{
  const f=tower(t);f.setScript((p,r)=>{if(p.kind==='work'&&p.agent.id===f.b.id){f.runner.stop(r.id);return Error('Stopped.');}});
  const first=await f.settle((await f.runner.start('ironman',f.floor.id,'Prepare a client proposal',{brief})).id);
  const old=f.store.runs.find(x=>x.id===first.id);old.steps[1].agent='someone-who-left';old.startedAt=Date.now()-2*864e5;const before=old.cost;
  f.setScript(()=>{});f.calls.length=0;await f.runner.continue(first.id);const done=await f.settle(first.id);
  assert.equal(f.calls[0].kind,'plan');assert.equal(done.status,'done');
  assert.ok(Math.abs(f.runner.spentToday('ironman',f.floor.id)-(done.cost-before))<1e-9);assert.ok(done.dayBase.cost===before);
});

test('parallel calls hold what they may cost: the second waits, then stops at the cap; a paid answer past the cap is kept',async t=>{
  const f=tower(t);const runner=new TowerRunner({store:f.store,getKey:()=>'test-key'});runner.save=()=>{};runner.emit=()=>{};
  const r={id:'hold',theme:'ironman',floorId:f.floor.id,cost:0,budget:{perRun:.1},steps:[],desk:{lead:[],reviewer:[]},calls:0};runner.live.set(r.id,{abort:new AbortController(),children:new Set(),run:r});
  let release,calls=0;const gate=new Promise(res=>release=res),old=globalThis.fetch;t.after(()=>globalThis.fetch=old);
  globalThis.fetch=async()=>{calls++;await gate;return Response.json({content:[{type:'text',text:'Work '+calls}],usage:{input_tokens:1000,output_tokens:8000}});};
  const first=runner.ask(r,{kind:'work',engine:'api',system:'s',prompt:'p'}),second=runner.ask(r,{kind:'work',engine:'api',system:'s',prompt:'p'});
  await wait(60);assert.equal(calls,1);release();
  assert.equal(await first,'Work 1');await assert.rejects(second,/Budget cap reached.*press Continue/);assert.equal(calls,1);assert.ok(r.cost>.1);assert.equal(r.held,0);
  // with room for both, they run side by side
  const roomy={...r,id:'roomy',cost:0,held:0,budget:{perRun:2}};runner.live.set(roomy.id,{abort:new AbortController(),children:new Set(),run:roomy});calls=0;
  globalThis.fetch=async()=>{calls++;await wait(30);return Response.json({content:[{type:'text',text:'ok'}],usage:{input_tokens:10,output_tokens:10}});};
  const both=[runner.ask(roomy,{kind:'work',engine:'api',system:'s',prompt:'p'}),runner.ask(roomy,{kind:'work',engine:'api',system:'s',prompt:'p'})];await wait(10);assert.equal(calls,2);await Promise.all(both);
});

test('a task budget covers the whole assembly line, and the lobby router’s cost counts in the run it starts',async t=>{
  const f=tower(t);f.floor.handoff=f.floors[1].id;f.floors[1].budget={perRun:2,perDay:20};
  const first=await f.settle((await f.runner.start('ironman',f.floor.id,'Prepare a client proposal',{brief:{...brief,budget:1}})).id);
  const next=f.store.runs.find(x=>x.id===first.handedTo.runId);assert.ok(Math.abs(next.chainSpent-first.cost)<1e-9);assert.ok(Math.abs(next.budget.perRun-(1-first.cost))<1e-9);
  for(const id of [...f.runner.live.keys()])f.runner.stop(id);await wait(20);
  const tight=await f.settle((await f.runner.start('ironman',f.floor.id,'Another proposal',{brief:{...brief,budget:.05},title:'Tight'})).id);
  assert.equal(tight.handedTo,null);assert.match(tight.note,/task budget \(\$0\.05\) was used by the floors before/);
  const lobby=await f.runner.start('ironman',f.floor.id,'Third proposal',{brief,routeCost:.003});assert.ok(lobby.cost>=.003);
});

test('Claude Code agents write only in their own run folder; the knowledge files are read-only',t=>{
  const dir=tmp(t);assert.equal(fenceRule('runs\\2026 [draft] {x}!*'),'runs/2026 ?draft? ?x???');
  const one=fenceFile(dir,false,undefined,'runs/2026 Task [a]'),two=fenceFile(dir,true,undefined,'runs/2026 Task [a]');assert.notEqual(one,two);
  const p=JSON.parse(fs.readFileSync(one,'utf8')).permissions;assert.ok(p.allow.includes('Edit(./runs/2026 Task ?a?/**)'));assert.ok(!p.allow.includes('Edit(./**)'));
  assert.ok(p.deny.includes('Edit(./knowledge/**)'));assert.ok(p.deny.includes('Bash'));assert.ok(p.deny.includes('WebFetch'));
  assert.ok(JSON.parse(fs.readFileSync(two,'utf8')).permissions.allow.includes('WebSearch'));
});

test('paid tools need their own number and code, and a document search after outside text waits for approval',()=>{
  const core={store:{},approvals:{},orders:{},deps:{},meetingWork:{get:()=>({suit:'Mark 5',allowance:1.5,tasks:[{status:'ready',title:'Draft proposal',suitName:'Mark 5',floorName:'Research'}]})},studio:{get:()=>({product:'Example bottle',scene:'On ice.',maxCost:2})}};
  const T=makeTools(core),by=n=>T.find(x=>x.name===n);
  assert.equal(by('meeting_work_start').risk,'high');assert.equal(by('product_render').risk,'high');assert.equal(by('files_search').guarded,true);
  assert.match(by('meeting_work_start').detail({id:'m'}),/Up to \$1\.50.*\n\nDraft proposal → Mark 5 \/ Research/s);assert.match(by('product_render').detail({id:'p'}),/up to \$2\.00/);
  assert.throws(()=>by('email_send').check({to:'client@example.com',text:'x'.repeat(15001)}),/too long to show in full/);
});

test('an approval keeps a full 12,000-character email, so you approve what you can read',t=>{
  const a=new Approvals({dir:tmp(t)}),text='Line of the email. '.repeat(700);const r=a.create({kind:'email',title:'Send it',detail:text});assert.equal(a.get(r.id).detail,text);
});

test('a damaged settings or suits file is kept aside and the last good copy is used',t=>{
  const dir=tmp(t),s=new SettingsStore(dir);s.update({voiceEnabled:false});s.update({voiceEnabled:true});
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'settings.json.bak'),'utf8')).voiceEnabled,false);
  fs.writeFileSync(path.join(dir,'settings.json'),'{"voiceEnabled": tr');const logs=[];const back=new SettingsStore(dir,(...m)=>logs.push(m.join(' ')));
  assert.equal(back.get().voiceEnabled,false);assert.ok(fs.readdirSync(dir).some(n=>n.startsWith('settings.json.broken-')));assert.match(logs.join('\n'),/last good copy was used/);
  const configFile=path.resolve('config/themes.json'),ws=new WorkstationStore({dir,configFile});ws.persist();ws.persist();fs.writeFileSync(path.join(dir,'workstations.json'),'{oops');
  const again=new WorkstationStore({dir,configFile});assert.ok(Object.keys(again.suits).length);assert.ok(fs.readdirSync(dir).some(n=>n.startsWith('workstations.json.broken-')));
  assert.equal(readJsonKeep(path.join(dir,'missing.json')),undefined);writeJsonKeep(path.join(dir,'x.json'),{a:1});assert.equal(fs.existsSync(path.join(dir,'x.json.bak')),false);
});

test('a failing backup warns once a day, and only the newest 30 backups are kept',async t=>{
  const dir=tmp(t),store=new BrainStore({dir,docs:dir,crypt:{available:()=>true,encrypt:s=>Buffer.from(s),decrypt:b=>b.toString()}}),notes=[];
  const core={store,deps:{userDir:dir,docs:dir,oneDrive:path.join(dir,'none'),routinesEnabled:true,appVersion:'1.87.0',notify:(...m)=>notes.push(m),broadcast(){},todos:{list:()=>[]},calendar:{list:()=>[]},tower:{runs:[]}},orders:{parse:()=>({jobs:[]})},mail:{since:()=>[],ready:()=>false},approvals:{list:()=>[]},push(){},message:async()=>({ok:true})};
  core.travel=new Travel(core);const routines=new Routines(core);store.patch?.({routines:{...store.get().routines,backup:true,weekly:false}});if(!store.get().routines.backup)store.get().routines.backup=true;
  const at=Date.parse('2026-10-03T10:00:00Z');await routines.tick(at);await routines.tick(at+31*60000);await routines.tick(at+62*60000);
  assert.equal(notes.length,1);assert.match(store.state.lastBackup.error,/OneDrive was not found/);
  fs.mkdirSync(path.join(dir,'none','JARVIS Backups'),{recursive:true});const folder=path.join(dir,'none','JARVIS Backups');
  for(let i=0;i<35;i++){const f=path.join(folder,`JARVIS-settings-2026-09-${String(i%30+1).padStart(2,'0')}T02-00-00-${String(i).padStart(3,'0')}Z.zip`);fs.writeFileSync(f,'old');fs.utimesSync(f,new Date(2026,8,1,0,i),new Date(2026,8,1,0,i));}
  fs.writeFileSync(path.join(folder,'my notes.txt'),'keep');await routines.backup();
  const left=fs.readdirSync(folder);assert.equal(left.filter(n=>n.startsWith('JARVIS-settings-')).length,30);assert.ok(left.includes('my notes.txt'));
});

test('times: “10 minutes from now” is relative, and “7 in the morning” follows the trip’s time zone',t=>{
  const now=new Date('2026-10-03T21:00:00');assert.equal(parseWhen('call me 10 minutes from now',now).words,'in 10 minutes');assert.equal(parseWhen('an hour from now',now).words,'in 1 hour');
  const dir=tmp(t),store=new BrainStore({dir,docs:dir,crypt:{available:()=>true,encrypt:s=>Buffer.from(s),decrypt:b=>b.toString()}}),core={store,deps:{},push(){}},travel=new Travel(core);
  store.setState({trip:{city:'Johannesburg',zone:'Africa/Johannesburg',start:'2026-10-12',end:'2026-10-18',flights:[]}});
  const at=Date.parse('2026-10-13T18:00:00Z'),wake=travel.parseWhen('wake me at 7 in the morning',at);assert.equal(new Date(wake.at).toISOString(),'2026-10-14T05:00:00.000Z');
  assert.equal(travel.parseWhen('in 10 minutes',at).at,at+600000);
});

test('stuck cards can be cleared: failed and stopped runs, and rehearsals that cannot be rated; a changed run comes back',t=>{
  const runs=[{id:'f',title:'Failed one',floorName:'Research',status:'failed',error:'Network down',endedAt:1},{id:'r',title:'Rehearsal',floorName:'Research',status:'done',rehearsal:true,endedAt:2},{id:'d',title:'Real',floorName:'Research',status:'done',endedAt:3}];
  const items=attentionItems({runs});assert.equal(items.find(i=>i.id==='run:f').action,'Open to continue');assert.equal(items.find(i=>i.id==='run:f').clearable,true);
  assert.equal(items.find(i=>i.id==='run:r').clearable,true);assert.equal(items.find(i=>i.id==='run:d').clearable,undefined);
  const dir=tmp(t),desk=new Workbench({dir,workstations:{themes:[],activeTheme:'ironman',modules:()=>[]},tower:{runs},runner:{},tabs:{list:()=>[]},missions:{board:()=>[]},core:()=>null});
  desk.acknowledge('run:f');desk.acknowledge('run:r');assert.throws(()=>desk.acknowledge('run:d'),/no longer waiting/);
  assert.deepEqual(desk.attention().items.map(i=>i.id),['run:d']);runs[0].status='budget';runs[0].endedAt=9;assert.ok(desk.attention().items.some(i=>i.id==='run:f'));
});

test('a full meeting work history makes room by dropping the oldest finished meeting, never one with work going',t=>{
  const dir=tmp(t),store=new BrainStore({dir,docs:dir}),tw=new TowerStore({dir,docs:dir}),core={store,push(){},deps:{userDir:dir,tower:tw,workstations:null,ideas:{list:()=>[],save:x=>x}}};
  const work=new MeetingWork(core);work.items=Array.from({length:100},(_,i)=>({id:'m'+i,at:i,suit:'Mark',reserved:0,allowance:1,tasks:[{id:'t',status:i===0?'queued':'done',authorised:true,budget:0}]}));
  work.makeRoom();assert.equal(work.items.length,99);assert.equal(work.items[0].id,'m0');assert.equal(work.items.some(m=>m.id==='m1'),false);
  work.items=Array.from({length:100},(_,i)=>({id:'b'+i,reserved:i===0?1:0,tasks:[{id:'t',status:'queued',authorised:true}]}));assert.throws(()=>work.makeRoom(),/full of work still going/);
});

test('Product Studio stops checking a clip after a day and asks you to look',async t=>{
  const dir=tmp(t),store=new BrainStore({dir,docs:dir}),core={store,approvals:new Approvals({dir}),push(){},deps:{userDir:dir}},studio=new ProductStudio(core);let polled=0;studio.poll=async()=>{polled++;};
  studio.projects=[{id:'00000000-0000-4000-8000-000000000001',job:{state:'queued',at:Date.now()-2*864e5,statusUrl:'https://api.higgsfield.ai/requests/x/status'}},{id:'00000000-0000-4000-8000-000000000002',job:{state:'in_progress',at:Date.now()-60000,statusUrl:'https://api.higgsfield.ai/requests/y/status'}}];
  await studio.tick();assert.equal(studio.projects[0].job.state,'needs check');assert.match(studio.projects[0].job.error,/stopped checking/);assert.equal(polled,1);
  await studio.tick();assert.equal(polled,2);
});
