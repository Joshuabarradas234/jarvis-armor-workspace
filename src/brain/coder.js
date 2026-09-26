/**
 * JARVIS Core — the coder: makes one change to JARVIS's own code, inside the workshop copy only.
 * Uses Claude Code if it is installed on this computer (it is fenced into the workshop folder and has no shell),
 * otherwise Claude through the API with a small set of file tools that cannot reach outside the workshop.
 * Nothing it writes is used until selfupdate.js has checked it and you have approved it.
 */
import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {runAgent} from './llm.js';
import {CLAUDE, callClaudeCode, detectClaudeCode} from '../tower/engines.js';
import {PROTECTED} from './selfupdate.js';

const SKIP = /^(dist\/vendor|dist\/wallpaper|node_modules)\//;
const TEXT = /\.(js|mjs|cjs|json|css|html?|md|txt|svg)$/i;

export function coderRules() {
  return `RULES
- Make the smallest change that fully does the job, and keep everything else working exactly as before.
- Match the style around you: compact modern JavaScript, British English for anything the user sees.
- Plain JavaScript only. No new npm packages, no build step: every file runs exactly as written.
- Never change these files: ${PROTECTED.join(', ')}.
- Never weaken approvals, permissions, the Content-Security-Policy, the preload bridge or any safety check. Never add calls to new outside services unless the task asks for it.
- Never make this computer reachable from the internet: no tunnels, no port forwarding, no servers listening on anything but 127.0.0.1.
- Never change how approvals, request codes, digests or self-updates work: changes to those lines are refused automatically.
- Plain characters only: no invisible or right-to-left characters in code, and no line longer than 2000 characters.
- src/main/main.js must keep calling globalThis.__jarvisBoot?.markGood?.() once the main screen is ready.
- Avoid editing the minified bundle dist/assets/index-*.js. For new screens or buttons, add a new file in dist/assets/ and load it from dist/index.html with <script type="module">, like tower.js and deck.js do; talk to the main process with window.jarvis.call(method, payload), and add the method to the api() switch in src/main/main.js.
- When you are done, reply with a short summary: what you changed, in which files, and how Joshua will notice it.`;
}
const guide = dir => { try { return fs.readFileSync(path.join(dir, 'src/brain/ARCHITECTURE.md'), 'utf8').slice(0, 24000); } catch { return ''; } };

function inside(dir, p) {
  const full = path.resolve(dir, String(p || '.').replace(/^\/+/, ''));
  if (full !== dir && !full.startsWith(dir + path.sep)) throw Error('That path is outside the workshop.');
  return full;
}
const relOf = (dir, full) => path.relative(dir, full).split(path.sep).join('/');

