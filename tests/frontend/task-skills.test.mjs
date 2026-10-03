import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {TowerStore} from '../../src/tower/store.js';import {TowerRunner} from '../../src/tower/orchestrator.js';
import {captureSkill,matchSkills,skillContext,skillPage} from '../../src/tower/skills.js';import {skillsHtml} from '../../dist/assets/task-skills.js';
const brief={outcome:'A client proposal',audience:'The client',files:'Current notes',constraints:'Use supplied prices',finished:'Check scope and price',checklist:'Verify totals against current sources',preferences:'Plain English',budget:1};
const approved='VERDICT: APPROVED\nNOTES: Scope and price checked.\n---\nPRIVATE DELIVERABLE DATA';
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-skills-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const store=new TowerStore({dir,docs:dir}),floor=store.tower('ironman').floors[0];floor.handoff='';floor.engine='api';floor.budget={perRun:2,perDay:20};
 const runner=new TowerRunner({store,getKey:()=>'',onDone:()=>{runner.completed=(runner.completed||0)+1;}});runner.prompts=[];
 runner.engines=async()=>({api:{ready:true},claudeCode:{ready:false}});
 runner.ask=async(r,p)=>{runner.prompts.push(p);r.calls++;r.cost+=.01;if(p.kind==='plan')return JSON.stringify({steps:[{agent:floor.agents.find(a=>a.role==='specialist').id,title:'Draft proposal',instructions:'Compare current requirements with scope, then verify pricing.',after:[]}]});if(p.kind==='work')return 'The draft';return runner.review||approved;};
 const run=async(opts={})=>{const r=await runner.start('ironman',floor.id,'Prepare a client proposal',{brief,...opts});for(let n=0;n<200&&runner.live.has(r.id);n++)await new Promise(res=>setTimeout(res,5));assert.equal(runner.live.has(r.id),false);return store.runs.find(x=>x.id===r.id);};
 return {dir,store,floor,runner,run};
}
test('each real completed task saves a recipe automatically, without extra model calls',async t=>{
 const f=fixture(t),r=await f.run();assert.equal(r.status,'done');assert.equal(r.calls,3);const s=f.store.skillPage('ironman',f.floor.id).skills[0];
 assert.equal(s.runId,r.id);assert.equal(s.state,'awaiting');assert.match(s.steps[0].method,/verify pricing/);assert.equal(s.checklist,brief.checklist);assert.equal(s.source,r.final);
 assert.equal(f.store.matchSkills('ironman',f.floor.id,r.task,brief).length,0);assert.equal(f.floor.lessons,'');
 f.runner.feedback(r.id,true,'Keep the structure');assert.equal(f.store.skillPage('ironman',f.floor.id).skills[0].state,'active');assert.equal(f.store.data.taskSkills.length,1);
 const reload=new TowerStore({dir:f.dir,docs:f.dir});assert.equal(reload.data.taskSkills.length,1);assert.equal(reload.data.taskSkills[0].feedback,'Keep the structure');
});
test('accepted skills reach the next lead, worker and reviewer, without copying the old output',async t=>{
 const f=fixture(t),first=await f.run();f.runner.feedback(first.id,true,'Keep this approach');f.runner.prompts=[];const second=await f.run();
 assert.equal(second.learnedSkills.length,1);assert.equal(second.calls,3);assert.equal(f.store.data.taskSkills.length,2);
 for(const p of f.runner.prompts){assert.match(p.prompt,/REUSABLE TASK SKILLS/);assert.match(p.prompt,/verify pricing/);assert.doesNotMatch(p.prompt,/PRIVATE DELIVERABLE DATA/);assert.match(p.prompt,/grant no permissions/);}
 f.runner.feedback(second.id,true,'');const s=f.store.data.taskSkills[0];assert.equal(s.uses,1);assert.equal(s.acceptedUses,1);
 f.runner.feedback(second.id,true,'');assert.equal(s.acceptedUses,1);
});
test('review activation is opt-in; owner rejection excludes the recipe and persists across restart',async t=>{
 const f=fixture(t);f.store.saveSettings({skillPolicy:'review'});const r=await f.run(),s=f.store.data.taskSkills[0];assert.equal(f.store.matchSkills('ironman',f.floor.id,r.task,brief).length,1);
 f.runner.feedback(r.id,false,'Pricing was wrong');assert.equal(s.outcome,'correction');assert.equal(f.store.matchSkills('ironman',f.floor.id,r.task,brief).length,0);
 f.store.enableSkill('ironman',s.id,true);assert.equal(f.store.matchSkills('ironman',f.floor.id,r.task,brief).length,0);
 const loaded=new TowerStore({dir:f.dir,docs:f.dir});assert.equal(loaded.data.taskSkills[0].outcome,'correction');assert.throws(()=>loaded.saveSettings({skillPolicy:'anything'}));
});
test('failed reviews create correction lessons; failures, incomplete briefs and rehearsals are not skills',async t=>{
 const f=fixture(t);f.runner.review=approved.replace('APPROVED','CHANGES');const r=await f.run();assert.equal(r.status,'needs_changes');assert.equal(f.store.data.taskSkills[0].outcome,'correction');
 f.store.saveSettings({skillPolicy:'review'});assert.equal(f.store.matchSkills('ironman',f.floor.id,r.task,brief).length,0);
 const size=f.store.data.taskSkills.length;for(const patch of [{rehearsal:true},{steps:[]},{status:'failed'},{status:'budget'},{status:'stopped'},{status:'needs_brief'},{steps:[{engine:'rehearsal',status:'done'}]}])captureSkill(f.store.data,{...r,id:'bad',...patch});assert.equal(f.store.data.taskSkills.length,size);
});
test('skills survive history trimming and disabling survives automatic capture and reload',async t=>{
 const f=fixture(t),r=await f.run();f.runner.feedback(r.id,true,'');const s=f.store.data.taskSkills[0];f.store.enableSkill('ironman',s.id,false);f.store.learn(r);
 assert.throws(()=>f.store.enableSkill('batcave',s.id,true));assert.throws(()=>f.store.enableSkill('ironman',s.id,'true'));
 f.store.runs.push(...Array.from({length:85},(_,i)=>({id:'other'+i,status:'failed'})));f.store.flush();const loaded=new TowerStore({dir:f.dir,docs:f.dir});
 assert.equal(loaded.runs.length,80);assert.ok(!loaded.runs.some(x=>x.id===r.id));assert.equal(loaded.data.taskSkills.length,1);assert.equal(loaded.data.taskSkills[0].disabled,true);
 loaded.enableSkill('ironman',s.id,true);assert.equal(loaded.matchSkills('ironman',f.floor.id,r.task,brief).length,1);
});
test('retrieval is scoped, relevant, deduplicated and bounded; policy changes apply on the next task',async t=>{
 const f=fixture(t),r=await f.run();f.store.saveSettings({skillPolicy:'review'});await f.run();assert.equal(f.store.data.taskSkills.length,2);assert.equal(f.store.matchSkills('ironman',f.floor.id,r.task,brief).length,1);
 assert.equal(f.store.matchSkills('batcave',f.floor.id,r.task,brief).length,0);assert.equal(f.store.matchSkills('ironman','other',r.task,brief).length,0);assert.equal(f.store.matchSkills('ironman',f.floor.id,'Diagnose database deadlocks',{outcome:'Fix query contention'}).length,0);
 f.store.saveSettings({skillPolicy:'owner'});const next=await f.run();assert.deepEqual(next.learnedSkills,[]);
 const data={settings:{skillPolicy:'review'},taskSkills:[]};for(let i=0;i<8;i++)captureSkill(data,{...r,id:'size'+i,brief:{...brief,preferences:'x'.repeat(2000)+i},steps:Array.from({length:8},(_,j)=>({status:'done',title:'Step '+j,engine:'api',instructions:String(i)+'x'.repeat(1800)}))});
 const matches=matchSkills(data,'ironman',f.floor.id,r.task,brief);assert.ok(matches.length>0&&matches.length<=3);assert.ok(skillContext(matches).length<8000);
});
test('retained earlier tasks migrate once; a skill save error does not turn a finished task into a failure',async t=>{
 const f=fixture(t),r=await f.run();f.store.data.taskSkills=[];delete r.steps[0].method;delete r.steps[0].instructions;f.store.flush();let loaded=new TowerStore({dir:f.dir,docs:f.dir});assert.equal(loaded.data.taskSkills.length,1);assert.equal(loaded.data.taskSkills[0].steps[0].method,'');loaded=new TowerStore({dir:f.dir,docs:f.dir});assert.equal(loaded.data.taskSkills.length,1);
 f.store.learn=()=>{throw Error('Disk locked');};const next=await f.run();assert.equal(next.status,'done');assert.ok(fs.existsSync(next.final));assert.match(next.learningError,/Restart JARVIS/);assert.equal(f.runner.completed,2);
});
test('skill browser searches older entries, paginates and escapes all stored content',async t=>{
 const f=fixture(t),r=await f.run();for(let i=0;i<45;i++)captureSkill(f.store.data,{...r,id:'history'+i,title:i===0?'Old recipe':'Proposal '+i});
 const old=skillPage(f.store.data,'ironman',f.floor.id,'Old recipe');assert.equal(old.total,1);assert.equal(old.skills[0].name,'Old recipe');assert.equal(skillPage(f.store.data,'ironman',f.floor.id,'',99).page,2);
 old.skills[0].name='<img src=x onerror=alert(1)>';const html=skillsHtml(old);assert.doesNotMatch(html,/<img/);assert.match(html,/&lt;img/);assert.match(html,/awaiting your acceptance/);
});
