import {app,BrowserWindow,ipcMain,Tray,Menu,nativeImage,screen,globalShortcut,powerMonitor,protocol,net,shell,dialog,safeStorage,Notification,session,WebContentsView,desktopCapturer} from 'electron';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {WorkspaceMachine,introDurations,DURATIONS} from '../state/machine.js';
import {SettingsStore} from '../settings/store.js';
import {validateSettings,sanitizeSettings,defaults} from '../settings/schema.js';
import {DisplayManager} from '../display/windows.js';
import {SystemMonitor} from '../system/monitor.js';
import {WindowsVoice} from '../voice/windows.js';
import {parseCommand,buildGrammar,spokenNames,cleanSpeech as clean,NAME_ALIASES} from '../voice/commands.js';
import {PanelManager} from './panels.js';
import {TowerStore,rankFor} from '../tower/store.js';
import {TowerRunner} from '../tower/orchestrator.js';
import {WorkstationStore} from '../workstations/store.js';
import {TabManager} from './tabs.js';
import {WindowLayout} from '../layout/windows.js';
import {MeetingManager,clock} from '../meeting/manager.js';
import {sendGmail,validEmail} from '../meeting/mailer.js';
import {callApi} from '../tower/engines.js';
import {MissionStore} from '../control/missions.js';
import {AgentRunner} from '../control/runner.js';
import {ControlServer} from '../control/server.js';
import {CalendarStore} from '../services/calendar.js';
import {TodoStore} from '../services/todos.js';
import {IdeaStore} from '../services/ideas.js';
import {IdeaAssistant} from '../ideas/assistant.js';
import {weather,askAI} from '../services/integrations.js';

protocol.registerSchemesAsPrivileged([{scheme:'jarvis',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}]);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const smoke=process.env.JARVIS_TEST==='1';
if(smoke)app.setPath('userData',path.join(root,'test-results','profile'));
const devURL=!app.isPackaged&&process.env.JARVIS_DEV_URL==='http://127.0.0.1:5173'?'http://127.0.0.1:5173':null;
const trusted=new Map(),mediaFiles=new Map();let tray,settings,displays,machine,monitor,voice,calendar,settingsWindow,todos=null,ideas=null;
let workstations,tabs,layout,telemetry=null,weatherCache=null,weatherChecked=0,onBattery=false,voiceStatus='MICROPHONE OFF',quitting=false,pendingModule=null,modules=[],reminderTimer,mainReady=false,pendingWake=false;
const status={errors:[],commandHistory:[]};
const scripts=app.isPackaged?path.join(process.resourcesPath,'windows'):path.join(root,'scripts','windows');
const assets=app.isPackaged?path.join(process.resourcesPath,'assets'):path.join(root,'assets');
let userDir;
function log(kind,message){const row={time:new Date().toISOString(),kind,message:String(message).slice(0,800)};status.errors.push(row);status.errors=status.errors.slice(-50);try{const f=path.join(userDir,'jarvis.log');if(fs.existsSync(f)&&fs.statSync(f).size>2e6)fs.renameSync(f,f+'.previous');fs.appendFileSync(f,JSON.stringify(row)+'\n');}catch{}broadcast('status',getStatus());}
let followUntil=0,panels=null,tower=null,towerRunner=null,towerKey=null;
function voiceContext(){return {theme:workstations.theme(),themes:workstations.themes,modules,idle:machine?.value?.state==='IDLE',follow:Date.now()<followUntil};}
function themePayload(){return {...workstations.describe(),allSuits:undefined};}

