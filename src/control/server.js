import http from 'node:http';
import crypto from 'node:crypto';

/**
 * A small server on the loopback interface only. The control deck is a normal
 * web page so it can live in a bay's tab, and a bay tab has no IPC bridge.
 * Every request must carry the token, so nothing else on the machine can read
 * or drive it.
 */
export class ControlServer {
  constructor({ missions, runner, board, run, hallName, changed, log }) {
    Object.assign(this, { missions, runner, board, run, log: log || (() => {}) });
    this.changed = changed || (() => {});   // tells the JARVIS screens that a bay was edited here
    this.hallName = hallName || (id => id);
    this.token = crypto.randomBytes(24).toString('hex');
    this.clients = new Set();
    this.port = null;
  }

  url(theme) { return `http://127.0.0.1:${this.port}/?k=${this.token}&hall=${encodeURIComponent(theme)}`; }

  async listen() {
    this.server = http.createServer((req, res) => this.route(req, res));
    await new Promise(resolve => this.server.listen(0, '127.0.0.1', resolve));
    this.port = this.server.address().port;
    this.log('control', `deck on 127.0.0.1:${this.port}`);
    return this.port;
  }

  close() { for (const c of this.clients) { try { c.end(); } catch { /* going down */ } } this.server?.close(); }

  /** Tell every open deck that something moved. */
  push(payload) {
    const line = `data: ${JSON.stringify(payload)}\n\n`;
    for (const c of this.clients) { try { c.write(line); } catch { this.clients.delete(c); } }
  }

  async route(req, res) {
    const u = new URL(req.url, `http://127.0.0.1:${this.port}`);
    // the browser asks for this on its own and carries no key; answering it keeps the console clean
    if (u.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (u.searchParams.get('k') !== this.token && req.headers['x-deck-key'] !== this.token) {
      res.writeHead(403).end('forbidden'); return;
    }
    const hall = u.searchParams.get('hall') || '';
    try {
      if (u.pathname === '/') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(PAGE); return;
      }
      if (u.pathname === '/api/board') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ hall, bays: this.board(hall) })); return;
      }
      if (u.pathname === '/api/events') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write('retry: 2000\n\n');
        this.clients.add(res);
        req.on('close', () => this.clients.delete(res));
        return;
      }
      if (u.pathname === '/api/report') {
        const bays = this.board(hall);
        const when = new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
        const pct = bays.length ? Math.round(bays.reduce((a, b) => a + b.progress, 0) / bays.length) : 0;
        const ago = t => { if (!t) return 'never'; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`; };
        const L = [`# ${this.hallName(hall)} — status`, '', `${when} · ${bays.length} bays · ${pct}% overall`, ''];
        for (const g of ['running', 'blocked', 'done', 'planned', 'idle']) {
          const rows = bays.filter(b => b.status === g);
          if (!rows.length) continue;
          L.push(`## ${g[0].toUpperCase() + g.slice(1)} (${rows.length})`, '');
          for (const b of rows) {
            L.push(`**${b.name}** — ${b.progress}%${b.tasksTotal ? `, ${b.tasksDone}/${b.tasksTotal} tasks` : ''}, last run ${ago(b.startedAt)}`);
            if (b.objective) L.push(`> ${b.objective.replace(/\n+/g, ' ')}`);
            for (const t of b.tasks) L.push(`- [${t.done ? 'x' : ' '}] ${t.text}`);
            if (g === 'blocked' && b.log.length) L.push(`- _last log:_ ${b.log[b.log.length - 1].line}`);
            L.push('');
          }
        }
        res.writeHead(200, { 'content-type': 'text/markdown; charset=utf-8' });
        res.end(L.join('\n')); return;
      }
      if (req.method === 'POST' && (u.pathname === '/api/bay' || u.pathname === '/api/run' || u.pathname === '/api/stop')) {
        const body = await this.body(req);
        if (u.pathname === '/api/bay') this.missions.set(hall, body.id, body.patch || {});
        if (u.pathname === '/api/run') this.run(hall, body.id);
        if (u.pathname === '/api/stop') this.runner.stop(hall, body.id);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, bays: this.board(hall) }));
        this.push({ hall }); this.changed(hall); return;
      }
      res.writeHead(404).end('not found');
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  }

  body(req) {
    return new Promise((resolve, reject) => {
      let raw = '';
      req.on('data', d => { raw += d; if (raw.length > 64_000) { reject(Error('Too much data.')); req.destroy(); } });   // stop reading, not just stop listening
      req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(Error('Bad request.')); } });
    });
  }
}

