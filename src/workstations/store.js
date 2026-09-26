import fs from 'node:fs';
import path from 'node:path';
const MAX_LINKS=20,MAX_APPS=20;
function safeName(name,fallback){const n=String(name??'').replace(/[<>\r\n]/g,'').trim().slice(0,40);return n||fallback;}
export function validateLink(link){
  if(!link||typeof link.url!=='string')throw Error('Invalid link.');
  const u=new URL(link.url);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Links must be HTTP or HTTPS without credentials.');
  if(!['browser','inapp'].includes(link.target))throw Error('Choose where the link opens.');
  return {url:u.href.slice(0,2048),target:link.target,label:String(link.label||u.hostname).slice(0,60)};
}
export function validateApp(app){
  if(!app||typeof app.path!=='string'||!path.isAbsolute(app.path)||app.path.length>2048)throw Error('Apps need an absolute path.');
  return {path:app.path,label:String(app.label||path.basename(app.path)).slice(0,60)};
}
export function validateMedia(m){const out={transitionVideo:'',chromaKey:true,transitionSound:'',start:0,end:0,preVideo:'',preSound:'',preFlashAt:0,blackout:false};for(const k of ['preVideo','preSound']){const v=m[k]??'';if(typeof v!=='string'||v.length>1024||(v&&!/^jarvis:\/\/(asset|custom)\//.test(v)))throw Error('Transition media must be an imported asset.');out[k]=v;}{const f=Number(m.preFlashAt??0);if(!Number.isFinite(f)||f<0||f>60)throw Error('Flash time must be 0–60 seconds.');out.preFlashAt=Math.round(f*10)/10;}out.blackout=m.blackout===true;out.reveal=['fade','lens'].includes(m.reveal)?m.reveal:'fade';for(const k of ['start','end']){const v=Number(m[k]??0);if(!Number.isFinite(v)||v<0||v>3600)throw Error('Clip times must be 0–3600 seconds.');out[k]=Math.round(v*10)/10;}if(out.end&&out.end<=out.start)throw Error('Clip end must be after its start.');for(const k of ['transitionVideo','transitionSound']){const v=m[k]??'';if(typeof v!=='string'||v.length>1024||(v&&!/^jarvis:\/\/(asset|custom)\//.test(v)))throw Error('Transition media must be an imported asset.');out[k]=v;}out.chromaKey=m.chromaKey!==false;return out;}
const MAX_WINDOWS=8;
/** Where each app window belongs when this suit opens: which screen, which half. */
export function validateLayout(layout){
  if(!layout||typeof layout!=='object')return null;
  const windows=Array.isArray(layout.windows)?layout.windows.slice(0,MAX_WINDOWS).map(w=>{
    const matchBy=['title','process','link'].includes(w?.matchBy)?w.matchBy:'title';
    let match=String(w?.match??'').replace(/[<>\r\n]/g,'').trim();
    if(matchBy==='link'){
      if(!/^[a-z]+:\/\//i.test(match)&&match)match='https://'+match;     // "claude.ai" is fine to type
      let u;try{u=new URL(match);}catch{throw Error('That link is not a web address.');}
      if(!['http:','https:'].includes(u.protocol)||match.length>2048)throw Error('Links must be web addresses (https://…).');
      match=u.href;
    }else match=match.slice(0,80);
    if(!match)return null;
    const out={match,
      matchBy,
      display:['top','bottom'].includes(w.display)?w.display:'top',
      area:['full','left','right','top','bottom'].includes(w.area)?w.area:'full',
      launch:''};
    if(typeof w.launch==='string'&&w.launch){
      if(!path.isAbsolute(w.launch)||w.launch.length>2048)throw Error('The app to start must be an absolute path.');
      out.launch=w.launch;
    }
    return out;
  }).filter(Boolean):[];
  if(!windows.length)return null;
  return {enabled:layout.enabled!==false,windows};
}
export function validateSuit(base,patch){
  const next={...base};
  next.name=safeName(patch.name,base.name);
  next.subtitle=String(patch.subtitle??base.subtitle??'').replace(/[<>\r\n]/g,'').trim().slice(0,80);
  if(patch.folder!==undefined){if(patch.folder!==''&&(typeof patch.folder!=='string'||!path.isAbsolute(patch.folder)||patch.folder.length>2048))throw Error('Folder must be an absolute path.');next.folder=patch.folder;}
  if(patch.links!==undefined){if(!Array.isArray(patch.links)||patch.links.length>MAX_LINKS)throw Error(`Up to ${MAX_LINKS} links per suit.`);next.links=patch.links.map(validateLink);}
  if(patch.apps!==undefined){if(!Array.isArray(patch.apps)||patch.apps.length>MAX_APPS)throw Error(`Up to ${MAX_APPS} apps per suit.`);next.apps=patch.apps.map(validateApp);}
  if(patch.autoLaunch!==undefined){if(typeof patch.autoLaunch!=='boolean')throw Error('autoLaunch must be on or off.');next.autoLaunch=patch.autoLaunch;}
  if(patch.accent!==undefined){if(!/^#[0-9a-f]{6}$/i.test(patch.accent))throw Error('Invalid accent colour.');next.accent=patch.accent;}
  if(patch.layout!==undefined)next.layout=validateLayout(patch.layout);
  if(patch.session!==undefined)next.session=validateSession(patch.session);
  return next;
}
/** A saved working session: which tabs were open in this suit and which one was in front. */
export function validateSession(session){
  if(!session||typeof session!=='object')return null;
  const tabs=Array.isArray(session.tabs)?session.tabs.slice(0,12).map(t=>{
    try{const u=new URL(String(t?.url||''));if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return null;
      return {url:u.href.slice(0,2048),title:String(t?.title||u.hostname).replace(/[<>\r\n]/g,'').slice(0,120)};
    }catch{return null;}
  }).filter(Boolean):[];
  if(!tabs.length)return null;
  const active=Number.isInteger(session.active)&&session.active>=0&&session.active<tabs.length?session.active:0;
  return {tabs,active,updatedAt:Number(session.updatedAt)||Date.now()};
}
/** Default names that moved when bays were added. Only an unchanged old default is renamed. */
const RENAMED={'spiderman:sm4':{'Reactor Vault':'Ghost-Spider'},'batcave:bc5':{'Cowl 04':'Knightmare Bat'},
  'batcave:bc6':{'Cowl 05':'Joker Bat'},'batcave:bc7':{'Cowl 06':'Exoframe Bat'},
  'ironman:im1':{'Bay 01':'Mark One','Mark I':'Mark One','MARK I':'Mark One'},
  'ironman:im2':{'Bay 02':'Mark Two','Mark II':'Mark Two','MARK II':'Mark Two'},
  'ironman:im4':{'Bay 04':'Mark Five','Suit 04':'Mark Five','SUIT 04':'Mark Five','Mark V':'Mark Five'}};
const POD_NAMES={"ironman:im5":{"Bay 05":"War Machine"},"ironman:im6":{"Bay 06":"Endgame"},"ironman:im7":{"Bay 07":"Hulkbuster"},"batcave:bc1":{"Cowl 01":"Hellbat"},"batcave:bc2":{"Cowl 02":"Arkham Knight"},"batcave:bc3":{"Cowl 03":"Dark Knight"},"batcave:bc5":{"Cowl 05":"Knightmare Bat"},"batcave:bc6":{"Cowl 06":"Joker Bat"},"batcave:bc7":{"Cowl 07":"Exoframe Bat"},"spiderman:sm1":{"Case 01":"Miles"},"spiderman:sm2":{"Case 02":"Symbiote"},"spiderman:sm3":{"Case 03":"Spider-Ham"},"spiderman:sm4":{"Case 04":"Ghost-Spider"},"spiderman:sm5":{"Case 05":"2099"},"spiderman:sm6":{"Case 06":"Spider-Punk"},"spiderman:sm7":{"Case 07":"Iron Spider"}};
function normaliseSuit(theme,s,saved){
  const key=theme.id+':'+s.id, moved={...RENAMED[key],...POD_NAMES[key]};
  if(saved&&moved&&moved[saved.name])saved={...saved,name:moved[saved.name]};
  const base={id:s.id,name:s.name,subtitle:'',accent:s.accent,hotspot:s.hotspot,plaque:s.plaque||null,eyes:s.eyes||null,canopy:s.canopy||null,face:s.face||null,emblem:s.emblem||null,isVehicle:!!s.isVehicle,folder:'',links:[],apps:[],autoLaunch:true,session:null,layout:null,theme:theme.id};
  if(!saved)return base;
  try{return validateSuit(base,saved);}catch{return base;}
}
export class WorkstationStore{
  constructor({configFile,dir,log=()=>{}}){
    this.file=path.join(dir,'workstations.json');this.log=log;
    this.themes=JSON.parse(fs.readFileSync(configFile,'utf8'));
    let saved={activeTheme:this.themes[0].id,suits:{}};
    try{const parsed=JSON.parse(fs.readFileSync(this.file,'utf8'));if(parsed&&typeof parsed==='object')saved={activeTheme:parsed.activeTheme,suits:parsed.suits&&typeof parsed.suits==='object'?parsed.suits:{}};}catch(e){if(e.code!=='ENOENT')log('workstations-recovery',String(e));}
    this.activeTheme=this.themes[0].id;   // always open in the Armor Hall, so JARVIS introduces himself
    this.media={};try{const m=JSON.parse(fs.readFileSync(this.file,'utf8')).media||{};for(const th of this.themes){const saved=m[th.id]||{};this.media[th.id]={...validateMedia(saved.customised?saved:{...(th.media||{}),...Object.fromEntries(Object.entries(saved).filter(([k,v])=>k==='start'||k==='end'))}),...(saved.customised?{customised:true}:{})};}}catch{for(const th of this.themes)this.media[th.id]=validateMedia(th.media||{});}
    // v9.5: the Web Lab no longer plays the web-shoot (its sound carried a voice); go straight into the transition
    {const w=this.media.spiderman;if(w&&typeof w.preVideo==='string'&&/spiderman-web\.(mp4|webm)$/.test(w.preVideo)){w.preVideo='';w.preSound='';w.preFlashAt=0;}}
    // v4.2: the bundled Iron Man transition is no longer a green-screen clip
    for(const th of this.themes){const m=this.media[th.id];if(m&&typeof m.transitionVideo==='string'&&m.transitionVideo.endsWith('/transitions/ironman.mp4'))m.chromaKey=false;}
    this.suits={};
    for(const theme of this.themes)this.suits[theme.id]=theme.suits.map(s=>normaliseSuit(theme,s,(saved.suits[theme.id]||[]).find(x=>x&&x.id===s.id)));
  }
  persist(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify({activeTheme:this.activeTheme,suits:this.suits,media:this.media},null,2));fs.renameSync(this.file+'.tmp',this.file);}
  theme(id=this.activeTheme){const t=this.themes.find(x=>x.id===id);if(!t)throw Error('Unknown theme.');return t;}
  setTheme(id){this.theme(id);this.activeTheme=id;this.persist();return this.describe();}
  /** Modules for the active theme, in the shape the state machine and renderers expect. */
  modules(themeId=this.activeTheme){
    const theme=this.theme(themeId);
    return this.suits[themeId].map((s,i)=>({...s,index:i+1,label:s.subtitle||`${theme.purpose} workstation`,hoverInfo:[s.folder?path.basename(s.folder):null,s.links.length?`${s.links.length} link${s.links.length===1?'':'s'}`:null,s.apps.length?`${s.apps.length} app${s.apps.length===1?'':'s'}`:null].filter(Boolean).join(' · ')||'Configure this suit in Settings',feature:'workstation',voicePhrase:`${theme.assistant}, open ${s.name}`}));
  }
  setMedia(themeId,patch){this.theme(themeId);this.media[themeId]={...validateMedia({...this.media[themeId],...patch}),customised:true};this.persist();return this.media[themeId];}
  suit(id,themeId=this.activeTheme){const s=this.suits[themeId]?.find(x=>x.id===id);if(!s)throw Error('Unknown suit.');return s;}
  saveSuit(id,patch,themeId=this.activeTheme){const list=this.suits[themeId];const i=list.findIndex(x=>x.id===id);if(i<0)throw Error('Unknown suit.');list[i]=validateSuit(list[i],patch||{});this.persist();return list[i];}
  /** Auto-save the working session for a suit. Returns true when something changed. */
  saveSession(id,session,themeId=this.activeTheme){
    const list=this.suits[themeId];const i=list.findIndex(x=>x.id===id);if(i<0)return false;
    const next=validateSession(session);
    const before=JSON.stringify(list[i].session?.tabs||null)+':'+(list[i].session?.active??-1);
    const after=JSON.stringify(next?.tabs||null)+':'+(next?.active??-1);
    if(before===after)return false;
    list[i].session=next;this.persist();return true;
  }
  clearSession(id,themeId=this.activeTheme){const list=this.suits[themeId];const i=list.findIndex(x=>x.id===id);if(i<0)return false;if(!list[i].session)return false;list[i].session=null;this.persist();return true;}
  describe(){const theme=this.theme();return {activeTheme:this.activeTheme,theme:{...theme,suits:undefined,media:this.media[theme.id]},themes:this.themes.map(t=>({id:t.id,name:t.name,assistant:t.assistant,purpose:t.purpose,accent:t.accent,wallpaper:t.wallpaper,media:this.media[t.id]})),modules:this.modules(),allSuits:this.suits};}
}