/** The active hall's voice profile and in-character reply lines. */
function voiceProfile(){return workstations.theme()?.voice||null;}
/** Clips recorded for each assistant. A mapped clip wins; otherwise one at random. */
let voiceMapCache=null;
function voiceMap(){
  if(voiceMapCache)return voiceMapCache;
  let shipped={},mine={};
  try{shipped=JSON.parse(fs.readFileSync(path.join(assets,'voice','packs','map.json'),'utf8'));}catch{}
  try{mine=JSON.parse(fs.readFileSync(path.join(userDir,'voicemap.json'),'utf8'));}catch{}
  voiceMapCache={...shipped,...mine};           // yours wins over the one that ships
  return voiceMapCache;
}
function packClip(themeId,action){
  const v=workstations.theme(themeId)?.voice;
  const mode=v?.packMode||settings.get().voicePack||'off';
  if(mode==='off')return null;
  const pack=v?.pack;
  if(!pack)return null;
  const dir=path.join(assets,'voice','packs',pack);
  if(!fs.existsSync(dir))return null;
  let named=voiceMap()[`${themeId}:${action}`];
  if(Array.isArray(named)&&named.length)named=named[Math.floor(Math.random()*named.length)];
  if(named){const f=path.join(dir,path.basename(named));if(fs.existsSync(f))return f;}
  if(mode!=='random')return null;
  const files=fs.readdirSync(dir).filter(f=>f.toLowerCase().endsWith('.wav'));
  if(!files.length)return null;
  return path.join(dir,files[Math.floor(Math.random()*files.length)]);
}
/** Roman numerals in suit names are read out as numbers ("Mark XXXIX" -> "Mark 39"); the caption keeps them. */
function speakable(t){const v={i:1,v:5,x:10,l:50,c:100};return String(t).replace(/\b(Mark|Mk|MK|MARK)\s+([IVXLC]+)\b/g,(m,a,r)=>{if(!/^(?=[IVXLC])(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(r))return m;let n=0;const w=r.toLowerCase();for(let k=0;k<w.length;k++){const x=v[w[k]],y=v[w[k+1]]||0;n+=x<y?-x:x;}return `${a} ${n}`;});}
function say(text,opts={}){if(!text)return;broadcast('caption',{text});voice?.speak(speakable(text),settings.get(),voiceProfile(),undefined,opts);}
/** A hall can greet you with its own recording instead of a spoken line. */
let introPlayed=false;
function sayReady(){
  const theme=workstations.theme();const rel=theme?.voice?.readySound;
  if(rel&&introPlayed){const clip=packClip(theme.id,'ready');if(clip){voice?.speak('',settings.get(),voiceProfile(),clip);return;}say(theme.readyLine);return;}
  if(rel)introPlayed=true;
  if(rel){const file=path.join(assets,rel);if(fs.existsSync(file)){voice?.speak(theme.readyLine||'',settings.get(),voiceProfile(),file);return;}log('voice','Missing hall sound: '+rel);}
  say(theme.readyLine);
}
/** Speak the hall's own acknowledgement for a voice command. */
function acknowledge(action,id){
  const v=voiceProfile();if(!v||!v.lines)return;
  // A hall that greets you after its transition must stay silent at the moment of the switch.
  // This has to come before the pack lookup: otherwise the clip plays over the opening
  // animation and the hall then says the very same line again when the transition ends.
  if(action==='theme'&&(v.silentOnSwitch||v.greetAfter))return;
  const clip=packClip(workstations.activeTheme,action);
  if(clip){voice?.speak('',settings.get(),v,clip);return;}

  let line=v.lines[action];if(!line)return;
  if(line.includes('{suit}')){
    const m=modules.find(x=>x.id===id);
    line=line.replace('{suit}',m?(m.name||m.label||'that suit'):'that suit');
  }
  say(line);
}

function getStatus(){return {...status,voice:voiceStatus,wallpaper:displays?.wallpaperStatus||'STARTING',onBattery};}
function broadcast(channel,data){for(const [id]of trusted){const contents=BrowserWindow.getAllWindows().map(w=>w.webContents).find(w=>w.id===id);if(contents&&!contents.isDestroyed())contents.send('jarvis:'+channel,data);}}
function createWindow({role,...options}){
  if(role==='main')mainReady=false;
  const w=new BrowserWindow({...options,title:'JARVIS // ARMOR WORKSPACE',autoHideMenuBar:true,icon:path.join(assets,'icons','app.png'),webPreferences:{preload:path.join(root,'src','main','preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true,backgroundThrottling:role==='wallpaper'?false:true,...(['main','console'].includes(role)?{autoplayPolicy:'no-user-gesture-required'}:{})}});
  const contentsId=w.webContents.id;trusted.set(contentsId,{role});
  w.webContents.setWindowOpenHandler(()=>({action:'deny'}));w.webContents.on('will-navigate',e=>e.preventDefault());w.webContents.on('will-attach-webview',e=>e.preventDefault());
  w.webContents.on('render-process-gone',(_e,d)=>{log('renderer',`${role}: ${d.reason}`);if(!quitting&&['main','console'].includes(role)){if(role==='main'){if(meetings?.active)endMeeting().catch(e=>log('meeting',e.message));machine?.dispatch('standdown');try{tabs?.closeAll();panels?.closeAll?.();}catch{}}else{try{deckGone();}catch{}}if(!w.isDestroyed())w.destroy();setTimeout(()=>displays.rebuild().catch(e=>log('recovery',e.message)),1000);}});
  w.on('closed',()=>trusted.delete(contentsId));
  if(role==='main'||role==='console')w.on('close',e=>{if(!quitting){e.preventDefault();machine?.dispatch('standdown');}});
  w.webContents.on('before-input-event',(event,input)=>{
    if(input.type!=='keyDown')return;
    if(input.key==='F12'&&input.control&&input.shift){w.webContents.openDevTools({mode:'detach'});event.preventDefault();}
  });
  return w;
}
function loadWindow(w,view,extra={}){const query=new URLSearchParams({view,...extra});const page=view==='vista'?'vista.html':'index.html';return w.loadURL(devURL?`${devURL}/${view==='vista'?'vista.html':''}?${query}`:`jarvis://app/${page}?${query}`);}
function assertSender(event){
  if(!trusted.has(event.sender.id)||event.senderFrame!==event.sender.mainFrame)throw Error('Untrusted request.');
  const url=new URL(event.senderFrame.url);if(!(url.protocol==='jarvis:'&&url.host==='app')&&!(devURL&&url.origin===devURL))throw Error('Untrusted origin.');
}
function openSettings(){if(settingsWindow&&!settingsWindow.isDestroyed()){settingsWindow.show();settingsWindow.focus();return;}settingsWindow=createWindow({role:'settings',width:1040,height:790,minWidth:720,minHeight:540,show:false,backgroundColor:'#080d10'});loadWindow(settingsWindow,settings.get().setupComplete?'settings':'setup').then(()=>settingsWindow?.show()).catch(e=>log('settings',e.message));settingsWindow.on('closed',()=>{settingsWindow=null;});}
function registerHotkeys(values){
  globalShortcut.unregisterAll();const failed=[];
  for(const action of ['wake','home','standdown']){try{if(!globalShortcut.register(values[action],()=>dispatch(action)))failed.push(values[action]);}catch{failed.push(values[action]);}}
  // v9.15: Win+1 to Win+7 (and Ctrl+Alt+1 to 7, in case Windows keeps Win+number for the taskbar) open that case's suit
  const suitKey=n=>()=>{const m=modules.filter(x=>!x.isVehicle).find(x=>x.index===n)||modules.filter(x=>!x.isVehicle)[n-1];if(m)dispatch('select',m.id);};
  for(let n=1;n<=7;n++)for(const k of [`Super+${n}`,`Control+Alt+${n}`]){try{if(!globalShortcut.register(k,suitKey(n)))failed.push(k);}catch{failed.push(k);}}
  if(failed.length)log('hotkeys',`Unavailable: ${failed.join(', ')}. Use the tray menu or choose another shortcut.`);
}
function updateTray(){if(!tray)return;tray.setContextMenu(Menu.buildFromTemplate([
  {label:'OPEN JARVIS',click:()=>dispatch('wake')},{label:'ENTER WORK MODE',click:()=>dispatch('wake')},{label:'ARMOR HALL',click:()=>dispatch('home')},{label:'THEME',submenu:workstations.themes.map(t=>({label:`${t.name.toUpperCase()} · ${t.assistant.toUpperCase()}`,type:'radio',checked:t.id===workstations.activeTheme,click:()=>setTheme(t.id)}))},
  {type:'separator'},{label:'MICROPHONE',type:'checkbox',checked:settings.get().voiceEnabled,click:item=>applySettings({voiceEnabled:item.checked})},
  {label:'WALLPAPER',type:'checkbox',checked:settings.get().wallpaper,click:item=>applySettings({wallpaper:item.checked})},
  {label:'THIRD SCREEN VIEW',type:'checkbox',checked:settings.get().thirdScreen!==false,click:item=>applySettings({thirdScreen:item.checked})},
  {label:'SETTINGS',click:openSettings},{type:'separator'},{label:'QUIT',click:()=>app.quit()}
]));}
/** The control deck: every bay's objective, progress and agent, for the hall you are in. */
let missions=null,runner=null,deck=null;
function boardFor(themeId){
  const id=themeId||workstations.activeTheme;
  return missions.board(id,workstations.modules(id).map(m=>({id:m.id,index:m.index,name:m.name,isVehicle:m.isVehicle})));
}
/** The centre bay of each hall opens the control deck instead of a blank tab. */
function deckTabFor(themeId,suitId){
  const t=themeId||workstations.activeTheme;const suit=workstations.suit(suitId,t);
  return suit?.isVehicle?deck?.url(t):null;
}
function runBay(themeId,suitId){
  const id=themeId||workstations.activeTheme;
  const suit=workstations.suit(suitId,id);
  if(!suit)throw Error('No such bay.');
  runner.start(id,suitId,suit.name);
  log('control',`running ${suit.name}`);
  return true;
}
const lastSpoken=new Map();      // so one finish is announced once, not on every update
function deckUpdate(themeId,suitId){
  broadcast('board',{theme:themeId,id:suitId,bays:boardFor(themeId)});
  deck?.push({hall:themeId});
  announceBay(themeId,suitId);
}
/** Say when an agent finishes or fails. Short, and only for the hall you are standing in. */
function announceBay(themeId,suitId){
  try{
    const key=`${themeId}:${suitId}`, st=missions.get(themeId,suitId).status;
    const was=lastSpoken.get(key); lastSpoken.set(key,st);
    if(st===was||!['done','blocked'].includes(st))return;
    if(was!=='running')return;                       // only announce a real run ending
    if(themeId!==workstations.activeTheme)return;    // never from another hall
    const name=workstations.suit(suitId,themeId)?.name||'That bay';
    const who=workstations.theme(themeId).voice?.address;
    const clip=packClip(themeId,st==='done'?'agent-done':'agent-failed');
    if(clip){voice?.speak('',settings.get(),voiceProfile(),clip);return;}
    say(st==='done'?`${name} is finished${who?', '+who:''}.`:`${name} needs attention${who?', '+who:''}.`);
  }catch(e){log('control',e.message);}
}
/** A hall can speak up on its own now and then, so it feels like company. */
let chatterTimer=null;
function scheduleChatter(){
  clearTimeout(chatterTimer);
  const v=workstations.theme()?.voice, c=v?.chatter;
  if(!c||!settings.get().voiceEnabled)return;
  const mins=Math.max(1,Number(c.everyMinutes)||8);
  const wait=(mins*60*1000)*(0.6+Math.random()*0.8);        // never on the clock
  chatterTimer=setTimeout(()=>{
    const idle=['ARMOR_HALL','MODULE'].includes(machine.value.state)&&!meetings?.active;
    if(idle&&!focusActive()&&Math.random()<(Number(c.chance)||0.6)){
      const clip=packClip(workstations.activeTheme,'quip');
      if(clip)voice?.speak('',settings.get(),voiceProfile(),clip);
    }
    scheduleChatter();
  },wait);
}
/** Spoken summary of where everything stands. */
/* ---------- conversation: greetings, thanks, the daily briefing, maps ---------- */
const TALK=['meeting-start','meeting-end','page-close','attention','greet','thanks','briefing','status','map','search','panel-close','note','focus','focus-stop','tower-open','tower-report','tower-task','globe','globe-view','globe-zoom','globe-spin','hands-calibrate','panel-close-all'];
function partOfDay(){const h=new Date().getHours();return h<12?'morning':h<18?'afternoon':'evening';}
function addr(){return workstations.theme().voice?.address||'sir';}
const pick=a=>a[Math.floor(Math.random()*a.length)];
const cap=t=>String(t||'').replace(/\b\w/g,c=>c.toUpperCase());
const WMO={0:'clear skies',1:'mostly clear',2:'partly cloudy',3:'overcast',45:'fog',48:'freezing fog',51:'light drizzle',53:'drizzle',55:'heavy drizzle',56:'freezing drizzle',57:'freezing drizzle',61:'light rain',63:'rain',65:'heavy rain',66:'freezing rain',67:'freezing rain',71:'light snow',73:'snow',75:'heavy snow',77:'snow grains',80:'light showers',81:'showers',82:'heavy showers',85:'snow showers',86:'heavy snow showers',95:'thunderstorms',96:'thunderstorms with hail',99:'thunderstorms with hail'};
/** Weather for the briefing: your Settings location, or Leeds until one is set. */
async function briefWeather(){
  try{
    const w=settings.get().weather||{};const loc=w.enabled&&Number.isFinite(w.latitude)&&Number.isFinite(w.longitude)?{enabled:true,latitude:w.latitude,longitude:w.longitude,place:''}:{enabled:true,latitude:53.8008,longitude:-1.5491,place:'Leeds'};
    if(!briefWeather.cache||Date.now()-briefWeather.at>600000){briefWeather.cache=await weather(loc);briefWeather.at=Date.now();}
    const c=briefWeather.cache?.current;if(!c)return null;
    return {temp:Math.round(c.temperature_2m),words:WMO[c.weather_code]||'',wind:Math.round(c.wind_speed_10m||0),place:loc.place};
  }catch(e){log('weather',e.message);return null;}
}
/* ---------- the earth: place look-up and local weather for the globe ---------- */
const WX_ICON={0:'☀',1:'🌤',2:'⛅',3:'☁',45:'🌫',48:'🌫',51:'🌦',53:'🌦',55:'🌧',61:'🌦',63:'🌧',65:'🌧',71:'🌨',73:'🌨',75:'❄',80:'🌦',81:'🌧',82:'⛈',95:'⛈',96:'⛈',99:'⛈'};
let geoLast=0,geoQueue=Promise.resolve();const geoCache=new Map();
function geoSearch(q){const job=geoQueue.then(()=>geoLookup(q));geoQueue=job.catch(()=>{});return job;}   // one at a time, so the one-a-second wait holds for every caller
async function geoLookup(q){
  if(!q)return null;const k=q.toLowerCase();if(geoCache.has(k))return geoCache.get(k);
  const wait=1100-(Date.now()-geoLast);if(wait>0)await new Promise(r=>setTimeout(r,wait));geoLast=Date.now();   // the free map service asks for one request a second at most
  const url=`https://nominatim.openstreetmap.org/search?${new URLSearchParams({q,format:'jsonv2',limit:'1',addressdetails:'1'})}`;
  const res=await net.fetch(url,{headers:{'User-Agent':`JARVIS-Armor-Workspace/${app.getVersion()} (personal desktop assistant)`,'Accept-Language':'en'},signal:AbortSignal.timeout(9000)});
  if(!res.ok)throw Error(`The map service answered ${res.status}.`);
  const [r]=await res.json();if(!r)return null;
  const b=(r.boundingbox||[]).map(Number);const a=r.address||{};
  const out={name:r.name||String(r.display_name||q).split(',')[0],detail:[a.city||a.town||a.village||'',a.state||'',a.country||''].filter((v,i,arr)=>v&&arr.indexOf(v)===i&&v!==r.name).join(', '),lat:Number(r.lat),lon:Number(r.lon),
    bbox:b.length===4&&b.every(Number.isFinite)?[b[2],b[0],b[3],b[1]]:null,kind:['city','town','village','suburb','neighbourhood','quarter'].includes(r.addresstype)?'city':['country','state','county','region'].includes(r.addresstype)?'country':'place'};
  geoCache.set(k,out);return out;
}
async function geoWeather(lat,lon){
  if(!Number.isFinite(lat)||!Number.isFinite(lon))return null;
  const url=`https://api.open-meteo.com/v1/forecast?${new URLSearchParams({latitude:lat.toFixed(4),longitude:lon.toFixed(4),current:'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day',timezone:'auto'})}`;
  const res=await net.fetch(url,{signal:AbortSignal.timeout(9000)});if(!res.ok)throw Error(`Weather service returned ${res.status}.`);
  const d=await res.json();const c=d.current||{};
  return {temp:c.temperature_2m,humidity:c.relative_humidity_2m,wind:c.wind_speed_10m,code:c.weather_code,words:WMO[c.weather_code]||'',icon:c.is_day===0&&[0,1].includes(c.weather_code)?'🌙':WX_ICON[c.weather_code]||'',offset:d.utc_offset_seconds,zone:d.timezone_abbreviation||''};
}
function briefingData(mode='briefing'){
  const now=new Date(),start=new Date(now);start.setHours(0,0,0,0);const end=new Date(start);end.setDate(end.getDate()+1);
  const fmt=d=>new Date(d).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  const events=calendar.list().filter(e=>{const t=Date.parse(e.start);return t>=start.getTime()&&t<end.getTime();})
    .map(e=>({time:fmt(e.start),title:e.title,past:Date.parse(e.end||e.start)<now.getTime()}));
  const open=todos.list().filter(t=>!t.done);
  const bays=boardFor().filter(b=>!b.isVehicle).map(b=>{const v=visits.get(workstations.activeTheme,b.id)||{};const last=Math.max(v.lastOpened||0,v.lastLeft||0)||null;return {name:b.name,status:b.status,progress:b.progress||0,last,lastAgo:last?ago(Date.now()-last):null};});
  const ideaList=ideas.list().filter(i=>i.stage!=='done').sort((a,b)=>b.progress-a.progress).slice(0,4).map(i=>({title:i.title,stage:i.stage,progress:i.progress}));
  const cpu=Number.isFinite(telemetry?.cpu)?Math.round(telemetry.cpu):null;
  const ram=telemetry?.memory?.total?Math.round(100*telemetry.memory.used/telemetry.memory.total):null;
  const who=addr(),parts=[];
  if(mode==='status'){parts.push(statusReport());if(events.length)parts.push(`${events.filter(e=>!e.past).length||'Nothing'} more on the calendar today.`);if(cpu!==null)parts.push(`Systems at ${cpu} percent.`);}
  else{
    parts.push(`Good ${partOfDay()}, ${who}.`);
    const ahead=events.filter(e=>!e.past);
    if(!events.length)parts.push('Your calendar is clear today.');
    else{parts.push(`You have ${ahead.length?ahead.length:'nothing else'} ${ahead.length===1?'thing':'things'} on the calendar${events.length>ahead.length?' still to come':''} today.`);
      for(const e of ahead.slice(0,5))parts.push(`At ${e.time}, ${e.title}.`);}
    if(open.length)parts.push(`${open.length} ${open.length===1?'task':'tasks'} on your list. First up: ${open[0].text}.`);
    const running=bays.filter(b=>b.status==='running'),blocked=bays.filter(b=>b.status==='blocked');
    if(running.length)parts.push(`${running.map(b=>b.name).join(' and ')} ${running.length===1?'is':'are'} running.`);
    if(blocked.length)parts.push(`${blocked.map(b=>b.name).join(' and ')} ${blocked.length===1?'needs':'need'} you.`);
    if(ideaList.length)parts.push(`Top idea: ${ideaList[0].title}, ${ideaList[0].progress} percent there.`);
    {const wait=assistant?.pending()||[];if(wait.length)parts.push(`${wait.length} ${wait.length===1?'idea needs':'ideas need'} your approval in the Ideas room: ${wait.slice(0,3).map(i=>i.title).join(', ')}.`);}
    const recent=bays.filter(b=>b.last).sort((a,b)=>b.last-a.last);if(recent.length)parts.push(`You were last working in ${recent[0].name}, ${recent[0].lastAgo}${recent[1]?`, and before that ${recent[1].name}`:''}.`);
  }
  if(focusActive())parts.push(`Focus mode: ${Math.ceil((focus.until-Date.now())/60000)} minutes left.`);
  let towerToday=[];
  try{const act=towerRunner.active(workstations.activeTheme);if(act.length)parts.push(`In ${towerName()}, ${act.map(r=>`${r.floorName} is ${r.progress} percent through ${r.title}`).join(', and ')}.`);
    towerToday=tower.runs.filter(r=>r.theme===workstations.activeTheme&&r.startedAt>=start.getTime()).slice(-6).reverse().map(r=>({floor:r.floorName,title:r.title,status:r.status,scheduled:!!r.scheduled,approvals:(r.approvals||[]).filter(a=>a.status==='waiting').length}));
    const night=towerToday.filter(r=>r.scheduled&&r.status==='done');if(night.length&&mode!=='status')parts.push(`Overnight, ${night.map(r=>r.floor).join(' and ')} finished ${night.length===1?'its':'their'} night shift. It's waiting in the tower.`);}catch{}
  return {mode,assistant:workstations.theme().assistant,greeting:`Good ${partOfDay()}, ${who}.`,focus:focusActive()?{until:focus.until}:null,
    date:now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}),time:fmt(now),
    events,todos:open.slice(0,6).map(t=>t.text),todoCount:open.length,bays,ideas:ideaList,system:{cpu,ram},tower:{name:towerName(),today:towerToday},spoken:parts.join(' ')};
}
function talk(action,cmd={}){
  const who=addr();
  if(action==='attention'){say(pick([`Yes, ${who}?`,`${cap(who)}?`,`Go ahead, ${who}.`]),{listenThrough:true});return true;}   // keep listening while he answers, so the command can follow straight on
  if(action==='greet'){say(`Good ${partOfDay()}, ${who}.`);return true;}
  if(action==='thanks'){say(pick([`You're welcome, ${who}.`,`Always a pleasure, ${who}.`,`Any time, ${who}.`]));return true;}
  if(action==='briefing'||action==='status'){
    (async()=>{const b=briefingData(action);
      if(action==='briefing'){const w=await briefWeather();if(w){b.weather=w;const line=`It's ${w.temp} degrees${w.words?' and '+w.words:''}${w.place?' in '+w.place:''}.`;b.spoken=b.spoken.replace(/^(Good \w+, [^.]+\.)/,`$1 ${line}`);}}
      broadcast('briefing',b);say(b.spoken);})().catch(e=>log('briefing',e.message));
    return true;
  }
  if(action==='note'){
    const text=String(cmd.text||'').trim().replace(/\bi\b/g,'I').replace(/^./,c=>c.toUpperCase()).slice(0,200);if(!text)return false;
    if(cmd.kind==='idea'){const n=ideas.list().length;const a=-Math.PI/2+n*2.4;ideas.save({title:text.slice(0,120),stage:'spark',progress:0,notes:'Captured by voice.',x:Math.max(8,Math.min(80,50+Math.cos(a)*30)),y:Math.max(16,Math.min(80,50+Math.sin(a)*26))});say(`Saved as a new idea, ${who}.`);}
    else{todos.add(text);say(pick([`Noted, ${who}. It's on your list.`,`On the list, ${who}.`]));}
    const sel=machine?.value?.state==='MODULE'&&machine.value.selected;if(sel)visits.note(workstations.activeTheme,sel,text);
    broadcast('captured',{kind:cmd.kind==='idea'?'idea':'todo',text,suit:sel||null});return true;
  }
  if(action==='focus'){startFocus(Number(cmd.minutes)||25);return true;}
  if(action==='globe'){broadcast('globe',{cmd:'earth'});say(pick([`Here's the earth, ${who}.`,`The earth, ${who}.`,`Bringing up the globe, ${who}.`]));return true;}
  if(action==='globe-view'){const v=['holo','satellite','night'].includes(cmd.view)?cmd.view:'holo';broadcast('globe',{cmd:'view',view:v});say(v==='satellite'?`The satellite view, ${who}.`:v==='night'?`The earth at night, ${who}.`:`Hologram view, ${who}.`);return true;}
  if(action==='hands-calibrate'){broadcast('hologram',{kind:'calibrate'});say(`Hold your hand where it feels natural for each corner, ${who}.`);return true;}
  if(action==='globe-zoom'){broadcast('globe',{cmd:'zoom',dir:cmd.dir>0?1:-1});return true;}
  if(action==='globe-spin'){broadcast('globe',{cmd:'spin',on:cmd.on!==false});say(cmd.on===false?`Holding still, ${who}.`:`Spinning, ${who}.`);return true;}
  if(action==='tower-open'){broadcast('tower-open',{});say(`${towerName()}, ${who}.`);return true;}
  if(action==='tower-report'){say(towerReport());broadcast('tower-open',{});return true;}
  if(action==='tower-task'){const text=String(cmd.text||'').trim();if(!text)return false;towerLobby(text).then(x=>{say(`${x.reason} ${x.floorName} is on it.`);}).catch(e=>say(e.message));return true;}
  if(action==='focus-stop'){if(!focusActive())return false;stopFocus(true);return true;}
  if(action==='map'||action==='search'){
    const q=String(cmd.query||'').slice(0,120).trim();if(!q)return false;
    if(action==='map'){broadcast('globe',{cmd:'place',q,style:cmd.style||undefined});say(pick([`Opening a map of ${cap(q)}.`,`Opening map for ${cap(q)}.`,`${cap(q)}, coming up.`]));return true;}
    const url=`https://www.google.com/search?q=${encodeURIComponent(q)}`;
    broadcast('hologram',{kind:action,title:`Search · ${q}`,url});
    say(action==='map'?`Opening a map for ${cap(q)}.`:`Searching for ${q}.`);return true;
  }
  if(action==='meeting-start'){try{startMeeting(cmd.id);}catch(e){say(e.message);}return true;}
  if(action==='meeting-end'){if(!meetings?.active){say(`There's no meeting running, ${who}.`);return true;}endMeeting().catch(e=>log('meeting',e.message));return true;}
  if(action==='panel-close-all'){broadcast('hologram',{kind:'close-all'});broadcast('globe',{cmd:'close'});say(pick(['All clear.',`Cleared, ${who}.`]));return true;}
  if(action==='page-close'){   // "close this page": the tab in front inside a suit, otherwise the floating panel
    if(machine?.value?.state==='MODULE'&&(tabs?.list?.()||[]).some(t=>!t.popped)){const done=dispatch('tab-close');if(done)acknowledge('tab-close');return done;}
    return talk('panel-close');
  }
  if(action==='panel-close'){broadcast('hologram',{kind:'close'});broadcast('globe',{cmd:'close'});say(pick(['Done.',`Closed, ${who}.`]));return true;}
  return false;
}
/* ---------- focus mode ---------- */
let focus={until:0,minutes:0,suit:null,theme:null,timer:null};
function focusActive(){return focus.until>Date.now();}
function focusPayload(){return {active:focusActive(),until:focus.until,minutes:focus.minutes,suit:focus.suit?(()=>{try{return workstations.suit(focus.suit,focus.theme).name;}catch{return null;}})():null};}
function startFocus(minutes){
  minutes=Math.max(1,Math.min(180,Math.round(minutes)));
  const inSuit=machine?.value?.state==='MODULE'?machine.value.selected:null;
  clearTimeout(focus.timer);
  focus={until:Date.now()+minutes*60000,minutes,suit:inSuit||focus.suit||null,theme:workstations.activeTheme,timer:null};
focus.timer=setTimeout(()=>endFocus(),minutes*60000);
  broadcast('focus',focusPayload());say(`Focus mode, ${addr()}. ${minutes} minutes. I'll hold everything until then.`);
}
function stopFocus(spoken){clearTimeout(focus.timer);focus.until=0;broadcast('focus',focusPayload());if(spoken)say(`Focus mode off, ${addr()}.`);}
function endFocus(){
  const back=focus.suit,theme=focus.theme;clearTimeout(focus.timer);focus.until=0;broadcast('focus',{...focusPayload(),ended:true});
  let name='';try{name=back?workstations.suit(back,theme).name:'';}catch{}
  say(`Time's up, ${addr()}.${name?` Bringing ${name} back.`:''}`);
  try{displays?.work?.show();displays?.work?.focus();}catch{}
  if(!back)return;
  if(theme&&theme!==workstations.activeTheme)setTheme(theme,{fast:true});
  const st=machine.value.state;
  if(st==='MODULE'&&machine.value.selected===back)return;
  if(st==='IDLE'){pendingModule=back;dispatch('wake');return;}
  if(['ARMOR_HALL','SUIT_HOVER'].includes(st)){dispatch('select',back);return;}
  dispatch('home');pendingModule=back;
}
/* ---------- meeting mode: record a call for a suit, transcribe it offline, email the notes ---------- */
let meetings=null,meetingFlush=null,meetingWatch=null,assistant=null;
function gmailFile(){return path.join(userDir,'gmail-app-password.enc');}
function gmailPassword(){try{return fs.existsSync(gmailFile())?safeStorage.decryptString(fs.readFileSync(gmailFile())):'';}catch(e){log('meeting','Could not read the Gmail app password: '+e.message);return '';}}
function meetingInfo(){
  const s=settings.get().meeting||{};const t=workstations.activeTheme;
  return {...meetings.state(),to:s.to||'',from:s.from||'',gmailReady:!!(s.from&&gmailPassword()),theme:t,hallName:workstations.theme().name,
    suits:modules.map(m=>({id:m.id,name:m.name})),open:machine?.value?.state==='MODULE'?machine.value.selected:null,
    past:meetings.pastFor(t).map(h=>({id:h.id,suitName:h.suitName,startedAt:h.startedAt,endedAt:h.endedAt,emailed:h.emailed,emailError:h.emailError}))};
}
/** Start recording for a suit in this hall (the one named, else the suit you are in, else ask). */
function startMeeting(id){
  if(meetings.m)throw Error(meetings.m.ending?'The last meeting is still being written up. Give it a moment.':`Already recording the ${meetings.m.suitName} meeting, ${addr()}.`);
  const theme=workstations.activeTheme;const suitId=id||(machine?.value?.state==='MODULE'?machine.value.selected:null);
  if(!suitId){broadcast('meeting',{type:'ask',info:meetingInfo()});say(`Which suit is the meeting for, ${addr()}?`);return false;}
  const suit=workstations.suit(String(suitId),theme);
  const mt=meetings.start({theme,hallName:workstations.theme(theme).name,suitId:suit.id,suitName:suit.name,suitFolder:suit.folder});
  broadcast('meeting',{type:'start',meeting:mt,info:meetingInfo()});
  clearTimeout(meetingWatch);
  meetingWatch=setTimeout(()=>{if(meetings.m?.id===mt.id&&!meetings.m.sources.length){meetings.discard();broadcast('meeting',{type:'failed',error:'The recording did not start.',info:meetingInfo()});say(`I couldn't start the recording, ${addr()}.`);}},12000);
  say(`Recording the ${suit.name} meeting, ${addr()}. Do let everyone know it's being recorded.`);
  return true;
}
/** End: the window hands over its last audio, the speech engine catches up, Claude summarises, Gmail sends. */
async function endMeeting(){
  if(!meetings?.active)return false;
  const id=meetings.m.id;
  await new Promise(resolve=>{meetingFlush={id,resolve};broadcast('meeting',{type:'stop',id});setTimeout(resolve,8000);});
  meetingFlush=null;
  say(`Wrapping up the meeting, ${addr()}. I'll send you the notes.`);
  const m=await meetings.finish();if(!m)return false;
  const s=settings.get().meeting||{},when=new Date(m.startedAt);
  const date=when.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'}),time=when.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  broadcast('meeting',{type:'status',text:'Writing the summary…'});
  let summary='';const key=readTowerKey();
  if(!m.transcript.trim())m.warnings.push('Nothing was transcribed. Check the microphone and that an English Windows speech recognizer is installed.');
  else if(key){try{summary=(await callApi({key,model:tower.settings().plannerModel,maxTokens:1500,
    system:'You write concise meeting notes. The transcript comes from offline speech recognition and contains recognition mistakes: read through them sensibly, but never invent names, numbers or decisions that are not there. British English, Markdown.',
    prompt:`Meeting for the "${m.suitName}" workstation (${m.hallName}), ${date} at ${time}, ${clock(m.duration)} long.\n\nWrite these sections: ## Summary (three to five sentences), ## Decisions, ## Action items (with the owner when it is clear), ## Open questions. Leave out a section if there is nothing for it.\n\nTRANSCRIPT:\n${m.transcript.slice(0,150000)}`})).text;}
    catch(e){m.warnings.push('No summary this time: '+e.message);}}
  else m.warnings.push('No summary: add a Claude API key in the tower (Engines) to get one.');
  const sources=m.sources.includes('system')?'your microphone and the call audio':'your microphone only';
  const markdown=[`# Meeting notes: ${m.suitName}`,'',`**${m.hallName}** · ${date}, ${time} · ${clock(m.duration)} · recorded ${sources}`,'',
    ...m.warnings.map(w=>'> '+w),m.warnings.length?'':null,summary||null,summary?'':null,'## Full transcript','','_Transcribed offline by Windows speech recognition, so expect some mistakes._','',
    m.transcript||'(Nothing was transcribed.)','',`Recording: ${fs.existsSync(m.recording)?m.recording:'not saved'}`,''].filter(x=>x!==null).join('\n');
  let emailed=false,emailError=null;const pass=gmailPassword();
  if(s.to&&s.from&&pass){
    broadcast('meeting',{type:'status',text:'Emailing '+s.to+'…'});
    const text=[`Meeting notes for ${m.suitName} (${m.hallName})`,`${date}, ${time} · ${clock(m.duration)}`,'',summary||'(No summary this time.)','',
      'The full transcript is attached.',fs.existsSync(m.recording)?'The recording is saved on your PC at:\n'+m.recording:'','','JARVIS'].join('\n');
    try{await sendGmail({user:s.from,password:pass,to:s.to,subject:`Meeting notes: ${m.suitName} · ${when.toLocaleDateString('en-GB',{day:'numeric',month:'short'})} ${time}`,text,
      attachments:[{name:`${m.suitName.replace(/[^\w .-]/g,'')} meeting ${when.toISOString().slice(0,10)}.txt`,type:'text/plain; charset=UTF-8',content:markdown}]});emailed=true;}
    catch(e){emailError=e.message;log('meeting',e.message);}
  }else emailError='Gmail is not set up yet. Open the meeting panel to add it.';
  const file=meetings.record(m,{markdown,emailed,emailError});
  broadcast('meeting',{type:'done',file,emailed,emailError,to:s.to,info:meetingInfo()});
  say(emailed?`The ${m.suitName} meeting notes are in your inbox, ${addr()}.`:`The ${m.suitName} meeting is saved, ${addr()}, but I couldn't email it.`);
  return true;
}
/* ---------- where was I: last visit, tabs, folder and a one-line note per suit ---------- */
const visits={
  file:null,data:{},
  load(){this.file=path.join(userDir,'suit-visits.json');try{this.data=JSON.parse(fs.readFileSync(this.file,'utf8'))||{};}catch{this.data={};}},
  key(t,id){return `${t}:${id}`;},
  get(t,id){return this.data[this.key(t,id)]||{};},
  set(t,id,patch){const k=this.key(t,id);this.data[k]={...(this.data[k]||{}),...patch};try{fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.data,null,2));fs.renameSync(this.file+'.tmp',this.file);}catch(e){log('visits',e.message);}},
  note(t,id,text){this.set(t,id,{note:String(text||'').slice(0,200),noteAt:Date.now()});}
};
function ago(ms){const m=Math.round(ms/60000);if(m<2)return 'just now';if(m<60)return `${m} minutes ago`;const h=Math.round(m/60);if(h<24)return `${h} hour${h===1?'':'s'} ago`;const d=Math.round(h/24);return d===1?'yesterday':`${d} days ago`;}
function recapFor(id){
  const t=workstations.activeTheme;let suit;try{suit=workstations.suit(id,t);}catch{return null;}
  const v=visits.get(t,id),sess=suit.session;
  const tabsLast=(sess?.tabs||[]).map(x=>x.title||(()=>{try{return new URL(x.url).hostname.replace(/^www\./,'');}catch{return '';}})()).filter(Boolean);
  const bits=[];
  if(v.lastLeft)bits.push(`Last here ${ago(Date.now()-v.lastLeft)}`);
  if(tabsLast.length)bits.push(`${tabsLast.length} tab${tabsLast.length===1?'':'s'}: ${tabsLast.slice(0,3).join(', ')}${tabsLast.length>3?'…':''}`);
  if(suit.folder)bits.push(`folder ${path.basename(suit.folder)}${fs.existsSync(suit.folder)?'':' (missing)'}`);
  return {id,theme:t,line:bits.join(' · '),note:v.note||'',noteAt:v.noteAt||null,lastLeft:v.lastLeft||null,tabs:tabsLast,first:!v.lastLeft&&!tabsLast.length};
}
/** The suit-up moment: the case opens and the suit steps out (drawn by suits3d.js); JARVIS says a line. */
let pendingShow=null;
function suitUp(id){
  const m=modules.find(x=>x.id===id);if(!m||m.isVehicle)return;
  if(Date.now()<(voice?.suppressedUntil||0)-200)return;   // already talking (e.g. answering "open Mark 2")
  say(pick([`Suiting up. ${m.name}.`,`${m.name}, coming online.`,`Bringing out the ${m.name}, ${addr()}.`,`${m.name}. Ready when you are, ${addr()}.`]));
}
function suitOpened(id){
  const r=recapFor(id);if(!r)return;broadcast('recap',r);
  const v=visits.get(r.theme,id);visits.set(r.theme,id,{lastOpened:Date.now()});
  if(v.lastLeft&&Date.now()-v.lastLeft>10*60000&&(r.tabs.length||r.note)){
    setTimeout(()=>{if(machine.value.state==='MODULE'&&machine.value.selected===id)say(`Welcome back, ${addr()}. Last time${r.tabs.length?` you had ${r.tabs.slice(0,2).join(' and ')} open`:''}${r.note?`${r.tabs.length?', and':''} your note says: ${r.note}`:''}.`);},Math.max(2500,(voice?.suppressedUntil||0)-Date.now()+400));
  }
}
/* ---------- suit health: broken links, missing folders, stuck agents ---------- */
let healthCache={},healthTimer=null;
async function linkOK(url){
  try{const res=await net.fetch(url,{method:'HEAD',signal:AbortSignal.timeout(7000)});return ![404,410].includes(res.status)&&res.status<500?'ok':`returns ${res.status}`;}
  catch(e){const m=String(e?.message||e);return /ERR_NAME_NOT_RESOLVED|ERR_ADDRESS_UNREACHABLE|ERR_CONNECTION_REFUSED|ENOTFOUND|ECONNREFUSED/i.test(m)?'unreachable':'ok';}
}
async function checkHealth(themeId=workstations.activeTheme){
  const out=[];const board=boardFor(themeId);
  for(const m of workstations.modules(themeId)){
    const suit=workstations.suit(m.id,themeId);const reasons=[];let level='ok';
    if(suit.folder&&!fs.existsSync(suit.folder)){reasons.push('Folder is missing');level='warn';}
    for(const l of (suit.links||[]).slice(0,8)){if(!/^https?:/i.test(l.url||''))continue;const r=await linkOK(l.url);if(r!=='ok'){reasons.push(`Link “${l.label||l.url}” ${r}`);level='warn';}}
    const b=board.find(x=>x.id===m.id);if(b?.status==='blocked'){reasons.push('Agent run needs you');level='bad';}
    out.push({id:m.id,level,reasons});
  }
  healthCache[themeId]=out;broadcast('health',{theme:themeId,suits:out});return out;
}
function scheduleHealth(){clearTimeout(healthTimer);healthTimer=setTimeout(()=>{checkHealth().catch(e=>log('health',e.message)).finally(()=>{clearTimeout(healthTimer);healthTimer=setTimeout(scheduleHealth,10*60000);});},4000);}
/** First time JARVIS wakes each day: the full briefing, once the welcome line has finished. */
function morningBrief(){
  const day=new Date().toDateString();if(visits.get('__','briefed').day===day)return;
  visits.set('__','briefed',{day});
  setTimeout(()=>{if(['ARMOR_HALL','SUIT_HOVER','MODULE'].includes(machine.value.state))talk('briefing');},Math.max(1500,(voice?.suppressedUntil||0)-Date.now()+700));
}
/* ---------- the tower: agent floors in each hall's building ---------- */
function towerName(t=workstations.activeTheme){try{return tower.tower(t).name;}catch{return 'The tower';}}
function towerKeyFile(){return path.join(userDir,'anthropic-key.enc');}
function readTowerKey(){
  if(towerKey!==null)return towerKey;
  try{towerKey=fs.existsSync(towerKeyFile())?safeStorage.decryptString(fs.readFileSync(towerKeyFile())):'';}catch(e){log('tower','Could not read the API key: '+e.message);towerKey='';}
  return towerKey;
}
const towerThrottle=new Map(),towerLatest=new Map();
/** Results flow back: a finished job moves its linked idea card along. */
function towerDone(run,{last}={}){
  if(!run.ideaId||!last)return;
  try{const idea=ideas.list().find(i=>i.id===run.ideaId);if(!idea)return;
    const stage=idea.stage==='spark'?'designing':idea.stage;
    ideas.save({...idea,stage,progress:Math.min(100,(idea.progress||0)+20),notes:`${idea.notes?idea.notes+'\n':''}• ${towerName(run.theme)} · ${run.floorName}: “${run.title}” done (${new Date().toLocaleDateString('en-GB',{day:'numeric',month:'short'})}).`.slice(-4000)});
  }catch(e){log('tower',e.message);}
}
/** Night shift: floors with a schedule start on their own (and catch up within 3 hours if JARVIS was off). */
async function towerNightShift(){
  if(!tower||!towerRunner)return;
  const now=new Date(),day=now.toDateString(),mins=now.getHours()*60+now.getMinutes();
  let eng=null;
  for(const [theme,t] of Object.entries(tower.data.towers))for(const f of t.floors){
    const sc=f.schedule;if(!sc?.on||sc.last===day||!sc.days.includes(now.getDay()))continue;
    const [h,m]=sc.time.split(':').map(Number);const at=h*60+m;if(mins<at||mins>at+180)continue;
    eng=eng||await towerRunner.engines();
    tower.saveFloor(theme,{id:f.id,schedule:{...sc,last:day}});
    if(!eng.api.ready&&!eng.claudeCode.ready){log('tower',`Night shift skipped for ${f.name}: no engine connected.`);continue;}
    try{await towerRunner.start(theme,f.id,sc.task||f.example||f.purpose,{scheduled:true,title:`Night shift ${sc.time}`});log('tower',`Night shift started: ${f.name}`);}catch(e){log('tower',`Night shift for ${f.name}: ${e.message}`);}
  }
}
const towerAnnounced=new Set();
function towerUpdate(run){
  const final=['done','failed','stopped','budget'].includes(run.status);
  towerLatest.set(run.id,run);
  const send=()=>{towerThrottle.delete(run.id);const latest=towerLatest.get(run.id)||run;broadcast('tower',{type:'run',run:latest});if(['done','failed','stopped','budget'].includes(latest.status))towerLatest.delete(run.id);};
  if(final){clearTimeout(towerThrottle.get(run.id));send();if(run.ideaId){try{assistant?.towerFinished(run);}catch(e){log('ideas',e.message);}}
    if(towerAnnounced.has(run.id))return;towerAnnounced.add(run.id);if(towerAnnounced.size>200)towerAnnounced.delete(towerAnnounced.values().next().value);   // approving or commenting afterwards doesn't announce it again
    if(run.status==='done')say(`${run.floorName} has finished "${run.title}".${run.rehearsal?' That was a rehearsal.':''}`);
    else if(run.status==='failed')say(`${run.floorName} hit a problem: ${String(run.error||'').slice(0,120)}`);
    else if(run.status==='budget')say(`${run.floorName} stopped at its budget cap, ${addr()}.`);
    return;}
  if(!towerThrottle.has(run.id))towerThrottle.set(run.id,setTimeout(send,250));
}
function towerReport(t=workstations.activeTheme){
  const active=towerRunner.active(t);const today=tower.runs.filter(r=>r.theme===t&&r.status==='done'&&r.endedAt>new Date().setHours(0,0,0,0));
  if(!active.length)return `${towerName(t)} is quiet, ${addr()}.${today.length?` ${today.length} ${today.length===1?'job':'jobs'} finished today.`:''}`;
  return `${towerName(t)}: ${active.map(r=>`${r.floorName} is ${r.progress} percent through "${r.title}"`).join('. ')}.`;
}
async function towerLobby(text,t=workstations.activeTheme){
  const route=await towerRunner.route(t,text);const run=await towerRunner.start(t,route.floorId,text);
  return {...route,run,floorName:tower.floor(t,route.floorId).name};
}
function towerView(t){
  const tw=tower.tower(t);
  const hasFile=tw.model&&['glb','image'].includes(tw.model.kind)&&tw.model.file&&fs.existsSync(path.join(userDir,'assets',tw.model.file));
  const bundled=!hasFile&&fs.existsSync(path.join(assets,'towers',`${t}.glb`));   // the towers you sent, built in
  const mdl=hasFile?{kind:tw.model.kind,url:`jarvis://custom/${tw.model.file.split('/').map(encodeURIComponent).join('/')}?v=${tw.model.v}`,band:tw.model.band||[0.1,0.9],name:tw.model.name||''}
    :bundled?{kind:'glb',url:`jarvis://asset/towers/${t}.glb`,band:tw.model?.band||{ironman:[0.14,0.9],batcave:[0.12,0.86],spiderman:[0.1,0.82]}[t]||[0.12,0.88],hero:0,name:'Your tower',bundled:true}
    :tw.model?.band?{kind:'stand-in',band:tw.model.band}:null;
  return {theme:t,name:tw.name,owner:tw.owner||'',org:tw.org||'',head:tw.head,model:mdl,settings:tower.settings(),root:tower.root,
    floors:tw.floors.map(f=>({...f,folder:tower.folder(t,f),knowledge:tower.knowledge(t,f),agents:f.agents.map(a=>({...a,rank:rankFor(a.xp)}))})),
    runs:tower.runs.filter(r=>r.theme===t).slice(-40).reverse(),active:towerRunner.active(t).map(r=>r.id),
    spent:Object.fromEntries(tw.floors.map(f=>[f.id,Math.round(towerRunner.spentToday(t,f.id)*100)/100])),ideas:ideas.list().map(i=>({id:i.id,title:i.title,progress:i.progress}))};
}
function insideTower(p){const f=path.resolve(String(p||''));return f.startsWith(path.resolve(tower.root)+path.sep)?f:null;}
function statusReport(){
  const bays=boardFor();
  const running=bays.filter(b=>b.status==='running'),done=bays.filter(b=>b.status==='done');
  const avg=bays.length?Math.round(bays.reduce((a,b)=>a+b.progress,0)/bays.length):0;
  const who=workstations.theme().voice?.address||'sir';
  const parts=[`${avg} percent across ${bays.length} bays, ${who}.`];
  if(running.length)parts.push(`${running.map(b=>b.name).join(' and ')} ${running.length===1?'is':'are'} running.`);
  if(done.length)parts.push(`${done.length} complete.`);
  const blocked=bays.filter(b=>b.status==='blocked');
  if(blocked.length)parts.push(`${blocked.map(b=>b.name).join(' and ')} needs attention.`);
  return parts.join(' ');
}
function dispatch(action,id,opts={}){
  if(TALK.includes(action)){if(action==='status'&&machine?.value?.state==='IDLE')return false;return talk(action,opts);}
  if(action==='settings'){openSettings();return true;}
  if(action==='run'){try{runBay(null,id);say(`Running ${workstations.suit(id)?.name||'it'}.`);}catch(e){say(e.message);log('control',e.message);}return true;}
  if(action==='status'){say(statusReport());return true;}

  if(action==='theme'){setTheme(id,opts);return true;}
  // "show me Mark 39": fly up to that case in the hall and turn the suit to face you, without opening it
  if(action==='suit-show'){
    const m=modules.find(x=>x.id===id);if(!m)return false;const st=machine.value.state;
    if(['ARMOR_HALL','SUIT_HOVER'].includes(st)){machine.dispatch('hover',id);broadcast('suit-show',{id});say(pick([`The ${m.name}, ${addr()}.`,`Here's the ${m.name}.`,`${m.name}, ${addr()}.`]));return true;}
    pendingShow=id;if(st==='IDLE')dispatch('wake');else if(['MODULE','SUIT_SELECTED'].includes(st))machine.dispatch('home');return true;
  }
  if(action==='select-hover'){if(machine.value.hover)return dispatch('select',machine.value.hover);return false;}
  if(action==='wake'&&machine.value.state==='IDLE'&&!mainReady){pendingWake=true;displays?.setActive(true);return true;}
  if(action==='standdown'&&pendingWake){pendingWake=false;displays?.setActive(false);return true;}
  if(action==='home'&&machine.value.state==='IDLE')return dispatch('wake');
  // --- workstation controls: only meaningful while a suit is open ---
  if(['tab-next','tab-prev','tab-close','tab-reload','open-folder','launch-all','session-clear','layout-apply'].includes(action)){
    if(machine.value.state!=='MODULE'||!machine.value.selected)return false;
    const current=machine.value.selected;
    try{
      if(action==='session-clear'){workstations.clearSession(current);return true;}
      if(action==='layout-apply'){const s=workstations.suit(current);if(!s?.layout?.enabled||!s.layout.windows?.length)return false;applyLayout(current).then(r=>broadcast('layout-result',{id:current,manual:true,...r})).catch(e=>log('layout',e.message));return true;}
      if(action==='launch-all'){launchSuit(current).then(r=>{broadcast('launch-result',{id:current,...r});return applyLayout(current);}).then(r=>broadcast('layout-result',{id:current,manual:true,...r})).catch(e=>log('launch',e.message));return true;}
      if(action==='open-folder'){const suit=workstations.suit(current);if(!suit.folder)return false;shell.openPath(suit.folder).catch(e=>log('launch',e.message));return true;}
      const list=tabs?.list?.()||[];if(!list.length)return false;
      const i=Math.max(0,list.findIndex(t=>t.active));
      if(action==='tab-next')return tabs.activate(list[(i+1)%list.length].id);
      if(action==='tab-prev')return tabs.activate(list[(i-1+list.length)%list.length].id);
      if(action==='tab-close')return tabs.close(list[i].id);
      if(action==='tab-reload')return tabs.navigate(list[i].id,'reload');
    }catch(e){log('workstation',e.message);return false;}
    return false;
  }
  if(action==='select'&&modules.some(m=>m.id===id)&&!['ARMOR_HALL','SUIT_HOVER'].includes(machine.value.state)){
    if(machine.value.state==='MODULE'&&machine.value.selected===id)return false;
    pendingModule=id;
    // switching straight from one suit to another saves the one you are leaving, same as going home
    if(machine.value.state==='IDLE')dispatch('wake');else if(machine.value.state==='MODULE'){leaveSuit();machine.dispatch('home');}
    return true;
  }
  if(['standdown','back','home'].includes(action)){pendingModule=null;leaveSuit();}
  return machine.dispatch(action,id);
}
/** Save the open suit's tabs and when you left it, then close its tabs without the close wiping that save. */
function saveOpenSession(){
  if(machine?.value?.state!=='MODULE'||!machine.value.selected)return;
  try{const list=tabs?.list?.()||[];const open=list.filter(t=>t.url&&/^https?:/i.test(t.url)&&!isDeckUrl(t.url));const active=Math.max(0,open.findIndex(t=>t.active));clearTimeout(sessionTimer);if(open.length)workstations.saveSession(machine.value.selected,{tabs:open.map(t=>({url:t.url,title:t.title})),active,updatedAt:Date.now()});else workstations.clearSession(machine.value.selected);}catch(e){log('session',e.message);}
}
function leaveSuit(){
  if(machine?.value?.state!=='MODULE'||!machine.value.selected)return;
  try{visits.set(workstations.activeTheme,machine.value.selected,{lastLeft:Date.now()});}catch{}
  saveOpenSession();
  restoringSession=true;try{tabs?.closeAll();}catch{}restoringSession=false;clearTimeout(sessionTimer);
}
async function applySettings(patch){
  const before=settings.get();validateSettings(patch,before);const result=settings.update(patch);
  if('voiceEnabled'in patch){voice.listen(result.voiceEnabled);scheduleChatter();}   // idle chatter starts (or stops) with the microphone, not only at launch
  if('hotkeys'in patch)registerHotkeys(result.hotkeys);
  if('startWithWindows'in patch&&process.platform==='win32')app.setLoginItemSettings({openAtLogin:result.startWithWindows,path:process.execPath,args:['--startup']});
  if('weather'in patch){weatherCache=null;weatherChecked=0;}
  if('startup'in patch)applyDurations(result);
  broadcast('settings',result);updateTray();
  if(['mainDisplay','controlDisplay','singleScreen','thirdScreen','wallpaper'].some(k=>k in patch&&before[k]!==result[k]))await displays.rebuild();
  return result;
}
function addMedia(file){const id=crypto.randomUUID();mediaFiles.set(id,file);return {id,name:path.basename(file),url:`jarvis://media/${id}/${encodeURIComponent(path.basename(file))}`,type:/\.(mp4|webm|mov|m4v)$/i.test(file)?'video':/\.(png|jpe?g|webp|gif)$/i.test(file)?'image':'audio'};}
async function choose({type}){
  const filters=type==='startup-video'?[{name:'Video',extensions:['mp4','webm','m4v','mov']}]:type==='startup-sound'||type==='transition-sound'?[{name:'Audio',extensions:['mp3','wav','ogg','m4a','flac']}]:type==='transition-video'?[{name:'Video',extensions:['mp4','webm','m4v','mov']}]:type==='media'?[{name:'Media',extensions:['mp3','wav','ogg','m4a','flac','mp4','webm','m4v','png','jpg','jpeg','webp','gif']}]:type==='jae'?[{name:'Jae asset',extensions:['glb','png','webp','webm']}]:type==='armor'?[{name:'3D armor',extensions:['glb']}]:undefined;
  const res=await dialog.showOpenDialog({properties:type==='folder'?['openDirectory']:type==='media'?['openFile','multiSelections']:['openFile'],filters});if(res.canceled)return [];
  if(type==='media')return res.filePaths.map(addMedia);
  if(['jae','armor','startup-video','startup-sound','transition-video','transition-sound'].includes(type)){const from=res.filePaths[0];if(fs.statSync(from).size>(type.endsWith('-video')?400:100)*1024*1024)throw Error('Use an asset under 100 MB (video 400 MB).');const name=crypto.randomUUID()+path.extname(from).toLowerCase();const dir=path.join(userDir,'assets');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(from,path.join(dir,name));return `jarvis://custom/${name}`;}
  return res.filePaths;
}
async function launch(id){
  const entry=settings.get().shortcuts.find(s=>s.id===id);if(!entry)throw Error('Unknown shortcut.');
  if(entry.type==='url'){const u=new URL(entry.target);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)throw Error('Unsupported address.');await shell.openExternal(u.href);}
  else if(entry.type==='mail')await shell.openExternal('mailto:');
  else if(entry.type==='calculator'){if(process.platform!=='win32')throw Error('Windows Calculator is unavailable on this platform.');await shell.openExternal('calculator:');}
  else {const target=entry.type==='documents'?app.getPath('documents'):entry.target;if(!path.isAbsolute(target))throw Error('Choose an absolute file path.');const error=await shell.openPath(target);if(error)throw Error(error);}
  return true;
}
function applyDurations(s){if(machine)machine.durations=s.startup.enabled&&(s.startup.video||s.startup.sound)?introDurations(s.startup.seconds):{...DURATIONS};}
let pendingDirect=false;
function directHall(){if(!mainReady){pendingDirect=true;displays?.setActive(true);return;}displays?.setActive(true);machine.dispatch('debug-hall');}
function refreshModules(){modules=workstations.modules();if(machine)machine.modules=modules;}
function setTheme(id,opts={}){
  const previous=workstations.activeTheme;
  if(String(id)!==previous&&workstations.themes.some(t=>t.id===String(id)))leaveSuit();   // save the open suit's tabs while it still belongs to the old hall
  workstations.setTheme(String(id));refreshModules();
  if(previous!==workstations.activeTheme){
    tabs?.closeAll();
    if(['MODULE','SUIT_SELECTED','SUIT_HOVER'].includes(machine.value.state))machine.dispatch('home');
    if(machine.value.state==='IDLE')queueMicrotask(()=>directHall());
    if(settings.get().voiceEnabled)voice.listen(true);
    const theme=workstations.theme();
    scheduleChatter();
    if(theme?.voice?.greetAfter){
      const wait=Number(theme.voice.greetAfter)||1800;   // let the transition finish first
      setTimeout(()=>{const clip=packClip(theme.id,'theme');
        if(clip)voice?.speak('',settings.get(),voiceProfile(),clip);else say(theme.readyLine);},wait);
    }
    else if(!theme?.voice?.silentOnSwitch)say(`${theme.name} online.`);
  }
  broadcast('theme',{...themePayload(),fast:!!opts.fast});updateTray();scheduleHealth();return workstations.describe();
}

