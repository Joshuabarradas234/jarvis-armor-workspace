// 1.97.0: JARVIS Server on the Mac mini runs the brain; the ZenBook signs in over Tailscale (src/main/link.js).
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {LinkServer, isTailnet, tailscaleAddress, newCode, FORWARD, LINK_METHODS, LINK_CHANNELS} from '../../src/main/link.js';
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-197-')); t.after(() => fs.rmSync(d, {recursive: true, force: true})); return d; };

test('only Tailscale addresses count: 100.64.0.0/10, nothing on the home network or the internet', () => {
  for (const ip of ['100.93.93.3', '100.64.0.1', '100.127.255.254', '::ffff:100.70.99.56']) assert.equal(isTailnet(ip), true, ip);
  for (const ip of ['100.63.255.255', '100.128.0.1', '192.168.10.139', '10.0.0.5', '127.0.0.1', '8.8.8.8', '', undefined, '::1']) assert.equal(isTailnet(ip), false, String(ip));
  assert.equal(tailscaleAddress({en0: [{family: 'IPv4', address: '192.168.10.139', internal: false}], utun3: [{family: 'IPv4', address: '100.93.93.3', internal: false}]}), '100.93.93.3');
  assert.equal(tailscaleAddress({en0: [{family: 'IPv4', address: '192.168.10.139', internal: false}]}), '');   // no Tailscale: nothing to listen on
  assert.match(newCode(), /^[A-HJ-NP-Z2-9]{6}$/);   // no 0/O or 1/I to misread
});

test('pairing: each code works once and runs out; five wrong codes lock it for 15 minutes; only a fingerprint of the key is kept', t => {
  let now = 1e12; const dir = tmp(t), s = new LinkServer({dir, call: async () => 0, now: () => now});
  assert.throws(() => s.pair('ABCDEF', 'x'), /wrong or has run out/);   // no code shown yet
  const {code} = s.startPairing(10);
  const r = s.pair(code.toLowerCase(), 'ZenBook');   // typed in lower case is fine
  assert.ok(r.token.length >= 40); assert.throws(() => s.pair(code, 'again'), /wrong or has run out/);
  const saved = fs.readFileSync(path.join(dir, 'link-devices.json'), 'utf8'); assert.ok(!saved.includes(r.token) && saved.includes('ZenBook'));
  assert.ok(s.device({headers: {authorization: `Bearer ${r.token}`}})); assert.equal(s.device({headers: {authorization: 'Bearer ' + 'y'.repeat(43)}}), null); assert.equal(s.device({headers: {}}), null);
  const c2 = s.startPairing(10).code; now += 11 * 60000; assert.throws(() => s.pair(c2, 'late'), /run out/);   // ten minutes later it no longer works
  const c3 = s.startPairing(10).code;
  for (let i = 0; i < 3; i++) assert.throws(() => s.pair('ZZZZZZ', 'guess'), /wrong/);
  assert.throws(() => s.pair(c3, 'right one, too late'), /Too many wrong codes/);   // 5 wrong in all: locked, even for the right code
  now += 16 * 60000; const c4 = s.startPairing(10).code; assert.ok(s.pair(c4, 'after the wait').token);
  const id = JSON.parse(fs.readFileSync(path.join(dir, 'link-devices.json'), 'utf8'))[0].id; s.remove(id);
  assert.equal(s.device({headers: {authorization: `Bearer ${r.token}`}}), null);   // removed: its key stops working at once
});

test('the link carries only the brain: JARVIS Core, to-dos and the calendar, never anything that opens a window or a folder', () => {
  assert.deepEqual([...FORWARD].sort(), ['calendar-delete', 'calendar-list', 'calendar-save', 'core', 'todo-add', 'todo-clear-done', 'todo-list', 'todo-remove', 'todo-toggle']);
  assert.deepEqual([...LINK_METHODS].filter(m => !FORWARD.has(m)).sort(), ['server-info', 'tower-key']);
  for (const m of ['tower-open', 'tower-link', 'folder-open', 'suit-launch', 'desk-project-file', 'move-apply', 'update-install', 'tabs-open', 'look']) assert.equal(LINK_METHODS.has(m), false, m);
  assert.deepEqual([...LINK_CHANNELS].sort(), ['briefing', 'calendar', 'core', 'todos']);
  const rules = fs.readFileSync('AGENTS.md', 'utf8'); assert.match(rules, /listens only on the computer's \*\*Tailscale address\*\* \(`100\.64\.0\.0\/10`\)/);
});

test('the ZenBook signed in: no JARVIS Core of its own, the brain\'s requests go to the Mac, and the Claude key reaches the Mac too', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["if(linkCfg.role==='client'){core=null;coreError=`JARVIS Core runs on ${linkCfg.name||linkCfg.host}.`;", "else try{core=createJarvisCore({userDir,",
    "if(linkClient&&['main','console','settings'].includes(role)){\n    if(FORWARD.has(method)){const r=await linkClient.call(method,payload);linkMirror(method,r);",
    "if(method==='tower-key')await linkClient.call('tower-key',payload);", "case 'link-signin':{\n      if(!['settings','main'].includes(role))return false;",
    "fs.writeFileSync(linkTokenFile(),safeStorage.encryptString(r.token));", "case 'link-move':{\n      if(!['settings','main'].includes(role))return false;",
    "writeJson(bf,{...(readJson(bf,{})||{}),enabled:false},2);", "label:`BRAIN ON ${String(linkCfg.name||linkCfg.host).toUpperCase()}"]) assert.ok(main.includes(s), s);
  const view = fs.readFileSync('src/settings/view.js', 'utf8');
  for (const s of ['<h3>JARVIS Link</h3>', "ctx.api('link-peers')", "ctx.api('link-signin',{host:sel.value", "ctx.api('link-move')"]) assert.ok(view.includes(s), s);
});

test('the Mac installer: Node 22 checked, a launchd agent that starts with the Mac, Mac line endings, and the server package', () => {
  const inst = fs.readFileSync('scripts/server/Install JARVIS Server.command', 'utf8');
  assert.ok(!inst.includes('\r')); assert.match(inst, /\[ "\$MAJOR" -lt 22 \]/); assert.ok(inst.includes('<key>KeepAlive</key><true/>') && inst.includes('launchctl bootstrap "gui/$(id -u)" "$PLIST"'));
  assert.ok(inst.includes('src/server/server.mjs" pair'));
  for (const f of ['Pair a device.command', 'Uninstall JARVIS Server.command']) assert.ok(!fs.readFileSync(path.join('scripts/server', f), 'utf8').includes('\r'), f);
  const build = fs.readFileSync('scripts/release/build-server.mjs', 'utf8'); assert.ok(build.includes("if (process.platform === 'win32') fail(") && build.includes("{mode: name.endsWith('.command') ? 0o755 : 0o644}"));
  const server = fs.readFileSync('src/server/server.mjs', 'utf8');
  assert.ok(server.includes("address: TEST ? () => '127.0.0.1' : tailscaleAddress, allow: TEST ?") && server.includes(': isTailnet});'));   // outside tests: Tailscale only
  assert.ok(server.includes("spawn('caffeinate', ['-i', '-w', String(process.pid)]"));
});
