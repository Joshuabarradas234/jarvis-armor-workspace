import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SourceTextModule, SyntheticModule, createContext } from 'node:vm';
import { imagePresenter, disposeObject } from '../../dist/assets/scene-quality.js';
import { hallLabel } from '../../dist/assets/hall-labels.js';
import { WorkstationStore } from '../../src/workstations/store.js';
import os from 'node:os';
import path from 'node:path';

const repo = new URL('../../', import.meta.url);
const read = file => fs.readFileSync(new URL(file, repo), 'utf8');
const themes = JSON.parse(read('config/themes.json'));
const pending = [];
class FakeImage { set src(value) { this.url = value; pending.push(this); } }
const host = () => ({ style:{backgroundImage:''}, classList:{add(){}}, appendChild(){} });
globalThis.Image = FakeImage;
globalThis.matchMedia = () => ({matches:true});

test('a newer hall wins when image requests finish in reverse order', async () => {
  pending.length=0; const el=host(), p=imagePresenter(el);
  const a=p.show('old.jpg',p.invalidate()), b=p.show('new.jpg',p.invalidate());
  pending[1].onload(); assert.equal(await b,true);
  pending[0].onload(); assert.equal(await a,false);
  assert.equal(el.style.backgroundImage,'url("new.jpg")'); p.dispose();
});
test('invalidating before IPC resolves prevents the old request from even loading', async () => {
  pending.length=0;const el=host(),p=imagePresenter(el),old=p.invalidate();p.invalidate();
  assert.equal(await p.show('late.jpg',old),false);assert.equal(pending.length,0);p.dispose();
});
test('a failed image preserves the last good backdrop and can be retried', async () => {
  pending.length=0;const el=host(),p=imagePresenter(el);el.style.backgroundImage='url("good.jpg")';
  const failed=p.show('broken.jpg',p.invalidate());pending[0].onerror();assert.equal(await failed,false);
  assert.equal(el.style.backgroundImage,'url("good.jpg")');
  const retry=p.show('broken.jpg',p.invalidate());pending[1].onload();assert.equal(await retry,true);p.dispose();
});
test('disposing the window prevents a pending image from painting', async () => {
  pending.length=0;const el=host(),p=imagePresenter(el),wait=p.show('pending.jpg',p.invalidate());p.dispose();pending[0].onload();
  assert.equal(await wait,false);assert.equal(el.style.backgroundImage,'');
});
test('shared GLTF textures, materials and geometry are disposed once; shared environment is retained', () => {
  const resource=extra=>({...extra,count:0,dispose(){this.count++;}});
  const tex=resource({isTexture:true}),env=resource({isTexture:true}),geometry=resource(),material=resource({map:tex,normalMap:tex,envMap:env});
  const object={traverse(fn){fn({geometry,material:[material,material]});fn({geometry,material});}};
  disposeObject(object,new Set([env]));
  assert.equal(tex.count,1);assert.equal(geometry.count,1);assert.equal(material.count,1);assert.equal(env.count,0);
});
test('disposal can share a seen set across multiple scenes', () => {
  let count=0;const geometry={dispose(){count++;}},seen=new Set(),obj={traverse(fn){fn({geometry});}};
  disposeObject(obj,new Set(),seen);disposeObject(obj,new Set(),seen);assert.equal(count,1);
});
test('live suit names are escaped, including quotes and HTML', () => {
  const label=hallLabel({name:'<img src=x onerror="bad()"> & test',index:1});
  assert.ok(label.includes('&lt;img'));assert.ok(label.includes('&quot;'));assert.ok(!label.includes('<img'));
});

