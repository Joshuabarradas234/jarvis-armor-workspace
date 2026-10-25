// 1.103.0: one-click updates on the Mac: checked downloads from the official release, then a script swaps the app (and
// JARVIS Server) after JARVIS quits, keeping the old one until the new one is fully in place.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import {spawnSync} from 'node:child_process';
import {prepareMacUpdate, macDmg, serverZip, MAC_INSTALL_SCRIPT} from '../../src/main/mac-update.js';

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-macup-')));
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const plist = v => `<?xml version="1.0"?><plist><dict><key>CFBundleShortVersionString</key>\n\t<string>${v}</string></dict></plist>`;
/** A pretend release and pretend Mac tools: hdiutil "mounts" an app of `inside`, ditto copies or unzips. */
function setup({v = '1.103.0', inside = v, sums = null, badDmg = false} = {}) {
  const dmg = Buffer.from('dmg-' + v), zip = Buffer.from('zip-' + v), urls = [];
  const SUMS = sums ?? `${sha(dmg)}  ${macDmg(v, 'x64')}\n${sha(zip)}  ${serverZip(v)}\n`;
  const fetchImpl = async u => { urls.push(u); const name = u.split('/').pop(); const body = name === 'SHA256SUMS.txt' ? SUMS : name === macDmg(v, 'x64') ? (badDmg ? Buffer.from('tampered') : dmg) : name === serverZip(v) ? zip : null;
    return body === null ? {ok: false, status: 404} : {ok: true, status: 200, text: async () => String(body), arrayBuffer: async () => Buffer.from(body)}; };
  const ran = [];
  const exec = async (cmd, args) => { ran.push([cmd, ...args]);
    if (cmd === 'hdiutil' && args[0] === 'attach') { const mnt = args[args.indexOf('-mountpoint') + 1]; fs.mkdirSync(path.join(mnt, 'JARVIS Armor Workspace.app', 'Contents'), {recursive: true}); fs.writeFileSync(path.join(mnt, 'JARVIS Armor Workspace.app', 'Contents', 'Info.plist'), plist(inside)); }
    if (cmd === 'ditto' && args[0] === '-x') { const app = path.join(args[3], 'JARVIS Server', 'app', 'src', 'server'); fs.mkdirSync(app, {recursive: true}); fs.writeFileSync(path.join(app, 'server.mjs'), '// server'); }
    else if (cmd === 'ditto') fs.cpSync(args[0], args[1], {recursive: true});
    return ''; };
  return {v, fetchImpl, exec, urls, ran};
}

test('a checked download: the Mac app (and JARVIS Server) from the official release, matching their fingerprints, staged ready to swap in', async () => {
  const s = setup(), dir = tmp();
  const r = await prepareMacUpdate({version: s.v, current: '1.102.0', arch: 'x64', dir, server: true, fetchImpl: s.fetchImpl, exec: s.exec});
  assert.equal(r.app, path.join(dir, 'JARVIS Armor Workspace.app')); assert.ok(fs.existsSync(path.join(r.app, 'Contents', 'Info.plist')));
  assert.equal(r.server, path.join(dir, 'server', 'JARVIS Server', 'app')); assert.ok(fs.existsSync(path.join(r.server, 'src', 'server', 'server.mjs')));
  assert.ok(s.urls.every(u => u.startsWith('https://github.com/Joshuabarradas234/jarvis-armor-workspace/releases/download/v1.103.0/')), s.urls.join(' '));
  assert.ok(s.ran.some(c => c[0] === 'hdiutil' && c[1] === 'detach'));   // the disk image is put away again
  const noServer = await prepareMacUpdate({version: s.v, current: '1.102.0', arch: 'x64', dir: tmp(), server: false, fetchImpl: s.fetchImpl, exec: s.exec});
  assert.equal(noServer.server, null);
});

