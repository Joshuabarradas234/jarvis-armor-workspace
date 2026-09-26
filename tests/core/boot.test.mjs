// Self-update boot test in real Electron: an approved update runs; a broken one rolls itself back.
import {spawn, execSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
const HERE = path.dirname(new URL(import.meta.url).pathname), BUILD = process.env.JARVIS_BUILD || path.resolve(HERE, '../..'), SCRATCH = process.env.JARVIS_TEST_DIR || path.join(os.tmpdir(), 'jarvis-core-test');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const PROFILE = path.join(BUILD, 'test-results', 'profile'), OUT = path.join(SCRATCH, 'boot');
fs.rmSync(OUT, {recursive: true, force: true}); fs.mkdirSync(OUT, {recursive: true});
const log = (...a) => { const l = a.join(' '); console.log(l); fs.appendFileSync(path.join(OUT, 'run.log'), l + '\n'); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const ok = (c, n, x = '') => { if (c) { pass++; log('  ✔', n); } else { fail++; log('  ✘', n, x); } };
const SELF = path.join(PROFILE, 'self');
const readState = () => JSON.parse(fs.readFileSync(path.join(SELF, 'state.json'), 'utf8'));
// a version = a copy of the app, like selfupdate.install() makes
const copy = (src, dst) => { for (const n of fs.readdirSync(src)) { if (['vendor', 'wallpaper', 'node_modules'].includes(n)) continue; const s = path.join(src, n), d = path.join(dst, n); if (fs.statSync(s).isDirectory()) { fs.mkdirSync(d, {recursive: true}); copy(s, d); } else fs.copyFileSync(s, d); } };
function makeVersion(id, edit) {
  const app = path.join(SELF, 'versions', id, 'app');
  for (const d of ['src', 'dist', 'config']) { fs.mkdirSync(path.join(app, d), {recursive: true}); copy(path.join(BUILD, d), path.join(app, d)); }
  fs.copyFileSync(path.join(BUILD, 'package.json'), path.join(app, 'package.json'));
  edit(app); return app;
}
// the list of files and fingerprints selfupdate.install() writes next to each version; boot.js checks it
const sealed = {};
function seal(id) {
  const app = path.join(SELF, 'versions', id, 'app'), list = {};
  const walk = sub => { for (const n of fs.readdirSync(path.join(app, sub))) { const r = sub ? `${sub}/${n}` : n; if (fs.statSync(path.join(app, r)).isDirectory()) walk(r); else list[r] = crypto.createHash('sha256').update(fs.readFileSync(path.join(app, r))).digest('hex'); } };
  walk(''); const text = JSON.stringify(list); fs.writeFileSync(path.join(SELF, 'versions', id, 'manifest.json'), text);
  return (sealed[id] = crypto.createHash('sha256').update(text).digest('hex'));
}
fs.rmSync(SELF, {recursive: true, force: true}); fs.mkdirSync(SELF, {recursive: true});
makeVersion('v1', app => { const f = path.join(app, 'dist/assets/core.js'); fs.writeFileSync(f, "document.documentElement.dataset.selfUpdateMarker = 'v1';\n" + fs.readFileSync(f, 'utf8')); });
makeVersion('v2', app => { const f = path.join(app, 'src/main/main.js'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace("const BOOT=globalThis.__jarvisBoot||null;", "const BOOT=globalThis.__jarvisBoot||null;throw new Error('update v2 is broken');")); });
makeVersion('v3', app => { const f = path.join(app, 'src/main/main.js'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace("globalThis.__jarvisBoot?.markGood?.();", "/* forgot to mark good */")); });
for (const id of ['v1', 'v2', 'v3']) seal(id);
const base = JSON.parse(fs.readFileSync(path.join(BUILD, 'package.json'), 'utf8')).version;
const V = (id, n, parent, title) => ({id, n, title, base, parent, created: Date.now() - (4 - n) * 1000, good: false, attempts: 0, manifest: sealed[id]});
const writeState = s => fs.writeFileSync(path.join(SELF, 'state.json'), JSON.stringify(s, null, 1));

const xvfb = spawn('Xvfb', [':97', '-screen', '0', '2560x1600x24', '-nolisten', 'tcp'], {detached: true, stdio: 'ignore'});
await sleep(1500);
const env = {...process.env, DISPLAY: ':97', JARVIS_TEST: '1'};
let procs = [];
function launch(extra = []) {
  const p = spawn(path.join(BUILD, 'node_modules/electron/dist/electron'), ['.', '--remote-debugging-port=9334', '--no-sandbox', ...extra], {cwd: BUILD, env, detached: true, stdio: ['ignore', fs.openSync(path.join(OUT, 'electron.log'), 'a'), fs.openSync(path.join(OUT, 'electron.log'), 'a')]});
  procs.push(p); return p;
}
const killAll = () => { try { execSync("pkill -f 'remote-debugging-port=9334'"); } catch {} };
async function connect(ms = 60000) { const t = Date.now(); while (Date.now() - t < ms) { try { return await chromium.connectOverCDP('http://127.0.0.1:9334'); } catch {} await sleep(800); } return null; }
async function mainPage(b, ms = 60000) { const t = Date.now(); while (Date.now() - t < ms) { const p = b.contexts().flatMap(c => c.pages()).find(p => p.url().includes('view=main')); if (p) return p; await sleep(500); } return null; }

log('\nA. An approved update (v1) starts, and is marked good');
writeState({current: 'v1', n: 3, events: [], versions: {v1: V('v1', 1, null, 'Marker test'), v2: V('v2', 2, 'v1', 'Broken on purpose'), v3: V('v3', 3, 'v1', 'Never marks itself good')}});
launch();
let b = await connect(); let page = b && await mainPage(b);
await sleep(9000);
const diag = page && await page.evaluate(() => window.jarvis.call('diagnostics'));
ok(diag?.running === `${base} · self-update 1`, `running ${diag?.running}`);
const marker = page && await page.evaluate(() => document.documentElement.dataset.selfUpdateMarker || '');
ok(marker === 'v1', 'screens come from the update (its core.js ran)');
const vendorOk = page && await page.evaluate(async () => { const r = await fetch('jarvis://app/vendor/three/three.module.min.js'); return r.ok && (await r.text()).length > 1000; });
ok(vendorOk, 'files the update does not carry (three.js in dist/vendor) come from the installed app');
let s = readState();
ok(s.versions.v1.good === true && s.versions.v1.attempts === 0, `v1 marked good (${JSON.stringify(s.versions.v1)})`);
await b.close().catch(() => {}); killAll(); await sleep(2500);

log('\nB. A broken update (v2: will not load) rolls back to v1 by itself');
s = readState(); s.current = 'v2'; writeState(s);
launch();
b = await connect(90000); page = b && await mainPage(b, 90000);
await sleep(6000);
s = readState();
ok(s.versions.v2.bad === true && /would not load: update v2 is broken/.test(s.versions.v2.reason), `v2 marked bad: ${s.versions.v2.reason}`);
ok(s.current === 'v1' && s.events.some(e => e.kind === 'rollback' && /^v2/.test(e.text)), `back on v1 (current ${s.current}; ${s.events.filter(e => e.kind === 'rollback').map(e => e.text).join(' | ')})`);
const d2 = page && await page.evaluate(() => window.jarvis.call('diagnostics'));
ok(d2?.running === `${base} · self-update 1`, `relaunched itself on v1 (${d2?.running})`);
await sleep(7000);
const notice = JSON.parse(fs.readFileSync(path.join(PROFILE, 'brain-state.json'), 'utf8'));
const act = fs.readFileSync(path.join(PROFILE, 'activity.jsonl'), 'utf8');
ok(/Rolled back v2/.test(act), 'the rollback is reported (activity log / WhatsApp)');
ok(!readState().rolledBack, 'notice cleared once reported');
await b?.close().catch(() => {}); killAll(); await sleep(2500);

log('\nC. An update that never finishes starting (v3) is dropped after two tries');
s = readState(); s.current = 'v3'; writeState(s);
for (let i = 1; i <= 2; i++) { launch(); b = await connect(); page = b && await mainPage(b); await sleep(8000); s = readState(); log(`   try ${i}: attempts ${s.versions.v3.attempts}, good ${s.versions.v3.good}`); await b?.close().catch(() => {}); killAll(); await sleep(2500); }
launch(); b = await connect(); page = b && await mainPage(b); await sleep(8000);
s = readState();
ok(s.versions.v3.bad === true && s.current === 'v1', `third start skips v3 (${s.versions.v3.reason}); current ${s.current}`);
const d3 = page && await page.evaluate(() => window.jarvis.call('diagnostics'));
ok(d3?.running === `${base} · self-update 1`, `running ${d3?.running}`);
await b?.close().catch(() => {}); killAll(); await sleep(2500);

log('\nD. Safe mode ignores every update');
launch(['--safe-mode']); b = await connect(); page = b && await mainPage(b); await sleep(6000);
const d4 = page && await page.evaluate(() => window.jarvis.call('diagnostics'));
ok(d4?.running === base, `safe mode runs the installed version (${d4?.running})`);
await b?.close().catch(() => {}); killAll(); await sleep(1500);

log('\nE. Installing a new build by hand sets old updates aside');
s = readState(); s.current = 'v1'; for (const v of Object.values(s.versions)) v.base = '1.79.0'; writeState(s);
launch(); b = await connect(); page = b && await mainPage(b); await sleep(6000);
const d5 = page && await page.evaluate(() => window.jarvis.call('diagnostics'));
s = readState();
ok(d5?.running === base && s.current === null && s.versions.v1.superseded, `new build wins (${d5?.running}); updates on 1.79.0 set aside`);
await b?.close().catch(() => {}); killAll(); await sleep(2500);

log('\nF. The same version number but a different build: updates made on the other build are set aside too');
const {buildId} = await import(path.join(BUILD, 'src/brain/selfupdate.js'));
const installedId = buildId(BUILD);
s = readState(); s.current = 'v1'; Object.assign(s.versions.v1, {base, baseId: installedId, superseded: false}); delete s.superseded; writeState(s);
launch(); b = await connect(); page = b && await mainPage(b); await sleep(6000);
const d6 = page && await page.evaluate(() => window.jarvis.call('diagnostics'));
ok(d6?.running === `${base} · self-update 1`, `made on this build → it runs (${d6?.running}; build ${installedId})`);
await b?.close().catch(() => {}); killAll(); await sleep(2500);
s = readState(); s.current = 'v1'; Object.assign(s.versions.v1, {baseId: '0123456789abcdef', superseded: false}); writeState(s);
launch(); b = await connect(); page = b && await mainPage(b); await sleep(6000);
const d7 = page && await page.evaluate(() => window.jarvis.call('diagnostics'));
s = readState();
ok(d7?.running === base && s.current === null && s.versions.v1.superseded, `made on another build of ${base} → set aside (${d7?.running})`);
await b?.close().catch(() => {}); killAll(); await sleep(2500);

log('\nG. A version whose files changed after you approved it is not started');
s = readState(); s.current = 'v1'; Object.assign(s.versions.v1, {baseId: installedId, superseded: false, bad: false}); delete s.superseded; delete s.rolledBack; writeState(s);
fs.appendFileSync(path.join(SELF, 'versions', 'v1', 'app', 'src', 'main', 'main.js'), '\n/* added after approval */\n');
launch(); b = await connect(); page = b && await mainPage(b); await sleep(6000);
const d8 = page && await page.evaluate(() => window.jarvis.call('diagnostics'));
s = readState();
ok(d8?.running === base && s.current === null && s.versions.v1.bad && /changed after you approved/.test(s.versions.v1.reason), `changed files → the installed version runs (${d8?.running}; ${s.versions.v1.reason})`);
await b?.close().catch(() => {}); killAll(); await sleep(2500);
s = readState(); s.current = '../../../x'; writeState(s);
launch(); b = await connect(); page = b && await mainPage(b); await sleep(6000);
const d9 = page && await page.evaluate(() => window.jarvis.call('diagnostics'));
ok(d9?.running === base && readState().current === null, `a made-up version name is ignored (${d9?.running})`);
await b?.close().catch(() => {}); killAll();
try { process.kill(-xvfb.pid); } catch {} try { xvfb.kill(); } catch {}
fs.rmSync(SELF, {recursive: true, force: true});
log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
