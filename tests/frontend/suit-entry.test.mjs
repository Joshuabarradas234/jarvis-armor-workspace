import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { entryFrame, createEntryMotion, entryZoom, makeDoors, placeDoors, makeEyes } from '../../dist/assets/suit-entry.js';
import { EYE_SURFACES, EYE_PATCHES, EYE_COLOURS } from '../../dist/assets/suit-eyes.js';
import { disposeObject } from '../../dist/assets/scene-quality.js';
import { WorkspaceMachine, DURATIONS } from '../../src/state/machine.js';
const selected=(id,state='SUIT_SELECTED')=>({state,selected:id});
test('the glass starts before eye ignition and choreography completes inside the real selection interval',()=>{
  for(const theme of ['ironman','batcave','spiderman']){
    assert.equal(entryFrame(theme,0).door,0);assert.equal(entryFrame(theme,.6).eyes,0);
    assert.ok(entryFrame(theme,.6).door>.4);
    const final=entryFrame(theme,DURATIONS.SUIT_SELECTED/1000-.1);
    assert.equal(final.door,1);assert.equal(final.eyes,1);assert.equal(final.stance,1);assert.equal(final.pulse,0);
  }
});
test('each hall has a distinct restrained activation stance',()=>{
  const iron=entryFrame('ironman',3),bat=entryFrame('batcave',3),spider=entryFrame('spiderman',3);
  assert.ok(iron.lift>bat.lift);assert.ok(bat.yaw>0&&spider.yaw<0);assert.ok(spider.lean>0&&bat.lean<0);
  for(const pose of [iron,bat,spider]){assert.ok(Math.abs(pose.yaw)<.3&&Math.abs(pose.roll)<.1&&pose.lift<.05);}
});
test('duplicate snapshots and the MODULE transition do not replay the entry',()=>{
  const motion=createEntryMotion('ironman','im1');motion.update(selected('im1'),1000);
  const one=motion.update(selected('im1'),2000),two=motion.update({...selected('im1'),revision:9},2100);
  assert.ok(two.door>=one.door&&two.eyes>=one.eyes);
  assert.equal(motion.update(selected('im1','MODULE'),4100).stance,1);
  assert.equal(motion.update(selected('im1','MODULE'),5000).door,1);
});
test('restoring a MODULE snapshot opens immediately and an unselected suit stays closed',()=>{
  const motion=createEntryMotion('batcave','bc1');
  assert.equal(motion.update(selected('bc2'),0).engaged,false);
  assert.equal(motion.update(selected('bc1','MODULE'),1000).eyes,1);
});
test('returning keeps the selected id but closes its glass, fades its eyes and resets its pose',()=>{
  const motion=createEntryMotion('spiderman','sm1');motion.update(selected('sm1'),0);motion.update(selected('sm1'),2000);
  const start=motion.update(selected('sm1','RETURNING'),3000),middle=motion.update(selected('sm1','RETURNING'),3350),end=motion.update(selected('sm1','RETURNING'),3700);
  assert.equal(start.door,1);assert.equal(middle.door,.5);assert.equal(end.door,0);assert.equal(end.eyes,0);assert.equal(Math.abs(end.yaw),0);assert.equal(end.engaged,false);
  assert.equal(motion.update(selected('sm1'),6000).door,0);
});
test('cancelling part way reverses from the visible pose instead of snapping fully open',()=>{
  const motion=createEntryMotion('ironman','im1');motion.update(selected('im1'),1000);
  const partial=motion.update(selected('im1'),1500),closing=motion.update(selected('im2'),1500);
  assert.equal(closing.door,partial.door);assert.ok(closing.door>0&&closing.door<1);
  assert.ok(motion.update(selected('im2'),1700).door<partial.door);
  assert.equal(motion.update(null,2300).engaged,false);
});
test('reduced motion and still mode retain open glass and eye lights without zoom or stance motion',()=>{
  const motion=createEntryMotion('ironman','im1'),frame=motion.update(selected('im1'),0,true);
  assert.equal(frame.door,1);assert.equal(frame.eyes,1);
  for(const key of ['yaw','lean','roll','lift','forward','scan','pulse'])assert.equal(frame[key],0);
  assert.equal(motion.update(selected('im1','RETURNING'),100,true).engaged,false);
});
test('the real state machine finishes entry and return without leaving active effects',()=>{
  let now=0,scheduled=null,snapshot;
  const machine=new WorkspaceMachine({modules:[{id:'im1'}],now:()=>now,schedule:(fn,ms)=>{scheduled={fn,ms};return 1;},cancel:()=>{scheduled=null;},onChange:s=>{snapshot=s;}});
  const motion=createEntryMotion('ironman','im1');machine.dispatch('debug-hall');machine.dispatch('select','im1');motion.update(snapshot,now);
  now=2900;assert.equal(motion.update(snapshot,now).eyes,1);
  now=3000;scheduled.fn();assert.equal(snapshot.state,'MODULE');assert.equal(motion.update(snapshot,now).door,1);
  machine.dispatch('home');assert.equal(snapshot.selected,'im1');motion.update(snapshot,now);
  now=3800;assert.equal(motion.update(snapshot,now).engaged,false);
  now=5200;scheduled.fn();assert.equal(snapshot.state,'ARMOR_HALL');assert.equal(motion.update(snapshot,now).eyes,0);machine.dispose();
});
const themes=JSON.parse(fs.readFileSync(new URL('../../config/themes.json',import.meta.url),'utf8'));
test('all 21 installed suits have finite model-space eye outlines, including both Spider-Ham faces',()=>{
  const ids=themes.flatMap(t=>t.suits.filter(s=>!s.isVehicle).map(s=>s.id));assert.equal(ids.length,21);
  assert.deepEqual(Object.keys(EYE_SURFACES).sort(),ids.sort());
  assert.equal(EYE_SURFACES.sm3.length,4);
  for(const id of ids){const eyes=EYE_SURFACES[id];assert.equal(eyes.length,id==='sm3'?4:2);assert.ok(new Set(eyes.map(x=>JSON.stringify(x))).size===eyes.length);
    for(const polygon of eyes){assert.ok(polygon.length>=3);for(const point of polygon){assert.equal(point.length,3);assert.ok(point.every(Number.isFinite));assert.ok(point[1]>.3&&point[1]<1.05);assert.ok(Math.abs(point[0])<.5&&Math.abs(point[2])<.5);}}
  }
  for(const colour of Object.values(EYE_COLOURS))assert.match(colour,/^#[0-9a-f]{6}$/i);
});
class V{set(x,y,z){Object.assign(this,{x,y,z});return this;}}
class Group{constructor(){this.children=[];this.position=new V();this.scale=new V();this.rotation=new V();this.visible=true;}add(o){this.children.push(o);}traverse(fn){fn(this);for(const o of this.children)o.traverse(fn);}}
class Geometry{constructor(w,h){this.w=w;this.h=h;this.disposed=0;}setAttribute(k,v){this[k]=v;}dispose(){this.disposed++;}}
class Material{constructor(v){Object.assign(this,v);this.disposed=0;}dispose(){this.disposed++;}}
class Mesh extends Group{constructor(geometry,material){super();Object.assign(this,{geometry,material});}}
const T={Group,Mesh,PlaneGeometry:Geometry,BufferGeometry:Geometry,MeshBasicMaterial:Material,DoubleSide:2,Float32BufferAttribute:class{constructor(array,itemSize){Object.assign(this,{array,itemSize});}}};
test('two visible glass leaves meet when closed and clear the suit opening when open',()=>{
  const doors=makeDoors(T,{},'#7fd6e8');placeDoors(doors,0,2,4,2,.55,true);
  assert.equal(doors.leaves.length,2);assert.equal(doors.leaves[0].leaf.position.x,-.25);assert.equal(doors.leaves[1].leaf.position.x,.25);
  placeDoors(doors,1,2,4,2,.55,true);
  for(const {leaf,side} of doors.leaves){assert.ok(Math.abs(leaf.position.x)-.25>.5);assert.ok(leaf.rotation.y*side>0);assert.equal(leaf.children[0].material.opacity,.85);}
  assert.equal(doors.root.visible,true);assert.ok(doors.latches.every(l=>l.material.opacity===0));
  placeDoors(doors,0,2,4,2,.55,false);assert.equal(doors.root.visible,false);
});
test('eye lights are depth-tested surface meshes parented to the moving suit and release their resources',()=>{
  const pivot=new Group(),eyes=makeEyes(T,pivot,EYE_PATCHES.sm3,'#ffffff');
  assert.equal(eyes.length,4);assert.deepEqual(pivot.children,eyes);
  for(const eye of eyes){assert.equal(eye.material.depthTest,true);assert.equal(eye.material.depthWrite,false);assert.equal(eye.visible,false);assert.ok(eye.geometry.position.array.length>=9);}
  disposeObject(pivot);
  for(const eye of eyes){assert.equal(eye.geometry.disposed,1);assert.equal(eye.material.disposed,1);}
});
test('glass frames release resources without disposing the renderer-owned shared glass texture',()=>{
  const texture={isTexture:true,count:0,dispose(){this.count++;}},doors=makeDoors(T,texture,'#ffffff');
  disposeObject(doors.root,new Set([texture]));assert.equal(texture.count,0);
  doors.root.traverse(o=>{if(o.geometry)assert.equal(o.geometry.disposed,1);if(o.material)assert.equal(o.material.disposed,1);});
});

test('end-pod zooms keep the artwork covering the window instead of revealing a blank half-screen',()=>{
  for(const theme of themes){
    const stage=JSON.parse(fs.readFileSync(new URL('../../assets/wallpaper/'+theme.id+'-empty.json',import.meta.url),'utf8'));
    for(const [W,H] of [[1280,720],[1440,900],[1920,1080]]){
      const k=Math.min(W/stage.w,H/stage.h),ox=(W-stage.w*k)/2,oy=(H-stage.h*k)/2;
      for(const b of Object.values(stage.bays)){
        const r={W,H,x:ox+b.x0*k,y:oy+b.y0*k,w:(b.x1-b.x0)*k,h:(b.y1-b.y0)*k,imageLeft:ox,imageRight:W-ox,imageTop:oy,imageBottom:H-oy};
        const z=entryZoom(r,.9);
        const left=W/2+(ox-W/2)*z.scale+z.x,right=W/2+(W-ox-W/2)*z.scale+z.x;
        assert.ok(left<=.001&&right>=W-.001);
        const centre=W/2+(r.x+r.w/2-W/2)*z.scale+z.x;
        assert.ok(centre-r.w*z.scale/2>=-.001&&centre+r.w*z.scale/2<=W+.001);
      }
    }
  }
});

test('every eye has a pre-baked curved surface with finite, bounded triangle vertices',()=>{
  assert.deepEqual(Object.keys(EYE_PATCHES).sort(),Object.keys(EYE_SURFACES).sort());
  for(const [id,eyes] of Object.entries(EYE_PATCHES)){
    assert.equal(eyes.length,EYE_SURFACES[id].length);
    for(const positions of eyes){assert.ok(positions.length>=9);assert.equal(positions.length%9,0);assert.ok(positions.every(Number.isFinite));
      for(let i=0;i<positions.length;i+=3){assert.ok(Math.abs(positions[i])<.5);assert.ok(positions[i+1]>.3&&positions[i+1]<1.05);assert.ok(Math.abs(positions[i+2])<.5);}
    }
  }
});
