import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * The brains behind the tower's agents.
 *  - api:         the Claude API (your Anthropic API key). Quick, structured; used for planning and sign-off.
 *  - claude-code: the Claude Code app on this computer, run in the floor's folder. It can read the floor's
 *                 knowledge files and write documents there. Used for the hands-on work.
 *  - rehearsal:   no AI at all. Shows how a run flows with placeholder output, until an engine is connected.
 */
const API_URL = 'https://api.anthropic.com/v1/messages';
/** USD per million tokens (input, output), for the budget meter's estimate. */
const PRICES = {haiku: [1, 5], sonnet: [3, 15], opus: [15, 75], fable: [15, 75]};

export async function callApi({key, model, system, prompt, web = false, maxTokens = 4000, signal}) {
  if (!key) throw Error('No Claude API key set. Add one in the tower\'s Engines settings.');
  const body = {model, max_tokens: maxTokens, system, messages: [{role: 'user', content: prompt}]};
  if (web) body.tools = [{type: 'web_search_20250305', name: 'web_search', max_uses: 6}];
  let res, tries = 0;
  for (;;) {
    // stoppable by the user AND still timed out: a hung request used to hold the floor forever
    res = await fetch(API_URL, {method: 'POST', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(300000)]) : AbortSignal.timeout(300000),
      headers: {'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01'}, body: JSON.stringify(body)});
    if ((res.status === 429 || res.status === 529 || res.status >= 500) && tries++ < 3) { await new Promise(r => setTimeout(r, 4000 * tries)); continue; }
    break;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Error(`Claude API ${res.status}: ${data?.error?.message || res.statusText}`);
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) throw Error('Claude API returned no text.');
  const u = data.usage || {};
  const price = PRICES[Object.keys(PRICES).find(k => String(model).includes(k))] || PRICES.sonnet;
  const cost = ((u.input_tokens || 0) * price[0] + (u.output_tokens || 0) * price[1]) / 1e6 + (u.server_tool_use?.web_search_requests || 0) * 0.01;
  return {text, usage: u, cost};
}

