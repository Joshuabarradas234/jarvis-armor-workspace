/* Play only animations authored for the model; never guess skin weights for static sculptures. */
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function authoredPose(T,model,clips,theme){
  if(!clips?.length)return null;
  const preferred={ironman:/repulsor|activate|entry/i,batcave:/guard|activate|entry/i,spiderman:/crouch|web|activate|entry/i}[theme];const clip=clips.find(c=>preferred.test(c.name));if(!clip)return null;
  const mixer=new T.AnimationMixer(model),action=mixer.clipAction(clip);action.play();action.paused=true;let head=null;model.traverse(n=>{if(n.isBone&&/head/i.test(n.name))head=n;});
  return {kind:'authored-clip',head,update(amount){action.time=clip.duration*clamp(amount,0,1);mixer.update(0);},dispose(){mixer.stopAllAction();mixer.uncacheRoot(model);}};
}
