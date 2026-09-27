import {app,BrowserWindow,powerMonitor,dialog} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const repo=process.env.JARVIS_VISUAL_APP||source,base=process.env.JARVIS_VISUAL_BASE||repo;
app.commandLine.appendSwitch('force-device-scale-factor','1');
const out=path.join(source,'test-results','entry-'+Date.now());
for(const dir of [out,...['profile','documents','desktop'].map(x=>path.join(out,x))])fs.mkdirSync(dir,{recursive:true});
dialog.showErrorBox=(title,message)=>{fs.writeFileSync(path.join(out,'fatal.txt'),title+'\n'+message);app.exit(3);};
process.on('uncaughtException',e=>{fs.writeFileSync(path.join(out,'fatal.txt'),e.stack);app.exit(3);});
app.setPath('userData',path.join(out,'profile'));app.setPath('documents',path.join(out,'documents'));app.setPath('desktop',path.join(out,'desktop'));
process.env.JARVIS_TEST='1';process.env.JARVIS_TEST_SPLIT='1440x900';
globalThis.__jarvisBoot={asarRoot:base,root:repo,base:JSON.parse(fs.readFileSync(path.join(repo,'package.json'))).version,version:null,label:'Isolated visual check'};
const {defaults}=await import(pathToFileURL(path.join(repo,'src/settings/schema.js')));
fs.writeFileSync(path.join(out,'profile/settings.json'),JSON.stringify({...defaults,setupComplete:true,wallpaper:false,startMinimized:true,voiceEnabled:false,voice:0,ambience:0,interface:0,music:0,quality:'ultra',hotkeys:{wake:'Control+Alt+Shift+F9',home:'Control+Alt+Shift+F10',standdown:'Control+Alt+Shift+F11',back:'Control+Alt+Shift+F12'},ideas:{sourceRepo:'',nightly:false},startup:{...defaults.startup,enabled:false}}));
const errors=[];
app.on('web-contents-created',(_e,w)=>w.on('console-message',(_ev,...args)=>{const row=args.length===1?args[0]:args;errors.push(row);}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(fn,ms=45000)=>{const end=Date.now()+ms;while(Date.now()<end){try{const r=await fn();if(r)return r;}catch{}await sleep(150);}throw Error('Timed out');};
setTimeout(()=>{fs.writeFileSync(path.join(out,'timeout-errors.json'),JSON.stringify(errors,null,2));app.exit(2);},420000).unref();
await import(pathToFileURL(path.join(repo,'src/main/main.js'))).catch(e=>{fs.writeFileSync(path.join(out,'fatal.txt'),e.stack);app.exit(3);});
app.whenReady().then(async()=>{
try{
 const win=await until(()=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('view=main')));
 win.webContents.on('render-process-gone',(_e,details)=>console.error('RENDERER_EXIT',details));win.on('unresponsive',()=>console.error('RENDERER_UNRESPONSIVE'));
 const js=code=>Promise.race([win.webContents.executeJavaScript(code),new Promise((_,reject)=>{const timer=setTimeout(()=>reject(Error('Renderer timeout: '+code.slice(0,110))),15000);timer.unref();})]);await until(()=>js('!!window.jarvis&&!!window.__jarvisHall'));
 const call=(method,payload)=>js('window.jarvis.call('+JSON.stringify(method)+','+JSON.stringify(payload)+')');
 await (await import(process.env.JARVIS_VISUAL_SUITE||'./entry-suite.mjs')).check({win,js,call,sleep,until,out});
 fs.writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2));console.log('ALL_COMPLETE',out);app.quit();
}catch(e){console.error(e);fs.writeFileSync(path.join(out,'console.json'),JSON.stringify(errors,null,2));app.exit(1);}
});
