// 1.89.2: no owner name in the code, and quitting JARVIS while his wake task is being made still removes it.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {ordersTemplate} from '../../src/brain/orders.js';import {BrainStore} from '../../src/brain/store.js';import {WakeTimer,TASK} from '../../src/main/wake-timer.js';

test('a new install has no owner name until you enter one, and still reads properly',t=>{
  assert.match(ordersTemplate(),/My name is \(add your name\)\. Call me "sir"\./);assert.match(ordersTemplate({name:'Alex'}),/My name is Alex\./);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-1892-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const store=new BrainStore({dir,docs:dir});assert.equal(store.get().owner.name,'');store.save({owner:{...store.get().owner,name:'Alex'}});assert.equal(new BrainStore({dir,docs:dir}).get().owner.name,'Alex');
  for(const f of ['src/brain/orders.js','src/brain/store.js','src/tower/seed.js','src/brain/coder.js'])assert.ok(!/Joshua(?!barradas234)/.test(fs.readFileSync(f,'utf8')),f);
});

test('quitting while the wake task is being created waits for it and removes it',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-1892-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const sync=[];let finish;const w=new WakeTimer({dir,platform:'win32',exe:'C:\\JARVIS.exe',exec:()=>new Promise(r=>finish=r),execSync:(cmd,args)=>sync.push(args.join(' '))});
  const p=w.set(Date.now()+3600e3);assert.equal(w.pending,true);const t0=Date.now();w.clearNow();
  assert.ok(Date.now()-t0>=1500);assert.deepEqual(sync,[`/Delete /F /TN ${TASK}`]);finish('');await p;assert.equal(w.pending,false);
  const idle=new WakeTimer({dir,platform:'win32',exec:async()=>'',execSync:()=>sync.push('again')});idle.clearNow();assert.equal(sync.length,1);   // nothing made: nothing to remove
});
