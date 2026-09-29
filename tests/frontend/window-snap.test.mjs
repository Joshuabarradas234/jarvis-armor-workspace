import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {snapTarget, snapRect} from '../../dist/assets/window-snap.js';
import {visiblePageExcerpt} from '../../src/main/page-excerpt.js';
const source=fs.readFileSync(new URL('../../dist/assets/hands-ideas.js',import.meta.url),'utf8');
function dragFixture(){
 const events=new Map(),calls=[],style={left:'100px',top:'90px',width:'500px',height:'350px'};let target=null;
 const window={__jarvisSnap:{clear(){target=null;},move(x,y){target=snapTarget(x,y,{x:6,y:6,width:1268,height:708});},take(){const r=target;target=null;return r;}}};
 const context={window,innerWidth:1280,innerHeight:720,call:async(...args)=>calls.push(args),clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name)=>events.delete(name)};
 const method=source.slice(source.indexOf('    down(p, e) {'),source.indexOf('    button(p, k) {'));
 const holo=vm.runInNewContext('({front(){},sync(){},save(){},'+method+'})',context);
 const p={id:'panel',scope:'hall',el:{style,isConnected:true,hidden:false,classList:{add(){},remove(){}},getBoundingClientRect:()=>({left:100,top:90,width:500,height:350})}};
 holo.down(p,{button:0,clientX:200,clientY:100,target:{closest:s=>s==='.hp-bar'?{}:null},preventDefault(){}});
 return {events,calls,style};
}
test('floating panel drag commits the preview and restores its native page',()=>{
 const f=dragFixture();f.events.get('pointermove')({clientX:10,clientY:350});f.events.get('pointerup')();
 assert.deepEqual(f.style,{left:'6px',top:'6px',width:'634px',height:'708px'});assert.equal(f.events.size,0);assert.deepEqual(f.calls.map(c=>c[1].show),[false,true]);
});
test('Escape, cancelled gestures and lost focus restore the original floating bounds',()=>{
 for(const event of ['keydown','pointercancel','blur']){const f=dragFixture();f.events.get('pointermove')({clientX:1270,clientY:710});f.events.get(event)({key:'Escape',preventDefault(){},stopImmediatePropagation(){}});assert.deepEqual(f.style,{left:'100px',top:'90px',width:'500px',height:'350px'});assert.equal(f.events.size,0);}
});
test('page excerpts skip fields, hidden nodes and editable content and cap their size',()=>{
 const nodes=[{value:'Visible source'},{value:'Password value',excluded:true},{value:'Hidden source',hidden:true},{value:'Editor draft',excluded:true},{value:'z'.repeat(15000)}].map(n=>({textContent:n.value,parentElement:{closest:()=>n.excluded,hidden:n.hidden,getClientRects:()=>n.hidden?[]:[{}]}}));
 let index=-1;const context={location:{href:'https://example.com'},NodeFilter:{SHOW_TEXT:4},document:{body:{},title:'Source',createTreeWalker:()=>({nextNode(){return ++index<nodes.length;},get currentNode(){return nodes[index];}})},getComputedStyle:()=>({visibility:'visible',display:'block'})};
 const result=vm.runInNewContext('('+visiblePageExcerpt.toString()+')()',context);
 assert.match(result.text,/Visible source/);assert.equal(result.text.includes('Password'),false);assert.equal(result.text.includes('Editor'),false);assert.equal(result.text.includes('Hidden'),false);assert.equal(result.text.length,12000);
});
