/* One budget for suit rendering, glass, particles and ambient media. */
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function renderBudget(settings={},status={},environment={}){
  const quiet=settings.animations===false||environment.reduced===true;
  const battery=!!status.onBattery&&settings.reduceOnBattery!==false;
  let quality=['low','medium','high','ultra'].includes(settings.quality)?settings.quality:'high';if(battery)quality='low';
  const levels={low:{dpr:1,anisotropy:2,particles:false,detail:false},medium:{dpr:1.25,anisotropy:4,particles:false,detail:true},high:{dpr:1.75,anisotropy:8,particles:true,detail:true},ultra:{dpr:2.5,anisotropy:16,particles:true,detail:true}};
  const spec=levels[quality],fps=battery?15:([15,30,60].includes(settings.fps)?settings.fps:30);
  return {...spec,quality,fps,quiet,dpr:Math.min(spec.dpr,clamp(environment.dpr||1,1,3)),videoRate:battery||fps===15?.5:1,pose:!quiet};
}
export function fitSuit({height,width,modelWidth,modelDepth=0,fill=.97,widthFit=.96,yaw=0}){
  const reach=Math.abs(Math.cos(yaw))*modelWidth+Math.abs(Math.sin(yaw))*modelDepth;
  return Math.max(1,Math.min(height*fill,width*widthFit/Math.max(.05,reach)));
}
export function suitRenderScale(budget,width,height,detail=false){
  // A short entry gets a sharper buffer; steady-state and battery FPS limits stay in place.
  const pixels=(detail?{low:4200000,medium:5000000,high:6500000,ultra:8300000}:{low:1200000,medium:2200000,high:4200000,ultra:8300000})[budget.quality];
  const wanted=detail?Math.max(budget.dpr,{low:2,medium:2,high:2.4,ultra:3.2}[budget.quality]):budget.dpr;
  return Math.min(wanted,Math.sqrt(pixels/Math.max(1,width*height)));
}
export function concealedHall(doc){return doc.hidden||!!doc.querySelector('.jc.in,.tw.in,.ix-room.in,.gx.in,.wb-panel,.module-host:not(.hidden) .workstation');}
export function watchRenderBudget(bridge=window.jarvis){
  let settings={},status={},alive=true;const off=[];
  if(bridge){off.push(bridge.on('settings',v=>{settings=v;}),bridge.on('status',v=>{status=v;}));bridge.call('bootstrap').then(b=>{if(alive){settings=b.settings||{};status=b.status||{};}}).catch(()=>{});}
  return {get(){return renderBudget(settings,status,{reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,dpr:devicePixelRatio||1});},dispose(){alive=false;for(const f of off)f?.();}};
}
