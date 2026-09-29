import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import zlib from 'node:zlib';
import {BrainStore} from '../../src/brain/store.js';
import {VoiceNotes, opusSeconds, boundedAudio} from '../../src/brain/voice-notes.js';
import {Travel, cleanTrip, wallTime, zonedParts} from '../../src/brain/travel.js';
import {Routines, weeklyText} from '../../src/brain/routines.js';
import {zipBytes, asarBytes, buildSelfRelease, sha256} from '../../src/brain/archives.js';
import {MeetingFollowups, meetingNotes} from '../../src/meeting/followups.js';
import {TodoStore} from '../../src/services/todos.js';
import {Approvals} from '../../src/brain/approvals.js';
import {CallEndTracker} from '../../src/meeting/call-watch.js';
import {reactionFrame, reactSuit, suitReaction} from '../../dist/assets/suit-reactions.js';
import {createJarvisCore} from '../../src/brain/index.js';

function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-routines-'));t.after(()=>{assert.ok(dir.startsWith(path.join(os.tmpdir(),'jarvis-routines-')));fs.rmSync(dir,{recursive:true,force:true});});
  const store=new BrainStore({dir,docs:dir,crypt:{available:()=>true,encrypt:s=>Buffer.from(s),decrypt:b=>b.toString()}});
  const messages=[],broadcasts=[]; const core={store,deps:{userDir:dir,docs:dir,oneDrive:dir,routinesEnabled:true,appVersion:'1.83.0',notify(){},broadcast:(...p)=>broadcasts.push(p),todos:{list:()=>[]},calendar:{list:()=>[]},tower:{runs:[]}},orders:{parse:()=>({jobs:[]})},mail:{since:()=>[],ready:()=>false},approvals:{list:()=>[]},push(){},message:async(...p)=>{messages.push(p);return{ok:true,via:'whatsapp'};}};
  core.travel=new Travel(core);core.routines=new Routines(core);return{dir,core,store,messages,broadcasts};
}
function unzip(bytes) { const out={};let p=0;while(bytes.readUInt32LE(p)===0x04034b50){const size=bytes.readUInt32LE(p+18),n=bytes.readUInt16LE(p+26),x=bytes.readUInt16LE(p+28),start=p+30+n+x,name=bytes.toString('utf8',p+30,p+30+n);out[name]=zlib.inflateRawSync(bytes.subarray(start,start+size));assert.equal(out[name].length,bytes.readUInt32LE(p+22));p=start+size;}assert.equal(bytes.readUInt32LE(p),0x02014b50);return out; }
function ogg(seconds=2) { const data=Buffer.alloc(47);data.write('OggS');data[5]=6;data.writeBigUInt64LE(BigInt(seconds*48000),6);data.writeUInt32LE(1,14);data[26]=1;data[27]=19;data.write('OpusHead',28);data[36]=1;data[37]=1;return data; }
const trip={city:'Johannesburg, South Africa',zone:'Africa/Johannesburg',start:'2026-10-12',end:'2026-10-18',latitude:-26.2,longitude:28.04,flights:'BA57'};

