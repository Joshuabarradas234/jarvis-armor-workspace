import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {TowerStore} from '../../src/tower/store.js';import {TowerRunner} from '../../src/tower/orchestrator.js';
import {reviewOf,briefGaps,briefOf,usefulness} from '../../src/tower/productivity.js';
import {IdeaStore} from '../../src/services/ideas.js';import {WorkSuggestions} from '../../src/services/work-suggestions.js';
import {throwTarget} from '../../dist/assets/screen-transfer.js';
const brief={outcome:'A usable summary',audience:'The project owner',files:'None needed',constraints:'British English',finished:'Three accurate bullets',budget:1,preferences:'Short sentences',checklist:'Check every claim'};
const approved='VERDICT: APPROVED\nNOTES: All acceptance checks passed.\n---\nThe complete result.';
function fixture(t,reviews=[approved]){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-productivity-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=new TowerStore({dir,docs:dir});const floor=store.tower('ironman').floors[0];floor.handoff='';floor.engine='api';floor.budget={perRun:2,perDay:10};
 const runner=new TowerRunner({store,getKey:()=>'',onDone:()=>{runner.done=(runner.done||0)+1;}});
 runner.engines=async()=>({api:{ready:true},claudeCode:{ready:false}});
 runner.ask=async(r,p)=>{r.calls++;r.cost+=.01;if(p.kind==='plan')return JSON.stringify({summary:'Plan',steps:[{agent:floor.agents.find(a=>a.role==='specialist').id,title:'Summary',instructions:'Write it',after:[]}]});if(p.kind==='work'){runner.work=(runner.work||0)+1;return 'Draft '+runner.work;}return reviews.shift()||approved;};
 return {dir,store,floor,runner};
}
async function finish(f,opts={brief}){const first=await f.runner.start('ironman',f.floor.id,'Write the summary',opts);for(let n=0;n<100&&f.runner.live.has(first.id);n++)await new Promise(r=>setTimeout(r,5));assert.equal(f.runner.live.has(first.id),false);return f.store.runs.find(r=>r.id===first.id);}
test('review sign-off fails closed on missing, conflicting or malformed verdict and failed workers',()=>{
 const steps=[{status:'done'}];assert.equal(reviewOf(approved,steps).verdict,'APPROVED');
 for(const text of ['Looks good',approved.replace('APPROVED','CHANGES'),approved.replace('NOTES: All acceptance checks passed.','NOTES:'),'VERDICT: CHANGES\n'+approved,approved.replace('result.','') .split('---')[0]])assert.equal(reviewOf(text,steps).verdict,'CHANGES');
 assert.equal(reviewOf(approved,[{status:'failed'}]).verdict,'CHANGES');assert.equal(reviewOf(approved,[]).verdict,'CHANGES');
});
test('missing brief fields stop before any model call',async t=>{const f=fixture(t),r=await finish(f,{});assert.equal(r.status,'needs_brief');assert.equal(r.calls,0);assert.ok(r.questions.length>=4);assert.equal(f.runner.work,undefined);assert.equal(briefGaps(briefOf(brief)).length,0);});
test('CHANGES returns to workers, then an approved repair completes once without automatic learning',async t=>{
 const f=fixture(t,[approved.replace('APPROVED','CHANGES'),approved]),r=await finish(f);
 assert.equal(r.status,'done');assert.equal(r.progress,100);assert.equal(r.rework,1);assert.equal(f.runner.work,2);assert.equal(r.reviews.length,2);assert.equal(f.runner.done,1);assert.ok(fs.existsSync(r.final));assert.equal(f.floor.lessons,'');
});
test('failed second review cannot produce a final or hand off to the next floor',async t=>{
 const f=fixture(t,[approved.replace('APPROVED','CHANGES'),'missing verdict']);f.floor.handoff=f.store.tower('ironman').floors[1].id;
 const r=await finish(f);assert.equal(r.status,'needs_changes');assert.equal(r.final,null);assert.equal(r.handedTo,null);assert.equal(f.store.runs.length,1);assert.equal(f.runner.done,undefined);assert.equal(f.runner.work,2);assert.throws(()=>f.runner.feedback(r.id,true,''));
});
test('lead questions pause before worker calls',async t=>{const f=fixture(t);f.runner.ask=async()=>JSON.stringify({questions:['Which month?'],steps:[]});const r=await finish(f);assert.equal(r.status,'needs_brief');assert.deepEqual(r.questions,['Which month?']);assert.equal(f.runner.work,undefined);});
test('missing or forward plan dependencies cannot start a worker on unfinished inputs',async t=>{const f=fixture(t);f.runner.ask=async()=>JSON.stringify({steps:[{agent:f.floor.agents.find(a=>a.role==='specialist').id,after:['missing']} ]});const r=await finish(f);assert.equal(r.status,'failed');assert.match(r.error,/dependency/);assert.equal(f.runner.work,undefined);});
test('older runs marked done despite CHANGES are reopened as needing correction',async t=>{const f=fixture(t);f.store.runs.push({id:'old',status:'done',verdict:'CHANGES',final:'invalid',progress:100,approvals:[{status:'waiting'}]});f.store.flush();const loaded=new TowerStore({dir:f.dir,docs:f.dir}),r=loaded.runs.find(r=>r.id==='old');assert.equal(r.status,'needs_changes');assert.equal(r.final,null);assert.equal(r.progress,96);assert.equal(r.approvals.length,0);});
test('budget failure during a correction prevents finalisation',async t=>{const f=fixture(t,[approved.replace('APPROVED','CHANGES')]),ask=f.runner.ask;f.runner.ask=async(r,p)=>{if(p.kind==='work'&&r.rework){const e=Error('Budget cap');e.budget=true;throw e;}return ask(r,p);};const r=await finish(f);assert.equal(r.status,'budget');assert.equal(r.final,null);assert.equal(f.runner.done,undefined);});
test('only owner-accepted real results become workflows; acceptance does not award XP twice',async t=>{
 const f=fixture(t),r=await finish(f);assert.throws(()=>f.store.saveWorkflow(r.id));f.runner.feedback(r.id,true,'Keep the concise style');const xp=f.store.floor('ironman',f.floor.id).agents.map(a=>a.xp);f.runner.feedback(r.id,true,'Again');assert.deepEqual(f.store.floor('ironman',f.floor.id).agents.map(a=>a.xp),xp);
 const w=f.store.saveWorkflow(r.id);assert.equal(w.example,'The complete result.\n');assert.equal(w.brief.preferences,'Short sentences');assert.equal(f.store.metrics('ironman').total.accepted,1);
 const loaded=new TowerStore({dir:f.dir,docs:f.dir});assert.equal(loaded.workflows('ironman')[0].id,w.id);assert.equal(loaded.metrics('ironman').total.accepted,1);
 r.rehearsal=true;assert.throws(()=>f.store.saveWorkflow(r.id));
});
test('usefulness counts accepted results and total wasted spend; zero acceptance has no ratio',()=>{
 const runs=[{status:'done',verdict:'APPROVED',feedback:{good:true},cost:2,startedAt:100,endedAt:1100},{status:'needs_changes',rework:1,cost:1},{rehearsal:true,cost:99,feedback:{good:true}}];const m=usefulness(runs);assert.equal(m.accepted,1);assert.equal(m.costPerAccepted,3);assert.equal(m.rework,1);assert.equal(m.completionMs,1000);assert.equal(usefulness([]).costPerAccepted,null);
});
test('suggestions are local, bounded, deduplicated, persistent and never automatically assisted',t=>{
 const {dir}=fixture(t),ideas=new IdeaStore(dir),s=new WorkSuggestions(dir,()=>ideas);let time=Date.UTC(2026,8,28,12);
 for(let i=0;i<8;i++)s.observe('suit',{theme:'batcave',id:'bc1',name:'Test suit',suit:true,pageText:'SECRET'},time+=31000);
 assert.equal(ideas.list().length,1);const idea=ideas.list()[0];assert.equal(idea.assist,null);assert.equal(idea.origin,'local-suggestion');assert.equal(idea.target.id,'bc1');assert.ok(!fs.readFileSync(s.file,'utf8').includes('SECRET'));
 const loaded=new WorkSuggestions(dir,()=>ideas);loaded.observe('suit',{theme:'batcave',id:'bc1'},time+=31000);assert.equal(ideas.list().length,1);
 loaded.configure(false);for(let i=0;i<10;i++)loaded.observe('move',{id:'bc2'},time+=31000);assert.equal(ideas.list().length,1);
 loaded.configure(true);for(const id of ['bc2','bc3'])for(let i=0;i<4;i++)loaded.observe('move',{id},time+=31000);assert.equal(ideas.list().length,2);
 ideas.remove(idea.id);loaded.observe('suit',{theme:'batcave',id:'bc1'},time+=31000);assert.equal(ideas.list().length,1,'dismissed suggestions do not immediately return');
});
test('tab throws require hold, deliberate displacement and a screen in that direction',()=>{
 const screens=[{id:1,current:true,bounds:{x:0,y:0,width:1600,height:900}},{id:2,bounds:{x:0,y:900,width:1600,height:900}},{id:3,bounds:{x:-1920,y:0,width:1920,height:1080}}];
 assert.equal(throwTarget(screens,0,.3,600).id,2);assert.equal(throwTarget(screens,-.3,0,600).id,3);assert.equal(throwTarget(screens,.3,0,600),null);assert.equal(throwTarget(screens,0,.3,100),null);assert.equal(throwTarget(screens,0,.04,600),null);assert.equal(throwTarget([screens[0]],0,.3,600),null);
});
