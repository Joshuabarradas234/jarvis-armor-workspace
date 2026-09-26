import {spawn} from 'node:child_process';
import path from 'node:path';

/**
 * Drives Windows window placement through PowerShell — the same channel the
 * speech engine already uses. Nothing extra to install.
 */
export class WindowLayout {
  constructor({scripts,log=()=>{}}){this.scripts=scripts;this.log=log;}
  #run(args,input,timeout=12000){
    if(process.platform!=='win32')return Promise.resolve({error:'Window layout is only available on Windows.'});
    return new Promise(resolve=>{
      const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.scripts,'layout.ps1'),...args],{windowsHide:true,stdio:[input===null?'ignore':'pipe','pipe','pipe']});
      let out='',err='';
      child.stdout.on('data',d=>out+=d);
      child.stderr.on('data',d=>err+=d);
      const timer=setTimeout(()=>{try{child.kill();}catch{}},timeout);
      child.on('error',e=>{clearTimeout(timer);this.log('layout',e.message);resolve({error:e.message});});
      child.on('exit',()=>{
        clearTimeout(timer);
        if(err)this.log('layout',err.slice(0,400));
        const line=out.trim().split('\n').filter(Boolean).pop();
        if(!line)return resolve({error:err.slice(0,300)||'No response from Windows.'});
        try{resolve(JSON.parse(line));}catch{resolve({error:'Unreadable response from Windows.'});}
      });
      if(input!==null){child.stdin.on('error',()=>{});child.stdin.end(input);}
    });
  }
  /** Every visible top-level window, so the settings screen can offer a pick list. */
  async list(){
    const res=await this.#run(['-List'],null);
    if(res?.error)return {error:res.error,windows:[]};
    const rows=Array.isArray(res)?res:[res].filter(Boolean);
    return {windows:rows.filter(r=>r&&r.title).map(r=>({title:String(r.title).slice(0,160),process:String(r.process||'').slice(0,80)}))};
  }
  /** Move windows. Entries carry physical-pixel rectangles worked out by the caller. */
  async apply(entries){
    if(!entries.length)return {results:[]};
    const res=await this.#run([],JSON.stringify({windows:entries}));
    if(res?.error)return {error:res.error,results:[]};
    const r=res?.results;
    return {results:Array.isArray(r)?r:r&&typeof r==='object'?[r]:[]};
  }
}