/* ---- screen choreography: put each app window where this suit wants it ---- */
/** The Zenbook's two panels, ordered by where they physically sit: upper, then lower. */
function screenPair(){
  const all=screen.getAllDisplays().slice().sort((a,b)=>a.bounds.y-b.bounds.y||a.bounds.x-b.bounds.x);
  return {top:all[0],bottom:all.length>1?all[all.length-1]:all[0]};
}
function areaRect(display,area){
  const a=display.workArea,halfW=Math.round(a.width/2),halfH=Math.round(a.height/2);
  if(area==='left')return {x:a.x,y:a.y,width:halfW,height:a.height};
  if(area==='right')return {x:a.x+halfW,y:a.y,width:a.width-halfW,height:a.height};
  if(area==='top')return {x:a.x,y:a.y,width:a.width,height:halfH};
  if(area==='bottom')return {x:a.x,y:a.y+halfH,width:a.width,height:a.height-halfH};
  return {x:a.x,y:a.y,width:a.width,height:a.height};
}
/** Turn a saved layout into physical-pixel rectangles for the current screens. */
function layoutEntries(spec){
  const pair=screenPair();
  return spec.windows.map(w=>{
    const display=pair[w.display]||pair.top;
    const rect=screen.dipToScreenRect(null,areaRect(display,w.area));
    return {match:w.match,matchBy:w.matchBy,launch:w.launch||'',x:rect.x,y:rect.y,w:rect.width,h:rect.height};
  });
}
/**
 * A link on the Screens list opens in a window of our own, so it lands exactly where
 * you put it: no guessing which browser window is which. One window per suit + link;
 * opening the suit again moves the same window back into place rather than adding another.
 * They share one signed-in session, so Claude and the rest remember you.
 */