let codeProbe = null;
/** Claude Code's command: its own install folder when it is there (the installer does not always add that folder to PATH), else whatever PATH finds. */
const CLAUDE = (() => { const own = path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude'); return fs.existsSync(own) ? '"' + own + '"' : 'claude'; })();
/** Is Claude Code installed and on the PATH? (checked once, then remembered) */
export function detectClaudeCode(force = false) {
  if (codeProbe && !force) return codeProbe;
  codeProbe = new Promise(resolve => {
    let out = '', done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    try {
      const child = spawn(CLAUDE, ['--version'], {shell: true, windowsHide: true});
      child.stdout.on('data', d => { out += d; });
      child.on('error', () => finish({ready: false, reason: 'Claude Code is not installed on this computer.'}));
      child.on('close', code => finish(code === 0 && /\d+\.\d+/.test(out) ? {ready: true, version: out.trim().split(/\s+/)[0]} : {ready: false, reason: 'Claude Code is not installed on this computer.'}));
      setTimeout(() => { try { child.kill(); } catch {} finish({ready: false, reason: 'Claude Code did not answer.'}); }, 15000);
    } catch (e) { finish({ready: false, reason: e.message}); }
  });
  return codeProbe;
}

/**
 * Run one agent turn through Claude Code, in the floor's folder. The prompt goes in on stdin (no length
 * limit), the answer comes back on stdout. It may read files and write new ones in that folder, and search
 * the web if the floor allows it, but it has no shell: it cannot run commands, send mail or install anything.
 */
/**
 * Agents are fenced into their floor's folder: they may read and write there, and nowhere else
 * (tested: a read of any other path is refused). No shell, and no searching the rest of the disk.
 */
function fenceFile(dir, web) {
  const file = path.join(dir || os.tmpdir(), web ? 'tower-agent-web.json' : 'tower-agent.json');
  const allow = ['Read(./**)', 'Edit(./**)', ...(web ? ['WebSearch', 'WebFetch'] : [])];
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, JSON.stringify({permissions: {allow, deny: ['Bash', 'Glob', 'Grep', 'NotebookEdit', ...(web ? [] : ['WebSearch', 'WebFetch'])]}}, null, 1));
  return file;
}
const q = a => /[\s"&|<>^()]/.test(a) ? `"${String(a).replace(/"/g, '\\"')}"` : a;   // arguments go through the shell (claude may be a .cmd)
/**
 * Claude Code streams what it is doing (stream-json): every file it reads or writes, every web search,
 * and its text as it goes. That feeds the desk cams. The last line carries the answer and what it cost.
 */
const base = p => String(p || '').split(/[\\/]/).pop();
function describeTool(c) {
  const i = c.input || {};
  if (c.name === 'Read') return `Reading ${base(i.file_path)}`;
  if (c.name === 'Write') return `Writing ${base(i.file_path)}`;
  if (c.name === 'Edit') return `Editing ${base(i.file_path)}`;
  if (c.name === 'WebSearch') return `Searching the web: ${String(i.query || '').slice(0, 90)}`;
  if (c.name === 'WebFetch') return `Reading ${String(i.url || '').replace(/^https?:\/\//, '').slice(0, 80)}`;
  return `${c.name}`;
}
export function callClaudeCode({cwd, prompt, model = 'sonnet', web = false, maxTurns = 14, onLine, onEvent, register, settingsDir}) {
  return new Promise((resolve, reject) => {
    const args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', model, '--max-turns', String(maxTurns), '--settings', fenceFile(settingsDir, web)];
    let child;
    try { child = spawn(CLAUDE, args.map(q), {cwd, shell: true, windowsHide: true, detached: process.platform !== 'win32'}); }
    catch (e) { reject(Error('Claude Code could not start: ' + e.message)); return; }
    register?.(child);
    let buf = '', err = '', result = null, draft = '';
    const timer = setTimeout(() => { killTree(child); reject(Error('Claude Code took longer than 20 minutes.')); }, 20 * 60000);
    const line = l => {
      let o; try { o = JSON.parse(l); } catch { return; }
      if (o.type === 'assistant') for (const c of o.message?.content || []) {
        if (c.type === 'tool_use') { const d = describeTool(c); onLine?.(d); onEvent?.({kind: 'tool', text: d}); }
        else if (c.type === 'text' && c.text) { draft += (draft ? '\n\n' : '') + c.text; onLine?.(c.text.replace(/\s+/g, ' ').slice(0, 160)); onEvent?.({kind: 'text', text: c.text.slice(0, 400), draft}); }
      }
      else if (o.type === 'result') result = o;
    };
    child.stdout.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (l) line(l); } });
    child.stderr.on('data', d => { err += d; });
    child.on('error', e => { clearTimeout(timer); reject(Error('Claude Code could not start: ' + e.message)); });
    child.on('close', code => {
      clearTimeout(timer); if (buf.trim()) line(buf.trim());
      if (child.stoppedByUser) return reject(Error('Stopped.'));
      const cost = Number(result?.total_cost_usd) || 0;
      if (result && !result.is_error && String(result.result || draft).trim()) resolve({text: String(result.result || draft).trim(), cost});
      else reject(Error(`Claude Code stopped (${result?.subtype || code}). ${String(result?.result || err || '').trim().split(/\r?\n/).slice(-3).join(' ').slice(0, 400)}`));
    });
    child.stdin.end(prompt);
  });
}

export function killTree(child) {
  if (!child) return;
  child.stoppedByUser = true;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {windowsHide: true}).on('error', () => { try { child.kill(); } catch {} });   // an unhandled 'error' here would crash the app
    else process.kill(-child.pid, 'SIGTERM');
  } catch { try { child.kill(); } catch {} }
}

/* ------------------------------------------------------------------ rehearsal: no AI, shows the flow */
const wait = (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal?.addEventListener('abort', () => { clearTimeout(t); rej(Error('Stopped.')); }); });
export async function rehearse({kind, floor, agent, task, step, steps, signal}) {
  await wait(1800 + Math.random() * 2600, signal);
  const note = '> **Rehearsal** — no AI engine is connected yet, so this is placeholder text showing the shape of the work. Connect Claude in the tower\'s Engines settings to run it for real.';
  if (kind === 'plan') {
    const team = floor.agents.filter(a => a.role === 'specialist');
    return {text: JSON.stringify({summary: `Split "${task.slice(0, 80)}" across the team.`,
      steps: team.slice(0, 4).map((a, i) => ({agent: a.id, title: `${a.title}: ${['gather what we need', 'draft the main piece', 'prepare the supporting material', 'polish the details'][i % 4]}`, instructions: `Do your part of: ${task}`, after: i === 0 ? [] : [team[0].id]}))})};
  }
  if (kind === 'route') return {text: JSON.stringify({floor: floor.id, reason: 'Best match for the skills this task needs.'})};
  if (kind === 'review') return {text: `VERDICT: APPROVED\nNOTES: ${agent.name === 'J. Jonah Jameson' ? 'It\'s not a Pulitzer, but it\'ll run. Next time, get me the numbers FIRST!' : 'Clear and complete. Ready to use.'}\n---\n# ${task.slice(0, 90)}\n\n${note}\n\n${(steps || []).map(s => `## ${s.title}\n${s.excerpt || ''}`).join('\n\n')}`};
  return {text: `${note}\n\n## ${step.title}\n\n**${agent.name}, ${agent.title}**\n\n- What I would do: ${step.instructions}\n- Using the floor brief: ${floor.purpose.slice(0, 160)}…\n- Output would be saved in this run's folder.`};
}
