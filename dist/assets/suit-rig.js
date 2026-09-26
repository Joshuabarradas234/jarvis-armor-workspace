/* Lightweight display rigs for the supplied static meshes; authored clips take priority. */
const known=/^(im[1-7]|bc[1235678]|sm[124567])$/;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function signaturePose(theme,amount){const k=clamp(amount,0,1);return theme==='batcave'?{shoulder:-.25*k,elbow:-.78*k,spread:.12*k,hip:0,knee:0,chest:.025*k}:theme==='spiderman'?{shoulder:-.28*k,elbow:-.36*k,spread:.20*k,hip:-.34*k,knee:.66*k,chest:.10*k}:{shoulder:-.65*k,elbow:-.36*k,spread:.035*k,hip:0,knee:0,chest:-.02*k};}
export function createSuitRig(T,model,id,theme){
  let existing=false;model.traverse(n=>{if(n.isSkinnedMesh)existing=true;});
  if(existing)return null; // Imported rigs are handled by their authored clips below.
  if(!known.test(id))return null; // Spider-Ham contains two separate figures; retain its original sculpture.
  model.updateMatrixWorld(true);const box=new T.Box3().setFromObject(model,true),height=box.max.y-box.min.y,h=id==='sm7'?.81:height;
  const root=new T.Group(),bones=[],points=[];
  const bone=(name,point,parent)=>{const b=new T.Bone();b.name=name;b.position.fromArray(point);if(parent)b.position.sub(new T.Vector3(...parent.point));(parent?.bone||root).add(b);const record={bone:b,point,index:bones.length};bones.push(b);points.push(record);return record;};
  const base=bone('display_root',[0,0,0]),pelvis=bone('hips',[0,.50*h,0],base),chest=bone('spine',[0,.74*h,0],pelvis),head=bone('head',[0,.85*h,0],chest);
  const sides=[];for(const sign of [-1,1]){const arm=bone('upper_arm_'+sign,[sign*.16*h,.75*h,0],chest),elbow=bone('forearm_'+sign,[sign*.21*h,.56*h,0],arm),hand=bone('hand_'+sign,[sign*.235*h,.40*h,0],elbow);
    const thigh=bone('thigh_'+sign,[sign*.075*h,.49*h,0],pelvis),knee=bone('shin_'+sign,[sign*.075*h,.27*h,0],thigh),foot=bone('foot_'+sign,[sign*.075*h,.055*h,.015*h],knee);sides.push({sign,arm,elbow,hand,thigh,knee,foot});}
  root.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones),originalGeometry=new Set();
  model.traverse(mesh=>{if(!mesh.isMesh||!mesh.geometry?.attributes.position)return;const geometry=mesh.geometry.clone();geometry.applyMatrix4(mesh.matrixWorld);const p=geometry.attributes.position,indices=new Uint16Array(p.count*4),weights=new Float32Array(p.count*4);
    for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),side=sides[x<0?0:1];let a=pelvis,b=pelvis,t=0;
      // Back panels, capes and mechanical spider arms remain on the torso. Flexible limbs get local chains.
      const accessory=(theme==='batcave'&&z<-.07*h&&y<.78*h)||(id==='sm7'&&(y>.83*h||z<-.04*h));
      if(y>.84*h&&!accessory){a=head;b=head;}
      else if(!accessory&&Math.abs(x)>.145*h&&y>.32*h&&y<.82*h){if(y>.57*h){a=side.arm;b=side.elbow;t=clamp((.63*h-y)/(.12*h),0,1);}else{a=side.elbow;b=side.hand;t=clamp((.44*h-y)/(.10*h),0,1);}}
      else if(!accessory&&y<.46*h&&Math.abs(x)>.022*h){if(y>.25*h){a=side.thigh;b=side.knee;t=clamp((.33*h-y)/(.12*h),0,1);}else{a=side.knee;b=side.foot;t=clamp((.11*h-y)/(.075*h),0,1);}}
      else{a=pelvis;b=chest;t=clamp((y-.51*h)/(.17*h),0,1);}
      indices[i*4]=a.index;indices[i*4+1]=b.index;weights[i*4]=1-t;weights[i*4+1]=t;
    }
    geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
    const skin=new T.SkinnedMesh(geometry,mesh.material);skin.name=mesh.name+'_display_rig';skin.frustumCulled=false;root.add(skin);skin.bind(skeleton,new T.Matrix4());originalGeometry.add(mesh.geometry);
  });
  root.updateMatrixWorld(true);skeleton.calculateInverses();const ankle=new T.Vector3();let last=-1;
  return {root,head:head.bone,chest:chest.bone,kind:'display-rig',dispose(){skeleton.dispose();},releaseOriginal(){for(const g of originalGeometry)g.dispose();},update(amount){if(amount===last)return;last=amount;const p=signaturePose(theme,amount);root.position.y=0;
    chest.bone.rotation.x=p.chest;
    for(const s of sides){const right=s.sign<0;s.arm.bone.rotation.set(theme==='ironman'&&!right?0:p.shoulder,0,-s.sign*p.spread);s.elbow.bone.rotation.x=theme==='ironman'&&!right?-.05*amount:p.elbow;s.thigh.bone.rotation.x=p.hip;s.knee.bone.rotation.x=p.knee;}
    root.updateMatrixWorld(true);let min=Infinity;for(const s of sides){s.foot.bone.getWorldPosition(ankle);root.worldToLocal(ankle);min=Math.min(min,ankle.y);}root.position.y=.055*h-min;root.updateMatrixWorld(true);
  }};
}
export function authoredPose(T,model,clips,theme){
  if(!clips?.length)return null;
  const preferred={ironman:/repulsor|activate|entry/i,batcave:/guard|activate|entry/i,spiderman:/crouch|web|activate|entry/i}[theme];const clip=clips.find(c=>preferred.test(c.name));if(!clip)return null;
  const mixer=new T.AnimationMixer(model),action=mixer.clipAction(clip);action.play();action.paused=true;let head=null;model.traverse(n=>{if(n.isBone&&/head/i.test(n.name))head=n;});
  return {kind:'authored-clip',head,update(amount){action.time=clip.duration*clamp(amount,0,1);mixer.update(0);},dispose(){mixer.stopAllAction();mixer.uncacheRoot(model);}};
}
