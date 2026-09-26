import fs from 'node:fs';
import path from 'node:path';
export class CalendarStore {
  constructor(dir){this.file=path.join(dir,'calendar.json');try{const loaded=JSON.parse(fs.readFileSync(this.file,'utf8'));this.events=Array.isArray(loaded)?loaded.filter(e=>e&&typeof e.id==='string'&&typeof e.title==='string'&&Number.isFinite(Date.parse(e.start))):[];}catch{this.events=[];}}
  list(){return [...this.events].sort((a,b)=>a.start.localeCompare(b.start));}
  save(event){
    if(typeof event.title!=='string'||!event.title.trim()||event.title.length>160||!Number.isFinite(Date.parse(event.start)))throw Error('Enter an event title and valid start time.');
    if(event.end&&(!Number.isFinite(Date.parse(event.end))||Date.parse(event.end)<Date.parse(event.start)))throw Error('End must follow start.');
    const row={id:event.id||crypto.randomUUID(),title:event.title.trim(),start:new Date(event.start).toISOString(),end:event.end?new Date(event.end).toISOString():null,reminder:!!event.reminder};
    this.events=this.events.filter(e=>e.id!==row.id).concat(row);this.flush();return this.list();
  }
  remove(id){this.events=this.events.filter(e=>e.id!==id);this.flush();return this.list();}
  flush(){fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.events,null,2));fs.renameSync(this.file+'.tmp',this.file);}
}
