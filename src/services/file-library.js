import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {Worker} from 'node:worker_threads';
const supported=/\.(pdf|docx|txt|md|csv)$/i,skip=new Set(['node_modules','.git','.codex','AppData','JARVIS','JARVIS Tower']);
export const fileTerms = q => [...new Set(String(q).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[])].filter(w=>!['jarvis','what','did','does','the','about','say','said','was','with','this','that','file','files','please','find','tell','from','have','how','which'].includes(w)).slice(0,18);
export function safeDocument(root,file){const base=fs.realpathSync(root),full=path.resolve(file);if(!full.toLowerCase().startsWith(base.toLowerCase()+path.sep))throw Error('Choose a document inside the selected folder.');let p=full;while(p.length>base.length){if(fs.lstatSync(p).isSymbolicLink())throw Error('Linked files are not searched.');p=path.dirname(p);}if(!supported.test(full)||!fs.statSync(full).isFile())throw Error('Unsupported document.');const real=fs.realpathSync(full);if(!real.toLowerCase().startsWith(base.toLowerCase()+path.sep))throw Error('Document left the selected folder.');return real;}
export class FileLibrary {
  constructor(core){this.core=core;this.cache=new Map();this.sources=new Map();this.busy=false;}
  root(){return this.core.store.get().workDesk?.folder||this.core.deps.docs;}
  read(file){return new Promise((resolve,reject)=>{const worker=new Worker(new URL('./document-text.js',import.meta.url),{workerData:{kind:'document-text',file,assets:this.core.deps.assets},execArgv:[],resourceLimits:{maxOldGenerationSizeMb:128}});const timer=setTimeout(()=>finish(Error('Document took too long to read.')),12000);let done=false;const finish=(e,p)=>{if(done)return;done=true;clearTimeout(timer);worker.terminate();e?reject(e):resolve(p);};worker.on('message',r=>finish(r.error?Error(r.error):null,r.pages));worker.on('error',e=>finish(e));worker.on('exit',code=>{if(!done)finish(Error('Document reader stopped ('+code+').'));});});}
  async search(query){
    if(this.busy)throw Error('A document search is already running.');const terms=fileTerms(query);if(!terms.length)throw Error('Include a document name or specific subject.');this.busy=true;
    try{const root=fs.realpathSync(this.root()),files=[],warnings=[];let entries=0;
      const walk=(dir,depth=0)=>{if(depth>8||entries>=2500)return;let rows;try{rows=fs.readdirSync(dir,{withFileTypes:true});}catch{return;}for(const e of rows){if(++entries>2500)break;if(e.name.startsWith('.')||skip.has(e.name)||e.isSymbolicLink())continue;const full=path.join(dir,e.name);if(e.isDirectory())walk(full,depth+1);else if(e.isFile()&&supported.test(e.name))files.push(full);}};walk(root);
      files.sort((a,b)=>terms.filter(t=>path.basename(b).toLowerCase().includes(t)).length-terms.filter(t=>path.basename(a).toLowerCase().includes(t)).length||a.localeCompare(b));
      const hits=[];let scanned=0;const started=Date.now();for(const candidate of files.slice(0,180)){if(Date.now()-started>25000){warnings.push('Search time limit reached. Narrow the selected folder.');break;}
        let file;try{file=safeDocument(root,candidate);const st=fs.statSync(file),key=`${st.size}:${st.mtimeMs}`;let pages=this.cache.get(file)?.key===key?this.cache.get(file).pages:null;if(!pages){pages=await this.read(file);if(this.cache.size>=25)this.cache.delete(this.cache.keys().next().value);this.cache.set(file,{key,pages});}scanned++;
          for(const p of pages){const lower=p.text.toLowerCase(),found=terms.filter(t=>lower.includes(t)),nameScore=terms.filter(t=>path.basename(file).toLowerCase().includes(t)).length;if(!found.length)continue;const positions=found.map(t=>lower.indexOf(t)),start=Math.max(0,Math.min(...positions)-180),excerpt=p.text.slice(start,start+1300).trim();const id=crypto.createHash('sha256').update(file+key+p.location+excerpt).digest('hex').slice(0,20);hits.push({id,file,name:path.relative(root,file),location:p.location,excerpt,score:found.length*4+nameScore*7,key});}
        }catch(e){warnings.push(path.basename(candidate)+': '+e.message);}}
      if(files.length>scanned)warnings.push(`Read ${scanned} of ${files.length} supported documents in the selected folder.`);if(entries>=2500)warnings.push('Folder enumeration limit reached; select a smaller folder.');
      const sources=hits.sort((a,b)=>b.score-a.score).slice(0,8);for(const s of sources){this.sources.set(s.id,s);if(this.sources.size>100)this.sources.delete(this.sources.keys().next().value);}return {sources:sources.map(({key,score,...s})=>s),scanned,total:files.length,warnings:warnings.slice(0,15),root};
    }finally{this.busy=false;}
  }
  open(id){const source=this.sources.get(String(id));if(!source)throw Error('Search for this source again.');const file=safeDocument(this.root(),source.file),st=fs.statSync(file);if(`${st.size}:${st.mtimeMs}`!==source.key)throw Error('This document changed. Search again before using its answer.');return this.core.deps.openFile(file);}
}
