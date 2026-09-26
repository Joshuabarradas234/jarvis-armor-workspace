export const defaults = {
  setupComplete:false, startWithWindows:false, startMinimized:true, autoStart:false,
  wallpaper:true, voiceEnabled:false, voiceName:'', voicePack:'off', animations:true,
  mainDisplay:null, controlDisplay:null, singleScreen:false, thirdScreen:true, scale:1,
  quality:'auto', fps:30, reduceOnBattery:true,
  master:0.65, voice:0.8, interface:0.35, mechanical:0.45, ambience:0.12, music:0.65,
  hotkeys:{wake:'CommandOrControl+Alt+J',home:'CommandOrControl+Alt+H',standdown:'CommandOrControl+Alt+X',back:'Escape'},
  weather:{latitude:null,longitude:null,enabled:false},
  ai:{endpoint:'',model:'',enabled:false},
  jaeAsset:'', shortcuts:[], favorites:[], updateFeed:'', deckBackdrops:{},
  startup:{enabled:true,video:'jarvis://asset/startup/welcome.mp4',sound:'jarvis://asset/startup/welcome.mp3',seconds:15,loopVideo:true}
};
const bools = ['setupComplete','startWithWindows','startMinimized','autoStart','wallpaper','voiceEnabled','animations','singleScreen','thirdScreen','reduceOnBattery'];
export function validateSettings(patch, current=defaults) {
  if (!patch || typeof patch!=='object' || Array.isArray(patch)) throw Error('Settings must be an object.');
  const next = structuredClone(current);
  for (const [key,value] of Object.entries(patch)) {
    if (!(key in defaults)) throw Error(`Unknown setting: ${key}`);
    if (bools.includes(key)) { if(typeof value!=='boolean')throw Error(`${key} must be on or off.`); next[key]=value; }
    else if(['master','voice','interface','mechanical','ambience','music','scale'].includes(key)) {
      const min=key==='scale'?0.75:0, max=key==='scale'?1.5:1;
      if(!Number.isFinite(value)||value<min||value>max)throw Error(`${key} is out of range.`); next[key]=value;
    } else if(key==='fps') {if(![15,30,60].includes(value))throw Error('Choose 15, 30 or 60 FPS.');next[key]=value;}
    else if(key==='quality') {if(!['auto','low','medium','high','ultra'].includes(value))throw Error('Unknown quality.');next[key]=value;}
    else if(['mainDisplay','controlDisplay'].includes(key)) {if(value!==null&&!Number.isInteger(value))throw Error('Invalid display.');next[key]=value;}
    else if(['voiceName','jaeAsset'].includes(key)) {if(typeof value!=='string'||value.length>1024)throw Error('Invalid asset/voice.');next[key]=value;}
    else if(key==='hotkeys') {
      if(!value || typeof value!=='object')throw Error('Invalid shortcuts.');
      const merged={...current.hotkeys};
      for(const [action,accelerator] of Object.entries(value)){
        if(!(action in defaults.hotkeys)||typeof accelerator!=='string'||accelerator.length>80||!accelerator.trim())throw Error('Invalid hotkey.');
        merged[action]=accelerator;
      }
      if(new Set(Object.values(merged)).size!==4)throw Error('Hotkeys must be different.');next.hotkeys=merged;
    } else if(key==='weather') {
      if(!value||typeof value!=='object'||typeof value.enabled!=='boolean')throw Error('Invalid weather settings.');
      for(const [k,limit]of [['latitude',90],['longitude',180]])if(value[k]!==null&&(!Number.isFinite(value[k])||Math.abs(value[k])>limit))throw Error('Invalid weather coordinates.');
      if(value.enabled&&(value.latitude===null||value.longitude===null))throw Error('Enter both weather coordinates.');
      next.weather={enabled:value.enabled,latitude:value.latitude,longitude:value.longitude};
    } else if(key==='ai') {
      if(!value||typeof value!=='object'||typeof value.enabled!=='boolean'||typeof value.model!=='string'||value.model.length>200||typeof value.endpoint!=='string')throw Error('Invalid AI settings.');
      if(value.endpoint){const url=new URL(value.endpoint);if(url.protocol!=='https:'||url.username||url.password)throw Error('AI endpoint must be HTTPS without credentials.');}
      if(value.enabled&&(!value.endpoint||!value.model))throw Error('Add an endpoint and model first.');
      next.ai={enabled:value.enabled,endpoint:value.endpoint,model:value.model};
    } else if(key==='shortcuts') {
      if(!Array.isArray(value)||value.length>40)throw Error('Up to 40 shortcuts are supported.');
      next.shortcuts=value.map(s=>{if(!s||typeof s.id!=='string'||typeof s.label!=='string'||!s.label.trim()||s.label.length>80||!['url','path','calculator','mail','documents'].includes(s.type)||typeof s.target!=='string'||s.target.length>2048)throw Error('Invalid launcher.');if(s.type==='url'&&!/^https?:\/\//i.test(s.target))throw Error('Use an HTTP or HTTPS URL.');return {id:s.id.slice(0,80),label:s.label,type:s.type,target:s.target};});
    } else if(key==='startup') {
      if(!value||typeof value!=='object'||typeof value.enabled!=='boolean')throw Error('Invalid startup settings.');
      for(const k of ['video','sound'])if(typeof value[k]!=='string'||value[k].length>1024||(value[k]&&!/^jarvis:\/\/(asset|custom)\//.test(value[k])))throw Error('Startup media must be an imported asset.');
      if(!Number.isFinite(value.seconds)||value.seconds<6||value.seconds>90)throw Error('Startup sequence length must be 6–90 seconds.');
      next.startup={enabled:value.enabled,video:value.video,sound:value.sound,seconds:Math.round(value.seconds*10)/10,loopVideo:value.loopVideo!==false};
    } else if(key==='voicePack') {
      if(!['off','random','mapped'].includes(value))throw Error('Voice pack must be off, random or mapped.');
      next.voicePack=value;
    } else if(key==='updateFeed') {
      if(typeof value!=='string'||value.length>2048)throw Error('Invalid update feed.');
      if(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw Error('The update feed must be an HTTPS address.');}
      next.updateFeed=value;
    } else if(key==='deckBackdrops') {
      if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Invalid second-screen pictures.');
      const out={};for(const [k,v] of Object.entries(value)){if(!['ironman','batcave','spiderman'].includes(k)||typeof v!=='string'||!/^[\w.-]{1,120}$/.test(v))throw Error('Invalid second-screen picture.');out[k]=v;}
      next.deckBackdrops=out;
    } else if(key==='favorites') {if(!Array.isArray(value)||value.length>20||value.some(x=>typeof x!=='string'||x.length>2048))throw Error('Invalid folders.');next.favorites=[...value];}
  }
  return next;
}
/** Lenient load: keep every valid key and drop the bad ones, so one bad value can't reset everything. */
export function sanitizeSettings(raw, base=defaults, onDrop=()=>{}) {
  let next = structuredClone(base);
  if (!raw || typeof raw!=='object' || Array.isArray(raw)) return next;
  for (const [key,value] of Object.entries(raw)) {
    try { next = validateSettings({[key]:value}, next); } catch (e) { onDrop(key, e.message); }
  }
  return next;
}
