import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const assets=process.env.JARVIS_ASSETS || path.join(root,'assets');
import * as T from '../dist/vendor/three/three.module.min.js';
import {GLTFLoader} from '../dist/vendor/three/GLTFLoader.js';
import {MeshoptDecoder} from '../dist/vendor/three/meshopt_decoder.module.js';
import {EYE_SURFACES,EYE_COLOURS} from '../dist/assets/suit-eyes.js';
const patches={};
const angles={bc6:-25,bc7:35,bc8:-35,sm1:-40,sm6:-82};
const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
loader.register(()=>({name:'OFFLINE_GEOMETRY_ONLY',loadMaterial:()=>Promise.resolve(new T.MeshBasicMaterial())}));
for(const [id,eyes]of Object.entries(EYE_SURFACES)){
  const theme=id.startsWith('im')?'ironman':id.startsWith('bc')?'batcave':'spiderman';
  const bytes=fs.readFileSync(path.join(assets,'suits',theme,id+'.glb'));
  const {scene:model}=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  model.updateMatrixWorld(true);const box=new T.Box3().setFromObject(model,true),size=box.getSize(new T.Vector3()),centre=box.getCenter(new T.Vector3()),s=1/size.y;
  model.scale.setScalar(s);model.position.set(-centre.x*s,-box.min.y*s,-centre.z*s);model.updateMatrixWorld(true);
  const front=new T.Vector3(0,0,1).applyAxisAngle(new T.Vector3(0,1,0),-(angles[id]||0)*Math.PI/180),ray=new T.Raycaster(),normal=new T.Vector3();let misses=0;
  patches[id]=eyes.map((polygon,index)=>{
    // The small foreground Spider-Ham head occludes the larger head's lower eye tips.
    // Keep the larger pair on that rear head; depth testing supplies the occlusion.
    const rearHead=id==='sm3'&&index<2;
    const sample=p=>{
      ray.set(p.clone().addScaledVector(front,2),front.clone().negate());
      const hits=ray.intersectObject(model,true);
      const hit=rearHead?hits.find(h=>Math.abs(h.point.dot(front)-.12)<.055):hits[0];
      if(!hit){misses++;return p.toArray();}
      normal.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
      return hit.point.clone().addScaledVector(normal,.0013).toArray().map(n=>+n.toFixed(6));
    };
    const out=[],N=5;
    for(let k=1;k<polygon.length-1;k++){
      const a=new T.Vector3(...polygon[0]),b=new T.Vector3(...polygon[k]),c=new T.Vector3(...polygon[k+1]);
      const grid=(i,j)=>sample(a.clone().multiplyScalar(1-(i+j)/N).addScaledVector(b,i/N).addScaledVector(c,j/N));
      for(let i=0;i<N;i++)for(let j=0;j<N-i;j++){
        out.push(...grid(i,j),...grid(i+1,j),...grid(i,j+1));
        if(i+j<N-1)out.push(...grid(i+1,j),...grid(i+1,j+1),...grid(i,j+1));
      }
    }
    return out;
  });
  console.log(id,patches[id].reduce((n,p)=>n+p.length/9,0)+' triangles',misses+' misses');
}
const file=path.join(root,'dist/assets/suit-eyes.js');
const source='/* Eye outlines and pre-baked surface meshes for the supplied normalised GLBs. Recalibrate when replacing a model. */\n'+
  'export const EYE_SURFACES = '+JSON.stringify(EYE_SURFACES)+';\n'+
  'export const EYE_PATCHES = '+JSON.stringify(patches)+';\n'+
  'export const EYE_COLOURS = '+JSON.stringify(EYE_COLOURS)+';\n';
fs.writeFileSync(file+'.tmp',source);fs.renameSync(file+'.tmp',file);
