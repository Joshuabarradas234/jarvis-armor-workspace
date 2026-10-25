// One-click Mac update, for real, on a GitHub macOS runner: the Mac app this job just built is served as if it were the
// release, checked against a fingerprint file, mounted, staged, and swapped over a pretend installed copy by the same
// script JARVIS runs (without opening it). Run after scripts/release/build-mac.mjs. Mac only; never touches /Applications.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {prepareMacUpdate, macDmg, MAC_INSTALL_SCRIPT} from '../../src/main/mac-update.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const V = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version, NAME = macDmg(V, process.arch);
let failed = 0; const ok = (c, name, extra = '') => { console.log(`${c ? '  ✔' : '  ✘'} ${name}${extra ? ` (${extra})` : ''}`); if (!c) { failed++; console.log(`::error::${name}${extra ? `: ${extra}` : ''}`); } };
if (process.platform !== 'darwin') { console.log('Mac only.'); process.exit(0); }
const dmg = path.join(ROOT, 'release', NAME);
if (!fs.existsSync(dmg)) { console.log(`::error::Build the app first: ${dmg} is missing`); process.exit(1); }

const bytes = fs.readFileSync(dmg), sums = `${crypto.createHash('sha256').update(bytes).digest('hex')}  ${NAME}\n`;
const fetchImpl = async u => { const name = u.split('/').pop(); const body = name === 'SHA256SUMS.txt' ? Buffer.from(sums) : name === NAME ? bytes : null;
  return body ? {ok: true, status: 200, text: async () => body.toString(), arrayBuffer: async () => body} : {ok: false, status: 404}; };
console.log('Mac one-click update:');
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-update-'));
try {
  const staged = await prepareMacUpdate({version: V, current: '0.0.1', dir: path.join(work, 'staged'), server: false, fetchImpl, onStatus: t => console.log('   ' + t)});
  ok(fs.existsSync(path.join(staged.app, 'Contents', 'MacOS', 'JARVIS Armor Workspace')), 'the release disk image is checked, mounted and the app staged');
  ok(!spawnSync('hdiutil', ['info'], {encoding: 'utf8'}).stdout.includes(path.join(work, 'staged', 'mnt')), 'and the disk image is put away again');
  const sig = spawnSync('codesign', ['--verify', '--deep', staged.app], {encoding: 'utf8'});
  ok(sig.status === 0, 'the staged app keeps its signature', sig.stderr.trim().slice(0, 300));
  const installed = path.join(work, 'Applications', 'JARVIS Armor Workspace.app'); fs.mkdirSync(installed, {recursive: true}); fs.writeFileSync(path.join(installed, 'old version'), 'x');
  const script = path.join(work, 'install.sh'); fs.writeFileSync(script, MAC_INSTALL_SCRIPT, {mode: 0o755});
  const r = spawnSync('/bin/bash', [script, '999999', installed, staged.app, '', path.join(work, 'no-server'), path.join(work, 'update.log'), 'no'], {encoding: 'utf8', timeout: 120000});
  ok(r.status === 0 && fs.existsSync(path.join(installed, 'Contents', 'MacOS', 'JARVIS Armor Workspace')) && !fs.existsSync(path.join(installed, 'old version')), 'the script swaps the new app over the installed one', fs.readFileSync(path.join(work, 'update.log'), 'utf8').slice(-400));
  ok(spawnSync('codesign', ['--verify', '--deep', installed], {encoding: 'utf8'}).status === 0, 'and the installed app is still properly signed');
} catch (e) { ok(false, 'the update ran', e.stack?.slice(0, 600)); }
fs.rmSync(work, {recursive: true, force: true});
process.exit(failed ? 1 : 0);
