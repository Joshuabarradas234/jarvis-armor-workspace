import fs from 'node:fs';import path from 'node:path';
import {writeJson} from '../brain/util.js';
/** Local usage counts only. No screen capture, page text, network calls or automatic execution. */
export class WorkSuggestions {
  constructor(dir,ideas,onChange=()=>{}) {
    this.file=path.join(dir,'work-suggestions.json');this.ideas=ideas;this.onChange=onChange;
    try{this.data=JSON.parse(fs.readFileSync(this.file,'utf8'));}catch{this.data={};}
    this.data={enabled:true,counts:{},seen:[],day:'',today:0,...this.data};this.last=new Map();
  }
  status(){return {enabled:this.data.enabled,today:this.data.today,limit:2,scope:'JARVIS suit opens, tab moves and Tower outcomes only. No page text, camera or screenshots.'};}
  save(){writeJson(this.file,this.data);}
  configure(enabled){if(typeof enabled!=='boolean')throw Error('Choose on or off.');this.data.enabled=enabled;this.save();return this.status();}
  observe(kind,context={},now=Date.now()) {
    if(!this.data.enabled||!['suit','move','rework','accepted'].includes(kind))return null;
    const theme=['ironman','batcave','spiderman'].includes(context.theme)?context.theme:'ironman';
    const id=String(context.id||'app').replace(/[^\w-]/g,'').slice(0,64),key=kind+':'+theme+':'+id;
    if(now-(this.last.get(key)||0)<30000)return null;this.last.set(key,now);
    const day=new Date(now).toISOString().slice(0,10);if(this.data.day!==day){this.data.day=day;this.data.today=0;}
    this.data.counts[key]=Math.min(10,(this.data.counts[key]||0)+1);
    if(Object.keys(this.data.counts).length>200)delete this.data.counts[Object.keys(this.data.counts)[0]];
    const threshold={suit:4,move:3,rework:2,accepted:2}[kind];
    if(this.data.counts[key]<threshold||this.data.today>=2||this.data.seen.includes(key)||this.ideas().list().length>=60){this.save();return null;}
    const name=String(context.name||'this workspace').slice(0,60);
    const [title,why,proposal]={
      suit:[`Create a start-of-work checklist for ${name}`,'You have opened this suit several times.','Suggest a short launch checklist and identify which links, files and recurring tasks belong here. Ask for the intended outcome first.'],
      move:[`Save a screen layout for ${name}`,'You have moved tabs between screens repeatedly.','Design a reusable screen layout for this suit. Ask which tabs belong on each screen before proposing any configuration change.'],
      rework:[`Improve the brief for ${name}`,'More than one run needed correction.','Inspect the review notes with the owner and propose clearer acceptance checks and a better specialist assignment. Do not change agent rules without approval.'],
      accepted:[`Keep an approved workflow for ${name}`,'The owner accepted several results here.','Choose an accepted Tower result and save its brief, writing preferences and checklist as a workflow for future jobs.']
    }[kind];
    const before=new Set(this.ideas().list().map(i=>i.id));
    this.ideas().save({title,notes:`Suggested from local JARVIS activity: ${why}\n\n${proposal}\n\nNothing has been run or changed. Ask JARVIS for a plan, then approve it to start. App code still needs review before it is applied.`,target:context.suit?{kind:'suit',theme,id,name}:{kind:'app'},x:20+(this.data.today*34),y:32});
    const idea=this.ideas().list().find(i=>!before.has(i.id));if(idea){idea.origin='local-suggestion';this.ideas().flush();}
    this.data.seen.push(key);this.data.seen=this.data.seen.slice(-200);this.data.today++;this.save();this.onChange();return idea||null;
  }
}