test('voice notes reject malformed audio, chained streams and long notes before paid transcription',()=>{
  assert.equal(opusSeconds(ogg()),2);assert.throws(()=>opusSeconds(ogg(301)),/five minutes/);assert.throws(()=>opusSeconds(Buffer.from('not audio')),/complete/);const second=ogg();second.writeUInt32LE(2,14);assert.throws(()=>opusSeconds(Buffer.concat([ogg(),second])),/one voice note/);
});
test('audio download enforces size even without Content-Length',async()=>{await assert.rejects(()=>boundedAudio(new Response(Buffer.alloc(4*1024*1024+1))),/too large/);});
function voiceFixture(t, reply = new Response(JSON.stringify({text:'Remind me tomorrow at six.',duration:2}))) {
  const {store}=fixture(t);store.save({voiceNotes:{enabled:true,dailyLimit:.06}});store.setSecret('openaiKey','test-key');store.setSecret('twilioToken','test-token');const sid='SM'+'a'.repeat(32),media='ME'+'b'.repeat(32),from='whatsapp:+447700900123',to='whatsapp:+15005550006',requests=[];
  const phone={sid:()=> 'AC'+'c'.repeat(32),config:()=>({whatsappFrom:'+15005550006'}),to:()=>'+447700900123',secret:n=>store.secret(n),async twilio(_method,sub){return sub.endsWith('/Media.json')?{media_list:[{sid:media,content_type:'audio/ogg'}]}:{sid,from,to,direction:'inbound'};}};
  const fetchImpl=async(url,init)=>{requests.push({url,init});return url.startsWith('https://api.twilio.com')?new Response(ogg()):reply.clone();};
  return {store,phone,requests,message:{sid,at:Date.now(),via:'whatsapp',media:1},voice:new VoiceNotes({store,phone,fetchImpl})};
}
test('verified owner audio uses OpenAI multipart and reserves spend before each paid call',async t=>{const f=voiceFixture(t);assert.match(await f.voice.transcribe(f.message),/tomorrow/);assert.equal(f.store.spent(),.03);assert.equal(f.requests[1].init.body.get('model'),'whisper-1');assert.equal(f.requests[1].init.body.get('file').type,'audio/ogg');await f.voice.transcribe(f.message);await assert.rejects(()=>f.voice.transcribe(f.message),/budget/);assert.equal(f.requests.filter(r=>r.url.includes('openai.com')).length,2);});
test('wrong sender, stale audio and absent opt-in never upload to OpenAI',async t=>{const f=voiceFixture(t);f.phone.twilio=async()=>({sid:f.message.sid,from:'whatsapp:+447700900999',to:'whatsapp:+15005550006',direction:'inbound'});await assert.rejects(()=>f.voice.transcribe(f.message),/verified/);await assert.rejects(()=>f.voice.transcribe({...f.message,at:Date.now()-16*60000}),/away/);f.store.save({voiceNotes:{enabled:false}});await assert.rejects(()=>f.voice.transcribe(f.message),/Enable/);assert.equal(f.requests.length,0);});
test('an ambiguous paid failure retains its allowance and is not retried',async t=>{const f=voiceFixture(t,new Response('{}',{status:500}));await assert.rejects(()=>f.voice.transcribe(f.message),/reserved allowance/);assert.equal(f.store.spent(),.03);assert.equal(f.requests.length,2);});
test('transcribed approval words cannot decide a pending Core approval',async t=>{
  const {dir}=fixture(t), replies=[];
  const core=createJarvisCore({userDir:dir,docs:dir,appVersion:'1.83.0',boot:{asarRoot:dir,root:dir,base:'1.83.0'},log(){},notify(){},broadcast(){},getKey:()=>'',pcAwake:()=>true,say(){},crypt:{available:()=>false},isIdle:()=>true,keepAwake(){},settings:{get:()=>({})}});t.after(()=>core.dispose());
  const a=core.approvals.create({kind:'update',title:'Test update',payload:{updateId:'fixture'}});core.voiceNotes.transcribe=async()=>`YES ${a.id} ${a.code}`;core.phone.deliver=async text=>{replies.push(text);return{ok:true};};await core.handleInbound({sid:'SM'+'a'.repeat(32),at:Date.now(),via:'whatsapp',media:1});assert.equal(core.approvals.get(a.id).status,'waiting');assert.match(replies[0],/cannot approve/);
});
test('travel rejects partial dates and invalid zones, and converts wake times exactly',()=>{assert.throws(()=>cleanTrip({...trip,start:'12th'}));assert.throws(()=>cleanTrip({...trip,zone:'Not/AZone'}));assert.equal(new Date(wallTime('2026-10-12','06:00','Africa/Johannesburg')).toISOString(),'2026-10-12T04:00:00.000Z');assert.throws(()=>wallTime('2026-03-29','01:30','Europe/London'),/does not exist/);});
test('travel only moves recurring wake calls, with explicit full dates and automatic return',t=>{const {core}=fixture(t);core.travel.apply(trip);const wake={time:'06:00',days:[0,1,2,3,4,5,6],actions:{deliver:'call',content:'wake'}};const at=Date.parse('2026-10-12T02:00Z');assert.equal(core.travel.next(wake,at),Date.parse('2026-10-12T04:00Z'));assert.equal(core.travel.zone(Date.parse('2026-10-19T10:00Z')),Intl.DateTimeFormat().resolvedOptions().timeZone);assert.match(core.travel.detail(trip),/One-off wake-up calls/);assert.equal(core.travel.isWake({...wake,actions:{deliver:'call',content:'day'}}),false);});
test('weekly review counts accepted results rather than all successful runs',t=>{const {core,store}=fixture(t);core.deps.tower.runs=[{status:'done',verdict:'APPROVED',feedback:{good:true},endedAt:Date.now(),cost:.2},{status:'done',endedAt:Date.now(),cost:.1},{status:'needs_changes',endedAt:Date.now()}];store.addSpend(.4);const s=weeklyText(core);assert.match(s,/1 Tower results accepted/);assert.match(s,/1 finished results still need your review/);assert.match(s,/1 runs need rework/);assert.match(s,/\$0.40/);});
test('Sunday delivery runs once; a missed 02:00 backup catches up and preserves credentials outside the ZIP',async t=>{const {core,store,dir,messages}=fixture(t);store.save({routines:{zone:'Europe/London'}});fs.writeFileSync(path.join(dir,'workstations.json'),'{}');fs.writeFileSync(path.join(dir,'brain-secrets.enc'),'PRIVATE');const at=Date.parse('2026-10-04T17:30Z');await core.routines.tick(at);await core.routines.tick(at+31*60000);assert.equal(messages.length,1);const backup=store.state.lastBackup;assert.ok(fs.existsSync(backup.file));const files=unzip(fs.readFileSync(backup.file));assert.ok(files['settings/workstations.json']);assert.ok(files['RESTORE.txt']);assert.ok(!Object.keys(files).some(n=>n.includes('secrets')));assert.equal(sha256(fs.readFileSync(backup.file)),backup.sha256);});
test('weekly preview never sends a message',async t=>{const {core,messages}=fixture(t);const r=await core.routines.weekly();assert.match(r.text,/This week/);assert.equal(messages.length,0);});
test('ZIP entries cannot escape their archive and payloads round-trip',()=>{assert.throws(()=>zipBytes([{name:'../bad',data:'x'}]));assert.throws(()=>zipBytes([{name:'a',data:'a'},{name:'a',data:'b'}]));const zip=zipBytes([{name:'app.asar',data:'hello'},{name:'windows/listen.ps1',data:'write-output ok'}]);assert.equal(unzip(zip)['app.asar'].toString(),'hello');});
test('ASAR header and data offsets round-trip with UTF-8 names and empty files',()=>{const bytes=asarBytes([{name:'src/hello.js',data:'export const hi="hello";'},{name:'src/empty.js',data:''},{name:'config/café.json',data:'{}'}]);const headerSize=bytes.readUInt32LE(4),header=JSON.parse(bytes.toString('utf8',16,16+bytes.readUInt32LE(12)));for(const [name,expected] of [['hello.js','export const hi="hello";'],['empty.js','']]){const f=header.files.src.files[name];assert.equal(bytes.subarray(8+headerSize+Number(f.offset),8+headerSize+Number(f.offset)+f.size).toString(),expected);}});
test('self-release includes exact approved code and shared vendor files, rejects changed manifests',t=>{const {core,dir}=fixture(t),base=path.join(dir,'base'),self=path.join(dir,'self'),version=path.join(self,'versions','v1');fs.mkdirSync(path.join(base,'dist/vendor'),{recursive:true});fs.writeFileSync(path.join(base,'dist/vendor/lib.js'),'vendor');fs.writeFileSync(path.join(base,'package.json'),JSON.stringify({version:'1.83.0',main:'src/main/boot.js',type:'module'}));fs.mkdirSync(path.join(version,'app/src/main'),{recursive:true});const contents='export const approved=true;';fs.writeFileSync(path.join(version,'app/src/main/boot.js'),contents);const manifest={'src/main/boot.js':sha256(contents)};for(const name of ['src/main/main.js','src/main/preload.cjs','src/brain/selfupdate.js','src/brain/approvals.js','dist/index.html']){const file=path.join(version,'app',name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,contents);manifest[name]=sha256(contents);}const raw=JSON.stringify(manifest);fs.writeFileSync(path.join(version,'manifest.json'),raw);core.deps.boot={asarRoot:base};core.updater={selfDir:self,state:()=>({versions:{v1:{manifest:sha256(raw),approvedVia:'ui',base:'1.83.0',created:123,title:'Test approved fix'}}})};const result=buildSelfRelease(core,'v1');const asar=unzip(fs.readFileSync(result.file))['app.asar'];assert.ok(asar.length<30000000);assert.match(result.version,/1\.83\.0-self\.123/);assert.match(fs.readFileSync(result.notes,'utf8'),/not run/);fs.writeFileSync(path.join(version,'app/src/main/boot.js'),'changed');assert.throws(()=>buildSelfRelease(core,'v1'),/file changed/);});
test('meeting actions require evidence and are idempotent across restarts',t=>{const {dir,core}=fixture(t),todos=new TodoStore(dir);const notes=meetingNotes({summary:'Planning.',decisions:['Use the new design.'],actions:[{task:'Send the mock-up',owner:'Alex',deadline:'Friday',evidence:'Alex will send the mock-up by Friday.'},{task:'Pay invoice',owner:'Unknown',evidence:'Not in the meeting'}]},'Alex will send the mock-up by Friday.');assert.equal(notes.actions.length,1);assert.equal(notes.uncertain.length,1);const follow=new MeetingFollowups({dir,todos,core:()=>core});follow.capture({id:'m1',suitName:'Mark One'},notes);new MeetingFollowups({dir,todos:new TodoStore(dir),core:()=>core}).capture({id:'m1',suitName:'Mark One'},notes);assert.equal(new TodoStore(dir).list().length,1);assert.equal(new TodoStore(dir).list()[0].owner,'Alex');});
test('meeting email cannot send until the exact draft is approved and never resends',async t=>{const {dir,core}=fixture(t),sent=[];core.approvals=new Approvals({dir});core.deps.sendMeeting=async p=>sent.push(p);const follow=new MeetingFollowups({dir,todos:new TodoStore(dir),core:()=>core});const m=follow.capture({id:'m1',suitName:'Mark One'},{markdown:'Notes.',actions:[]});const p={id:m.id,to:'recipient@example.com',subject:'Follow-up',text:'Reviewed text'};await assert.rejects(()=>follow.send(p),/approved/);const r=follow.request(m.id,p);await assert.rejects(()=>follow.send(p),/approved/);core.approvals.decide(r.approval,true,{via:'ui'});await follow.send(p);assert.equal(sent.length,1);await assert.rejects(()=>follow.send(p),/already sent/);});
test('call-end detection needs an observed call and stable explicit end, never silence or closure',()=>{const tracker=new CallEndTracker();assert.equal(tracker.sample([{id:'teams',ended:true}],100),false);assert.equal(tracker.sample([{id:'teams',active:true}],1000),false);assert.equal(tracker.sample([],90000),false);assert.equal(tracker.sample([{id:'teams',ended:true}],100000),false);assert.equal(tracker.sample([{id:'teams',ended:true}],116000),true);const b=new CallEndTracker();b.sample([{id:'zoom',active:true}],1);b.sample([{id:'zoom',ended:true}],10);b.sample([{id:'zoom',active:true}],100);assert.equal(b.sample([{id:'zoom',ended:true}],20000),false);});
test('suit reactions expire and reduced motion stays steady',()=>{assert.deepEqual(reactionFrame('customer-angry',100,true),reactionFrame('customer-angry',9000,true));assert.equal(reactionFrame('customer-angry',120001),null);assert.equal(reactSuit({kind:'customer-angry',at:1000},1000),true);assert.equal(suitReaction('im7',true,2000).colour,'#ff3f35');assert.equal(suitReaction('im7',true,122000),null);assert.equal(reactSuit({kind:'anything',at:1000},1000),false);});