// Load the actual bundled hall class, replacing only its shared HTML-escape import.
const context=createContext({});
const stub=new SyntheticModule(['o'],function(){this.setExport('o',s=>s);},{context});
const hallModule=new SourceTextModule(read('dist/assets/hall-fZdHx-gJ.js'),{context});
await hallModule.link(()=>stub);await hallModule.evaluate();
const {ArmorHall}=hallModule.namespace;
for(const theme of themes){
  const stage=JSON.parse(read('assets/wallpaper/'+theme.id+'-empty.json'));
  test(theme.id+': every suit has exactly one valid pod and the artwork exists',()=>{
    const suits=theme.suits.filter(s=>!s.isVehicle);
    assert.equal(suits.length,7);assert.deepEqual(Object.keys(stage.bays),suits.map(s=>s.id));
    assert.ok(fs.statSync(new URL('assets/'+theme.wallpaper,repo)).size>100000);
    assert.equal(stage.image,theme.wallpaper.split('/').pop());
    for(const suit of suits){const b=stage.bays[suit.id];assert.ok(b.x0>0&&b.x1<stage.w&&b.y0>0&&b.foot<stage.h);assert.ok(b.x1>b.x0&&b.foot>b.y0);assert.ok(b.widthFit<=.99&&!b.spill);}
    const centre=theme.suits.find(s=>s.isVehicle);
    assert.ok(centre.hotspot.y*stage.h/100>Math.max(...Object.values(stage.bays).map(b=>b.foot)));
    /* Full-height projections rise above the dais; keep their base below the pods and their top clear of headings. */
    const o=theme.overlay;assert.ok((o.y+o.h/2)*stage.h/100>Math.max(...Object.values(stage.bays).map(b=>b.foot)));
    assert.ok(o.y-o.h/2>=27&&o.y+o.h/2<95&&o.x-o.w/2>0&&o.x+o.w/2<100);
  });
  for(const [W,H] of [[1920,1080],[1440,900],[1280,720],[800,600],[600,900]]){
    test(theme.id+': all seven clickable pods stay aligned and inside '+W+'×'+H,()=>{
      const hall=Object.create(ArmorHall.prototype);hall.el={clientWidth:W,clientHeight:H};hall.theme=theme;hall.image={w:stage.w,h:stage.h};
      const g=hall.geometry();assert.ok(g.w<=W+.001&&g.h<=H+.001);
      for(const suit of theme.suits.filter(s=>!s.isVehicle)){
        const b=stage.bays[suit.id],h=suit.hotspot,k=Math.min(W/stage.w,H/stage.h);
        const x=g.ox+g.w*h.x/100,y=g.oy+g.h*h.y/100,w=g.w*h.w/100,height=g.h*h.h/100;
        assert.ok(x>=0&&y>=0&&x+w<=W+.001&&y+height<=H+.001);
        assert.ok(Math.abs(x-(g.ox+b.x0*k))<.001);assert.ok(Math.abs(y+height-(g.oy+b.foot*k))<.001);
      }
    });
  }
}

test('generic pod names migrate, but saved custom names and workspace data survive', () => {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-pod-names-'));
  try {
    fs.writeFileSync(path.join(dir,'workstations.json'),JSON.stringify({suits:{ironman:[{id:'im5',name:'Bay 05',folder:'',links:[{url:'https://example.com',target:'inapp',label:'Project'}]}],spiderman:[{id:'sm4',name:'My design work'}]}}));
    const store=new WorkstationStore({configFile:fileURLToPath(new URL('config/themes.json',repo)),dir});
    assert.equal(store.suit('im5','ironman').name,'War Machine');
    assert.equal(store.suit('im5','ironman').links[0].url,'https://example.com/');
    assert.equal(store.suit('sm4','spiderman').name,'My design work');
    assert.equal(store.suit('sm1','spiderman').name,'Miles');
  } finally {
    // Only this uniquely-created test directory is removed.
    assert.ok(dir.startsWith(path.join(os.tmpdir(),'jarvis-pod-names-')));fs.rmSync(dir,{recursive:true,force:true});
  }
});

