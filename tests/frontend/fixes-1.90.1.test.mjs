// 1.90.1: "look at my screen" works in any app. The card floats above everything, and he listens for it from the tray.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {ScreenLook} from '../../src/main/screen-look.js';
import {parseCommand} from '../../src/voice/commands.js';
const themes=[{id:'ironman',assistant:'Jarvis'},{id:'batcave',assistant:'Alfred'}];
const heard=(p,idle)=>parseCommand(p,{theme:{assistant:'Jarvis'},themes,modules:[],idle});

test('closed to the tray, he still hears "look at my screen" and its questions, and nothing else changes there',()=>{
  assert.deepEqual(heard('jarvis look at my screen',true),{action:'look'});
  assert.deepEqual(heard('jarvis what does this error mean',true),{action:'look',question:'what does this error mean'});
  assert.deepEqual(heard('jarvis look at my screen and tell me how to fix it',true),{action:'look',question:'how to fix it'});
  assert.deepEqual(heard('alfred look at this',true),{action:'look'});
  assert.deepEqual(heard('jarvis wake up',true),{action:'wake',theme:'ironman'});
  assert.equal(heard('jarvis open settings',true),null);
  assert.deepEqual(heard('jarvis look at my screen',false),{action:'look'});
});

test('the picture is taken before his card appears, and a follow-up says so',async()=>{
  const order=[];
  const look=new ScreenLook({capture:async()=>{order.push('capture');return {jpeg:Buffer.from('x'),display:7};},show:c=>order.push(c.busy?`busy:${c.follow}`:'answer'),ask:async()=>({text:'A spreadsheet.'})});
  await look.look('');assert.deepEqual(order,['capture','busy:false','answer']);
  order.length=0;await look.look('and the total?',{follow:true});assert.deepEqual(order,['busy:true','answer']);   // same picture, no new capture
});

test('the card has its own small window above every app, on the screen he looked at',()=>{
  const page=fs.readFileSync('dist/look.html','utf8');
  assert.match(page,/Content-Security-Policy" content="default-src 'self' jarvis:; script-src 'self';/);assert.ok(page.includes('<script type="module" src="./assets/screen-look.js"></script>'));
  assert.ok(!fs.readFileSync('dist/index.html','utf8').includes('screen-look.js'));
  const card=fs.readFileSync('dist/assets/screen-look.js','utf8');
  assert.ok(card.includes("if (J && VIEW === 'look')"));assert.ok(card.includes("J.call('screen-look-size'"));assert.ok(card.includes("J.call('screen-look-close')"));assert.ok(card.includes('-webkit-app-region:drag'));
  const main=fs.readFileSync('src/main/main.js','utf8');
  for(const s of ["createWindow({role:'look',","w.setAlwaysOnTop(true,'screen-saver');","w.loadURL('jarvis://app/look.html?view=look')","if(!w.isVisible())w.showInactive();",
    "if(lookWin&&!lookWin.isDestroyed()&&lookWin.isVisible()){lookWin.hide();",   // never in his own picture
    "return {jpeg:src.thumbnail.toJPEG(82),display:d.id};","show:card=>showLook(card)",
    "case 'screen-look-size':{if(role!=='look')return false;","case 'screen-look-close':{if(role!=='look')return false;look?.forget();",
    "if(ask&&lookOpen()){handled=true;why='';followUntil=Date.now()+25000;look.look(ask,{follow:true})"])assert.ok(main.includes(s),s);
  assert.ok(!main.includes("new Notification({title:'JARVIS looked at your screen'"));   // the card shows instead
});