/** File tools fenced into `dir`. */
export function fileTools(dir) {
  const guard = r => {
    if (PROTECTED.includes(r)) throw Error(`${r} is protected; change something else.`);
    if (!/^(src|dist|config)\//.test(r)) throw Error('Only files under src/, dist/ or config/ may be changed.');
    if (/(^|\/)\.|^dist\/vendor\/|^dist\/wallpaper\/|(^|\/)node_modules\/|[:<>"|?*\\]/i.test(r)) throw Error('Hidden files, odd characters, dist/vendor and dist/wallpaper are off limits.');
    if (PROTECTED.includes(r.toLowerCase())) throw Error(`${r} is protected; change something else.`);
  };
  const walk = (base, depth, out = [], sub = '') => {
    if (depth < 0) return out;
    for (const name of fs.readdirSync(path.join(base, sub)).sort()) {
      const r = sub ? `${sub}/${name}` : name; if (SKIP.test(r + '/') || name.startsWith('.')) continue;
      const st = fs.statSync(path.join(base, r));
      if (st.isDirectory()) { out.push(r + '/'); walk(base, depth - 1, out, r); } else out.push(`${r} (${st.size < 2048 ? st.size + ' B' : Math.round(st.size / 1024) + ' KB'})`);
    }
    return out;
  };
  return [
    {name: 'list_files', description: 'List files and folders (relative to the app root).', input_schema: {type: 'object', properties: {path: {type: 'string', description: 'Folder, e.g. "src/brain". Default: the app root.'}, depth: {type: 'integer', description: 'How deep to go (default 2).'}}},
      run: ({path: p = '.', depth = 2}) => { const full = inside(dir, p); return walk(full, Math.min(4, depth)).map(x => (p === '.' ? '' : relOf(dir, full) + '/') + x).join('\n').slice(0, 20000) || '(empty)'; }},
    {name: 'read_file', description: 'Read a file with line numbers. Very long lines (minified code) are cut; use search to find things in them.', input_schema: {type: 'object', properties: {path: {type: 'string'}, start_line: {type: 'integer'}, end_line: {type: 'integer'}}, required: ['path']},
      run: ({path: p, start_line = 1, end_line}) => {
        const full = inside(dir, p); const lines = fs.readFileSync(full, 'utf8').split('\n');
        const a = Math.max(1, start_line), b = Math.min(lines.length, end_line || a + 399);
        return `${relOf(dir, full)} — lines ${a}-${b} of ${lines.length}\n` + lines.slice(a - 1, b).map((l, i) => `${String(a + i).padStart(5)}  ${l.length > 1500 ? l.slice(0, 1500) + ` …(line continues, ${l.length} chars)` : l}`).join('\n');
      }},
    {name: 'search', description: 'Find a piece of text in the code (plain text, not a pattern; not case-sensitive). Returns file:line: text.', input_schema: {type: 'object', properties: {text: {type: 'string', description: 'The text to look for'}, path: {type: 'string', description: 'Folder or file to search (default: everything).'}}, required: ['text']},
      run: ({text, pattern, path: p = '.'}) => {
        const needle = String(text ?? pattern ?? '').toLowerCase(); if (!needle) throw Error('Give some text to look for.');
        const base = inside(dir, p); const out = [];
        const scan = f => { const r = relOf(dir, f); if (SKIP.test(r) || !TEXT.test(f)) return; const lines = fs.readFileSync(f, 'utf8').split('\n'); lines.forEach((l, i) => { if (out.length >= 80) return; const at = l.toLowerCase().indexOf(needle); if (at >= 0) { const from = Math.max(0, at - 90); out.push(`${r}:${i + 1}: ${l.length > 220 ? (from ? '…' : '') + l.slice(from, from + 220) + '…' : l}`); } }); };
        const go = f => { const st = fs.lstatSync(f); if (st.isSymbolicLink()) return; if (st.isDirectory()) { for (const n of fs.readdirSync(f)) if (!n.startsWith('.')) go(path.join(f, n)); } else scan(f); };
        go(base); return out.length ? out.join('\n') : 'No matches.';
      }},
    {name: 'edit_file', description: 'Replace one exact piece of text in a file. old_text must appear exactly once; include enough surrounding text to make it unique.', input_schema: {type: 'object', properties: {path: {type: 'string'}, old_text: {type: 'string'}, new_text: {type: 'string'}}, required: ['path', 'old_text', 'new_text']},
      run: ({path: p, old_text, new_text}) => {
        const full = inside(dir, p); const r = relOf(dir, full); guard(r);
        const text = fs.readFileSync(full, 'utf8'); const i = text.indexOf(old_text);
        if (!old_text || i < 0) throw Error('old_text was not found. Read the file again and copy the text exactly.');
        if (text.indexOf(old_text, i + old_text.length) >= 0) throw Error('old_text appears more than once. Include more surrounding text.');
        fs.writeFileSync(full, text.slice(0, i) + new_text + text.slice(i + old_text.length)); return `Edited ${r}.`;
      }},
    {name: 'create_file', description: 'Create a new file (or replace a whole small file).', input_schema: {type: 'object', properties: {path: {type: 'string'}, content: {type: 'string'}}, required: ['path', 'content']},
      run: ({path: p, content}) => { const full = inside(dir, p); const r = relOf(dir, full); guard(r); if (String(content).length > 400000) throw Error('Too big.'); fs.mkdirSync(path.dirname(full), {recursive: true}); fs.writeFileSync(full, String(content)); return `Wrote ${r} (${String(content).length} characters).`; }},
  ];
}

/** Flags that keep Claude Code to itself (no MCP servers, no personal hooks, settings or plugins). Without them it is not used. */
let isolationFlags = null;
function isolation() {
  if (isolationFlags) return isolationFlags;
  isolationFlags = new Promise(resolve => {
    let out = ''; let child;
    try { child = spawn(CLAUDE, ['--help'], {shell: true, windowsHide: true}); } catch { return resolve({args: [], budget: false}); }
    child.stdout.on('data', d => { out += d; }); child.on('error', () => resolve({args: [], budget: false}));
    child.on('close', () => resolve({args: /--strict-mcp-config/.test(out) && /--setting-sources/.test(out) ? ['--strict-mcp-config', '--setting-sources', 'project'] : [], budget: /--max-budget-usd/.test(out)}));
    setTimeout(() => { try { child.kill(); } catch {} resolve({args: [], budget: false}); }, 15000);
  });
  return isolationFlags;
}

/**
 * Make the change described in `task`, in the workshop folder `dir`.
 * engine: 'auto' | 'api' | 'claude-code'.  Returns {summary, cost, engine}.
 */
export async function makeChange({dir, task, context = '', engine = 'auto', key, model = 'claude-sonnet-5', codeModel = 'sonnet', budget = 3, signal, onEvent, log}) {
  let use = engine;
  if (use === 'auto') use = (await detectClaudeCode()).ready ? 'claude-code' : 'api';
  const brief = `You are improving JARVIS Armor Workspace, an Electron desktop app for Windows, by editing its source code in a sandbox copy (the current folder is the app root).\n\n${guide(dir)}\n\n${coderRules()}\n\nTASK\n${task}${context ? `\n\nBACKGROUND\n${context}` : ''}`;
  if (use === 'claude-code') {
    try {
      const noWrite = ['./src/main/boot.js', './src/main/preload.cjs', './src/brain/selfupdate.js', './src/brain/approvals.js', './package.json', './dist/vendor/**', './dist/wallpaper/**', './dist/Vendor/**', './dist/Wallpaper/**', './**/.*', './**/.*/**', './**/*:*'];
      const flags = await isolation();
      if (!flags.args.length) { isolationFlags = null; throw Error('this Claude Code cannot be kept away from your own settings, hooks and MCP servers (update it with: claude update)'); }
      const r = await callClaudeCode({cwd: dir, prompt: brief, model: codeModel, maxTurns: 50, timeoutMin: 30, settingsDir: path.dirname(dir), onEvent, extraArgs: [...flags.args, ...(flags.budget ? ['--max-budget-usd', String(Math.max(0.3, Math.min(5, budget)).toFixed(2))] : [])],
        fence: {allow: ['Read(./**)', 'Edit(./src/**)', 'Edit(./dist/**)', 'Edit(./config/**)', 'Write(./src/**)', 'Write(./dist/**)', 'Write(./config/**)', 'Glob(./**)', 'Grep(./**)'],
          deny: ['Bash', 'WebSearch', 'WebFetch', 'NotebookEdit', 'Task', 'Agent', ...noWrite.flatMap(p => [`Edit(${p})`, `Write(${p})`])]}});
      return {summary: r.text, cost: r.cost || 0, engine: 'claude-code'};
    } catch (e) { if (engine === 'claude-code' || !key) throw e; log?.('self-update', `Claude Code could not do it (${e.message}); using the API.`); }
  }
  if (!key) throw Error('No Claude API key, and Claude Code is not installed: I have nothing to write code with.');
  const r = await runAgent({key, model, system: brief, prompt: 'Make the change now. Look before you edit. When you are finished, reply with the summary.', tools: fileTools(dir), maxSteps: 45, maxTokens: 8000, budget, signal, onEvent});
  return {summary: r.text, cost: r.cost, engine: 'api', steps: r.steps};
}
