import {execFile} from 'node:child_process';
import path from 'node:path';

/** Only explicit call-ended screens count. Silence, window closure and an unreadable UI are not proof. */
export class CallEndTracker {
  constructor() { this.source = null; this.endedSince = 0; }
  sample(rows, now = Date.now()) {
    if (!this.source) this.source = rows.find(r => r.active)?.id || null;
    const r = rows.find(r => r.id === this.source);
    if (!r || r.active || !r.ended) { this.endedSince = 0; return false; }
    if (!this.endedSince) this.endedSince = now;
    return now - this.endedSince >= 15000;
  }
}
export function webCallState() {
  const labels = [...document.querySelectorAll('button,[role=button],[role=heading],h1,h2,[role=alert]')].slice(0, 2000).filter(e => e.getClientRects().length).map(e => (e.getAttribute('aria-label') || e.innerText || '').trim());
  return {active: labels.some(t => /^(leave|leave meeting|leave call|end meeting|end call)(\b|$)/i.test(t)), ended: labels.some(t => /you(?:'ve| have)? left (?:the )?(meeting|call)|meeting (?:has )?ended|call (?:has )?ended|rejoin (?:the )?(meeting|call)/i.test(t))};
}
export class CallWatcher {
  constructor({scripts, tabs, onEnd, log}) { Object.assign(this, {scripts, tabs, onEnd, log}); this.epoch = 0; }
  start() { this.stop(); this.tracker = new CallEndTracker(); this.timer = setInterval(() => this.poll(), 5000); this.poll(); }
  stop() { this.epoch++; clearInterval(this.timer); this.timer = null; }
  async poll() {
    if (this.busy || !this.timer) return; this.busy = true; const epoch = this.epoch;
    try {
      const rows = [];
      if (process.platform === 'win32') {
        const native = await new Promise(resolve => execFile('powershell.exe', ['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(this.scripts,'meeting-state.ps1')], {windowsHide:true,timeout:4000,maxBuffer:65536}, (e, out) => { try { resolve(e ? [] : [].concat(JSON.parse(out))); } catch { resolve([]); } }));
        rows.push(...native);
      }
      for (const t of (this.tabs()?.tabs || [])) {
        const wc = t.view?.webContents; if (!wc || wc.isDestroyed()) continue;
        let u; try { u = new URL(wc.getURL()); } catch { continue; }
        if (u.protocol !== 'https:' || !/(^|\.)(teams\.microsoft\.com|teams\.live\.com|teams\.cloud\.microsoft|zoom\.us)$/.test(u.hostname)) continue;
        let timeout;
        try { const r = await Promise.race([wc.executeJavaScript('('+webCallState.toString()+')()',false),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('Call screen unavailable')),1800);})]); rows.push({id:'tab:'+t.id,...r}); } catch {} finally {clearTimeout(timeout);}
      }
      if (epoch === this.epoch && this.timer && this.tracker.sample(rows)) { this.stop(); await this.onEnd(); }
    } catch (e) { this.log?.('meeting', 'Call end check: '+e.message); }
    finally { this.busy = false; }
  }
}
