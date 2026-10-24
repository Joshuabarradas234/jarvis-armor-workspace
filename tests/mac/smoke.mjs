// Starts the built Mac app (release/mac-arm64 or release/mac, for the runner's chip) on a GitHub macOS runner and checks it really runs: the main process
// gets to the end of start-up, JARVIS Core starts, the hall's window loads, and nothing is logged as a crash.
// Run after scripts/release/build-mac.mjs. Mac only; it uses a fresh profile, so it never touches anyone's data.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const APP = path.join(ROOT, 'release', process.arch === 'arm64' ? 'mac-arm64' : 'mac', 'JARVIS Armor Workspace.app', 'Contents', 'MacOS', 'JARVIS Armor Workspace');   // this runner's own chip
const PROFILE = path.join(os.homedir(), 'Library', 'Application Support', 'jarvis-armor-workspace'), LOG = path.join(PROFILE, 'jarvis.log');
const PORT = 9333, sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0; const ok = (c, name, extra = '') => { console.log(`${c ? '  ✔' : '  ✘'} ${name}${extra ? ` (${extra})` : ''}`); if (!c) { failed++; console.log(`::error::${name}${extra ? `: ${extra}` : ''}`); } };
if (process.platform !== 'darwin') { console.log('Mac only.'); process.exit(0); }
if (!fs.existsSync(APP)) { console.log(`::error::Build the app first: ${APP} is missing`); process.exit(1); }

// a profile that has been through setup, so the hall opens rather than the first-run wizard
fs.rmSync(PROFILE, {recursive: true, force: true}); fs.mkdirSync(PROFILE, {recursive: true});
fs.writeFileSync(path.join(PROFILE, 'settings.json'), JSON.stringify({setupComplete: true, autoStart: true, wallpaper: false}));

const app = spawn(APP, [`--remote-debugging-port=${PORT}`], {stdio: ['ignore', 'pipe', 'pipe']});
let out = ''; app.stdout.on('data', d => out += d); app.stderr.on('data', d => out += d);
let exited = null; app.on('exit', (code, sig) => { exited = {code, sig}; });
const pages = async () => { try { return await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); } catch { return []; } };
const logText = () => { try { return fs.readFileSync(LOG, 'utf8'); } catch { return ''; } };

let list = [];
for (let i = 0; i < 90 && !exited; i++) { list = await pages(); if (list.some(p => /index\.html\?view=main/.test(p.url)) && /deck on/.test(logText())) break; await sleep(1000); }
await sleep(5000);   // let the timers that run soon after start-up have their go
list = await pages();
const log = logText().split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return {kind: '?', message: l}; } });

console.log('Mac start-up check:');
ok(!exited, 'the app is still running', exited ? `it exited with ${exited.code ?? exited.sig}` : '');
ok(log.some(l => /^deck on/.test(l.message || '')), 'the main process got through start-up (the deck server is on)');
ok(list.some(p => /index\.html\?view=main/.test(p.url)), 'the hall window loaded', list.map(p => p.url.replace(/^jarvis:\/\/app\//, '')).join(', ') || 'no pages');
const crashes = log.filter(l => l.kind === 'crash');
ok(!crashes.length, 'nothing logged as a crash', crashes.map(c => String(c.message).split('\n')[0]).join(' | ').slice(0, 600));
const brain = log.filter(l => l.kind === 'brain' && /did not start/.test(l.message || ''));
ok(!brain.length, 'JARVIS Core started', brain.map(b => b.message).join(' | ').slice(0, 400));
console.log('\nWhat JARVIS logged:'); for (const l of log.slice(0, 60)) console.log(`  [${l.kind}] ${String(l.message).split('\n')[0].slice(0, 200)}`);
if (failed) console.log('\nThe app printed:\n' + out.slice(-4000));

app.kill('SIGTERM'); await sleep(3000); if (!exited) app.kill('SIGKILL');
process.exit(failed ? 1 : 0);