const PAGE = `<!doctype html><html><head><meta charset="utf-8"><title>Control Deck</title><style>
:root{--line:#1d2b38;--muted:#7d97a8;--text:#dceaf5;--accent:#6fc8f5;--bg:#070c12}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:14px Segoe UI,system-ui,sans-serif}
header{display:flex;align-items:baseline;gap:14px;padding:18px 22px 10px}
#rep{margin-left:auto}
h1{font:600 15px Consolas,monospace;letter-spacing:.22em;text-transform:uppercase;margin:0}
.sum{color:var(--muted);font:12px Consolas,monospace;letter-spacing:.1em}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px;padding:8px 22px 28px}
.bay{border:1px solid var(--line);border-radius:4px;background:#0b1219;padding:14px 15px 12px;display:flex;flex-direction:column;gap:9px}
.bay.running{border-color:#3fd68290;box-shadow:0 0 0 1px #3fd68225}
.top{display:flex;align-items:center;gap:9px}
.n{width:22px;height:22px;flex:0 0 auto;border-radius:50%;border:1px solid var(--accent);display:grid;place-items:center;font:700 11px Consolas,monospace;color:var(--accent)}
.nm{font-weight:600;flex:1}
.st{font:700 10px Consolas,monospace;letter-spacing:.14em;padding:3px 8px;border-radius:2px;text-transform:uppercase}
.st.idle{color:#8fa6b5;background:#8fa6b51f}.st.planned{color:#9ecbff;background:#9ecbff1f}
.st.running{color:#8ff0b8;background:#3fd68224}.st.blocked{color:#ff9b9b;background:#e0545424}.st.done{color:#c8f08f;background:#a8d86024}
textarea{width:100%;min-height:46px;resize:vertical;background:#070d13;color:var(--text);border:1px solid var(--line);border-radius:3px;padding:7px 8px;font:13px inherit}
.bar{height:6px;border-radius:3px;background:#101c26;overflow:hidden}
.bar i{display:block;height:100%;background:linear-gradient(90deg,#2f7fb8,var(--accent))}
.meta{display:flex;justify-content:space-between;color:var(--muted);font:11px Consolas,monospace}
ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;max-height:150px;overflow:auto}
li{display:flex;gap:7px;align-items:flex-start;font-size:13px}
li input{margin:2px 0 0}li span{flex:1}
li .del{border:0;background:none;color:var(--muted);padding:0 5px;font:15px/1 Segoe UI,sans-serif;letter-spacing:0;opacity:0;cursor:pointer}
li:hover .del{opacity:.8}li .del:hover{color:#ff9b9b;opacity:1}li.done span{color:var(--muted);text-decoration:line-through}
.add{display:flex;gap:6px}.add input{flex:1;background:#070d13;color:var(--text);border:1px solid var(--line);border-radius:3px;padding:6px 8px;font:13px inherit}
button{cursor:pointer;border:1px solid var(--line);background:#0e1922;color:var(--text);border-radius:3px;padding:6px 11px;font:600 11px Consolas,monospace;letter-spacing:.1em;text-transform:uppercase}
button:hover{border-color:var(--accent)}button.go{color:#8ff0b8;border-color:#3fd68266}button.stop{color:#ff9b9b;border-color:#e0545466}
.row{display:flex;gap:7px;align-items:center}
.log{font:11px Consolas,monospace;color:var(--muted);background:#060a0f;border:1px solid var(--line);border-radius:3px;padding:6px 8px;max-height:92px;overflow:auto;white-space:pre-wrap}
.agentrow input{width:100%;background:#070d13;color:#bfe6ff;border:1px solid var(--line);border-radius:3px;padding:6px 8px;font:12px Consolas,monospace}
.agentrow input:focus{outline:none;border-color:var(--accent)}
.agent{font:11px Consolas,monospace;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
</style></head><body>
<header><h1>Control Deck</h1><span class="sum" id="sum">reading bays…</span><button id="rep" type="button">Copy status report</button></header>
<div class="grid" id="grid"></div>
<script>
const P=new URLSearchParams(location.search),K=P.get('k'),HALL=P.get('hall')||'';
const api=(p,b)=>fetch(p+'?k='+K+'&hall='+encodeURIComponent(HALL),b?{method:'POST',headers:{'content-type':'application/json','x-deck-key':K},body:JSON.stringify(b)}:undefined).then(r=>r.json());
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ago=t=>{if(!t)return'never';const s=(Date.now()-t)/1000;if(s<60)return Math.round(s)+'s ago';if(s<3600)return Math.round(s/60)+'m ago';return Math.round(s/3600)+'h ago';};
let bays=[];
/**
 * Redrawing replaces the whole grid, so doing it while you are typing throws the
 * caret out of the box mid-word. The five-second poll used to do exactly that.
 * Anything pending is drawn the moment the field loses focus.
 */
let pending=false;
function busy(){const a=document.activeElement;
  return !!(a&&a.closest&&a.closest('#grid')&&/^(INPUT|TEXTAREA)$/.test(a.tagName)&&a.type!=='checkbox');}
function draw(){
  if(busy()){pending=true;return}
  pending=false;
  const run=bays.filter(b=>b.status==='running').length, done=bays.filter(b=>b.status==='done').length;
  const avg=bays.length?Math.round(bays.reduce((a,b)=>a+b.progress,0)/bays.length):0;
  document.getElementById('sum').textContent=\`\${bays.length} bays / \${run} running / \${done} done / \${avg}% overall\`;
  document.getElementById('grid').innerHTML=bays.map(b=>\`
   <div class="bay \${b.status}">
    <div class="top"><span class="n">\${b.index}</span><span class="nm">\${esc(b.name)}</span><span class="st \${b.status}">\${b.status}</span></div>
    <textarea data-obj="\${b.id}" placeholder="What is this bay for?">\${esc(b.objective)}</textarea>
    <div class="bar"><i style="width:\${b.progress}%"></i></div>
    <div class="meta"><span>\${b.tasksTotal?b.tasksDone+' of '+b.tasksTotal+' tasks':b.progress+'%'}</span><span>last run \${ago(b.startedAt)}</span></div>
    <ul>\${b.tasks.map((t,i)=>\`<li class="\${t.done?'done':''}"><input type="checkbox" data-task="\${b.id}" data-i="\${i}" \${t.done?'checked':''}><span>\${esc(t.text)}</span><button class="del" type="button" title="Delete this step" data-del="\${b.id}" data-i="\${i}">×</button></li>\`).join('')}</ul>
    <div class="add"><input data-new="\${b.id}" placeholder="Add a step, press enter"></div>
    <div class="agentrow"><input data-agent="\${b.id}" value="\${esc(b.agent)}" placeholder="Agent command, e.g. python C:\\\\agents\\\\research.py" spellcheck="false"></div>
    <div class="agentrow"><input data-env="\${b.id}" value="\${esc((b.env||'').replace(/\\n/g,'; '))}" placeholder="Environment, e.g. AWS_PROFILE=prod; AWS_REGION=eu-west-2" spellcheck="false"></div>
    <div class="row"><button class="go" data-run="\${b.id}" \${b.status==='running'?'disabled':''}>Run</button>
      <button class="stop" data-stop="\${b.id}" \${b.status==='running'?'':'disabled'}>Stop</button>
      <span class="agent">\${b.agent?'agent linked':'no agent yet'}</span></div>
    \${b.log.length?\`<div class="log">\${b.log.map(l=>esc(l.line)).join('\\n')}</div>\`:''}
   </div>\`).join('');
}
function fail(msg){document.getElementById('sum').textContent=msg}
async function load(){
  try{
    const r=await api('/api/board');
    if(!r||!Array.isArray(r.bays)){fail(r&&r.error?'could not read the bays — '+r.error:'could not read the bays');return}
    bays=r.bays||bays;draw();
  }catch(e){fail('lost the connection to JARVIS — '+e.message)}
}
document.addEventListener('change',async e=>{
  const c=e.target.closest('[data-task]');
  if(c){const b=bays.find(x=>x.id===c.dataset.task);b.tasks[+c.dataset.i].done=c.checked;
    const r=await api('/api/bay',{id:b.id,patch:{tasks:b.tasks}});bays=r.bays||bays;draw();}
});
document.addEventListener('keydown',async e=>{
  const n=e.target.closest('[data-new]');
  if(n&&e.key==='Enter'&&n.value.trim()){const b=bays.find(x=>x.id===n.dataset.new);
    const r=await api('/api/bay',{id:b.id,patch:{tasks:[...b.tasks,{text:n.value.trim(),done:false}]}});bays=r.bays||bays;draw();}
});
async function saveEnv(el){const v=el.value.split(';').map(x=>x.trim()).filter(Boolean).join('\\n');
  const r=await api('/api/bay',{id:el.dataset.env,patch:{env:v}});if(r.error)alert(r.error);else{bays=r.bays||bays;draw();}}
async function copyReport(){
  const md=await fetch('/api/report?k='+K+'&hall='+encodeURIComponent(HALL)).then(r=>r.text());
  const b=document.getElementById('rep');
  try{await navigator.clipboard.writeText(md);b.textContent='Copied';}
  catch(e){const t=document.createElement('textarea');t.value=md;document.body.appendChild(t);t.select();document.execCommand('copy');t.remove();b.textContent='Copied';}
  setTimeout(()=>{b.textContent='Copy status report'},1600);}
async function saveAgent(el){const r=await api('/api/bay',{id:el.dataset.agent,patch:{agent:el.value}});if(r.error)alert(r.error);else{bays=r.bays||bays;draw();}}
document.addEventListener('keydown',e=>{const a=e.target.closest('[data-agent],[data-env]');if(a&&e.key==='Enter'){e.preventDefault();a.blur();}});
document.addEventListener('focusout',async e=>{
  const a=e.target.closest('[data-agent]');if(a){await saveAgent(a);return;}
  const v=e.target.closest('[data-env]');if(v){await saveEnv(v);return;}
  const t=e.target.closest('[data-obj]');
  if(t){const r=await api('/api/bay',{id:t.dataset.obj,patch:{objective:t.value}});bays=r.bays||bays;draw();}
});
document.addEventListener('focusout',()=>{setTimeout(()=>{if(pending&&!busy())draw()},0)});
document.addEventListener('click',async e=>{
  const g=e.target.closest('[data-run]'),s=e.target.closest('[data-stop]');
  if(e.target.closest('#rep')){await copyReport();return}
  const d=e.target.closest('[data-del]');
  if(d){const b=bays.find(x=>x.id===d.dataset.del);const tasks=b.tasks.filter((_,i)=>i!==+d.dataset.i);
    const r=await api('/api/bay',{id:b.id,patch:{tasks}});bays=r.bays||bays;draw();return}
  if(g){const r=await api('/api/run',{id:g.dataset.run});if(r.error)alert(r.error);else{bays=r.bays||bays;draw()}}
  if(s){const r=await api('/api/stop',{id:s.dataset.stop});bays=r.bays||bays;draw()}
});
new EventSource('/api/events?k='+K+'&hall='+encodeURIComponent(HALL)).onmessage=load;
load();setInterval(load,5000);
</script></body></html>`;