const linkWindows=new Map();
function linkSession(){
  const s=session.fromPartition('persist:suit-links');
  if(!s.__jarvisReady){
    s.__jarvisReady=true;
    s.setUserAgent(s.getUserAgent().replace(/\s*Electron\/[\d.]+/,'').replace(/\s*jarvis-armor-workspace\/[\d.]+/i,''));   // some sign-in pages refuse "Electron"
    s.setPermissionRequestHandler((_w,perm,cb)=>cb(['clipboard-sanitized-write','fullscreen','notifications'].includes(perm)));
  }
  return s;
}
function placeLinkWindow(key,url,rect){
  let w=linkWindows.get(key);
  if(!w||w.isDestroyed()){
    w=new BrowserWindow({...rect,show:false,autoHideMenuBar:true,backgroundColor:'#0b1219',title:url,
      webPreferences:{session:linkSession(),sandbox:true,contextIsolation:true,nodeIntegration:false}});
    w.webContents.setWindowOpenHandler(({url:u})=>/^https?:/i.test(u)?{action:'allow'}:{action:'deny'});   // sign-in pop-ups
    w.on('closed',()=>linkWindows.delete(key));
    linkWindows.set(key,w);
    w.once('ready-to-show',()=>{if(!w.isDestroyed()){w.setBounds(rect);w.show();}});
    w.loadURL(url).catch(e=>log('layout',`${url}: ${e.message}`));
  }else{
    if(w.isMinimized())w.restore();
    w.setBounds(rect);w.show();
  }
  return w;
}
/* ---------- the deck (second screen) ---------- */
let deckPanels=null;
const pmFor=role=>role==='console'?deckPanels:panels;
function deckUp(){const c=displays?.console;return !!(c&&!c.isDestroyed());}
function deckInfo(){
  const r=displays?.roles;if(!deckUp()||!r?.main||!r?.control)return {present:false};
  const m=r.main.bounds,d=r.control.bounds;
  const side=d.y>=m.y+m.height-8?'below':d.y+d.height<=m.y+8?'above':d.x>=m.x+m.width-8?'right':'left';
  return {present:true,side,main:{w:m.width,h:m.height},deck:{w:d.width,h:d.height},panels:deckPanels.list().length};
}
function deckBackdrop(t){
  const custom=(settings.get().deckBackdrops||{})[t];
  if(custom&&fs.existsSync(path.join(userDir,'assets',custom)))return {url:`jarvis://custom/${encodeURIComponent(custom)}`,custom:true};
  return {url:fs.existsSync(path.join(assets,'deck',`${t}.jpg`))?`jarvis://asset/deck/${t}.jpg`:`jarvis://asset/wallpaper/${t}.jpg`,custom:false,scene:fs.existsSync(path.join(assets,'deck',`${t}.json`))};   // scene: the hall has a living deck scene (only the Batcave so far)
}
function throwPanelDown(id){
  if(!deckUp())throw Error('The second screen is not on. Take the keyboard off to use it.');
  if(deckPanels.list().length>=12)throw Error('The lower screen already has 12 pages. Close one first.');
  const r=panels.release(id);if(!r)return false;const pid=deckPanels.adopt(r);
  broadcast('hologram',{kind:'gone',id});broadcast('deck',{type:'adopted',id:pid,url:r.url,title:r.title});return {deck:true,id:pid};
}
/** A page on the deck goes back up: into the open suit as a tab, or into the hall as a floating panel. */
function sendUp(id){
  if(machine?.value?.state!=='MODULE'&&panels.list().length>=12)throw Error('The top screen already has 12 pages. Close one first.');
  const r=deckPanels.release(id);if(!r)return false;broadcast('deck',{type:'gone',id});
  const inSuit=machine?.value?.state==='MODULE';
  if(inSuit){try{tabs.adopt(r);return 'tab';}catch(e){log('deck',e.message);}}
  const pid=panels.adopt(r);broadcast('hologram',{kind:'adopted',id:pid,url:r.url,title:r.title});return 'panel';
}
/** Keyboard back on: the deck is going away, so every page on it comes home first rather than being lost. */
function deckGone(){
  if(!deckPanels)return;
  for(const p of deckPanels.list()){try{const r=deckPanels.release(p.id);if(!r)continue;const pid=panels.adopt(r);broadcast('hologram',{kind:'adopted',id:pid,url:r.url,title:r.title});}catch(e){log('deck',e.message);}}
}
/** links:false = only tidy windows that are already open; the link windows wait for Launch setup. */
/** Hand control: web pages in tabs sit above the app's own drawing, so over a tab the ring is a tiny see-through view of its own. */
let ringView=null;
function handRing(sender,p){
  const win=BrowserWindow.fromWebContents(sender);if(!win||win.isDestroyed())return false;
  if(!p||!p.show){if(ringView&&!ringView.webContents.isDestroyed())ringView.setVisible(false);return true;}
  if(!ringView||ringView.webContents.isDestroyed()){
    ringView=new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:false}});
    ringView.setBackgroundColor('#00000000');
    ringView.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    ringView.webContents.on('will-navigate',e=>e.preventDefault());
    ringView.webContents.loadURL('jarvis://app/hand-ring.html').catch(()=>{});
  }
  const s=p.pinch?46:64,x=Math.round(Number(p.x)||0),y=Math.round(Number(p.y)||0);
  if(ringView.__win&&ringView.__win!==win&&!ringView.__win.isDestroyed()){try{ringView.__win.contentView.removeChildView(ringView);}catch{}}
  ringView.__win=win;win.contentView.addChildView(ringView);   // re-adding keeps it above any tab opened since
  ringView.setBounds({x:x-s/2,y:y-s/2,width:s,height:s});ringView.setVisible(true);
  return true;
}
/** Claude inside the Ideas room: a sandboxed page that sits in the panel the room draws for it. */
let claudeView=null;
function ideaClaude(sender,p){
  const win=BrowserWindow.fromWebContents(sender);if(!win||win.isDestroyed())return false;
  if(claudeView&&claudeView.webContents.isDestroyed())claudeView=null;
  if(!p||p.show===false){if(claudeView){claudeView.setVisible(false);claudeView.setBounds({x:0,y:0,width:0,height:0});}return true;}
  // the main window is rebuilt after a renderer crash: move the panel (still signed in) into the new one
  if(claudeView&&claudeView.__win!==win){if(claudeView.__win&&!claudeView.__win.isDestroyed()){try{claudeView.__win.contentView.removeChildView(claudeView);}catch{}}win.contentView.addChildView(claudeView);claudeView.__win=win;}
  if(!claudeView){
    claudeView=new WebContentsView({webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,partition:'persist:jarvis-tabs'}});
    const ok=u=>{try{return ['https:'].includes(new URL(u).protocol);}catch{return false;}};
    claudeView.webContents.setWindowOpenHandler(({url})=>{if(ok(url))claudeView.webContents.loadURL(url);return {action:'deny'};});
    claudeView.webContents.on('will-navigate',(e,u)=>{if(!ok(u))e.preventDefault();});
    win.contentView.addChildView(claudeView);claudeView.__win=win;
    claudeView.webContents.loadURL('https://claude.ai/new').catch(e=>log('ideas',e.message));
  }
  const r=p.rect||{};const b={x:Math.max(0,Math.round(r.x||0)),y:Math.max(0,Math.round(r.y||0)),width:Math.max(0,Math.round(r.width||0)),height:Math.max(0,Math.round(r.height||0))};
  claudeView.setBounds(b);claudeView.setVisible(b.width>0&&b.height>0);return true;
}
async function applyLayout(id,{links=true}={}){
  let suit;try{suit=workstations.suit(String(id));}catch{return {placed:0,missing:[],error:'Unknown suit.'};}
  const spec=suit?.layout;
  if(!spec?.enabled||!spec.windows?.length)return {placed:0,missing:[]};
  let linksPlaced=0;
  {const pair=screenPair();
    for(const w of links?spec.windows.filter(x=>x.matchBy==='link'):[]){
      try{placeLinkWindow(`${suit.id}|${w.match}`,w.match,areaRect(pair[w.display]||pair.top,w.area));linksPlaced++;}
      catch(e){log('layout',`${w.match}: ${e.message}`);}
    }}
  const rest=spec.windows.filter(x=>x.matchBy!=='link');
  if(!rest.length)return {placed:linksPlaced,missing:[]};
  if(process.platform!=='win32')return {placed:linksPlaced,missing:[],error:'Window layout is only available on Windows.'};
  const entries=layoutEntries({...spec,windows:rest});
  const strip=({launch,...rest})=>rest;
  let results=[];
  const first=await layout.apply(entries.map(strip));
  if(first.error)return {placed:0,missing:[],error:first.error};
  results=first.results;
  // anything that was not already running gets started, then placed on a second pass
  const absent=results.filter(r=>!r.moved).map(r=>r.match);
  const toStart=entries.filter(e=>e.launch&&absent.includes(e.match));
  if(toStart.length){
    for(const e of toStart){try{const err=await shell.openPath(e.launch);if(err)log('layout',`${e.match}: ${err}`);}catch(err){log('layout',err.message);}}
    await new Promise(r=>setTimeout(r,3000));
    const second=await layout.apply(toStart.map(strip));
    if(!second.error)results=[...results.filter(r=>!toStart.some(t=>t.match===r.match)),...second.results];
  }
  const missing=results.filter(r=>!r.moved).map(r=>r.match);
  if(missing.length)log('layout',`Not placed: ${missing.join(', ')}`);
  return {placed:linksPlaced+results.filter(r=>r.moved).length,missing};
}

