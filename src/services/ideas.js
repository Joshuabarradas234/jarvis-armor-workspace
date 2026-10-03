import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
/** The Ideas room: each idea, how far along it is, and where its card sits. */
export const STAGES=['spark','designing','building','testing','done'];
/** What an idea is for: one suit in a hall, the JARVIS app itself, or nothing in particular. */
function target(t){
  if(!t||typeof t!=='object')return null;
  if(t.kind==='app')return {kind:'app'};
  if(t.kind==='suit'&&typeof t.theme==='string'&&typeof t.id==='string'&&t.theme&&t.id)return {kind:'suit',theme:t.theme.slice(0,32),id:t.id.slice(0,64),name:String(t.name||'').slice(0,60)};
  return null;
}
export class IdeaStore{
  /** Re-read the saved file into this same object: everything holding it (JARVIS Core, meetings) sees the restored list. */
  reload(){Object.assign(this,new IdeaStore(path.dirname(this.file)));return this;}
  constructor(dir){
    this.file=path.join(dir,'ideas.json');
    try{const raw=JSON.parse(fs.readFileSync(this.file,'utf8'));this.items=Array.isArray(raw)?raw.filter(x=>x&&typeof x.id==='string').map(x=>this.clean(x,x)):[];}catch{this.items=[];}
  }
  clean(p,prev={}){
    const n=v=>Number.isFinite(Number(v))?Number(v):null;
    const out={id:prev.id||crypto.randomUUID(),title:String(p.title??prev.title??'').replace(/[\r\n]+/g,' ').trim().slice(0,120),
      stage:STAGES.includes(p.stage)?p.stage:(prev.stage||'spark'),
      progress:Math.max(0,Math.min(100,Math.round(n(p.progress)??prev.progress??0))),
      notes:String(p.notes??prev.notes??'').slice(0,4000),
      x:Math.max(0,Math.min(100,n(p.x)??prev.x??50)),y:Math.max(0,Math.min(100,n(p.y)??prev.y??50)),
      target:target(p.target===undefined?prev.target:p.target),
      origin:prev.origin==='local-suggestion'?'local-suggestion':undefined,
      assist:prev.assist||null,   // JARVIS's plan and where it stands; only the main process changes it (setAssist)
      project:prev.project&&typeof prev.project==='object'?prev.project:null,   // the step-by-step project plan (src/ideas/planner.js, setProject)
      created:prev.created||Date.now(),updated:Date.now()};
    return out;
  }
  /** Update what JARVIS is doing with an idea (null clears it). */
  setAssist(id,patch){
    const i=this.items.find(x=>x.id===id);if(!i)throw Error('That idea no longer exists.');
    i.assist=patch===null?null:{...(i.assist||{}),...patch,updatedAt:Date.now()};
    this.flush();return i.assist;
  }
  /** Keep the idea's project plan (null clears it). */
  setProject(id,project){
    const i=this.items.find(x=>x.id===id);if(!i)throw Error('That idea no longer exists.');
    i.project=project&&typeof project==='object'?project:null;this.flush();return i.project;
  }
  get(id){return this.items.find(x=>x.id===id)||null;}
  list(){return [...this.items].sort((a,b)=>a.created-b.created);}
  save(p){
    if(!p||typeof p!=='object')throw Error('Invalid idea.');
    const i=this.items.findIndex(x=>x.id===p.id);
    const next=this.clean(p,i>=0?this.items[i]:{});
    if(!next.title)throw Error('Give the idea a name.');
    if(i>=0)this.items[i]=next;else{if(this.items.length>=60)throw Error('Up to 60 ideas.');this.items.push(next);}
    this.flush();return this.list();
  }
  remove(id){this.items=this.items.filter(x=>x.id!==id);this.flush();return this.list();}
  flush(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.items,null,2));fs.renameSync(this.file+'.tmp',this.file);}
}
