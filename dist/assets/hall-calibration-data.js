/* Normalised coordinates survive changes in source-image resolution. Shared with the local store. */
export const BAY_IDS={ironman:['im1','im2','im3','im4','im5','im6','im7'],batcave:['bc1','bc2','bc3','bc8','bc5','bc6','bc7'],spiderman:['sm1','sm2','sm3','sm4','sm5','sm6','sm7']};
const object=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)!==null;
const number=(v,min,max)=>{if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)throw Error('Calibration value is out of range.');return v;};
const vector=(v,n,min,max)=>{if(!Array.isArray(v)||v.length!==n)throw Error('Invalid calibration coordinates.');return v.map(x=>number(x,min,max));};
function keys(v,allowed){if(!object(v)||Object.keys(v).some(k=>!allowed.includes(k)))throw Error('Unknown calibration field.');}
export function validateHallCalibration(theme,value){
  if(!Object.hasOwn(BAY_IDS,theme))throw Error('Choose a hall.');keys(value,['bays','hologram','centreLabel']);const out={bays:{}};
  if(value.bays!==undefined){keys(value.bays,BAY_IDS[theme]);for(const [id,b]of Object.entries(value.bays)){
    keys(b,['bounds','label','fill','widthFit','eyeOffset','eyeScale','pose']);const row={};
    if(b.bounds!==undefined){row.bounds=vector(b.bounds,4,0,1);if(row.bounds[2]-row.bounds[0]<.025||row.bounds[3]-row.bounds[1]<.08)throw Error('Make the pod wider and taller.');}
    if(b.label!==undefined){row.label=vector(b.label,3,0,1);number(row.label[2],.025,.3);}
    for(const key of ['fill','widthFit'])if(b[key]!==undefined)row[key]=number(b[key],.65,.99);
    if(b.eyeOffset!==undefined)row.eyeOffset=vector(b.eyeOffset,3,-.15,.15);
    if(b.eyeScale!==undefined)row.eyeScale=number(b.eyeScale,.5,1.8);
    if(b.pose!==undefined)row.pose=number(b.pose,0,1);
    out.bays[id]=row;
  }}
  if(value.hologram!==undefined){out.hologram=vector(value.hologram,4,0,1);const[x,y,w,h]=out.hologram;if(w<.05||h<.05||x-w/2<0||x+w/2>1||y-h/2<0||y+h/2>1)throw Error('Keep the hologram inside the picture.');}
  if(value.centreLabel!==undefined){out.centreLabel=vector(value.centreLabel,3,0,1);number(out.centreLabel[2],.025,.4);}
  return out;
}
export function calibratedStage(stage,patch={}){
  const result={...stage,bays:{...stage.bays}};
  for(const[id,p]of Object.entries(patch.bays||{})){const b=result.bays[id];if(!b)continue;const next={...b};
    if(p.bounds){const[x0,y0,x1,y1]=p.bounds;Object.assign(next,{x0:x0*stage.w,y0:y0*stage.h,x1:x1*stage.w,y1:y1*stage.h,foot:y1*stage.h});}
    for(const k of ['fill','widthFit','eyeOffset','eyeScale','pose'])if(p[k]!==undefined)next[k]=p[k];result.bays[id]=next;
  }return result;
}
export function calibratedModules(modules,stage,patch={}){return modules.map(m=>{
  const b=stage.bays[m.id],p=patch.bays?.[m.id];const next={...m};
  if(b)next.hotspot={x:b.x0/stage.w*100,y:b.y0/stage.h*100,w:(b.x1-b.x0)/stage.w*100,h:(b.foot-b.y0)/stage.h*100};
  const label=m.isVehicle?patch.centreLabel:p?.label;if(label)next.plaque={x:label[0]*100,y:label[1]*100,w:label[2]*100};return next;
});}