/* ---- working sessions: remember the tabs open in each suit ---- */
let sessionTimer=null,restoringSession=false;
function scheduleSessionSave(list){
  if(restoringSession)return;
  if(machine?.value?.state!=='MODULE'||!machine.value.selected)return;
  const id=machine.value.selected;
  clearTimeout(sessionTimer);
  sessionTimer=setTimeout(()=>{
    try{
      const open=(list||[]).filter(t=>t.url&&/^https?:/i.test(t.url)&&!isDeckUrl(t.url));
      const active=Math.max(0,open.findIndex(t=>t.active));
      if(open.length)workstations.saveSession(id,{tabs:open.map(t=>({url:t.url,title:t.title})),active,updatedAt:Date.now()});
      else workstations.clearSession(id);
    }catch(e){log('session',e.message);}
  },1200);
}
/** Reopen whatever was on screen last time this suit was open. */
/** The control deck lives on a fresh port and key each launch; an old address is dead. */
const isDeckUrl=u=>/^http:\/\/127\.0\.0\.1:\d+\/\?k=/.test(String(u||''));
async function restoreSession(id){
  let suit;try{suit=workstations.suit(String(id));}catch{return 0;}
  const session=suit?.session;if(!session?.tabs?.length)return 0;
  restoringSession=true;let opened=0,activeId=null;
  try{
    for(let i=0;i<session.tabs.length;i++){
      if(isDeckUrl(session.tabs[i].url))continue;   // saved by an older version: the deck opens fresh instead
      try{const tabId=tabs.open(session.tabs[i].url,false);opened++;if(i===session.active)activeId=tabId;}
      catch(e){log('session',e.message);}
    }
    if(activeId)tabs.activate(activeId);
  }finally{setTimeout(()=>{restoringSession=false;},800);}
  return opened;
}

