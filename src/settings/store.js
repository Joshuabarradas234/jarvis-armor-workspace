import path from 'node:path';
import { defaults, validateSettings, sanitizeSettings } from './schema.js';
import { readJsonKeep, writeJsonKeep } from '../brain/util.js';
export class SettingsStore {
  constructor(dir, log=()=>{}){
    this.file=path.join(dir,'settings.json'); this.log=log;
    this.data=structuredClone(defaults);
    // a damaged file is kept aside and the last good copy is used; then key by key, one bad value is dropped on its own
    const saved=readJsonKeep(this.file,msg=>log('settings-recovery',msg));
    if(saved!==undefined)try{this.data=sanitizeSettings(saved,this.data,(k,msg)=>log('settings-recovery',`${k}: ${msg}`));}catch(e){log('settings-recovery',String(e));}
    if(!this.data.shortcuts.length)this.data.shortcuts=[{id:'browser',label:'Browser',type:'url',target:'https://www.google.com'},{id:'mail',label:'Email',type:'mail',target:''},{id:'documents',label:'Documents',type:'documents',target:''},{id:'calculator',label:'Calculator',type:'calculator',target:''}];
  }
  get(){return structuredClone(this.data);}
  update(patch){const next=validateSettings(patch,this.data);writeJsonKeep(this.file,next,2);this.data=next;return this.get();}
  reset(){this.data=structuredClone(defaults);return this.update({});}
}