test('nothing is installed from a download that does not match, is not listed, is the wrong version, or is not newer', async () => {
  const go = (opts, extra = {}) => { const s = setup(opts); return prepareMacUpdate({version: s.v, current: '1.102.0', arch: 'x64', dir: tmp(), server: true, fetchImpl: s.fetchImpl, exec: s.exec, ...extra}); };
  await assert.rejects(go({badDmg: true}), /does not match its published fingerprint/);
  await assert.rejects(go({sums: 'ab'.repeat(32) + '  something-else.zip\n'}), /does not list JARVIS-Armor-Workspace-1\.103\.0-mac-intel\.dmg/);
  await assert.rejects(go({inside: '1.99.0'}), /is not JARVIS 1\.103\.0/);
  await assert.rejects(go({}, {current: '1.103.0'}), /You already have JARVIS 1\.103\.0/);
  await assert.rejects(go({}, {version: '1.103.0; rm -rf /'}), /not a JARVIS version number/);
});

test('the swap script keeps the old app until the new one is in place, updates JARVIS Server, and never opens anything in a test', {skip: process.platform !== 'darwin' && 'the swap script uses ditto, which only Macs have'}, () => {
  const root = tmp(), apps = path.join(root, 'Applications'), installed = path.join(apps, 'JARVIS Armor Workspace.app'), fresh = path.join(root, 'new', 'JARVIS Armor Workspace.app');
  const base = path.join(root, 'JARVIS Server'), srv = path.join(root, 'server-new');
  for (const [d, f] of [[installed, 'old.txt'], [fresh, 'new.txt'], [path.join(base, 'app'), 'old-server.txt'], [srv, 'new-server.txt']]) { fs.mkdirSync(d, {recursive: true}); fs.writeFileSync(path.join(d, f), 'x'); }
  const script = path.join(root, 'install.sh'); fs.writeFileSync(script, MAC_INSTALL_SCRIPT, {mode: 0o755});
  const r = spawnSync('/bin/bash', [script, '999999', installed, fresh, srv, base, path.join(root, 'update.log'), 'no'], {encoding: 'utf8', timeout: 60000});
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(installed, 'new.txt')) && !fs.existsSync(path.join(installed, 'old.txt')) && !fs.existsSync(installed + '.old'));
  assert.ok(fs.existsSync(path.join(base, 'app', 'new-server.txt')) && fs.existsSync(path.join(base, 'app.old', 'old-server.txt')));
  assert.match(fs.readFileSync(path.join(root, 'update.log'), 'utf8'), /JARVIS Server updated[\s\S]*app updated/);
  const broken = spawnSync('/bin/bash', [script, '999999', installed, path.join(root, 'missing.app'), '', base, path.join(root, 'update.log'), 'no'], {encoding: 'utf8', timeout: 60000});
  assert.equal(broken.status, 0); assert.ok(fs.existsSync(path.join(installed, 'new.txt')), 'a failed copy puts the old app back');
});

test('JARVIS installs on the Mac from Install now (the tray, the banner or Settings), and falls back to the download page where it can\'t write', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["if(process.platform==='darwin')return installMacUpdate(version);", "fs.accessSync(path.dirname(bundle),fs.constants.W_OK);writable=app.isPackaged&&bundle.endsWith('.app');",
    "if(!writable){await shell.openExternal(RELEASES);return {opened:true};}", "if(meetings?.active)throw Error('A meeting is being recorded. End it first, then install the update.');",
    "server:fs.existsSync(path.join(serverBase,'app','src','server','server.mjs'))", "fs.writeFileSync(script,MAC_INSTALL_SCRIPT,{mode:0o755});",
    "spawn('/bin/bash',[script,String(process.pid),bundle,staged.app,staged.server||'',serverBase,path.join(userDir,'update.log'),'yes'],{detached:true,stdio:'ignore'}).unref();", "{label:`INSTALL JARVIS ${pendingUpdate.latest}`,"]) assert.ok(main.includes(s), s);
  assert.ok(fs.readFileSync('.github/workflows/test.yml', 'utf8').includes('node tests/mac/update.mjs'));
});
