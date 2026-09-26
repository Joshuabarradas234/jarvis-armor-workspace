import fs from 'node:fs';
import path from 'node:path';
import { defaults, validateSettings } from './schema.js';
export class SettingsStore {
  constructor(dir, log=()=>{}){
    this.file=path.join(dir,'settings.json'); this.log=log;
    this.data=structuredClone(defaults);
    try{this.data=validateSettings(JSON.parse(fs.readFileSync(this.file,'utf8')),this.data);}catch(e){if(e.code!=='ENOENT')log('settings-recovery',String(e));}
    if(!this.data.shortcuts.length)this.data.shortcuts=[{id:'browser',label:'Browser',type:'url',target:'https://www.google.com'},{id:'mail',label:'Email',type:'mail',target:''},{id:'documents',label:'Documents',type:'documents',target:''},{id:'calculator',label:'Calculator',type:'calculator',target:''}];
  }
  get(){return structuredClone(this.data);}
  update(patch){const next=validateSettings(patch,this.data);fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(next,null,2));fs.renameSync(this.file+'.tmp',this.file);this.data=next;return this.get();}
  reset(){this.data=structuredClone(defaults);return this.update({});}
}
