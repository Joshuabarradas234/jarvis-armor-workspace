const {contextBridge,ipcRenderer,webUtils}=require('electron');
const channels=['board','snapshot','telemetry','settings','status','media-control','module-control','audio-test','theme','tabs','launch-result','layout-result','voice-meter','briefing','panels','hologram','caption','focus','recap','health','captured','tower','tower-open','globe','deck','hands-remote','heard','suit-show','meeting','ideas'];
contextBridge.exposeInMainWorld('jarvis',{
  call:(method,payload)=>ipcRenderer.invoke('jarvis:call',method,payload),
  pathFor:file=>{try{return webUtils.getPathForFile(file);}catch{return '';}},
  on:(name,callback)=>{if(!channels.includes(name))return()=>{};const listener=(_event,data)=>callback(data);ipcRenderer.on('jarvis:'+name,listener);return()=>ipcRenderer.removeListener('jarvis:'+name,listener);}
});