test('one-off travel wake calls require reviewed times and restore on cancellation',t=>{
  const {core,store}=fixture(t),at=wallTime('2026-10-12','06:00','Europe/London');
  store.alarms=[{id:'wake',status:'armed',kind:'call',report:true,at,zone:'Europe/London'},{id:'reminder',status:'armed',kind:'call',report:false,at,zone:'Europe/London'}];
  const p=core.travel.proposal(trip);assert.equal(p.alarms.length,1);assert.equal(p.alarms[0].at,Date.parse('2026-10-12T04:00Z'));
  store.alarms[0].at+=60000;assert.throws(()=>core.travel.apply(p),/changed after/);store.alarms[0].at=at;
  core.travel.apply(p);assert.equal(store.alarms[0].at,Date.parse('2026-10-12T04:00Z'));assert.equal(store.alarms[1].at,at);
  assert.equal(core.travel.parseWhen('tomorrow at 6 am',Date.parse('2026-10-12T15:00Z')).at,Date.parse('2026-10-13T04:00Z'));
  core.travel.stop();assert.equal(store.alarms[0].at,at);assert.equal(store.alarms[0].travelOriginalAt,undefined);
});
test('flight alerts match selected flights and deduplicate messages',async t=>{
  const {core,store,messages}=fixture(t);store.setState({trip:cleanTrip(trip)});core.mail={st:()=>({uidValidity:1}),read:async uid=>({subject:'Gate changed',text:uid===1?'BA 57 boarding at gate 4':'BA570 boarding at gate 4'})};
  const rows=[{uid:1,subject:'Gate changed',summary:'A new gate',from:'airline@example.com'},{uid:2,subject:'Gate changed',summary:'Other flight',from:'airline@example.com'}];
  await core.travel.onMail(rows);await core.travel.onMail(rows);assert.equal(messages.length,1);assert.equal(store.state.flightAlerts.length,1);
});
test('audio redirects never forward the Twilio credential and reject unknown hosts',async t=>{
  const f=voiceFixture(t),calls=[];f.voice.f=async(url,init)=>{calls.push({url,init});if(calls.length===1)return new Response(null,{status:302,headers:{location:'https://media.twiliocdn.com/note'}});if(calls.length===2)return new Response(ogg());return new Response(JSON.stringify({text:'A reminder'}));};
  await f.voice.transcribe(f.message);assert.ok(calls[0].init.headers.Authorization);assert.equal(calls[1].init.headers.Authorization,undefined);
  const bad=voiceFixture(t);bad.voice.f=async()=>new Response(null,{status:302,headers:{location:'https://unknown.example.com/audio'}});await assert.rejects(()=>bad.voice.transcribe(bad.message),/unexpected audio/);assert.equal(bad.store.spent(),0);
});
test('meeting restart recovers missing to-dos and preserves an unreadable draft file',t=>{
  const {dir,core}=fixture(t),file=path.join(dir,'meeting-followups.json');fs.writeFileSync(file,JSON.stringify([{id:'recover',actions:[{task:'Send design',owner:'Alex',deadline:'Friday'}]}]));
  const todos=new TodoStore(dir);new MeetingFollowups({dir,todos,core:()=>core});new MeetingFollowups({dir,todos,core:()=>core});assert.equal(todos.list().length,1);
  fs.writeFileSync(file,'broken data');const broken=new MeetingFollowups({dir,todos,core:()=>core});assert.match(broken.loadError,/preserved/);assert.throws(()=>broken.capture({id:'new'},{actions:[],markdown:''}),/preserved/);assert.equal(fs.readFileSync(file,'utf8'),'broken data');
});

