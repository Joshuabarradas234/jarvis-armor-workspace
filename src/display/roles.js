/** For tests only: JARVIS_TEST_SPLIT="1920x1080,1920x1200" pretends one tall screen is a laptop screen with a second one below it. */
export function testDisplays(){
  const spec=process.env.JARVIS_TEST_SPLIT;if(!spec)return null;
  let y=0;return spec.split(',').map((p,i)=>{const [w,h]=p.split('x').map(Number);const b={x:0,y,width:w,height:h};y+=h;return {id:900+i,label:`Test ${i+1}`,bounds:b,workArea:b,size:{width:w,height:h},workAreaSize:{width:w,height:h},scaleFactor:1,rotation:0,internal:true};});
}
export function resolveDisplays(displays, settings) {
  if(!displays.length)return {main:null,control:null,single:true};
  const ordered=[...displays].sort((a,b)=>a.bounds.y-b.bounds.y||a.bounds.x-b.bounds.x);
  const main=displays.find(d=>d.id===settings.mainDisplay)||ordered[0];
  const control=settings.singleScreen?null:displays.find(d=>d.id===settings.controlDisplay&&d.id!==main.id)||ordered.find(d=>d.id!==main.id)||null;
  // v9.18: a third screen, if there is one, shows the hall's view (the Batcave with the plane on its pad)
  const third=control&&settings.thirdScreen!==false?ordered.find(d=>d.id!==main.id&&d.id!==control.id)||null:null;
  return {main,control,third,single:!control};
}
