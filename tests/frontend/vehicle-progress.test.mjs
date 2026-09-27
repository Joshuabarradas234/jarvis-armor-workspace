import test from 'node:test';import assert from 'node:assert/strict';
import {missionProgress} from '../../dist/assets/mission-progress.js';
import {vehicleFraming,vehicleActive} from '../../dist/assets/vehicle-hologram.js';
import {AgentRunner} from '../../src/control/runner.js';
test('an active agent shows working before it reports any percentage',()=>{
 const p=missionProgress({status:'running',progress:0});assert.equal(p.visible,true);assert.equal(p.indeterminate,true);assert.equal(p.text,'Working');
 assert.equal(missionProgress({status:'running',progress:43}).text,'Working · 43%');assert.equal(missionProgress({status:'running',progress:43}).indeterminate,false);
});
test('queued, blocked, finished and idle states remain distinct and bounded',()=>{
 assert.equal(missionProgress({status:'planned'}).text,'Queued');assert.equal(missionProgress({status:'blocked',progress:75}).text,'Needs attention');assert.equal(missionProgress({status:'done',progress:100}).text,'Done');assert.equal(missionProgress({status:'idle'}).visible,false);assert.equal(missionProgress({status:'unknown'}).visible,false);
 assert.equal(missionProgress({progress:Infinity}).pct,100);assert.equal(missionProgress({progress:-3}).pct,0);assert.equal(missionProgress({progress:'bad'}).pct,0);
});
test('the complete vehicle stays in its fixed frame for every rotation and viewport shape',()=>{
 const size={x:.423,y:.272,z:1},e=.40;
 for(const aspect of [.75,1,1.5,2,3]){const {span,targetY}=vehicleFraming(size,aspect);for(let i=0;i<72;i++){const a=i*Math.PI/36;for(const x of [-size.x/2,size.x/2])for(const y of [0,size.y])for(const z of [-size.z/2,size.z/2]){const X=x*Math.cos(a)+z*Math.sin(a),Z=z*Math.cos(a)-x*Math.sin(a),Y=(y-targetY)*Math.cos(e)-Z*Math.sin(e);assert.ok(Math.abs(X)<=span*aspect/2);assert.ok(Math.abs(Y)<=span/2);}}}
});
test('the Batmobile pauses outside the visible Batcave overview',()=>{
 const p={theme:'batcave',state:'ARMOR_HALL',hidden:false,covered:false};assert.equal(vehicleActive(p),true);assert.equal(vehicleActive({...p,state:'SUIT_HOVER'}),true);
 for(const patch of [{theme:'ironman'},{state:'MODULE'},{state:'SUIT_SELECTED'},{hidden:true},{covered:true}])assert.equal(vehicleActive({...p,...patch}),false);
});
test('agent progress lines and task completion update the correct suit independently',()=>{
 const state=new Map(),updates=[],key=(t,id)=>t+':'+id;
 const missions={get(t,id){return state.get(key(t,id))||{tasks:[{text:'Check',done:false}],progress:0};},set(t,id,p){state.set(key(t,id),{...this.get(t,id),...p});},note(){}};
 const runner=new AgentRunner({missions,onUpdate(){}});runner.onUpdate=(t,id)=>updates.push(key(t,id));runner.handle('batcave','bc1','PROGRESS 42');runner.handle('batcave','bc2','PROGRESS 65');runner.handle('batcave','bc1','TASK done 1');
 assert.equal(missions.get('batcave','bc1').progress,42);assert.equal(missions.get('batcave','bc2').progress,65);assert.equal(missions.get('batcave','bc1').tasks[0].done,true);assert.equal(missions.get('batcave','bc2').tasks[0].done,false);assert.deepEqual(updates,['batcave:bc1','batcave:bc2','batcave:bc1']);
});
