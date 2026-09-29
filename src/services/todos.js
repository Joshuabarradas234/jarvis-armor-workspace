import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {writeJson} from '../brain/util.js';
/** A plain local to-do list, kept next to the calendar. */
export class TodoStore {
  constructor(dir){
    this.file=path.join(dir,'todos.json');
    try{const raw=JSON.parse(fs.readFileSync(this.file,'utf8'));
      this.items=Array.isArray(raw)?raw.filter(t=>t&&typeof t.id==='string'&&typeof t.text==='string').map(t=>({id:t.id,text:t.text,done:!!t.done,created:Number(t.created)||Date.now(),doneAt:Number(t.doneAt)||null,source:typeof t.source==='string'?t.source:'',owner:String(t.owner||''),deadline:String(t.deadline||'')})):[];}
    catch{this.items=[];}
  }
  list(){return [...this.items].sort((a,b)=>(a.done-b.done)||(a.done?(b.doneAt||0)-(a.doneAt||0):a.created-b.created));}
  add(text,meta={}){
    if(meta.source&&this.items.some(t=>t.source===meta.source))return this.list();
    const t=String(text??'').replace(/[\r\n]+/g,' ').trim();
    if(!t)throw Error('Type something to add.');
    if(t.length>200)throw Error('Keep it under 200 characters.');
    this.items.push({id:crypto.randomUUID(),text:t,done:false,created:Date.now(),doneAt:null,source:String(meta.source||'').slice(0,100),owner:String(meta.owner||'').slice(0,50),deadline:String(meta.deadline||'').slice(0,80)});this.flush();return this.list();
  }
  toggle(id){const i=this.items.find(x=>x.id===id);if(i){i.done=!i.done;i.doneAt=i.done?Date.now():null;this.flush();}return this.list();}
  remove(id){this.items=this.items.filter(x=>x.id!==id);this.flush();return this.list();}
  clearDone(){this.items=this.items.filter(x=>!x.done);this.flush();return this.list();}
  flush(){writeJson(this.file,this.items,2);}
}
