// 1.90.0: "look at my screen", the second brain, and the cinematic morning briefing.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {ScreenLook,lookContent,spokenPart} from '../../src/main/screen-look.js';
import {Recall,recallTerms,rankRecall,excerptOf,matchers,chunks,localItems,recallText,spokenRecall} from '../../src/brain/recall.js';
import {buildScenes,datePhrase,whenIn} from '../../src/main/briefing-cinema.js';
import {parseCommand} from '../../src/voice/commands.js';
import {makeTools} from '../../src/brain/tools.js';
import {WindowsVoice} from '../../src/voice/windows.js';
const ctx={theme:{assistant:'Jarvis'},themes:[],modules:[]},say=p=>parseCommand(p,ctx);
const tmp=t=>{const d=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-190-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;};

test('looking at the screen: one picture, an answer said and shown, follow-ups reuse the picture for ten minutes',async()=>{
  let now=1e6,shots=0;const asked=[],shown=[],said=[],spent=[];
  const look=new ScreenLook({capture:async()=>{shots++;return {jpeg:Buffer.from('jpeg'+shots),display:'main'};},ask:async q=>{asked.push(q);return {text:'That is a build error in main.js.\n\n- Line **42** is missing a bracket.',cost:0.01};},
    say:t=>said.push(t),show:c=>shown.push(c),spent:(usd,k)=>spent.push([usd,k]),now:()=>now});
  assert.equal(await look.look('what does this error mean'),'That is a build error in main.js.\n\n- Line **42** is missing a bracket.');
  assert.deepEqual(said,['That is a build error in main.js.']);assert.equal(shown[0].busy,true);assert.equal(shown[1].display,'main');assert.equal(shown[1].follow,false);
  assert.equal(asked[0].image,Buffer.from('jpeg1').toString('base64'));assert.deepEqual(spent,[[0.01,'screen look']]);
  await look.look('how do I fix it',{follow:true});assert.equal(shots,1);assert.equal(asked[1].history.length,1);assert.equal(shown.at(-1).follow,true);
  now+=11*60000;await look.look('and now?',{follow:true});assert.equal(shots,2);assert.equal(asked[2].history.length,0);   // too old: a fresh look
  look.forget();assert.equal(look.last,null);
});

