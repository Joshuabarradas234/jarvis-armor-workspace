import os from 'node:os';
import fs from 'node:fs';
/**
 * Live CPU / memory / disk readings for the hall and system panels, from Node's own
 * built-ins. This replaced the third-party `systeminformation` library, whose battery
 * reader (it shells out to Windows commands) was flagged by Microsoft Defender's cloud
 * scanner in September 2026. Nothing here runs an external command.
 * Anything not available this way is left null, and the screens show "Unavailable".
 */
function cpuTimes(){let idle=0,total=0;for(const c of os.cpus()){for(const v of Object.values(c.times))total+=v;idle+=c.times.idle;}return {idle,total};}
function storage(){
  const mounts=process.platform==='win32'?['C:\\']:['/'];
  const out=[];
  for(const m of mounts){try{const s=fs.statfsSync(m);out.push({mount:m.replace(/\\$/,''),fs:m,size:s.blocks*s.bsize,available:s.bavail*s.bsize});}catch{}}
  return out.length?out:null;
}
export class SystemMonitor {
  constructor(publish,active=()=>false){this.publish=publish;this.active=active;this.timer=null;this.running=false;this.stopped=false;this.static=null;this.history=[];this.ticks=0;this.slow={};this.last=null;}
  async start(){
    const c=os.cpus()[0];
    this.static={cpu:c?{manufacturer:'',brand:c.model.trim(),cores:os.cpus().length,speed:c.speed/1000}:null,graphics:null,os:{platform:process.platform,release:os.release(),arch:os.arch()}};
    this.last=cpuTimes();
    this.poll();
  }
  async poll(){
    if(this.running||this.stopped)return;this.running=true;
    try{
      const now=cpuTimes();let cpu=null;
      if(this.last){const dt=now.total-this.last.total,di=now.idle-this.last.idle;if(dt>0)cpu=Math.max(0,Math.min(100,100*(1-di/dt)));}
      this.last=now;
      const total=os.totalmem(),free=os.freemem();
      const memory={total,available:free,free,used:total-free};
      if(this.ticks++%5===0)this.slow={storage:storage(),temp:null,graphics:null,processes:null};
      this.history.push({time:Date.now(),cpu,ram:100*(total-free)/total});if(this.history.length>60)this.history.shift();
      this.publish({timestamp:Date.now(),cpu,memory,battery:null,network:null,hardware:this.static,history:[...this.history],...this.slow});
    }finally{this.running=false;if(!this.stopped)this.timer=setTimeout(()=>this.poll(),this.active()?2500:15000);}
  }
  stop(){this.stopped=true;clearTimeout(this.timer);}
}
