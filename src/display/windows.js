import { BrowserWindow,screen } from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { resolveDisplays,testDisplays } from './roles.js';
const allDisplays=()=>testDisplays()||screen.getAllDisplays();
const testing=!!process.env.JARVIS_TEST_SPLIT;
export class DisplayManager {
  constructor({settings,create,load,scripts,onChange,onConsoleGone,log}){Object.assign(this,{settings,create,load,scripts,onChange,onConsoleGone,log});this.work=null;this.console=null;this.vista=null;this.wallpapers=[];this.active=false;this.debounce=null;this.generation=0;this.wallpaperStatus='STARTING';this.rebuilding=false;this.stopped=false;}
  describe(){return allDisplays().map((d,i)=>({id:d.id,label:d.label||`Display ${i+1}`,number:i+1,bounds:d.bounds,scaleFactor:d.scaleFactor}));}
  // listening starts before the first build, so a screen switched on while JARVIS is starting still gets its window
  async start(){this.changed=()=>{clearTimeout(this.debounce);this.debounce=setTimeout(()=>this.rebuild().catch(e=>this.log('displays',e.message)),500);};for(const e of ['display-added','display-removed','display-metrics-changed'])screen.on(e,this.changed);await this.rebuild();}
  async rebuild(){
    if(this.stopped)return;this.rebuilding=true;
    const generation=++this.generation;
    const roles=resolveDisplays(allDisplays(),this.settings());this.roles=roles;
    for(const w of this.wallpapers)if(w&&!w.isDestroyed())w.destroy();this.wallpapers=[];
    if(!roles.main){this.rebuilding=false;return;}
    const full=w=>{if(!testing)w.setFullScreen(true);};const position=(w,bounds)=>{const current=w.getBounds();if(['x','y','width','height'].some(k=>current[k]!==bounds[k])){if(!testing)w.setFullScreen(false);w.setBounds(bounds);full(w);}};
    if(!this.work||this.work.isDestroyed()){
      this.work=this.create({role:'main',...roles.main.bounds,show:false,frame:false,backgroundColor:'#05080a'});
      full(this.work);await this.load(this.work,'main');
    }else position(this.work,roles.main.bounds);
    if(generation!==this.generation)return;
    if(roles.control){if(!this.console||this.console.isDestroyed()){this.console=this.create({role:'console',...roles.control.bounds,show:false,frame:false,backgroundColor:'#05080a'});full(this.console);await this.load(this.console,'console');}else position(this.console,roles.control.bounds);}
    else if(this.console&&!this.console.isDestroyed()){try{this.onConsoleGone?.(this.console);}catch(e){this.log('displays',e.message);}this.console.destroy();this.console=null;}   // keyboard back on: whatever was on the deck comes home first
    if(generation!==this.generation)return;
    if(roles.third){if(!this.vista||this.vista.isDestroyed()){this.vista=this.create({role:'vista',...roles.third.bounds,show:false,frame:false,skipTaskbar:true,backgroundColor:'#05080a'});full(this.vista);await this.load(this.vista,'vista');}else position(this.vista,roles.third.bounds);}
    else if(this.vista&&!this.vista.isDestroyed()){this.vista.destroy();this.vista=null;}
    if(generation!==this.generation)return;
    if(!this.settings().wallpaper)this.wallpaperBlocked=false;   // switching the wallpaper off and on again tries once more
    if(this.settings().wallpaper&&process.platform==='win32'&&this.wallpaperBlocked)this.wallpaperStatus='UNAVAILABLE · THIS DESKTOP SHOWS ITS OWN WALLPAPER';   // no place behind the icons on this Windows: leave it alone
    else if(this.settings().wallpaper&&process.platform==='win32'){
      let successes=0;
      for(const d of (testing?[]:screen.getAllDisplays())){
        if(this.wallpaperBlocked)break;
        const w=this.create({role:'wallpaper',...d.bounds,show:false,frame:false,focusable:false,skipTaskbar:true,backgroundColor:'#05080a'});this.wallpapers.push(w);w.on('closed',()=>{if(!this.rebuilding&&!this.stopped&&!w.failed&&!this.wallpaperBlocked&&this.settings().wallpaper)this.changed?.();});w.setIgnoreMouseEvents(true);await this.load(w,'wallpaper');
        if(generation!==this.generation)return;
        if(w.isDestroyed())continue;   // one wallpaper window gone: carry on, or the build never finishes and 'rebuilding' stays stuck on
        const handle=w.getNativeWindowHandle();const number=handle.length===8?handle.readBigUInt64LE().toString():handle.readUInt32LE().toString();
        try{await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.scripts,'wallpaper.ps1'),'-Handle',number],{windowsHide:true,timeout:15000},(e,out,err)=>e?reject(Error(err||e.message)):out.includes('"attached":true')?resolve():reject(Error('No desktop acknowledgement'))));successes++;}catch(e){const noRoom=/WorkerW not found/i.test(e.message);if(noRoom)this.wallpaperBlocked=true;this.log('wallpaper',noRoom?'Live wallpaper is not possible on this desktop (no WorkerW behind the icons); not retrying until the wallpaper setting is switched off and on.':e.message);w.failed=true;if(!w.isDestroyed())w.destroy();}
      }
      this.wallpaperStatus=this.wallpaperBlocked?'UNAVAILABLE · THIS DESKTOP SHOWS ITS OWN WALLPAPER':successes===allDisplays().length?'ACTIVE BEHIND DESKTOP ICONS':successes?'PARTIAL · CHECK DISPLAY SETTINGS':'UNAVAILABLE · LIVELY FALLBACK AVAILABLE';
    }else this.wallpaperStatus=this.settings().wallpaper?'WINDOWS REQUIRED':'OFF';
    if(generation===this.generation){this.rebuilding=false;this.setActive(this.active);this.onChange();
      // screens changed while this build ran (the lower screen came on half-way through): build again
      const now=resolveDisplays(allDisplays(),this.settings());if(['main','control','third'].some(k=>(now[k]?.id??null)!==(roles[k]?.id??null)))this.changed?.();}
  }
  setActive(active){const changed=this.active!==active;this.active=active;for(const w of [this.work,this.console,this.vista])if(w&&!w.isDestroyed()){if(active){if(!w.isVisible())w.showInactive?.();if(!w.isVisible())w.show();}else w.hide();}if(active&&changed&&!this.work?.isDestroyed())this.work?.focus();}
  identify(){for(const d of this.describe()){const w=this.create({role:'identify',...d.bounds,show:false,frame:false,alwaysOnTop:true,skipTaskbar:true,backgroundColor:'#070d11'});this.load(w,'identify',{number:String(d.number),label:d.label}).then(()=>{if(!w.isDestroyed())w.show();}).catch(e=>this.log('displays',e.message));setTimeout(()=>{if(!w.isDestroyed())w.destroy();},4200);}}
  dispose({destroyWindows=true}={}){this.stopped=true;this.generation++;clearTimeout(this.debounce);for(const e of ['display-added','display-removed','display-metrics-changed'])if(this.changed)screen.removeListener(e,this.changed);if(destroyWindows)for(const w of [this.work,this.console,this.vista,...this.wallpapers])if(w&&!w.isDestroyed())w.destroy();}
}