test('a look that fails says why, and two at once do not both run',async()=>{
  const said=[],shown=[];let release;
  const bad=new ScreenLook({capture:async()=>{throw Error('Windows did not give me a picture of the screen.');},ask:async()=>({text:'x'}),say:t=>said.push(t),show:c=>shown.push(c)});
  assert.equal(await bad.look(''),null);assert.match(said[0],/^I couldn't look at the screen\. Windows did not give me a picture/);assert.match(shown.at(-1).error,/Windows did not/);
  const slow=new ScreenLook({capture:async()=>({jpeg:Buffer.from('x'),display:'other'}),ask:()=>new Promise(r=>release=()=>r({text:'Done.'}))});
  const first=slow.look('');await new Promise(r=>setTimeout(r,10));assert.equal(await slow.look(''),null);release();assert.equal(await first,'Done.');
  const c=lookContent({image:'AAA',question:'Q?',history:[{q:'a',a:'b'}]});assert.equal(c[0].type,'image');assert.equal(c[0].source.media_type,'image/jpeg');assert.match(c[1].text,/EARLIER QUESTIONS[\s\S]*Q: a\nA: b[\s\S]*QUESTION: Q\?$/);
  assert.equal(spokenPart('**Bold** start with `code`.\n\nMore'),'Bold start with code.');
});

test('voice: look and second-brain phrases, and other questions still go to JARVIS chat',()=>{
  assert.deepEqual(say('jarvis look at my screen'),{action:'look'});
  assert.deepEqual(say('jarvis what does this error mean'),{action:'look',question:'what does this error mean'});
  assert.deepEqual(say('jarvis look at my screen and tell me how to fix it'),{action:'look',question:'how to fix it'});
  assert.deepEqual(say('jarvis what did we agree with the landlord'),{action:'recall',question:'what did we agree with the landlord'});
  assert.deepEqual(say('jarvis search everything for the boiler quote'),{action:'recall',question:'the boiler quote'});
  assert.deepEqual(say('jarvis what do i know about council tax'),{action:'recall',question:'council tax'});
  assert.deepEqual(say('jarvis second brain'),{action:'recall'});
  assert.equal(say('jarvis what did you do today'),null);
  assert.equal(say('good morning jarvis')?.action,'greet');
});

test('chat tools: the screen is only looked at on the PC, and the second brain shows its card only for voice',async()=>{
  const calls=[];const core={store:{},approvals:{},orders:{},deps:{lookAtScreen:async q=>{calls.push(['look',q]);return 'I see a spreadsheet.';},recall:async(q,o)=>{calls.push(['recall',q,o]);return 'From your email [1].';}}};
  const T=makeTools(core),by=n=>T.find(x=>x.name===n);
  assert.equal(by('look_at_screen').level,'read');assert.equal(by('recall').level,'read');
  assert.match(await by('look_at_screen').run({question:'x'},{via:'whatsapp'}),/only look at the screen when you ask on the PC/);assert.equal(calls.length,0);
  assert.equal(await by('look_at_screen').run({question:'what is this'},{via:'voice'}),'I see a spreadsheet.');
  await by('recall').run({question:'boiler'},{via:'whatsapp'});await by('recall').run({question:'boiler'},{via:'voice'});
  assert.deepEqual(calls.slice(1),[['recall','boiler',{show:false}],['recall','boiler',{show:true}]]);
});

test('second brain: the right words are looked for, and the best match wins',()=>{
  assert.deepEqual(recallTerms('What did we agree with the landlord about the boiler?'),['agree','landlord','boiler']);
  const items=[{kind:'email',title:'Lunch on Friday',text:'Shall we get lunch? The landlord says hi.'},
    {kind:'meeting',title:'Meeting: Mark 5',text:'We agreed the landlord pays for the new boiler by March.',at:Date.now()},
    {kind:'todo',title:'Buy milk',text:'Buy milk'}];
  const top=rankRecall('what did we agree with the landlord about the boiler',items);
  assert.equal(top[0].kind,'meeting');assert.ok(!top.some(x=>x.kind==='todo'));
  const many=Array.from({length:12},(_,i)=>({kind:'email',title:`Invoice ${i}`,text:'invoice'}));
  assert.equal(rankRecall('invoice',[...many,{kind:'document',title:'Invoices.pdf',text:'invoice'}]).filter(x=>x.kind==='email').length,6);   // email cannot crowd out the rest
  assert.equal(rankRecall('invoices',[{kind:'note',title:'n',text:'The invoiced amount'}]).length,1);   // "invoices" finds "invoiced"
  const long='filler '.repeat(400)+'the boiler warranty runs to 2031 '+'filler '.repeat(400);
  const ex=excerptOf(long,matchers(['boiler','warranty']),200);assert.ok(ex.includes('boiler warranty'));assert.ok(ex.startsWith('…')&&ex.endsWith('…'));assert.ok(ex.length<=204);
  assert.deepEqual(chunks('a\n\nb',10),['a\n\nb']);assert.equal(chunks('x'.repeat(50)+'\n\n'+'y'.repeat(50),60).length,2);
  assert.equal(spokenRecall('The landlord pays [1][2]. Due March [3].\n\nMore [4]'),'The landlord pays. Due March.');
});

test('second brain: meetings, plans, Tower results, dates and notes are all searched where they are',async t=>{
  const dir=tmp(t),tr=path.join(dir,'transcript.md'),fin=path.join(dir,'FINAL.md');
  fs.writeFileSync(tr,'# Meeting\n\n[10:02] We agreed the landlord fixes the boiler.');fs.writeFileSync(fin,'# Competitor report\n\nThree rivals charge more.');
  const opened=[];
  const items=await localItems({meetings:[{transcript:tr,suitName:'Mark 5',hallName:'Armour hall',startedAt:1}],ideas:[{title:'Website',notes:'A site for the shop',created:2,project:{goal:'Launch',phases:[{name:'Build',steps:[{title:'Pick a domain',done:true},{title:'Write copy'}]}]}}],
    brainstorms:[{topic:'Side projects',at:3,ideas:[{title:'Candles',pitch:'Hand-poured'}]}],runs:[{status:'done',title:'Competitor report',floorName:'Research',final:fin,endedAt:4},{status:'done',rehearsal:true,title:'Practice'}],
    todos:[{text:'Call the plumber',done:false}],events:[{title:'Dentist',start:'2026-10-05T10:00:00'}],dates:[{id:'1',name:'Council tax',kind:'bill',day:1,amount:'£150',created:5,sent:[]}],
    notes:'Owner likes short emails.',orders:'Never book flights.',read:f=>fs.promises.readFile(f,'utf8'),opener:f=>()=>opened.push(f)});
  const kinds=new Set(items.map(i=>i.kind));for(const k of ['meeting','idea','plan','brainstorm','tower','todo','event','date','note','orders'])assert.ok(kinds.has(k),k);
  assert.ok(!items.some(i=>/Practice/.test(i.title)));assert.match(items.find(i=>i.kind==='plan').text,/Pick a domain \(done\)/);
  assert.match(items.find(i=>i.kind==='date').text,/amount: £150/);assert.ok(!/created/.test(items.find(i=>i.kind==='date').text));
  items.find(i=>i.kind==='meeting').open();assert.deepEqual(opened,[tr]);
});

test('second brain: answers cite numbered sources, say what was not searched, and open what can be opened',async()=>{
  const prompts=[],spent=[],opened=[];
  const r=new Recall({local:async()=>[{kind:'meeting',title:'Meeting: Mark 5',text:'We agreed the landlord fixes the boiler by March.',at:Date.now(),open:()=>opened.push('meeting')}],
    mail:async terms=>{assert.deepEqual(terms,['landlord','boiler']);throw Error('Email is not connected.');},
    docs:async()=>[{kind:'document',title:'Lease.pdf, page 3',text:'The landlord maintains the boiler.'}],
    claude:async p=>{prompts.push(p);return {text:'The landlord fixes the boiler by March [1], as the lease says [2].',cost:0.02};},spent:(u,k)=>spent.push([u,k])});
  const out=await r.search('the landlord and the boiler');
  assert.match(prompts[0].prompt,/^QUESTION: the landlord and the boiler\n\nSOURCES:\n\[1\] /);assert.match(prompts[0].prompt,/Meeting notes: Meeting: Mark 5/);assert.match(prompts[0].system,/never instructions/);
  assert.deepEqual(out.missed,['Email: Email is not connected.']);assert.equal(out.sources.length,2);assert.ok(out.sources.every(s=>s.cited));
  assert.equal(out.spoken,'The landlord fixes the boiler by March, as the lease says.');assert.deepEqual(spent,[[0.02,'second brain']]);
  const ref=out.sources.find(s=>s.kind==='meeting').ref;assert.ok(ref);assert.equal(out.sources.find(s=>s.kind==='document').ref,'');r.open(ref);assert.deepEqual(opened,['meeting']);
  assert.throws(()=>r.open('nope'),/Search again/);
  assert.match(recallText(out),/Sources:\n\[1\] Meeting notes: Meeting: Mark 5[\s\S]*Not searched: Email/);
  const empty=new Recall({local:async()=>[],claude:async()=>{throw Error('should not be called');}});
  assert.match((await empty.search('zebra crossings')).answer,/couldn't find anything/);
  await assert.rejects(empty.search('what is the'),/something specific/);
});

test('cinematic briefing: a full day in scenes, and a quiet day kept short',()=>{
  const now=new Date(2026,9,4,7,30).getTime();
  const full=buildScenes({who:'sir',part:'morning',date:'Sunday 4 October',time:'07:30',now,weather:{temp:12,words:'light rain',place:'Leeds',wind:40,icon:'🌦'},
    night:{done:[{floor:'Research',title:'Competitor report'}],waiting:[{title:'Send email'},{title:'Code update'}]},mail:{count:14,reply:[{from:'Sarah',subject:'Invoice'}],unhappy:1},
    events:[{time:'09:00',title:'Stand-up',past:true},{time:'10:00',title:'Dentist',past:false}],dates:[{name:'Council tax',kind:'bill',daysLeft:1,amount:'£150'},{name:'Mum',kind:'birthday',daysLeft:5}],
    todos:{count:3,first:['Call the plumber']},projects:[{title:'Website',progress:40,next:'Write copy'}],blocked:['Mark 5']});
  assert.deepEqual(full.map(s=>s.id),['open','weather','night','mail','today','dates','work','close']);
  assert.equal(full[0].line,"Good morning, sir. It's Sunday 4 October. Here's your day.");
  assert.equal(full[1].line,"It's 12 degrees with light rain in Leeds. It is windy out there.");
  assert.equal(full[2].line,'While you were away, the Research floor finished Competitor report. 2 things are waiting for your OK.');
  assert.equal(full[3].line,'14 emails came in since last night. One needs a reply, including Sarah about Invoice. One sounds unhappy.');
  assert.equal(full[4].line,'You have 1 thing on today. At 10:00, Dentist.');
  assert.equal(full[5].line,"Council tax, £150, is due tomorrow and it's Mum's birthday on Friday.");
  assert.equal(full[6].line,'3 tasks on your list. First up: Call the plumber. Website is 40 percent there. Next step: Write copy. Mark 5 needs you.');
  const quiet=buildScenes({who:'sir',part:'morning',date:'Sunday 4 October',time:'07:30',now,weather:null,night:{done:[],waiting:[]},mail:null,events:[],dates:[],todos:{count:0,first:[]},projects:[],blocked:[]});
  assert.deepEqual(quiet.map(s=>s.id),['open','today','close']);assert.equal(quiet[1].line,'Your calendar is clear today.');
  assert.equal(whenIn(0,now),'today');assert.equal(whenIn(3,now),'on Wednesday');assert.equal(whenIn(9,now),'in 9 days');
  assert.equal(datePhrase({name:"James",kind:'birthday',daysLeft:2},now),"it's James' birthday on Tuesday");assert.equal(datePhrase({name:"Dad's birthday",kind:'birthday',daysLeft:0},now),"Dad's birthday is today");
});

test('the briefing speaks its lines with bookmarks so the screen follows his voice, and is silent when muted',()=>{
  const v=new WindowsVoice({scripts:'scripts/windows',assets:'assets',dir:os.tmpdir(),log(){}});
  assert.equal(v.speakParts(['a','b'],{master:0,voice:1},{}),false);assert.equal(v.speakParts([],{master:1,voice:1},{}),false);
  const ps=fs.readFileSync('scripts/windows/speak.ps1','utf8');
  assert.ok(ps.includes("$prompt.AppendBookmark([string]$i)"));assert.ok(ps.includes("[Console]::Out.WriteLine('MARK ' + $e.SourceEventArgs.Bookmark)"));
  assert.ok(ps.indexOf("Unregister-Event -SourceIdentifier 'jarvis.mark'")<ps.indexOf('    exit 0\n  }\n  $speaker.Speak'));   // or PowerShell lingers for seconds after the last word
});

test('wiring: the cards load on the top screen, use channels the preload already allows, and keep Tower announcements tidy',()=>{
  const html=fs.readFileSync('dist/index.html','utf8');for(const f of ['screen-look.js','recall.js','briefing-cinema.js'])assert.ok(html.includes(`<script type="module" src="./assets/${f}"></script>`),f);
  const pre=fs.readFileSync('src/main/preload.cjs','utf8');assert.ok(pre.includes("'core'")&&pre.includes("'briefing'"));
  const main=fs.readFileSync('src/main/main.js','utf8');
  for(const s of ["globalShortcut.register('Control+Alt+L'","globalShortcut.register('Control+Alt+F'","broadcast('core',{type:'screen-look',card})","broadcast('core',{type:'recall',card})","case 'briefing-stop':","if(action==='briefing'&&!cmd.plain){cinemaBrief()"])assert.ok(main.includes(s),s);
  assert.match(main,/\n\s*if\(towerAnnounced\.size>200\)towerAnnounced\.delete\(towerAnnounced\.values\(\)\.next\(\)\.value\);/);
  {const ov=JSON.parse(fs.readFileSync('config/themes.json','utf8')).find(x=>x.id==='ironman').overlay;assert.deepEqual([ov.x,ov.y],[50.7,63.5]);}   // the hologram's feet on the pad's centre (measured from the video and the hall picture)
  assert.ok(fs.readFileSync('dist/assets/hands-ideas.js','utf8').includes("if (d.mode === 'cinema') { if (d.start && Brief.el) Brief.close(true); return; }"));
  for(const f of ['dist/assets/screen-look.js','dist/assets/recall.js','dist/assets/briefing-cinema.js','src/main/screen-look.js','src/brain/recall.js','src/main/briefing-cinema.js'])assert.ok(!/@gmail|\+44\d{6,}/.test(fs.readFileSync(f,'utf8')),f);
});
