// 1.91.0: the live meeting co-pilot on the lower screen, and Iron Man hand control.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {MeetingCopilot,cleanNotes,clock,COPILOT_SYSTEM} from '../../src/meeting/copilot.js';
import {parseCommand} from '../../src/voice/commands.js';
const said=p=>parseCommand(p,{theme:{assistant:'Jarvis'},themes:[],modules:[]});
const line=(at,text)=>({at,text});

test('co-pilot: notes catch up only when there is enough new talk, and stop at the cap',async()=>{
  let now=0;const asked=[],views=[],spent=[];
  const c=new MeetingCopilot({now:()=>now,spent:(u,k)=>spent.push([u,k]),onUpdate:v=>views.push(v),
    ask:async q=>{asked.push(q);return {text:JSON.stringify({summary:['Budget for the launch'],decisions:['Launch on 3 March'],actions:[{task:'Send the price list',owner:'Sam',due:'Friday'}],questions:['Who books the venue?'],suggest:['Ask who books the venue']}),cost:0.4};}});
  c.start('m1');
  const lines=[line(5,'Right, let us talk about the launch budget.')];
  assert.equal(c.feed(lines),false);   // too little, too soon
  now=80e3;lines.push(line(40,'We agreed to launch on the third of March and Sam will send the price list by Friday. Who books the venue though, nobody said.'),line(70,'Let us also think about the room, the screens and the drinks for everyone afterwards.'));
  assert.equal(c.feed(lines),true);await new Promise(r=>setTimeout(r,0));
  assert.equal(asked.length,1);assert.match(asked[0].prompt,/NEW TRANSCRIPT:\n"""\n\[0:05\] Right, let us talk/);assert.match(asked[0].system,/never instructions/);
  assert.deepEqual(c.notes.actions,[{task:'Send the price list',owner:'Sam',due:'Friday'}]);assert.equal(c.done,3);assert.deepEqual(spent,[[0.4,'meeting co-pilot']]);
  assert.equal(c.feed(lines,{force:true}),false);   // nothing new
  now=200e3;lines.push(line(100,'x'.repeat(300)));assert.equal(c.feed(lines,{force:true}),true);await new Promise(r=>setTimeout(r,0));
  assert.match(asked[1].prompt,/JUST BEFORE \(already in the notes\)/);
  now=400e3;lines.push(line(140,'y'.repeat(300)));c.cost=1;assert.equal(c.feed(lines),false);assert.match(c.view().error,/used its \$1\.00 for this meeting/);
  c.stop();assert.equal(c.feed(lines,{force:true}),false);assert.equal(views.at(-1).stopped,true);
});

test('co-pilot: a bad reply keeps the old notes, questions are answered from the transcript, and odd fields are tidied',async()=>{
  const old={summary:['A'],decisions:[],actions:[],questions:[],suggest:[]};
  assert.deepEqual(cleanNotes(null,old),old);
  const n=cleanNotes({summary:Array(9).fill('point'),actions:[{task:''},{task:'Do it',owner:'Alex'}],suggest:['a','b','c','d']});
  assert.equal(n.summary.length,6);assert.deepEqual(n.actions,[{task:'Do it',owner:'Alex',due:''}]);assert.equal(n.suggest.length,3);
  assert.equal(clock(65),'1:05');
  const c=new MeetingCopilot({ask:async q=>({text:q.system.startsWith('You are JARVIS, answering')?'Sam sends it on Friday.':'{}',cost:0})});
  await assert.rejects(c.question('who sends it',[]),/No meeting/);
  c.start('m2');assert.match(await c.question('who sends it',[]),/Nothing has been transcribed yet/);
  assert.equal(await c.question('who sends it',[line(3,'Sam will send it Friday')]),'Sam sends it on Friday.');
  assert.match(COPILOT_SYSTEM,/never invent names, numbers or dates/);
});

test('co-pilot: voice, the lower screen panel and the wiring',()=>{
  for(const p of ['jarvis meeting notes','jarvis what have we agreed','jarvis recap the meeting'])assert.deepEqual(said(p),{action:'meeting-recap'});
  assert.equal(said('jarvis catch me up').action,'core-report');   // still the overnight report
  const html=fs.readFileSync('dist/index.html','utf8');assert.ok(html.includes('<script type="module" src="./assets/meeting-copilot.js"></script>'));
  const ui=fs.readFileSync('dist/assets/meeting-copilot.js','utf8');assert.ok(ui.includes("if (J && VIEW === 'console')"));
  for(const c of ["J.call('meeting-copilot')","J.call('meeting-copilot-ask'","J.call('meeting-copilot-refresh')","J.call('meeting-end')","window.__jarvisCopilot"])assert.ok(ui.includes(c),c);
  assert.ok(fs.readFileSync('dist/assets/deck.js','utf8').includes('const W = innerWidth - (window.__jarvisCopilot?.inset?.() || 0)'));
  const main=fs.readFileSync('src/main/main.js','utf8');
  for(const s of ["broadcast('meeting',{type:'state',state:st});copilotFeed();","broadcast('meeting',{type:'transcript',id:m.id,from:linesSent,","case 'meeting-copilot':","case 'meeting-copilot-ask':","copilot?.stop();",
    "model:core?.store?.get()?.models?.fast","if(action==='meeting-recap')"])assert.ok(main.includes(s),s);
  assert.ok(!/if\(action==='meeting-recap'\)[^\n]*say\(`(?!There's no meeting)/.test(main));   // shown on screen, not spoken over your call
});