async function launchSuit(id,what='all'){
  const suit=workstations.suit(String(id));const results={links:0,apps:0,tabs:0,errors:[]};
  // a centre bay is the control deck: it opens the board rather than a blank tab
  if(suit?.isVehicle&&['all','links'].includes(what)&&machine.value.state==='MODULE'&&machine.value.selected===suit.id&&displays.work&&!displays.work.isDestroyed()){
    const url=deckTabFor(null,suit.id);
    if(url){try{tabs.open(url,true);results.tabs++;}catch(e){log('control',e.message);}}
  }
  if(['all','links'].includes(what))for(const link of suit.links){try{if(link.target==='inapp'){if(machine.value.state==='MODULE'&&machine.value.selected===suit.id&&displays.work&&!displays.work.isDestroyed()){tabs.open(link.url,results.tabs===0);results.tabs++;}}else{await shell.openExternal(link.url);results.links++;}}catch(e){results.errors.push(`${link.label}: ${e.message}`);}}
  if(['all','apps'].includes(what))for(const item of suit.apps){try{const error=await shell.openPath(item.path);if(error)throw Error(error);results.apps++;}catch(e){results.errors.push(`${item.label}: ${e.message}`);}}
  if(what==='folder'&&suit.folder){try{const error=await shell.openPath(suit.folder);if(error)throw Error(error);}catch(e){results.errors.push(`Folder: ${e.message}`);}}
  for(const err of results.errors)log('launch',err);
  return results;
}
function resolveInFolder({root,path:rel}={}){
  if(typeof root!=='string'||!path.isAbsolute(root))throw Error('This suit has no folder yet.');
  const suits=Object.values(workstations.suits).flat();if(!suits.some(s=>s.folder&&path.resolve(s.folder)===path.resolve(root)))throw Error('Folder is not assigned to a suit.');
  const base=path.resolve(root);const target=path.resolve(base,String(rel||'.'));
  if(target!==base&&!target.startsWith(base+path.sep))throw Error('Stay inside the suit folder.');
  return {root:base,target};
}
function listFolder(payload){
  const {root,target}=resolveInFolder(payload);
  if(!fs.existsSync(target))return {root,path:path.relative(root,target),missing:true,entries:[]};
  const entries=fs.readdirSync(target,{withFileTypes:true}).filter(e=>!e.name.startsWith('.')).map(e=>{let st=null;try{st=fs.statSync(path.join(target,e.name));}catch{}return {name:e.name,dir:e.isDirectory(),size:st?.size??0,modified:st?.mtimeMs??0,ext:e.isDirectory()?'':path.extname(e.name).slice(1).toLowerCase()};}).sort((a,b)=>b.dir-a.dir||a.name.localeCompare(b.name,undefined,{sensitivity:'base'})).slice(0,500);
  return {root,path:path.relative(root,target),missing:false,entries};
}
function importFiles(dest,files){
  const copied=[];for(const from of files){if(!path.isAbsolute(from)||!fs.existsSync(from))continue;let name=path.basename(from),to=path.join(dest,name),n=1;const ext=path.extname(name),stem=name.slice(0,name.length-ext.length);while(fs.existsSync(to)){to=path.join(dest,`${stem} (${n++})${ext}`);}if(path.resolve(from)===path.resolve(to)||path.resolve(dest).startsWith(path.resolve(from)+path.sep))continue;fs.cpSync(from,to,{recursive:true});copied.push(path.basename(to));}
  return copied;
}
async function api(event,method,payload){
  assertSender(event);if(typeof method!=='string')throw Error('Invalid request.');
  const role=trusted.get(event.sender.id).role;
  if(['wallpaper','identify'].includes(role)&&method!=='bootstrap')throw Error('Read-only display.');
  switch(method){
    case 'bootstrap':return {snapshot:machine.snapshot(),settings:settings.get(),modules,theme:themePayload(),displays:displays.describe(),single:displays.roles?.single??true,telemetry,status:getStatus(),platform:process.platform,version:app.getVersion(),preview:false,audioAssets:Object.fromEntries(['hover','wake','lock','launch','standby','ready'].filter(n=>fs.existsSync(path.join(assets,'audio',n+'.wav'))).map(n=>[n,`jarvis://asset/audio/${n}.wav`]))};
    case 'action':if(!['wake','hover','select','home','back','standdown','settings','debug-hall','debug-helmet','theme','skip'].includes(payload?.action))throw Error('Unknown command.');return dispatch(payload.action,payload.id,{fast:payload.fast===true});
    case 'renderer-ready':if(role==='main'){mainReady=true;if(pendingWake){pendingWake=false;dispatch('wake');}if(pendingDirect){pendingDirect=false;directHall();}}return true;
    case 'settings':return applySettings(payload);
    case 'identify':displays.identify();return true;
    case 'setup-complete':await applySettings({...payload,setupComplete:true});settingsWindow?.close();dispatch('wake');return true;
    case 'audio-test':say('System starting up. Audio systems are online.');broadcast('audio-test',true);return true;
    case 'microphone-test':await applySettings({voiceEnabled:true});return true;
    case 'voice-diagnose':return voice.diagnose();
    case 'system-microphone':if(process.platform==='win32')await shell.openExternal('ms-settings:sound');return true;
    case 'choose':return choose(payload||{});
    case 'launch':return launch(payload);
    case 'favorite-open':{const target=Number.isInteger(payload)?settings.get().favorites[payload]:undefined;if(!target)throw Error('Unknown folder.');const error=await shell.openPath(target);if(error)throw Error(error);return true;}
    case 'calendar-list':return calendar.list();
    case 'todo-list':return todos.list();
    case 'todo-add':return todos.add(payload?.text);
    case 'todo-toggle':return todos.toggle(String(payload?.id||''));
    case 'todo-remove':return todos.remove(String(payload?.id||''));
    case 'todo-clear-done':return todos.clearDone();
    case 'calendar-save':return calendar.save(payload);
    case 'calendar-delete':return calendar.remove(payload);
    case 'weather':if(Date.now()-weatherChecked>600000||!weatherCache){weatherChecked=Date.now();try{weatherCache=await weather(settings.get().weather);}catch(e){weatherCache={status:'WEATHER UNAVAILABLE',error:e.message};}}return weatherCache;
    case 'media-control':if(!['play','pause','previous','next','stop'].includes(payload))throw Error('Invalid media command.');broadcast('media-control',payload);return true;
    case 'module-control':if(!['launch-all'].includes(payload))throw Error('Invalid module control.');if(payload==='launch-all'){const id=machine.value.selected;const r=await launchSuit(id);broadcast('launch-result',{id,...r});return r;}return true;   /* the suit page shows anything that failed to open */
    case 'wallpaper-test':await applySettings({wallpaper:true});settingsWindow?.hide();setTimeout(()=>{if(settingsWindow&&!settingsWindow.isDestroyed())settingsWindow.show();},4500);return displays.wallpaperStatus;
    case 'voice-command':{const text=String(payload).slice(0,500);status.commandHistory.unshift({time:Date.now(),text});status.commandHistory=status.commandHistory.slice(0,50);const command=parseCommand(text,voiceContext());if(command){if(dispatch(command.action,command.id,command))followUntil=Date.now()+12000;}broadcast('status',getStatus());return {handled:!!command};}
    case 'ai-key':{if(typeof payload!=='string'||payload.length>4000)throw Error('Invalid API key.');if(!safeStorage.isEncryptionAvailable()||(process.platform==='linux'&&safeStorage.getSelectedStorageBackend()==='basic_text'))throw Error('Secure credential storage unavailable.');const f=path.join(userDir,'ai-key.enc');if(!payload){if(fs.existsSync(f))fs.unlinkSync(f);}else fs.writeFileSync(f,safeStorage.encryptString(payload));return true;}
    case 'ai-chat':{if(!Array.isArray(payload)||payload.length>40||payload.some(m=>!['user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>10000))throw Error('Invalid conversation.');let key='';try{key=safeStorage.decryptString(fs.readFileSync(path.join(userDir,'ai-key.enc')));}catch{}return askAI(settings.get().ai,key,payload);}
    case 'workstations':return workstations.describe();
    case 'board':return boardFor(payload?.theme);
    case 'board-save':{if(!payload||typeof payload.id!=='string')throw Error('Choose a bay.');const t=payload.theme||workstations.activeTheme;missions.set(t,payload.id,payload.patch||{});deck?.push({hall:t});return boardFor(t);}   // an open control deck tab refreshes too
    case 'board-run':return runBay(payload?.theme,payload.id);
    case 'board-stop':return runner.stop(payload?.theme||workstations.activeTheme,payload.id);
    case 'deck-url':return deck.url(payload?.theme||workstations.activeTheme);
    case 'theme-set':return setTheme(payload);
    case 'theme-media-save':{if(!payload||typeof payload.theme!=='string')throw Error('Choose a hall.');workstations.setMedia(payload.theme,payload.patch||{});broadcast('theme',themePayload());return workstations.describe();}
    case 'suit-save':{if(!payload||typeof payload.id!=='string')throw Error('Choose a suit.');const themeId=typeof payload.theme==='string'?payload.theme:workstations.activeTheme;workstations.saveSuit(payload.id,payload.patch,themeId);if(themeId===workstations.activeTheme)refreshModules();broadcast('theme',themePayload());scheduleHealth();return workstations.describe();}
    case 'layout-windows':return layout.list();
    case 'layout-apply':return applyLayout(payload?.id||machine.value.selected);
    case 'session-clear':{const id=String(payload?.id||machine.value.selected||'');const themeId=typeof payload?.theme==='string'?payload.theme:workstations.activeTheme;const cleared=workstations.clearSession(id,themeId);if(cleared)broadcast('theme',themePayload());return {cleared};}
    case 'session-info':{try{const themeId=typeof payload?.theme==='string'?payload.theme:workstations.activeTheme;const suit=workstations.suit(String(payload?.id||machine.value.selected||''),themeId);return {session:suit?.session||null};}catch{return {session:null};}}
    case 'suit-launch':return launchSuit(payload?.id||machine.value.selected,payload?.what||'all');
    case 'suit-choose-folder':{const res=await dialog.showOpenDialog({properties:['openDirectory','createDirectory']});return res.canceled?'':res.filePaths[0];}
    case 'suit-choose-app':{const res=await dialog.showOpenDialog({properties:['openFile'],filters:process.platform==='win32'?[{name:'Applications and shortcuts',extensions:['exe','lnk','bat','cmd','url']},{name:'All files',extensions:['*']}]:undefined});return res.canceled?'':res.filePaths[0];}
    case 'folder-list':return listFolder(payload);
    case 'folder-open':{const {target}=resolveInFolder(payload);const error=await shell.openPath(target);if(error)throw Error(error);return true;}
    case 'folder-reveal':{const {target}=resolveInFolder(payload);if(fs.statSync(target).isDirectory()){const error=await shell.openPath(target);if(error)throw Error(error);}else shell.showItemInFolder(target);return true;}
    case 'folder-add':{const {target}=resolveInFolder(payload);if(!fs.statSync(target).isDirectory())throw Error('Choose a folder.');const res=await dialog.showOpenDialog({properties:['openFile','multiSelections']});if(res.canceled)return [];return importFiles(target,res.filePaths);}
    case 'folder-import':{const {target}=resolveInFolder({root:payload?.root,path:payload?.path});if(!fs.statSync(target).isDirectory())throw Error('Choose a folder.');if(!Array.isArray(payload?.files)||payload.files.length>200)throw Error('Drop up to 200 items at a time.');return importFiles(target,payload.files.map(String));}
    case 'folder-mkdir':{const {target}=resolveInFolder({root:payload?.root,path:payload?.path});const name=String(payload?.name||'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'').trim().slice(0,80);if(!name||name==='.'||name==='..')throw Error('Enter a folder name.');fs.mkdirSync(path.join(target,name));return true;}
    case 'folder-create':{const themeId=typeof payload?.theme==='string'?payload.theme:workstations.activeTheme;const suit=workstations.suit(String(payload?.id??payload),themeId);const base=path.join(app.getPath('documents'),'JARVIS Workspaces',workstations.theme(themeId).name,suit.name.replace(/[<>:"/\\|?*]/g,''));fs.mkdirSync(base,{recursive:true});workstations.saveSuit(suit.id,{folder:base},themeId);if(themeId===workstations.activeTheme)refreshModules();broadcast('theme',themePayload());return base;}   /*settings can make a folder for a suit in another hall */
    case 'tabs-open':{if(role!=='main')throw Error('Tabs belong to the main display.');if(machine.value.state!=='MODULE')throw Error('Open a suit first.');return tabs.open(String(payload?.url),payload?.activate!==false);}
    case 'tabs-close':return tabs.close(String(payload));
    case 'tabs-activate':return tabs.activate(String(payload));
    case 'tabs-navigate':{if(!['back','forward','reload','external'].includes(payload?.command))throw Error('Unknown tab command.');return tabs.navigate(String(payload.id),payload.command);}
    case 'tabs-layout':{if(role!=='main')return false;if(!payload||typeof payload!=='object')throw Error('Invalid layout.');tabs.setLayout(payload);return true;}
    case 'tabs-show':{if(role!=='main')return false;tabs.show(!!payload);return true;}
    case 'tabs-state':return !!tabs.shown;
    case 'geo-home':{const w=settings.get().weather||{};return w.enabled&&Number.isFinite(w.latitude)&&Number.isFinite(w.longitude)?{name:w.place||'Home',lat:w.latitude,lon:w.longitude}:{name:'Leeds',lat:53.8008,lon:-1.5491};}
    case 'geo-search':return geoSearch(String(payload?.q||'').slice(0,160));
    case 'geo-weather':return geoWeather(Number(payload?.lat),Number(payload?.lon));
    case 'globe-say':{const t=String(payload?.text||'').slice(0,200);if(t)say(t);return true;}
    case 'tabs-list':return tabs.list();
    case 'tabs-scroll':{const dy=Math.max(-2000,Math.min(2000,Number(payload?.dy)||0));const at=Number.isFinite(payload?.x)&&Number.isFinite(payload?.y)?{x:payload.x,y:payload.y}:null;return tabs.scroll(dy,at);}
    case 'tabs-pointer':{if(role!=='main')return false;const type=String(payload?.type||'');if(!['move','down','up'].includes(type))throw Error('Unknown pointer event.');const x=Number(payload?.x),y=Number(payload?.y);if(!Number.isFinite(x)||!Number.isFinite(y))return false;if(tabs.win()?.webContents!==event.sender)return false;return tabs.pointer(type,x,y);}
    case 'hands-ring':return handRing(event.sender,payload);
    case 'vista-scene':{const t=workstations.activeTheme;const own=fs.existsSync(path.join(assets,'deck',`${t}-vista.json`));const b=deckBackdrop(t);return {theme:t,name:workstations.theme().name,assistant:workstations.theme().assistant,accent:workstations.theme().accent,scene:own&&!b.custom?`jarvis://asset/deck/${t}-vista.json`:null,image:b.url};}
    case 'suit-activity':{const t=typeof payload?.theme==='string'?payload.theme:workstations.activeTheme;const board=boardFor(t);const out={};for(const m of workstations.modules(t)){const v=visits.get(t,m.id)||{};const b=board.find(x=>x.id===m.id)||{};out[m.id]={status:b.status||'idle',progress:b.progress||0,last:Math.max(v.lastOpened||0,v.lastLeft||0)||null,open:machine.value.state==='MODULE'&&machine.value.selected===m.id};}return out;}
    case 'panel-open':{if(!['main','console'].includes(role))throw Error('Panels open on the JARVIS screens.');const r=payload?.rect;return pmFor(role).open({id:payload?.id,url:String(payload?.url||''),rect:r});}
    case 'panel-place':return ['main','console'].includes(role)&&pmFor(role).place(String(payload?.id||''),payload?.rect);
    case 'panel-show':return ['main','console'].includes(role)&&pmFor(role).show(payload?.id?String(payload.id):null,!!payload?.show);
    case 'panel-front':return ['main','console'].includes(role)&&pmFor(role).front(String(payload||''));
    case 'panel-close':return ['main','console'].includes(role)&&pmFor(role).close(String(payload||''));
    case 'panel-nav':{if(!['back','forward','reload','external'].includes(payload?.command))throw Error('Unknown panel command.');return pmFor(role).navigate(String(payload.id||''),payload.command);}
    case 'panel-list':return pmFor(role).list();
    case 'panel-pointer':{if(!['main','console'].includes(role))return false;const type=String(payload?.type||'');if(!['move','down','up'].includes(type))throw Error('Unknown pointer event.');const x=Number(payload?.x),y=Number(payload?.y);if(!Number.isFinite(x)||!Number.isFinite(y))return false;return pmFor(role).pointer(type,x,y,payload?.id?String(payload.id):undefined);}
    case 'panel-scroll':{const x=Number(payload?.x),y=Number(payload?.y),dy=Math.max(-2000,Math.min(2000,Number(payload?.dy)||0));return Number.isFinite(x)&&Number.isFinite(y)&&pmFor(role).scroll(x,y,dy);}
    /* ---- the deck: the second screen that appears when the keyboard comes off ---- */
    case 'suit-models':{   // 3D suits for the chambers: built-in ones, and your own in <user>/assets/suits/<hall>/<suit id>.glb
      const t=String(payload?.theme||workstations.activeTheme).replace(/[^a-z]/g,'');const out={};
      for(const [base,host] of [[path.join(assets,'suits',t),'asset'],[path.join(userDir,'assets','suits',t),'custom']]){try{for(const f of fs.readdirSync(base))if(/^[\w-]+\.glb$/i.test(f))out[f.replace(/\.glb$/i,'')]=`jarvis://${host}/suits/${t}/${encodeURIComponent(f)}`;}catch{}}
      return out;
    }
    case 'deck-info':return deckInfo();
    case 'deck-earth':{broadcast('globe',{cmd:'earth'});return true;}
    case 'panel-throw':{if(role!=='main')return false;return throwPanelDown(String(payload?.id||''));}
    case 'deck-send-up':return sendUp(String(payload?.id||''));
    case 'deck-send-all-up':{let n=0;for(const p of deckPanels.list()){if(sendUp(p.id))n++;}return n;}
    case 'hands-remote':{if(role!=='main')return false;const c=displays?.console;if(!c||c.isDestroyed())return false;c.webContents.send('jarvis:hands-remote',payload);return true;}
    case 'deck-backdrop':return deckBackdrop(String(payload?.theme||workstations.activeTheme));
    case 'deck-backdrop-set':{
      const t=String(payload?.theme||workstations.activeTheme);if(!workstations.themes.some(x=>x.id===t))throw Error('Unknown hall.');
      if(payload?.reset){const cur=settings.get().deckBackdrops||{};delete cur[t];await applySettings({deckBackdrops:{...cur}});broadcast('deck',{type:'backdrop',theme:t,...deckBackdrop(t)});return deckBackdrop(t);}
      const res=await dialog.showOpenDialog(displays?.console&&!displays.console.isDestroyed()?displays.console:null,{title:'Choose a picture for the second screen',properties:['openFile'],filters:[{name:'Pictures',extensions:['jpg','jpeg','png','webp']}]});
      if(res.canceled||!res.filePaths[0])return null;const from=res.filePaths[0];if(fs.statSync(from).size>40*1024*1024)throw Error('Use a picture under 40 MB.');
      const name=`deck-${t}-${Date.now()}${path.extname(from).toLowerCase()}`;const dir=path.join(userDir,'assets');fs.mkdirSync(dir,{recursive:true});fs.copyFileSync(from,path.join(dir,name));
      await applySettings({deckBackdrops:{...(settings.get().deckBackdrops||{}),[t]:name}});const out=deckBackdrop(t);broadcast('deck',{type:'backdrop',theme:t,...out});return out;
    }
    case 'briefing':{if(role!=='main')return false;return talk(payload==='status'?'status':'briefing');}
    case 'tower-get':return towerView(typeof payload?.theme==='string'?payload.theme:workstations.activeTheme);
    case 'tower-model-set':{
      const t=workstations.activeTheme;const kind=payload?.kind==='image'?'image':'glb';
      const res=await dialog.showOpenDialog({title:kind==='glb'?'Choose your 3D tower (.glb)':'Choose a picture of your tower',properties:['openFile'],filters:kind==='glb'?[{name:'3D model (glTF binary)',extensions:['glb']}]:[{name:'Pictures',extensions:['png','jpg','jpeg','webp']}]});
      if(res.canceled)return null;const src=res.filePaths[0];const st=fs.statSync(src);if(st.size>250*1024*1024)throw Error('That file is over 250 MB.');
      const ext=path.extname(src).toLowerCase().replace(/[^.a-z]/g,'');const dir=path.join(userDir,'assets','towers');fs.mkdirSync(dir,{recursive:true});
      for(const f of fs.readdirSync(dir))if(f.startsWith(t+'.'))try{fs.unlinkSync(path.join(dir,f));}catch{}
      fs.copyFileSync(src,path.join(dir,t+ext));
      const tw=tower.tower(t);tw.model={kind,file:`towers/${t}${ext}`,v:Date.now(),band:tw.model?.band||[0.1,0.9],name:path.basename(src)};tower.flush();return towerView(t);
    }
    case 'tower-model-clear':{const tw=tower.tower(workstations.activeTheme);delete tw.model;tower.flush();return towerView(workstations.activeTheme);}
    case 'tower-model-band':{const tw=tower.tower(workstations.activeTheme);const b=Math.max(0,Math.min(0.9,Number(payload?.bottom)||0)),top=Math.max(b+0.05,Math.min(1,Number(payload?.top)||1));tw.model={...(tw.model||{kind:'stand-in',file:'',v:0}),band:[b,top]};tower.flush();return towerView(workstations.activeTheme);}
    case 'tower-engines':{if(payload?.force){const {detectClaudeCode}=await import('../tower/engines.js');await detectClaudeCode(true);}const e=await towerRunner.engines();return {...e,hasKey:!!readTowerKey()};}
    case 'tower-key':{if(typeof payload!=='string'||payload.length>400)throw Error('Invalid API key.');const k=payload.trim();if(k&&!/^sk-ant-[\w-]{20,}$/.test(k))throw Error('That does not look like a Claude API key (they start with sk-ant-).');if(!safeStorage.isEncryptionAvailable())throw Error('Secure key storage is not available on this computer.');if(!k){if(fs.existsSync(towerKeyFile()))fs.unlinkSync(towerKeyFile());}else fs.writeFileSync(towerKeyFile(),safeStorage.encryptString(k));towerKey=k;return true;}
    case 'tower-settings':return tower.saveSettings(payload||{});
    case 'tower-save-tower':return tower.saveTower(workstations.activeTheme,payload||{});
    case 'tower-save-floor':{if(!payload||typeof payload.id!=='string')throw Error('Choose a floor.');tower.saveFloor(workstations.activeTheme,payload);return towerView(workstations.activeTheme);}
    case 'tower-add-floor':{const f=tower.addFloor(workstations.activeTheme);return {...towerView(workstations.activeTheme),added:f.id};}
    case 'tower-remove-floor':{if(towerRunner.active(workstations.activeTheme).some(r=>r.floorId===payload))throw Error('That floor is working. Stop it first.');tower.removeFloor(workstations.activeTheme,String(payload));return towerView(workstations.activeTheme);}
    case 'tower-reset':{tower.resetExamples(workstations.activeTheme);return towerView(workstations.activeTheme);}
    case 'tower-run':{const run=await towerRunner.start(workstations.activeTheme,String(payload?.floorId||''),String(payload?.task||''),{ideaId:typeof payload?.ideaId==='string'?payload.ideaId:undefined});return run;}
    case 'tower-desk':return towerRunner.desk(String(payload?.runId||''),String(payload?.who||''));
    case 'tower-approve':{
      const a=towerRunner.approve(String(payload?.runId||''),Number(payload?.i),!!payload?.yes);
      if(payload?.yes){let url='';
        if(a.type==='email'){const to=/[\w.+-]+@[\w-]+\.[\w.-]+/.exec(a.to)?.[0]||'';url=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(a.title)}&body=${encodeURIComponent(String(payload?.body||'').slice(0,1800))}`;}
        else if(a.type==='post'){const p=a.to.toLowerCase();url=p.includes('linkedin')?'https://www.linkedin.com/feed/?shareActive=true':/\b(x|twitter)\b/.test(p)?'https://x.com/compose/post':p.includes('facebook')?'https://www.facebook.com/':p.includes('instagram')?'https://www.instagram.com/':'';}
        if(url)await shell.openExternal(url);return {...a,opened:!!url};}
      return a;
    }
    case 'tower-lobby':return towerLobby(String(payload||'').slice(0,4000));
    case 'tower-stop':return towerRunner.stop(String(payload||''));
    case 'tower-feedback':return towerRunner.feedback(String(payload?.runId||''),!!payload?.good,String(payload?.comment||''));
    case 'tower-knowledge-add':{let files=Array.isArray(payload?.paths)?payload.paths.filter(p=>typeof p==='string'&&p):[];if(!files.length){const res=await dialog.showOpenDialog({title:'Add knowledge to this floor',properties:['openFile','multiSelections'],filters:[{name:'Documents',extensions:['md','txt','pdf','docx','csv','json','html','xlsx','pptx']},{name:'All files',extensions:['*']}]});if(res.canceled)return null;files=res.filePaths;}return tower.addKnowledge(workstations.activeTheme,String(payload?.floorId||''),files.slice(0,20));}
    case 'tower-knowledge-remove':return tower.removeKnowledge(workstations.activeTheme,String(payload?.floorId||''),String(payload?.name||''));
    case 'tower-brief-upload':{const res=await dialog.showOpenDialog({title:'Upload a brief for this floor',properties:['openFile'],filters:[{name:'Text',extensions:['md','txt']}]});if(res.canceled)return null;const text=fs.readFileSync(res.filePaths[0],'utf8').slice(0,6000);tower.saveFloor(workstations.activeTheme,{id:String(payload?.floorId||''),purpose:text});return towerView(workstations.activeTheme);}
    case 'tower-open':{const f=insideTower(payload);if(!f)throw Error('Only files in the tower can be opened.');const err=await shell.openPath(f);if(err)throw Error(err);return true;}
    case 'tower-read':{const f=insideTower(payload);if(!f||!fs.existsSync(f))throw Error('That file is not there any more.');return fs.readFileSync(f,'utf8').slice(0,200000);}
    case 'tower-report':return talk('tower-report');
    case 'tower-link':{const u=String(payload||'');if(!/^https?:\/\//i.test(u))throw Error('Only web links can open.');await shell.openExternal(u);return true;}
    case 'hologram-open':{if(role!=='main')return false;const u=String(payload?.url||'');if(!/^https?:\/\//i.test(u))throw Error('Only web links can open.');broadcast('hologram',{kind:/google\.com\/maps/.test(u)?'map':'link',url:u,title:String(payload?.title||'').slice(0,80)});return true;}
    case 'focus-start':return talk('focus',{minutes:Number(payload?.minutes)||25});
    case 'focus-stop':return talk('focus-stop');
    case 'focus-add':{if(!focusActive())return false;const add=Math.max(-60,Math.min(60,Number(payload)||0))*60000;const was=focus.until;focus.until=Math.max(Date.now()+60000,focus.until+add);focus.minutes=Math.max(1,Math.round(focus.minutes+(focus.until-was)/60000));   /*keep the session's total so the ring doesn't snap back to full */clearTimeout(focus.timer);focus.timer=setTimeout(()=>endFocus(),focus.until-Date.now());broadcast('focus',focusPayload());return focusPayload();}
    case 'focus-state':return focusPayload();
    case 'suit-recap':return recapFor(String(payload||machine.value.selected||''));
    case 'suit-note':{const id=String(payload?.id||'');workstations.suit(id);visits.note(workstations.activeTheme,id,String(payload?.note||''));return recapFor(id);}
    case 'health':{const t=workstations.activeTheme;return healthCache[t]||await checkHealth(t);}
    case 'tabs-throw':{
      const list=tabs.list();const id=String(payload?.id||list.find(t=>t.active&&!t.popped)?.id||'');if(!id)return false;
      if(deckUp()){if(deckPanels.list().length>=12)throw Error('The lower screen already has 12 pages. Close one first.');const r=tabs.release(id);if(!r)return false;const pid=deckPanels.adopt(r);broadcast('deck',{type:'adopted',id:pid,url:r.url,title:r.title});return {deck:true,id:pid};}
      const all=screen.getAllDisplays().slice().sort((a,b)=>a.bounds.x-b.bounds.x||a.bounds.y-b.bounds.y);if(all.length<2)throw Error('Only one screen is connected.');
      const here=displays?.work&&!displays.work.isDestroyed()?screen.getDisplayMatching(displays.work.getBounds()).id:screen.getPrimaryDisplay().id;
      const idx=all.findIndex(d=>d.id!==here);return tabs.popOut(id,{display:idx+1});
    }
    case 'ideas-list':return ideas.list();
    case 'ideas-save':return ideas.save(payload);
    case 'ideas-remove':return ideas.remove(String(payload||''));
    case 'ideas-targets':{const t=workstations.activeTheme;return {theme:t,hallName:workstations.theme(t).name,suits:workstations.modules(t).map(m=>({id:m.id,name:m.name,centre:!!m.isVehicle}))};}
    case 'idea-assist':{const id=String(payload?.id||'');assistant.get(id);assistant.think(id,{feedback:String(payload?.feedback||'').slice(0,2000)}).catch(e=>log('ideas',e.message));return true;}
    case 'idea-approve':return assistant.approve(String(payload?.id||''));
    case 'idea-decline':return assistant.decline(String(payload?.id||''));
    case 'idea-open':{const a=assistant.get(String(payload?.id||'')).assist||{};const f=payload?.what==='diff'?a.diffFile:insideTower(a.resultFile);if(!f||!fs.existsSync(f))throw Error('That file is not there any more.');const err=await shell.openPath(f);if(err)throw Error(err);return true;}
    case 'ideas-config':{
      if(payload&&typeof payload==='object'&&('nightly' in payload||'sourceRepo' in payload)){const cur=settings.get().ideas||{};const next={sourceRepo:typeof payload.sourceRepo==='string'?payload.sourceRepo:cur.sourceRepo||'',nightly:typeof payload.nightly==='boolean'?payload.nightly:cur.nightly!==false};
        if(next.sourceRepo&&!IdeaAssistant.isRepo(next.sourceRepo))throw Error('That folder is not the JARVIS source (a git folder with src/main/main.js).');await applySettings({ideas:next});}
      const {detectClaudeCode}=await import('../tower/engines.js');const code=await detectClaudeCode(!!payload?.recheck);
      return {...assistant.config(),claudeCode:code,hasKey:!!readTowerKey(),building:assistant.building};
    }
    case 'ideas-choose-source':{const res=await dialog.showOpenDialog({title:'Choose your JARVIS source folder',properties:['openDirectory']});if(res.canceled||!res.filePaths[0])return null;const p=res.filePaths[0];if(!IdeaAssistant.isRepo(p))throw Error('That folder is not the JARVIS source (a git folder with src/main/main.js).');const cur=settings.get().ideas||{};await applySettings({ideas:{sourceRepo:p,nightly:cur.nightly!==false}});return p;}
    case 'ideas-claude':{if(role!=='main')return false;return ideaClaude(event.sender,payload);}
    case 'tabs-popout':{const id=String(payload?.id||'');const o={};if(Number.isInteger(payload?.display))o.display=payload.display;if(Number.isFinite(payload?.x)&&Number.isFinite(payload?.y)){o.x=payload.x;o.y=payload.y;}return tabs.popOut(id,o);}
    case 'tabs-dock':return tabs.dock(String(payload));
    case 'tabs-displays':return tabs.displays();
    case 'link-open-on':{   // a link tile on the suit page, opened on the screen picked for it
      if(role!=='main')throw Error('Links open from the main display.');
      const suit=workstations.suit(String(payload?.id||''));const link=suit?.links?.[Number(payload?.index)];
      if(!link)throw Error('That link is no longer on this suit.');
      if(!/^https?:\/\//i.test(link.url))throw Error('Only web links can open on a screen.');
      const where=payload?.where;
      if(where==='browser'){await shell.openExternal(link.url);return {ok:true,where};}
      const inSuit=machine.value.state==='MODULE'&&machine.value.selected===suit.id;
      if(where==='here'){if(!inSuit)throw Error('Open the suit first.');const t=tabs.open(link.url,true);return {ok:true,where,tab:t||null};}
      const all=screen.getAllDisplays().slice().sort((a,b)=>a.bounds.x-b.bounds.x||a.bounds.y-b.bounds.y);
      const n=Number(where);const d=Number.isInteger(n)&&all[n-1];if(!d)throw Error('That screen is not connected right now.');
      if(link.target==='inapp'&&inSuit){const t=tabs.open(link.url,true);if(t)tabs.popOut(t,{display:n});return {ok:true,where:n};}
      const w=placeLinkWindow(`pick:${suit.id}:${link.url}`,link.url,d.workArea);
      w.once('ready-to-show',()=>{if(!w.isDestroyed())w.maximize();});if(w.isVisible())w.maximize();
      return {ok:true,where:n};
    }
    case 'backup-export':{
      const stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
      const res=await dialog.showSaveDialog({title:'Save workspace backup',defaultPath:`jarvis-workspace-${stamp}.json`,filters:[{name:'JARVIS backup',extensions:['json']}]});
      if(res.canceled||!res.filePath)return {saved:false};
      const readJson=(f)=>{try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return null;}};
      const payload={kind:'jarvis-armor-workspace-backup',version:app.getVersion(),savedAt:new Date().toISOString(),
        settings:readJson(path.join(userDir,'settings.json')),
        workstations:readJson(path.join(userDir,'workstations.json')),
        calendar:readJson(path.join(userDir,'calendar.json')),todos:readJson(path.join(userDir,'todos.json')),ideas:readJson(path.join(userDir,'ideas.json'))};
      fs.writeFileSync(res.filePath,JSON.stringify(payload,null,2),'utf8');
      return {saved:true,path:res.filePath};
    }
    case 'backup-import':{
      const res=await dialog.showOpenDialog({title:'Restore workspace backup',properties:['openFile'],filters:[{name:'JARVIS backup',extensions:['json']}]});
      if(res.canceled||!res.filePaths[0])return {restored:false};
      let data; try{data=JSON.parse(fs.readFileSync(res.filePaths[0],'utf8'));}catch{throw Error('That file is not a readable backup.');}
      if(!data||data.kind!=='jarvis-armor-workspace-backup')throw Error('That file is not a JARVIS workspace backup.');
      const obj=v=>v&&typeof v==='object'&&!Array.isArray(v);
      if(data.settings!=null&&!obj(data.settings))throw Error('The settings in that backup are damaged.');
      if(data.workstations!=null&&(!obj(data.workstations)||!obj(data.workstations.suits)))throw Error('The suits in that backup are damaged.');
      for(const k of ['calendar','todos','ideas'])if(data[k]!=null&&!Array.isArray(data[k]))throw Error(`The ${k} in that backup are damaged.`);
      // keep a rescue copy of what is being replaced
      const stamp=Date.now();
      const files={settings:'settings.json',workstations:'workstations.json',calendar:'calendar.json',todos:'todos.json',ideas:'ideas.json'};
      for(const [k,f] of Object.entries(files)){
        const src=path.join(userDir,f);
        if(data[k]!=null&&fs.existsSync(src))try{fs.copyFileSync(src,path.join(userDir,f.replace('.json',`.before-restore-${stamp}.json`)));}catch{}
      }
      const write=(f,v)=>{const p=path.join(userDir,f);fs.writeFileSync(p+'.tmp',JSON.stringify(v,null,2),'utf8');fs.renameSync(p+'.tmp',p);};
      // load it now: out of the open suit first, then every store re-reads (and re-checks) its file
      if(['MODULE','SUIT_SELECTED','SUIT_HOVER'].includes(machine.value.state))dispatch('home');
      const dropped=[];
      if(data.settings){const next=sanitizeSettings(data.settings,defaults,k=>dropped.push(k));await applySettings(Object.fromEntries(Object.keys(defaults).map(k=>[k,next[k]])));}
      if(data.workstations){const theme=workstations.activeTheme;write(files.workstations,data.workstations);workstations=new WorkstationStore({configFile:path.join(root,'config','themes.json'),dir:userDir,log});if(theme!==workstations.activeTheme&&workstations.themes.some(t=>t.id===theme))workstations.setTheme(theme);refreshModules();broadcast('theme',themePayload());updateTray();scheduleHealth();if(settings.get().voiceEnabled)voice.listen(true);}
      if(data.calendar){write(files.calendar,data.calendar);calendar=new CalendarStore(userDir);}
      if(data.todos){write(files.todos,data.todos);todos=new TodoStore(userDir);}
      if(data.ideas){write(files.ideas,data.ideas);ideas=new IdeaStore(userDir);}
      if(dropped.length)log('backup',`Restore skipped invalid settings: ${dropped.join(', ')}`);
      return {restored:true,live:true,savedAt:data.savedAt||null,fromVersion:data.version||null,skipped:dropped};
    }
    case 'update-check':{
      const current=app.getVersion();
      const feed=(settings.get()?.updateFeed)||'https://raw.githubusercontent.com/Joshuabarradas234/jarvis-armor-workspace/main/latest.json';
      try{
        const res=await new Promise((resolve,reject)=>{
          const req=https.get(feed,{headers:{'User-Agent':'JARVIS-Armor-Workspace'},timeout:8000},r=>{
            if(r.statusCode&&r.statusCode>=300&&r.statusCode<400&&r.headers.location){r.resume();return https.get(r.headers.location,{headers:{'User-Agent':'JARVIS-Armor-Workspace'},timeout:8000},r2=>{let b='';r2.on('data',d=>b+=d);r2.on('end',()=>resolve({status:r2.statusCode,body:b}));}).on('error',reject);}
            let b='';r.on('data',d=>b+=d);r.on('end',()=>resolve({status:r.statusCode,body:b}));
          });
          req.on('timeout',()=>{req.destroy();reject(Error('timed out'));});
          req.on('error',reject);
        });
        if(res.status!==200)return {current,error:'feed returned '+res.status};
        const data=JSON.parse(res.body);
        const parse=(v)=>String(v||'0').split('.').map(n=>parseInt(n,10)||0);
        const [a,b,c]=parse(data.version),[x,y,z]=parse(current);
        const newer=a>x||(a===x&&(b>y||(b===y&&c>z)));
        return {current,latest:data.version,update:newer,url:data.url||'',notes:data.notes||''};
      }catch(e){return {current,error:e.message};}
    }
    case 'diagnostics':return {status:getStatus(),displays:displays.describe(),version:app.getVersion(),platform:process.platform,gpu:app.getGPUFeatureStatus(),settingsPath:path.join(userDir,'settings.json')};
    case 'open-logs':{const file=path.join(userDir,'jarvis.log');if(!fs.existsSync(file))fs.writeFileSync(file,'No errors recorded in this session.\n');const error=await shell.openPath(file);if(error)throw Error(error);return true;}
    case 'clear-cache':await session.defaultSession.clearCache();return true;
    case 'reset-settings':{const response=await dialog.showMessageBox({type:'question',buttons:['Cancel','Reset settings'],defaultId:0,cancelId:0,message:'Reset JARVIS settings?',detail:'Your local calendar and imported assets are kept.'});if(response.response===1){await applySettings(structuredClone(defaults));openSettings();}return true;}
    case 'meeting-state':return meetingInfo();
    case 'meeting-start':return startMeeting(typeof payload?.id==='string'?payload.id:null);
    case 'meeting-end':{if(!meetings.active)return false;endMeeting().catch(e=>log('meeting',e.message));return true;}
    case 'meeting-source':{if(role!=='main')throw Error('Meetings record from the main window.');const src=await desktopCapturer.getSources({types:['screen'],thumbnailSize:{width:0,height:0}});return src[0]?.id||null;}
    case 'meeting-capturing':{if(role!=='main')return false;clearTimeout(meetingWatch);const sources=(Array.isArray(payload?.sources)?payload.sources:[]).filter(x=>['mic','system'].includes(x));return meetings.capturing(String(payload?.id||''),sources);}
    case 'meeting-audio':{if(role!=='main'||!(payload?.bytes instanceof Uint8Array))return false;return meetings.audio(String(payload.id||''),payload.bytes);}
    case 'meeting-chunk':{if(role!=='main'||!(payload?.bytes instanceof Uint8Array)||payload.bytes.length>16000*2*65)return false;return meetings.chunk(String(payload.id||''),Math.max(0,Number(payload.start)||0),payload.bytes);}
    case 'meeting-flushed':{if(meetingFlush&&meetingFlush.id===payload?.id)meetingFlush.resolve();return true;}
    case 'meeting-failed':{if(role!=='main'||meetings.m?.id!==payload?.id||meetings.m.ending)return false;clearTimeout(meetingWatch);meetings.discard();const why=String(payload?.error||'').slice(0,200);broadcast('meeting',{type:'failed',error:why,info:meetingInfo()});say(`I couldn't start the recording, ${addr()}.`);return true;}
    case 'meeting-settings':{
      const to=String(payload?.to||'').trim(),from=String(payload?.from||'').trim();
      if(!validEmail(to))throw Error('Enter the email address the notes should go to.');
      if(from&&!validEmail(from))throw Error('Enter the Gmail address that sends the notes.');
      const pw=String(payload?.password||'').replace(/\s+/g,'');
      if(pw){if(!/^[a-z]{16}$/i.test(pw))throw Error('A Gmail app password is 16 letters (spaces are fine).');if(!safeStorage.isEncryptionAvailable())throw Error('Secure storage is not available on this PC.');fs.writeFileSync(gmailFile(),safeStorage.encryptString(pw));}
      if(payload?.forget){try{fs.unlinkSync(gmailFile());}catch{}}
      await applySettings({meeting:{to,from}});return meetingInfo();
    }
    case 'meeting-test-email':{const s=settings.get().meeting||{},pass=gmailPassword();if(!s.to||!s.from||!pass)throw Error('Add the Gmail address and app password first.');await sendGmail({user:s.from,password:pass,to:s.to,subject:'JARVIS meeting notes: test',text:'This is a test from JARVIS. Meeting notes will arrive like this when you end a meeting.\n\nJARVIS'});return true;}
    case 'meeting-open':{const h=meetings.find(String(payload?.id||''));if(!h)throw Error('That meeting is no longer in the history.');const target=payload?.what==='folder'?h.folder:h.transcript;if(!fs.existsSync(target))throw Error('That file has been moved or deleted.');const err=await shell.openPath(target);if(err)throw Error(err);return true;}
    case 'quit':app.quit();return true;
    default:throw Error('Unsupported request.');
  }
}
if(!smoke&&!app.requestSingleInstanceLock()){app.quit();}else{








  app.on('second-instance',()=>{if(machine)dispatch('wake');});   // a second launch while this one is still starting must not crash it
  app.whenReady().then(async()=>{
    userDir=app.getPath('userData');fs.mkdirSync(userDir,{recursive:true});
    process.on('uncaughtException',e=>{try{log('crash',e?.stack||e?.message||String(e));}catch{}});
    process.on('unhandledRejection',e=>{try{log('crash',e?.stack||String(e));}catch{}});
    protocol.handle('jarvis',request=>{
      const url=new URL(request.url);let target;
      if(url.host==='media'){target=mediaFiles.get(url.pathname.split('/')[1]);if(!target)return new Response('Missing media',{status:404});}
      else {const base=url.host==='app'?path.join(root,'dist'):url.host==='asset'?assets:url.host==='custom'?path.join(userDir,'assets'):null;if(!base)return new Response('Forbidden',{status:403});const rel=decodeURIComponent(url.pathname).replace(/^\/+/, '');target=path.resolve(base,rel||'index.html');if(!target.startsWith(base+path.sep))return new Response('Forbidden',{status:403});}
      return net.fetch(pathToFileURL(target).toString(),{headers:request.headers}).then(res=>{const headers=new Headers(res.headers);headers.set('Access-Control-Allow-Origin','*');return new Response(res.body,{status:res.status,statusText:res.statusText,headers});}).catch(()=>new Response('Not found',{status:404}));
    });
    const camOK=(wc,perm,details)=>{if(perm!=='media')return false;const t=wc&&trusted.get(wc.id);if(!t||t.role!=='main')return false;const types=details?.mediaTypes||[];return !types.includes('audio')||!!meetings?.m;};   /* audio only for a meeting */
    session.defaultSession.setPermissionRequestHandler((wc,perm,callback,details)=>callback(camOK(wc,perm,details)));
    session.defaultSession.setPermissionCheckHandler((wc,perm,_origin,details)=>perm==='media'&&camOK(wc,perm,{mediaTypes:details?.mediaType==='audio'?['audio']:['video']}));
    settings=new SettingsStore(userDir,log);visits.load();try{if(!visits.get('__','startup19').done){visits.set('__','startup19',{done:true});const st=settings.get().startup;if(st&&/startup\/welcome\.mp4$/.test(st.video||'')&&st.seconds===15)settings.update({startup:{...st,seconds:19.2}});}}catch(e){log('settings',e.message);}   /*once only, so choosing 15 s again sticks */calendar=new CalendarStore(userDir);todos=new TodoStore(userDir);ideas=new IdeaStore(userDir);
    workstations=new WorkstationStore({configFile:path.join(root,'config','themes.json'),dir:userDir,log});try{const s3=workstations.suit('im3','ironman');if(s3&&/^\s*(bay\s*0?3|mark\s*(16|xvi)|mk[\s-]*16)\s*$/i.test(s3.name||''))workstations.saveSuit('im3',{name:'Mark XXXIX'},'ironman');}catch(e){log('suits',e.message);}try{const s4=workstations.suit('bc8','batcave');if(s4&&/^\s*(cowl\s*0?4|doomsday(\s*bat)?)\s*$/i.test(s4.name||''))workstations.saveSuit('bc8',{name:'Absolute Batman'},'batcave');}catch(e){log('suits',e.message);}   /* v9.16: the fourth Batcave case is Absolute Batman */   /* v9.14: the third chamber is the Mark XXXIX now */
    modules=workstations.modules();
    missions=new MissionStore({dir:userDir});
    runner=new AgentRunner({missions,onUpdate:deckUpdate,log});
    deck=new ControlServer({missions,runner,board:boardFor,run:runBay,changed:t=>{try{if(workstations.themes.some(x=>x.id===t))broadcast('board',{theme:t,bays:boardFor(t)});}catch(e){log('control',e.message);}},hallName:id=>{try{return workstations.theme(id).name;}catch{return id;}},log});
    await deck.listen();
    voice=new WindowsVoice({scripts,assets,dir:userDir,grammar:()=>buildGrammar(voiceContext()),names:()=>spokenNames(voiceContext()),onClap:()=>{if(machine?.value?.state==='IDLE'){log('voice','double clap: waking');dispatch('wake');}},onMeter:m=>{broadcast('voice-meter',{level:voice.level,detected:!!m.detected,recognizer:voice.recognizer,audioState:voice.audioState});},onCommand:(text,confidence,rejected,meta={})=>{const heard=text||rejected||'';let command=text?parseCommand(text,voiceContext()):null;let handled=false,why='';
      // a quieter, less certain match still counts when it starts or ends with the assistant's name (or JARVIS has just answered you)
      if(command&&meta.low){const ctx=voiceContext();const nm=clean(ctx.theme?.assistant||'');const t=clean(text);const named=!!nm&&[nm,...(NAME_ALIASES[nm]||[])].some(n=>t===n||t.startsWith(n+' ')||t.endsWith(' '+n));if(!named&&!(ctx.follow&&confidence>=0.25)){command=null;why='unsure';}}
      if(text&&!command&&!why)why='no-match';if(!text)why=meta.mine?'own-voice':meta.rejected?'unclear':'quiet';
      if(command){if(command.theme&&command.theme!==workstations.activeTheme){try{workstations.setTheme(command.theme);refreshModules();broadcast('theme',themePayload());updateTray();scheduleChatter();scheduleHealth();setTimeout(()=>{if(settings.get().voiceEnabled)voice.listen(true);},0);}catch(e){log('voice',e.message);}}handled=!!dispatch(command.action,command.id,command);if(handled){followUntil=Date.now()+12000;if(!TALK.includes(command.action))setTimeout(()=>{try{acknowledge(command.action,command.id);}catch{}},260);}}broadcast('heard',{text:heard,confidence:Math.round((confidence||0)*100),handled,why:handled?'':why,name:voiceContext().theme?.assistant||'Jarvis'});status.commandHistory.unshift({time:Date.now(),text:heard,confidence:Math.round((confidence||0)*100),accepted:!!text,handled});status.commandHistory=status.commandHistory.slice(0,50);tray?.setToolTip(`JARVIS · heard: “${heard}” ${Math.round((confidence||0)*100)}%${handled?' ✓':''}`);broadcast('status',getStatus());},onStatus:text=>{voiceStatus=text;broadcast('status',getStatus());},log});
    machine=new WorkspaceMachine({modules,onChange:s=>{
      displays?.setActive(s.state!=='IDLE');broadcast('snapshot',s);
      if(s.state==='WAKE')say('System starting up.');
      if(s.state==='ARMOR_HALL'&&s.selected===null){if(pendingModule){const id=pendingModule;pendingModule=null;queueMicrotask(()=>dispatch('select',id));}else if(pendingShow){const id=pendingShow;pendingShow=null;setTimeout(()=>dispatch('suit-show',id),600);}}
      if(s.state==='SUIT_SELECTED'&&s.selected&&machine?.previous!=='SUIT_SELECTED')suitUp(s.selected);
      if(s.state==='SHUTDOWN')say('Standing by.');
      if(s.state==='ARMOR_HALL'&&machine?.previous==='HELMET_OPENING'){sayReady();morningBrief();}
      if(s.state==='MODULE'&&s.selected&&machine?.previous!=='MODULE')suitOpened(s.selected);
      if(machine?.value?.selected&&s.state==='RETURNING'){}
      if(s.state==='MODULE'&&s.selected){const suit=modules.find(m=>m.id===s.selected);setTimeout(async()=>{if(machine.value.state!=='MODULE'||machine.value.selected!==s.selected)return;applyLayout(s.selected,{links:false}).then(r=>{if(r&&(r.placed||r.error))broadcast('layout-result',{id:s.selected,...r});}).catch(e=>log('layout',e.message));const resumed=await restoreSession(s.selected);broadcast('launch-result',{id:s.selected,resumed});if(resumed){try{const v=voiceProfile();if(v?.lines?.resume)say(v.lines.resume);}catch{}return;}if(!suit?.autoLaunch)return;launchSuit(s.selected).then(r=>broadcast('launch-result',{id:s.selected,...r})).catch(e=>log('launch',e.message));},400);}
      if(s.state!=='MODULE')tabs?.closeAll();
      if(machine)machine.previous=s.state;
    }});
    layout=new WindowLayout({scripts,log});
    meetings=new MeetingManager({dir:userDir,docs:app.getPath('documents'),scripts,log,onUpdate:st=>broadcast('meeting',{type:'state',state:st})});
    tower=new TowerStore({dir:userDir,docs:app.getPath('documents')});towerRunner=new TowerRunner({store:tower,getKey:readTowerKey,onUpdate:towerUpdate,onDone:towerDone,log});setInterval(towerNightShift,30000);setTimeout(towerNightShift,20000);
    assistant=new IdeaAssistant({ideas:()=>ideas,tower:()=>tower,runner:()=>towerRunner,workstations:()=>workstations,board:t=>boardFor(t),readKey:readTowerKey,settings:()=>settings.get(),
      dir:userDir,appRoot:root,desktop:app.getPath('desktop'),log,broadcast,say:t=>say(t),addr:()=>addr(),notify:(title,body)=>{try{if(Notification.isSupported()&&!focusActive()&&!meetings?.active)new Notification({title,body}).show();}catch{}}});
    setInterval(()=>assistant.night(()=>visits.get('__','ideasNight').day,day=>visits.set('__','ideasNight',{day})).catch(e=>log('ideas',e.message)),10*60000);
    panels=new PanelManager({window:()=>displays?.work,onChange:list=>broadcast('panels',list),log});
    deckPanels=new PanelManager({window:()=>displays?.console,onChange:list=>broadcast('deck',{type:'panels',list}),log});
    tabs=new TabManager({window:()=>displays?.work,onChange:list=>{broadcast('tabs',list);scheduleSessionSave(list);},log});
    applyDurations(settings.get());scheduleHealth();
    displays=new DisplayManager({settings:()=>settings.get(),create:createWindow,load:loadWindow,scripts,log,onConsoleGone:deckGone,onChange:()=>{broadcast('status',getStatus());broadcast('settings',settings.get());broadcast('deck',{type:'info',...deckInfo()});}});
    ipcMain.handle('jarvis:call',async(event,method,payload)=>{try{return await api(event,method,payload);}catch(e){log('request',`${method}: ${e.message}`);throw e;}});
    // v9.20: setup run with the keyboard on used to save "single screen", and then the lower screen never lit up. Undo that once.
    try{if(!visits.get('__','screens2').done){visits.set('__','screens2',{done:true});if(settings.get().singleScreen)settings.update({singleScreen:false});}}catch(e){log('displays',e.message);}
    try{await displays.start();}catch(e){log('displays',e.message);setTimeout(()=>displays.rebuild().catch(err=>log('displays',err.message)),2000);}
    scheduleChatter();
    const icon=nativeImage.createFromPath(path.join(assets,'icons','tray.png'));
    tray=new Tray(icon);tray.setToolTip('JARVIS // ARMOR WORKSPACE');tray.on('double-click',()=>dispatch('wake'));updateTray();registerHotkeys(settings.get().hotkeys);
    {let relayoutTimer;const relayout=()=>{clearTimeout(relayoutTimer);relayoutTimer=setTimeout(()=>{if(machine?.value?.state!=='MODULE'||!machine.value.selected)return;const id=machine.value.selected;applyLayout(id,{links:false}).then(r=>{if(r&&(r.placed||r.error))broadcast('layout-result',{id,...r});}).catch(e=>log('layout',e.message));},1500);};for(const e of ['display-added','display-removed','display-metrics-changed'])screen.on(e,relayout);}
    onBattery=powerMonitor.isOnBatteryPower();powerMonitor.on('on-battery',()=>{onBattery=true;broadcast('status',getStatus());});powerMonitor.on('on-ac',()=>{onBattery=false;broadcast('status',getStatus());});
    powerMonitor.on('resume',()=>{if(settings.get().voiceEnabled)voice.listen(true);displays.rebuild().catch(e=>log('resume',e.message));});
    monitor=new SystemMonitor(data=>{telemetry=data;broadcast('telemetry',data);},()=>machine.value.state!=='IDLE');monitor.start().catch(e=>log('monitor',e.message));voice.listen(settings.get().voiceEnabled);
    const reminded=new Set();reminderTimer=setInterval(()=>{for(const event of calendar.list()){const delta=Date.parse(event.start)-Date.now();if(event.reminder&&delta>=0&&delta<=300000&&!reminded.has(event.id)&&!focusActive()&&Notification.isSupported()){reminded.add(event.id);new Notification({title:event.title,body:'Starting in '+Math.ceil(delta/60000)+' minutes.'}).show();}}},30000);
    if(!settings.get().setupComplete)openSettings();else if(settings.get().autoStart||(!process.argv.includes('--startup')&&!settings.get().startMinimized))dispatch('wake');
    app.on('activate',()=>{if(machine)dispatch('wake');});
  }).catch(e=>{console.error(e);app.quit();});
}
app.on('window-all-closed',()=>{});
app.on('before-quit',()=>{
  if(quitting)return;quitting=true;try{meetings?.saveNow();}catch{}try{saveOpenSession();}catch{}try{missions?.flush?.();}catch{}   /*quitting inside a suit: save its tabs now, the 1.2 s auto-save won't get the chance */try{towerRunner?.stopAll();}catch{}
  clearInterval(reminderTimer);clearTimeout(chatterTimer);clearTimeout(healthTimer);clearTimeout(focus.timer);try{deck?.close();}catch{}
  tabs?.dispose();machine?.dispose();monitor?.stop();voice?.dispose();globalShortcut.unregisterAll();
  // Let Electron close windows in its normal quit sequence, so renderer
  // beforeunload handlers can release media and graphics resources.
  displays?.dispose({destroyWindows:false});tray?.destroy();
});