test('build reaction requires explicit PASS, clean process exit and no cancellation',async()=>{
  const vm=await import('node:vm'),{EventEmitter}=await import('node:events'),children=[],events=[];
  const context=vm.createContext({process:{platform:'win32',env:{}},setTimeout,Map,String,Number,Date});
  const runnerModule=new vm.SourceTextModule(fs.readFileSync(new URL('../../src/control/runner.js',import.meta.url),'utf8'),{context});
  const spawnModule=new vm.SyntheticModule(['spawn'],function(){this.setExport('spawn',()=>{const p=new EventEmitter();p.stdout=new EventEmitter();p.stderr=new EventEmitter();children.push(p);return p;});},{context});
  await runnerModule.link(()=>spawnModule);await runnerModule.evaluate();
  const states={},missions={data:states,get:(theme,id)=>states[theme+':'+id]||{agent:'test',tasks:[],status:'idle',progress:0},set(theme,id,p){states[theme+':'+id]={...this.get(theme,id),...p};},persist(){},note(){}};
  const runner=new runnerModule.namespace.AgentRunner({missions,onUpdate(){},onBuild:e=>events.push(e)});
  for(const [id,line,code,stopped] of [['good','BUILD PASS',0,false],['error','BUILD PASS',1,false],['none','STATUS done',0,false],['cancel','BUILD PASS',0,true],['failed','BUILD FAIL',0,false]]){runner.start('ironman',id,id);const child=children.at(-1);child.stdout.emit('data',line+'\n');child.stoppedByUser=stopped;child.emit('close',code);}
  assert.equal(events.length,1);assert.equal(events[0].id,'good');
});
