import test from 'node:test';
import assert from 'node:assert/strict';
import {signatureFrame,addEyeHalos,lightEyes} from '../../dist/assets/suit-signatures.js';
test('Iron Man eyes and reactor power up together without blinking off',()=>{
 const frames=Array.from({length:31},(_,i)=>signatureFrame('ironman',i/10));
 assert.ok(frames.every(f=>f.eye>=.9&&f.eye<=1&&f.reactor>=.45&&f.reactor<=1.5));
 assert.ok(Math.max(...frames.map(f=>f.eye))-Math.min(...frames.map(f=>f.eye))>.09);
 assert.ok(signatureFrame('ironman',1.5).reactor>signatureFrame('ironman',3).reactor);assert.ok(signatureFrame('ironman',1.5).ring>.8);assert.equal(signatureFrame('ironman',3).ring,0);
 assert.equal(signatureFrame('ironman',3,true).eye,signatureFrame('ironman',1,true).eye);
});
test('Batman and Spider-Man signature projections are bounded, temporary and suppressed in reduced motion',()=>{
 for(const theme of ['batcave','spiderman']){assert.equal(signatureFrame(theme,0).projection,0);assert.ok(signatureFrame(theme,1.5).projection>.3);assert.equal(signatureFrame(theme,3).projection,0);assert.equal(signatureFrame(theme,1.5,true).projection,0);}
 assert.equal(signatureFrame('ironman',1.5).projection,0);assert.ok(signatureFrame('spiderman',1).sweep<signatureFrame('spiderman',1.7).sweep);
});
test('eye halos follow their fitted surface and the quality setting without changing its vertices',()=>{
 const geometry={},eye={geometry,children:[],material:{},userData:{},add(n){this.children.push(n);}};
 const T={Mesh:class{constructor(g,m){this.geometry=g;this.material=m;this.scale={setScalar(n){this.value=n;}};}},MeshBasicMaterial:class{constructor(v){Object.assign(this,v);}},AdditiveBlending:2,DoubleSide:2};
 addEyeHalos(T,eye);assert.equal(eye.children.length,2);assert.ok(eye.children.every(h=>h.geometry===geometry&&h.material.depthTest&&!h.material.depthWrite));
 const frame=signatureFrame('ironman',1.5);lightEyes(eye,1,frame,false);assert.equal(eye.visible,true);assert.ok(eye.children[0].material.opacity>0);assert.equal(eye.children[1].visible,false);
 lightEyes(eye,1,frame,true);assert.equal(eye.children[1].visible,true);lightEyes(eye,0,frame,true);assert.equal(eye.visible,false);assert.ok(eye.children.every(h=>h.material.opacity===0));
});
