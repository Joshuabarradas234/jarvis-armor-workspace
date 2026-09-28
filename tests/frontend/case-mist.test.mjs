import test from 'node:test';import assert from 'node:assert/strict';
import {mistFrame,mistLayers,makeCaseMist,updateCaseMist} from '../../dist/assets/case-mist.js';
import {createEntryMotion} from '../../dist/assets/suit-entry.js';
import {renderBudget} from '../../dist/assets/render-budget.js';

test('pressure release fills the suit from its feet to above its head, then reveals it',()=>{
 for(let i=0;i<8;i++){for(const t of [-1,0,.12,.14,2.25,3,100,NaN,Infinity])assert.equal(mistFrame(t,i),null);assert.ok(mistFrame(.7,i).opacity>.38);}
 for(const i of [0,1,2,3]){const p=mistFrame(.8,i);assert.ok(p.y-p.height/2<-.5);assert.ok(p.y+p.height/2>.5);assert.ok(p.x-p.width/2<-.5);assert.ok(p.x+p.width/2>.5);assert.ok(p.opacity>.6);}
 for(let t=0;t<2.3;t+=.01)for(let i=0;i<8;i++){const p=mistFrame(t,i);if(!p)continue;assert.ok(Object.values(p).every(Number.isFinite));assert.ok(p.opacity>=0&&p.opacity<=.62);}
 for(const i of [0,1,2,3]){let previous=1;for(let t=1;t<2.25;t+=.025){const p=mistFrame(t,i);assert.ok(p.opacity<=previous);previous=p.opacity;}assert.ok(mistFrame(2.1,i).opacity<.04);}
 for(const i of [-1,8,.5,NaN])assert.equal(mistFrame(.8,i),null);
});
test('battery mode keeps the full-body burst with fewer layers; reduced motion disables it',()=>{
 for(const quality of ['low','medium','high','ultra']){const b=renderBudget({quality,animations:true},{onBattery:false});assert.equal(mistLayers(b),{low:4,medium:6,high:8,ultra:8}[quality]);assert.equal(mistLayers({...b,quiet:true}),0);}
 assert.equal(mistLayers(renderBudget({quality:'ultra'},{onBattery:true})),4);
 assert.equal(mistLayers(renderBudget({},{},{reduced:true})),0);
 assert.equal(mistLayers(renderBudget({animations:false})),0);
});
test('returning, late model loads and workstation entry never replay the pressure burst',()=>{
 const m=createEntryMotion('batcave','bc1');const select={state:'SUIT_SELECTED',selected:'bc1'};
 m.update(select,0);assert.ok(mistFrame(m.update(select,500).seconds));assert.equal(mistFrame(m.update({state:'RETURNING',selected:'bc1'},600).seconds),null);
 const late=createEntryMotion('ironman','im1');const tail=mistFrame(late.update({state:'SUIT_SELECTED',selected:'im1'},0,false,1900).seconds);assert.ok(tail.opacity<.2,'A late model joins the fading tail rather than restarting the burst');assert.equal(mistFrame(late.update({state:'SUIT_SELECTED',selected:'im1'},500).seconds),null);
 const module=createEntryMotion('spiderman','sm1');assert.equal(mistFrame(module.update({state:'MODULE',selected:'sm1'},0).seconds),null);
});

test('rendered mist stays in front of projecting armour and disappears on cancellation or quiet mode',()=>{
 class Group{constructor(){this.children=[];}add(o){this.children.push(o);}}
 const vector=()=>({set(...v){this.value=v;}});
 class Mesh{constructor(g,m){this.geometry=g;this.material=m;this.position=vector();this.scale=vector();this.rotation={};}}
 class Material{constructor(v){Object.assign(this,v);}}
 const mist=makeCaseMist({Group,Mesh,PlaneGeometry:class{},ShaderMaterial:Material,DoubleSide:2});
 updateCaseMist(mist,.8,renderBudget({quality:'high'},{onBattery:true}));assert.equal(mist.root.visible,true);assert.equal(mist.clouds.filter(c=>c.visible).length,4);
 for(const cloud of mist.clouds.filter(c=>c.visible)){assert.equal(cloud.material.depthTest,false);assert.equal(cloud.material.depthWrite,false);assert.ok(cloud.scale.value[1]>1.3);}
 for(const [seconds,budget] of [[0,renderBudget()],[2.3,renderBudget()],[.8,renderBudget({animations:false})]]){updateCaseMist(mist,seconds,budget);assert.equal(mist.root.visible,false);assert.ok(mist.clouds.every(c=>!c.visible));}
});
