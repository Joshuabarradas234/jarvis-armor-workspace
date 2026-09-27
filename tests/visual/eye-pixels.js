export async function measureEyes(id){
 const T=await import('jarvis://app/vendor/three/three.module.min.js'),S=window.__jarvisSuits,b=S.bays.get(id),r=S.renderer;
 b.scene.updateMatrixWorld(true);const camera=b.camera.clone(),box=new T.Box3();for(const e of b.eyes)box.expandByObject(e,true);
 const low=new T.Vector3(Infinity,Infinity,0),high=new T.Vector3(-Infinity,-Infinity,0);
 for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const p=new T.Vector3(x,y,z).project(camera);low.x=Math.min(low.x,p.x);low.y=Math.min(low.y,p.y);high.x=Math.max(high.x,p.x);high.y=Math.max(high.y,p.y);}
 const W=b.rect.w,H=b.rect.h,w=(high.x-low.x)/2*W+12,h=(high.y-low.y)/2*H+12,x=(low.x+1)/2*W-6,y=(1-high.y)/2*H-6;
 camera.setViewOffset(W,H,x,y,w,h);
 const target=new T.WebGLRenderTarget(384,192),pixels=[];r.setRenderTarget(target);r.setScissorTest(false);
 for(const mode of ['lit','unlit','no-depth']){for(const e of b.eyes){e.visible=mode!=='unlit';e.material.opacity=1;e.material.depthTest=mode!=='no-depth';}r.clear();r.render(b.scene,camera);const a=new Uint8Array(384*192*4);r.readRenderTargetPixels(target,0,0,384,192,a);pixels.push(a);}
 for(const e of b.eyes){e.visible=true;e.material.opacity=.92;e.material.depthTest=true;}
 r.setRenderTarget(null);r.setScissorTest(true);target.dispose();
 const compare=(a,b)=>{let pixels=0,total=0;for(let i=0;i<a.length;i+=4){let d=0;for(let c=0;c<3;c++)d+=Math.abs(a[i+c]-b[i+c]);if(d>15)pixels++;total+=d;}return{pixels,total};};
 return {id,visible:compare(pixels[0],pixels[1]),all:compare(pixels[2],pixels[1])};
}