test('a GLTF arriving after a hall switch is released, and teardown releases the WebGL context once', async () => {
  const intervals=[],events=new Map(),loads=[],resources=[];
  const resource=extra=>{const r={...extra,count:0,dispose(){this.count++;}};resources.push(r);return r;};
  class V {set(){return this;}copy(){return this;}setScalar(){return this;}}
  class Object3D {constructor(){this.children=[];this.position=new V();this.rotation=new V();this.scale=new V();this.target={position:new V()};}add(...o){this.children.push(...o);}traverse(fn){fn(this);for(const o of this.children)o.traverse?.(fn);}clear(){this.children=[];}}
  class Mesh extends Object3D {constructor(geometry,material){super();this.geometry=geometry;this.material=material;}}
  class Geometry {dispose(){}}
  class Material {constructor(v){Object.assign(this,v);}dispose(){}}
  class Texture {constructor(){this.isTexture=true;}dispose(){}}
  class Renderer {constructor(){this.disposed=0;this.lost=0;}setScissorTest(){}setClearColor(){}dispose(){this.disposed++;}forceContextLoss(){this.lost++;}}
  class Loader {setMeshoptDecoder(){return this;}load(url,ok){loads.push({url,ok});}}
  class Room extends Object3D {dispose(){}}
  const three={Scene:Object3D,Group:Object3D,PerspectiveCamera:Object3D,HemisphereLight:Object3D,SpotLight:Object3D,DirectionalLight:Object3D,Mesh,PlaneGeometry:Geometry,MeshBasicMaterial:Material,ShaderMaterial:Material,CanvasTexture:Texture,WebGLRenderer:Renderer,PMREMGenerator:class{fromScene(){return resource({texture:resource({isTexture:true})});}dispose(){}},SRGBColorSpace:'srgb',ACESFilmicToneMapping:1,AdditiveBlending:1};
  const gradient={addColorStop(){}}, ctx2d=new Proxy({},{get(_t,k){return k.startsWith('create')?()=>gradient:()=>{};}});
  const classes={add(){},remove(){},contains(){return false;}};
  const element=()=>({style:{},classList:classes,isConnected:true,getContext:()=>ctx2d,append(...els){for(const e of els)e.parentElement=this;},remove(){this.parentElement=null;}});
  const back=element(),hotspots=element(),body={dataset:{theme:'ironman'},classList:classes};
  const window={jarvis:{on(){},async call(name){return name==='suit-models'?{pod:'/'+body.dataset.theme+'.glb'}:{};}}};
  const context=createContext({window,document:{body,hidden:false,createElement:element,querySelector:s=>s==='.hall-backdrop'?back:s==='.hall-hotspots'?hotspots:null},URLSearchParams,location:{search:'?view=main'},console,performance:{now:()=>0},setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval(){},setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>1,cancelAnimationFrame(){},addEventListener:(name,fn)=>events.set(name,fn),MutationObserver:class{observe(){}},fetch:async()=>({ok:true,json:async()=>({w:100,h:100,bays:{pod:{}},reactor:false})})});
  window.addEventListener=context.addEventListener;
  const quality=new SourceTextModule(read('dist/assets/scene-quality.js'),{context});await quality.link(()=>{});await quality.evaluate();
  const libs={
    '../vendor/three/three.module.min.js':three,
    '../vendor/three/GLTFLoader.js':{GLTFLoader:Loader},
    '../vendor/three/meshopt_decoder.module.js':{MeshoptDecoder:{}},
    '../vendor/three/RoomEnvironment.js':{RoomEnvironment:Room},
  };
  const modules=new Map();for(const [name,exports] of Object.entries(libs)){const m=new SyntheticModule(Object.keys(exports),function(){for(const [k,v] of Object.entries(exports))this.setExport(k,v);},{context});await m.link(()=>{});await m.evaluate();modules.set(name,m);}
  const suits=new SourceTextModule(read('dist/assets/suits3d.js'),{context,importModuleDynamically:s=>modules.get(s)});const imports=new Map([['./scene-quality.js',quality]]);
  for(const name of ['suit-entry.js','suit-eyes.js','hall-calibration-data.js','render-budget.js','suit-rig.js','suit-signatures.js','case-mist.js']){const m=new SourceTextModule(read('dist/assets/'+name),{context});await m.link(()=>{});await m.evaluate();imports.set('./'+name,m);}
  await suits.link(name=>imports.get(name));await suits.evaluate();
  const flush=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
  const sync=intervals.find(i=>i.ms===1500).fn;sync();await flush();assert.equal(loads.length,1);
  const old=window.__jarvisSuits.bays.get('pod'),renderer=window.__jarvisSuits.renderer;
  body.dataset.theme='batcave';sync();await flush();assert.equal(loads.length,2);assert.equal(old.disposed,true);
  const geometry=resource(),texture=resource({isTexture:true}),material=resource({map:texture});
  loads[0].ok({scene:{traverse(fn){fn({geometry,material});}}});
  assert.equal(geometry.count,1);assert.equal(texture.count,1);assert.equal(material.count,1);
  assert.equal(window.__jarvisSuits.bays.get('pod').ready,false);assert.equal(window.__jarvisSuits.theme,'batcave');
  events.get('pagehide')();events.get('pagehide')();assert.equal(renderer.disposed,1);assert.equal(renderer.lost,1);assert.equal(window.__jarvisSuits.bays.size,0);
});
