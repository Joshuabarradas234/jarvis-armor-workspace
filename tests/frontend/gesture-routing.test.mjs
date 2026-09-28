import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createContext,SourceTextModule,runInContext} from 'node:vm';
const source=fs.readFileSync(new URL('../../dist/assets/hands-ideas.js',import.meta.url),'utf8');
const displays=[{id:10,index:0,label:'Screen 1',current:true,bounds:{x:0,y:0,width:1600,height:900}},{id:20,index:1,label:'Screen 2',bounds:{x:0,y:900,width:1600,height:900}},{id:30,index:2,label:'Screen 3',bounds:{x:-1920,y:0,width:1920,height:1080}}];
const settle=()=>new Promise(resolve=>setImmediate(resolve));
async function fixture(options={}){
 const calls=[],remote=[],events={},hints=[],clicks=[];let now=1000;
 const noop=()=>{},list={add:noop,remove:noop,toggle:noop},ring={classList:list,style:{setProperty:noop}},tab={dataset:{tab:'draft'},closest(s){return s.includes('.ws-tab')||s==='targets'?this:null;},click(){clicks.push('draft');}};
 const H={pinching:false,trail:[],coolUntil:0,zoomRef:null,hoverChain:[],x:0,y:0},window={jarvis:{async call(method,payload){calls.push({method,payload});if(method==='tabs-displays')return options.getDisplays?options.getDisplays():displays;if(method==='tabs-popout')return options.popout?options.popout():true;return true;}}};
 const document={body:{append(el){hints.push(el);}},createElement(){return{setAttribute:noop,remove(){this.removed=true;}};},addEventListener:noop,removeEventListener:noop};
 const context=createContext({window,document,URLSearchParams,location:{search:''},innerWidth:1600,innerHeight:900,setTimeout,clearTimeout,performance:{now:()=>now},H,ring,MAIN:true,TARGETS:'targets',DRAGGY:'draggy',DeckGeo:{deck:{w:1600}},Calib:{on:false},Focus:{state:null},Room:{open:false},Brief:{},drawPip:noop,flash:noop,ringTo:noop,hover:noop,dwellTick:noop,webUnder:()=>null,nearTarget:()=>null,at:(x,y)=>y<80?tab:null,fire:noop,remote:m=>remote.push(m),call:window.jarvis.call,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),reachBox:()=>({x0:0,x1:1,y0:0,y1:1}),VIRT:()=>({w:1600,h:1800}),fx:v=>v,fy:v=>v,accent:()=> '#fff',flickDown:()=>false,addEventListener:(name,fn)=>events[name]=fn,removeEventListener:noop});
 const module=new SourceTextModule(fs.readFileSync(new URL('../../dist/assets/screen-transfer.js',import.meta.url),'utf8'),{context});await module.link(()=>{});await module.evaluate();
 const helpers=source.slice(source.indexOf('  const d2 ='),source.indexOf('\n',source.indexOf('  function curled(')));
 const handSize=source.split(/\r?\n/).find(s=>s.includes('const handSize ='));
 const functions=['onResults','actuate','press','release'].map(name=>{const fn=source.match(new RegExp('  function '+name+'\\([^]*?\\n  }'));assert.ok(fn,name);return fn[0];}).join('\n');
 runInContext(helpers+'\n'+handSize+'\nlet pinchFrames=0,openFrames=0,ringOverTab=false;\n'+functions,context);
 function frame(x,y,pinched,time){now=time;const cx=1-x/1600,cy=y/1800,lm=Array.from({length:21},()=>({x:cx,y:cy}));lm[0].y+=.2;lm[17].x+=.06;lm[4]={x:cx+(pinched?0:.2),y:cy-.12};lm[8]={x:cx,y:cy-.12};for(const i of [12,16,20])lm[i].y+=.04;context.onResults({multiHandLandmarks:[lm]});}
 return{H,window,calls,remote,events,hints,clicks,frame,async loss(time){now=time;context.onResults({multiHandLandmarks:[]});await settle();},screens:window.__jarvisScreens};
}
test('a recorded pinch carries a suit tab below the main screen and moves it once on release',async()=>{
 const f=await fixture();f.frame(800,40,true,1000);await settle();assert.equal(f.screens.isDragging(),true);
 f.frame(800,1200,true,1600);assert.equal(f.screens.isDragging(),true);assert.equal(f.H.onDeck,undefined);assert.equal(f.remote.length,0);assert.equal(f.calls.filter(c=>c.method==='tabs-popout').length,0);assert.match(f.hints.at(-1).textContent,/Release to move to Screen 2/);
 f.frame(800,1200,false,1700);await settle();const moves=f.calls.filter(c=>c.method==='tabs-popout');assert.equal(moves.length,1);assert.equal(moves[0].payload.displayId,20);assert.equal(f.clicks.length,0);assert.equal(f.screens.isDragging(),false);
 f.frame(800,1200,false,1800);assert.equal(f.H.onDeck,true);assert.equal(f.remote.at(-1).visible,true);assert.equal(f.calls.filter(c=>c.method==='tabs-popout').length,1);
});
test('left-screen grab waits for the hold threshold and preserves an ordinary quick tab click',async()=>{
 const f=await fixture();f.frame(800,40,true,1000);await settle();f.frame(200,40,true,1200);f.frame(200,40,false,1300);assert.equal(f.calls.filter(c=>c.method==='tabs-popout').length,0);
 f.frame(800,40,true,2000);await settle();f.frame(200,40,true,2600);f.frame(200,40,false,2700);await settle();assert.equal(f.calls.find(c=>c.method==='tabs-popout').payload.displayId,30);
 f.frame(800,40,true,3000);await settle();f.frame(800,40,false,3100);assert.equal(f.clicks.length,1);
});
test('tracking loss and Escape cancel transfers without a stray tab click',async()=>{
 const f=await fixture();f.frame(800,40,true,1000);await settle();f.frame(800,1200,true,1600);await f.loss(2301);assert.equal(f.screens.isDragging(),false);assert.equal(f.calls.filter(c=>c.method==='tabs-popout').length,0);
 f.frame(800,40,true,3000);await settle();let stopped=false;f.events.keydown({key:'Escape',preventDefault(){},stopImmediatePropagation(){stopped=true;}});f.frame(800,40,false,3100);assert.equal(stopped,true);assert.equal(f.clicks.length,0);assert.equal(f.screens.isDragging(),false);
});
test('one screen never moves a tab, and late discovery failure cannot cancel a newer grab',async()=>{
 const f=await fixture({getDisplays:()=>displays.slice(0,1)});f.frame(800,40,true,1000);await settle();f.frame(800,1200,true,1600);assert.match(f.hints.at(-1).textContent,/Only one screen/);f.frame(800,1200,false,1700);assert.equal(f.calls.filter(c=>c.method==='tabs-popout').length,0);
 let reject,attempt=0;const g=await fixture({getDisplays:()=>++attempt===1?new Promise((_,r)=>reject=r):displays});g.screens.grab('old',800,40,1000);g.screens.grab('new',800,40,1200);await settle();reject(Error('stale display query'));await settle();assert.equal(g.screens.isDragging(),true);g.screens.move(800,1200,1800);g.screens.release(false);await settle();assert.equal(g.calls.find(c=>c.method==='tabs-popout').payload.id,'new');
});
test('a missing or disconnected tab reports failure rather than pretending it moved',async()=>{
 for(const popout of [()=>false,()=>{throw Error('Display disconnected');}]){
  const f=await fixture({popout});f.screens.grab('draft',800,40,1000);await settle();f.screens.move(800,1200,1600);f.screens.release(false);await settle();assert.match(f.hints.at(-1).textContent,/closed|disconnected/);assert.equal(f.screens.isDragging(),false);f.screens.cancel();
 }
});
