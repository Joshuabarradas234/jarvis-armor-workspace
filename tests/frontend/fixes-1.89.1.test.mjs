// 1.89.1: hall transitions and the welcome video play at full speed, and a hall's background always follows its suits.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {byteRange,rangeResponse} from '../../src/main/ranges.js';

test('byte ranges are read the way video players ask for them',()=>{
  assert.deepEqual(byteRange('bytes=0-',1000),{start:0,end:999});assert.deepEqual(byteRange('bytes=100-199',1000),{start:100,end:199});
  assert.deepEqual(byteRange('bytes=900-5000',1000),{start:900,end:999});assert.deepEqual(byteRange('bytes=-200',1000),{start:800,end:999});
  assert.deepEqual(byteRange('bytes=1000-',1000),{bad:true});assert.deepEqual(byteRange('bytes=500-100',1000),{bad:true});
  assert.equal(byteRange('bytes=0-1,5-6',1000),null);assert.equal(byteRange('items=0-1',1000),null);assert.equal(byteRange('',1000),null);
});

test('a range request gets 206 with Content-Range and exactly those bytes; out of range is 416',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-1891-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'clip.mp4'),data=Buffer.from(Array.from({length:5000},(_,i)=>i%251));fs.writeFileSync(file,data);
  const r=rangeResponse(file,'bytes=1000-1999',{'Access-Control-Allow-Origin':'*'});
  assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),'bytes 1000-1999/5000');assert.equal(r.headers.get('content-length'),'1000');
  assert.equal(r.headers.get('content-type'),'video/mp4');assert.equal(r.headers.get('accept-ranges'),'bytes');assert.equal(r.headers.get('access-control-allow-origin'),'*');
  assert.deepEqual(Buffer.from(await r.arrayBuffer()),data.subarray(1000,2000));
  assert.equal(rangeResponse(file,'bytes=9000-').status,416);assert.equal(rangeResponse(path.join(dir,'missing.mp4'),'bytes=0-'),null);assert.equal(rangeResponse(dir,'bytes=0-'),null);
});

test('videos decode in software unless JARVIS_HW_VIDEO=1, and the jarvis: handler answers ranges itself',()=>{
  const main=fs.readFileSync('src/main/main.js','utf8');
  assert.match(main,/if\(process\.env\.JARVIS_HW_VIDEO!=='1'\)app\.commandLine\.appendSwitch\('disable-accelerated-video-decode'\);/);
  assert.ok(main.indexOf('disable-accelerated-video-decode')<main.indexOf('app.whenReady'));   // before the GPU process starts
  assert.match(main,/const range=request\.headers\.get\('range'\);if\(range&&target\)\{const r=rangeResponse\(target,range/);
});

test('the hall applies a background picture whenever it is still the one the current hall wants',()=>{
  const hall=fs.readFileSync('dist/assets/hall-fZdHx-gJ.js','utf8');
  assert.match(hall,/i\.onload=\(\)=>\{this\.disposed\|\|this\.assetUrl\(this\.theme\?\.wallpaper\)!==r\|\|\(/);
  assert.ok(!hall.includes('this.theme!==t||('));   // hall calibration replaces the theme object within half a second, which used to drop the picture
});

test('with a welcome recording, JARVIS speaks once when the app opens: nothing over it, and no second greeting in the hall',()=>{
  const main=fs.readFileSync('src/main/main.js','utf8');
  assert.match(main,/if\(s\.state==='WAKE'\)\{const st=settings\.get\(\)\.startup\|\|\{\};introVoiced=!!\(st\.enabled&&st\.sound\);if\(introVoiced\)broadcast\('caption',\{text:'System starting up\.'\}\);else say\('System starting up\.'\);\}/);
  assert.match(main,/if\(s\.state==='ARMOR_HALL'&&machine\?\.previous==='HELMET_OPENING'\)\{if\(introVoiced\)introPlayed=true;else sayReady\(\);introVoiced=false;morningBrief\(\);\}/);
});
