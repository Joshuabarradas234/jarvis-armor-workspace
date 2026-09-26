import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
/** The Ideas room: each idea, how far along it is, and where its card sits. */
export const STAGES=['spark','designing','building','testing','done'];
export class IdeaStore{
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
      created:prev.created||Date.now(),updated:Date.now()};
    return out;
  }
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
