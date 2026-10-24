import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
/** Mac voices that sound like JARVIS, best first (all built into macOS). */
export const MAC_VOICES=['Daniel','Oliver','Arthur','Serena'];
/** SAPI's rate (-10 to 10) as words a minute for the Mac's say. */
export const macRate=rate=>Math.round(Math.min(260,Math.max(120,180+(typeof rate==='number'&&rate>-11?rate:0)*12)));
/** Windows: PowerShell's speech engine (scripts/windows). Mac: jarvis-listen (scripts/mac/listen.swift) and say. Both send the same lines. */
export class WindowsVoice {
  constructor({scripts,assets,dir,grammar,names,onCommand,onStatus,onMeter,onClap,log,helper=''}){Object.assign(this,{scripts,assets,dir,grammar,names,onCommand,onStatus,onMeter,onClap,log,helper});this.listener=null;this.speaker=null;this.suppressedUntil=0;this.enabled=false;this.threshold=0.4;this.floor=0.12;this.lastHeard=null;this.level=0;this.recognizer='';this.audioState='';this.lastDetected=0;}
  listen(enabled){
    this.enabled=enabled;
    if(this.listener){const p=this.listener;this.listener=null;p.kill();}
    if(!enabled){this.onStatus('MICROPHONE OFF');return;}
    if(process.platform==='darwin'){
      if(!this.helper||!fs.existsSync(this.helper)){this.onStatus('VOICE CONTROL UNAVAILABLE · HOTKEY CONTROL ACTIVE');return;}
      const child=spawn(this.helper,['--locale','en-GB'],{stdio:['ignore','pipe','pipe']});this.attach(child);return;
    }
    if(process.platform!=='win32'){this.onStatus('VOICE CONTROL UNAVAILABLE · HOTKEY CONTROL ACTIVE');return;}
    const grammar=this.grammar();
    const file=path.join(this.dir,'voice-grammar.json');fs.writeFileSync(file,JSON.stringify(grammar));
    this.attach(spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.scripts,'listen.ps1'),'-GrammarFile',file,'-Names',(this.names?.()||['jarvis']).map(n=>String(n).replace(/[^a-z ]/gi,'')).filter(Boolean).join(',')],{windowsHide:true,stdio:['ignore','pipe','pipe']}));
  }
  /** Read a listener's lines (PowerShell's, or jarvis-listen's on a Mac: the same lines). */
  attach(child){
    this.listener=child;this.onStatus('MICROPHONE STARTING');let buffer='';
    child.stdout.on('data',chunk=>{buffer+=chunk.toString();let idx;while((idx=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,idx);buffer=buffer.slice(idx+1);try{const item=JSON.parse(line);if(item.status){this.lastError=item.error||null;this.engine=item.engine||'';if(item.note)this.log('voice',item.note);if(item.error)this.log('voice',item.error);if(item.recognizer)this.recognizer=`${item.recognizer} (${item.culture})`;this.onStatus(item.error?`${item.status}\n${item.error}`:item.status);}else if(item.error){this.log('voice',item.error);}if(typeof item.level==='number'){this.level=item.level;this.onMeter?.({level:item.level});}if(item.clap){try{this.onClap?.(item);}catch{}}if(item.detected){this.lastDetected=Date.now();this.onMeter?.({detected:true});}if(item.audioState)this.audioState=item.audioState;if(item.text){this.lastHeard={text:item.text,confidence:item.confidence,time:Date.now()};const mine=Date.now()<=this.suppressedUntil;if(!item.rejected&&!mine&&item.confidence>=this.floor)this.onCommand(item.text,item.confidence,null,{low:item.confidence<this.threshold,dictation:!!item.dictation});else this.onCommand(null,item.confidence,item.text,{mine,rejected:!!item.rejected});}}catch{}}});
    child.stderr.on('data',d=>this.log('voice',String(d).slice(0,500)));
    child.on('error',e=>{this.log('voice',e.message);this.onStatus('VOICE CONTROL UNAVAILABLE · HOTKEY CONTROL ACTIVE');});
    child.on('exit',()=>{if(this.listener===child){this.listener=null;this.onStatus(this.enabled?'VOICE CONTROL UNAVAILABLE · HOTKEY CONTROL ACTIVE':'MICROPHONE OFF');}});
  }
  /** The Mac's say: a Mac voice (yours if you chose one, else Daniel), at JARVIS's rate and volume. */
  saySpawn(text,settings,profile){const v=settings.voiceName&&!/microsoft|desktop/i.test(settings.voiceName)?settings.voiceName:(profile?.prefer||[]).find(p=>MAC_VOICES.includes(p))||MAC_VOICES[0];const vol=Math.max(0,Math.min(1,settings.master*settings.voice));return spawn('say',['-v',v,'-r',String(macRate(profile?.rate)),'--',`[[volm ${vol.toFixed(2)}]] ${text}`],{stdio:['ignore','ignore','pipe']});}
  speak(text,settings,profile,soundFile,opts={}){
    if(process.platform==='darwin'&&settings.master*settings.voice>0){
      if(this.speaker)this.speaker.kill();
      this.suppressedUntil=Date.now()+(opts.listenThrough?350:Math.max(2500,text.length*85));
      const names={'System starting up.':'startup.wav','Standing by.':'standby.wav'},wav=soundFile||(names[text]?path.join(this.assets,'voice',names[text]):null);
      const child=wav&&fs.existsSync(wav)?spawn('afplay',['-v',String(Math.max(0,Math.min(1,settings.master*settings.voice))),wav],{stdio:['ignore','ignore','pipe']}):this.saySpawn(text,settings,profile);
      this.speaker=child;child.on('error',e=>this.log('speech',e.message));child.stderr?.on('data',d=>this.log('speech',String(d).slice(0,400)));
      child.on('exit',()=>{if(this.speaker===child)this.speaker=null;if(!opts.listenThrough)this.suppressedUntil=Math.max(this.suppressedUntil,Date.now()+700);});
      return;
    }
    if(process.platform!=='win32'||settings.master*settings.voice===0)return;
    if(this.speaker)this.speaker.kill();
    let ms=Math.max(2500,text.length*85);
    if(soundFile){try{const b=fs.readFileSync(soundFile);const rate=b.readUInt32LE(24),ch=b.readUInt16LE(22),bits=b.readUInt16LE(34);
      const data=Math.max(0,b.length-44);ms=Math.max(ms,Math.round(data/(rate*ch*bits/8)*1000)+900);}catch{ms=Math.max(ms,15000);}}
    this.suppressedUntil=Date.now()+(opts.listenThrough?350:ms);   // never listen to our own voice, except a short 'Yes, sir?', which can't be mistaken for a command, so a command said over it still counts
    const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.scripts,'speak.ps1')],{windowsHide:true,stdio:['pipe','ignore','pipe']});this.speaker=child;child.on('close',()=>{if(!opts.listenThrough)this.suppressedUntil=Math.max(this.suppressedUntil,Date.now()+700);});
    child.on('error',e=>this.log('speech',e.message));child.stderr.on('data',d=>this.log('speech',String(d).slice(0,400)));
    const names={'System starting up.':'startup.wav','Standing by.':'standby.wav'};const candidate=soundFile||(names[text]?path.join(this.assets,'voice',names[text]):null);
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({text,voice:settings.voiceName,prefer:profile?.prefer||[],rate:typeof profile?.rate==='number'?profile.rate:-1,volume:Math.round(100*settings.master*settings.voice),soundFile:candidate&&fs.existsSync(candidate)?candidate:null}));
    child.on('exit',()=>{if(this.speaker===child)this.speaker=null;});
  }
  /** Several lines spoken as one, for the cinematic briefing: onMark(i) as line i starts, onEnd() when it stops. False when muted or not on Windows. */
  speakParts(parts,settings,profile,{onMark=()=>{},onEnd=()=>{}}={}){
    if(process.platform==='darwin'&&settings.master*settings.voice>0&&parts.length){   // one say per line, so each line's start is known
      if(this.speaker)this.speaker.kill();const run=this.partsRun=Symbol('parts');
      this.suppressedUntil=Date.now()+Math.max(2500,parts.join(' ').length*85+parts.length*450);
      const next=i=>{if(this.partsRun!==run)return;if(i>=parts.length){this.speaker=null;this.suppressedUntil=Math.min(this.suppressedUntil,Date.now()+400);onEnd();return;}
        onMark(i);const child=this.saySpawn(parts[i],settings,profile);this.speaker=child;child.on('error',e=>{this.log('speech',e.message);next(parts.length);});child.on('exit',code=>{if(this.partsRun===run)next(code===0?i+1:parts.length);});};
      next(0);return true;
    }
    if(process.platform!=='win32'||settings.master*settings.voice===0||!parts.length)return false;
    if(this.speaker)this.speaker.kill();
    this.suppressedUntil=Date.now()+Math.max(2500,parts.join(' ').length*85+parts.length*450);
    const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.scripts,'speak.ps1')],{windowsHide:true,stdio:['pipe','pipe','pipe']});this.speaker=child;
    let buffer='';child.stdout.on('data',chunk=>{buffer+=chunk.toString();let i;while((i=buffer.indexOf('\n'))>=0){const m=/^MARK (\d+)/.exec(buffer.slice(0,i).trim());buffer=buffer.slice(i+1);if(m)onMark(Number(m[1]));}});
    child.on('error',e=>this.log('speech',e.message));child.stderr.on('data',d=>this.log('speech',String(d).slice(0,400)));
    child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({parts,voice:settings.voiceName,prefer:profile?.prefer||[],rate:typeof profile?.rate==='number'?profile.rate:-1,volume:Math.round(100*settings.master*settings.voice)}));
    child.on('exit',()=>{if(this.speaker===child){this.speaker=null;this.suppressedUntil=Math.min(this.suppressedUntil,Date.now()+400);}onEnd();});   // finished early: listen again straight away
    return true;
  }
  /** Stop talking now. */
  hush(){this.partsRun=null;if(this.speaker){this.speaker.kill();this.speaker=null;}this.suppressedUntil=Math.min(this.suppressedUntil,Date.now()+300);}
  diagnose(){
    if(process.platform==='darwin')return new Promise(resolve=>{const child=spawn('say',['-v','?'],{stdio:['ignore','pipe','ignore']});let out='';child.stdout.on('data',d=>out+=d);child.on('close',()=>resolve({platform:'darwin',helper:!!this.helper&&fs.existsSync(this.helper),voices:out.split('\n').filter(l=>/en_GB|en_US/.test(l)).map(l=>l.split(/\s{2,}/)[0]).slice(0,20),listening:!!this.listener}));child.on('error',e=>resolve({platform:'darwin',error:e.message}));});
    if(process.platform!=='win32')return Promise.resolve({platform:process.platform,note:'Voice diagnostics only run on Windows and on a Mac.'});
    return new Promise(resolve=>{const child=spawn('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.scripts,'listen.ps1'),'-Diagnose'],{windowsHide:true,stdio:['ignore','pipe','pipe']});let out='',err='';child.stdout.on('data',d=>out+=d);child.stderr.on('data',d=>err+=d);const done=()=>{try{resolve({...JSON.parse(out.trim().split('\n').pop()),listener:this.listener?'running':'stopped',status:this.lastError||null,engine:this.engine||null});}catch{resolve({raw:out.slice(0,2000),stderr:err.slice(0,1000)});}};child.on('error',e=>resolve({error:e.message}));child.on('exit',done);setTimeout(()=>{try{child.kill();}catch{}},20000);});
  }
  dispose(){this.enabled=false;this.listener?.kill();this.speaker?.kill();}
}
