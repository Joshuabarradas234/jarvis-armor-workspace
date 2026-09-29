import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {Workbench, attentionItems, pageOf} from '../../src/control/workbench.js';
import {snapRect, snapTarget} from '../../dist/assets/window-snap.js';
const page={url:'https://example.com/brief',title:'Project brief',text:'A useful page.'};
const brief={outcome:'A decision-ready summary',audience:'Me',files:'Supplied page',constraints:'Draft only',finished:'Facts, sources and next steps',budget:.5};
function fixture(t){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-workbench-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const floor={id:'research',name:'Research',budget:{perRun:1,perDay:5},engine:'rehearsal'},runs=[],calls=[];
  const workstations={themes:[{id:'ironman',name:'Armor Hall'}],activeTheme:'ironman',modules:()=>[{id:'im1',name:'Mark One'}],suit(id,theme){if(id!=='im1'||theme!=='ironman')throw Error('Unknown suit');return {id,name:'Mark One'};}};
  const tower={runs,tower:()=>({floors:[floor]}),floor(theme,id){if(theme!=='ironman'||id!=='research')throw Error('Unknown floor');return floor;}};
  const runner={async start(...args){calls.push(args);return {id:'run',theme:args[0],floorId:args[1],status:'planning'};}};
  const deps={dir,workstations,tower,runner,tabs:{list:()=>[]},missions:{board:()=>[]},core:()=>null};
  const desk=new Workbench(deps),payload={theme:'ironman',suitId:'im1',floorId:'research',mode:'summarise',pages:[page],brief};
  return {desk,deps,payload,floor,calls,runs,dir,runner};
}
test('attention shelf separates decisions, rework and unaccepted results across halls',()=>{
  const runs=[{id:'bad',theme:'batcave',status:'needs_changes',title:'Fix',feedback:null},{id:'good',theme:'ironman',status:'done',title:'Ready',approvals:[{status:'waiting'}]},{id:'accepted',status:'done',feedback:{good:true}},{id:'rejected',status:'done',feedback:{good:false}},{id:'working',status:'working'}];
  const before=JSON.stringify(runs),items=attentionItems({approvals:[{id:1,title:'Send email',status:'waiting'},{id:2,status:'approved'}],runs});
  assert.equal(items.filter(i=>i.kind==='approval').length,2);assert.equal(items.filter(i=>i.kind==='blocked').length,2);assert.equal(items.filter(i=>i.kind==='finished').length,1);
  assert.equal(items.some(i=>i.runId==='accepted'||i.runId==='working'),false);assert.equal(items[0].kind,'approval');assert.equal(JSON.stringify(runs),before);
});
test('reviewing a suit result only hides that revision and cannot hide a blocker',()=>{
  const m={id:'im1',theme:'ironman',name:'Mark One',status:'done',objective:'Draft',endedAt:123,tasks:[{text:'Check',done:true}]};
  const first=attentionItems({missions:[m]})[0],seen={[first.id]:first.revision};
  assert.equal(attentionItems({missions:[m],seen}).length,0);
  assert.equal(attentionItems({missions:[{...m,endedAt:124}],seen}).length,1);
  assert.equal(attentionItems({missions:[{...m,status:'blocked'}],seen})[0].kind,'blocked');
});
test('a saved page brief survives restart, remembers its team and never starts AI',t=>{
  const {desk,deps,payload,calls}=fixture(t),d=desk.put(payload),reopened=new Workbench(deps);
  assert.equal(calls.length,0);assert.equal(reopened.draft(d.id).pages[0].text,page.text);
  assert.equal(reopened.options().teams['ironman:im1'],'research');assert.equal(reopened.attention().items[0].source,'draft');
});
test('starting sends both comparison excerpts and the owner brief to the selected team',async t=>{
  const {desk,payload,calls}=fixture(t);const d=desk.put({...payload,mode:'compare',pages:[page,{...page,url:'https://example.com/alternative',text:'Other page'}]});
  const result=await desk.start(d.id);assert.equal(result.id,'run');assert.equal(calls.length,1);
  assert.deepEqual(calls[0].slice(0,2),['ironman','research']);assert.match(calls[0][2],/Compare both/);
  const opts=calls[0][3],input=JSON.parse(opts.input);assert.equal(input.kind,'untrusted-page-excerpts');assert.equal(input.pages.length,2);assert.equal(opts.brief.budget,.5);assert.equal(desk.state.drafts.length,0);
});
test('task mode asks for a plan without executing the described work',async t=>{
  const {desk,payload,calls}=fixture(t);await desk.start(desk.put({...payload,mode:'task'}).id);assert.match(calls[0][2],/Do not execute that plan/);
});
test('missing brief fields or spend cap stop work before the agent runs',async t=>{
  const {desk,payload,calls}=fixture(t);
  for(const b of [{...brief,audience:''},{...brief,budget:null}]){const d=desk.put({...payload,brief:b});await assert.rejects(()=>desk.start(d.id),/Complete|spend cap/);}
  assert.equal(calls.length,0);assert.equal(desk.state.drafts.length,2);
});
test('invalid destinations, actions, URLs and missing comparison input are rejected',t=>{
  const {desk,payload}=fixture(t);
  for(const patch of [{theme:'missing'},{suitId:'missing'},{floorId:'missing'},{mode:'delete'},{mode:'compare'},{pages:[{url:'file:///private.txt'}]},{pages:[{url:'https://name:secret@example.com'}]},{mode:'compare',pages:[page,page]}])assert.throws(()=>desk.put({...payload,...patch}));
  assert.equal(desk.state.drafts.length,0);assert.equal(pageOf({...page,text:'x'.repeat(13000)}).text.length,12000);
});
test('a second start or edit cannot duplicate a pending paid run',async t=>{
  const {desk,payload,runner,calls}=fixture(t);let resolve;runner.start=(...args)=>{calls.push(args);return new Promise(r=>resolve=r);};
  const d=desk.put(payload),pending=desk.start(d.id);
  await assert.rejects(()=>desk.start(d.id),/already starting/);assert.throws(()=>desk.put({...payload,id:d.id}),/already starting/);assert.throws(()=>desk.remove(d.id),/starting/);
  resolve({id:'run'});await pending;assert.equal(calls.length,1);
});
test('failed dispatch keeps the brief available for correction',async t=>{
  const {desk,payload,runner}=fixture(t);runner.start=async()=>{throw Error('Team is busy');};const d=desk.put(payload);
  await assert.rejects(()=>desk.start(d.id),/busy/);assert.equal(desk.draft(d.id).id,d.id);assert.equal(desk.busy.size,0);
});
test('automatic floor handoffs cannot silently expand the page-task budget',async t=>{
  const {desk,payload,floor,calls}=fixture(t);floor.handoff='another';const d=desk.put(payload);await assert.rejects(()=>desk.start(d.id),/automatically hands/);assert.equal(calls.length,0);
});
test('an unreadable draft file is preserved instead of overwritten',t=>{
  const {deps,payload,dir}=fixture(t);fs.writeFileSync(path.join(dir,'workbench.json'),'broken');const desk=new Workbench(deps);
  assert.match(desk.attention().error,/could not be read/);assert.throws(()=>desk.put(payload),/backup/);assert.equal(fs.readFileSync(path.join(dir,'workbench.json'),'utf8'),'broken');
});
test('snap geometry tiles odd sized work areas without gaps or lost negative origins',()=>{
  const b={x:-1920,y:-200,width:1919,height:1039},l=snapRect('left',b),r=snapRect('right',b),br=snapRect('bottom-right',b);
  assert.equal(l.x+l.width,r.x);assert.equal(r.x+r.width,b.x+b.width);assert.equal(br.y+br.height,b.y+b.height);assert.equal(snapRect('invalid',b),null);
});
test('snap previews select corners, sides and cancel in the centre',()=>{
  const b={x:6,y:6,width:1280,height:720};assert.deepEqual(snapTarget(10,20,b),snapRect('top-left',b));assert.deepEqual(snapTarget(1280,700,b),snapRect('bottom-right',b));assert.deepEqual(snapTarget(1280,350,b),snapRect('right',b));assert.equal(snapTarget(600,350,b),null);assert.equal(snapTarget(2,2,{x:0,y:0,width:500,height:300}),null);
});
