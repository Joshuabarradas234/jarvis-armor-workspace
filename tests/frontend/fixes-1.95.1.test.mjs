// 1.95.1: the one-click installer no longer hangs, the update banner shows whenever the hall opens, Ask JARVIS
// finds a free key (Ctrl+Alt+Space is the Claude app's quick entry), and a start-up failure is written down.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const BT = '`';

test('the installer: no pipe in the wait for JARVIS to close, Windows\' own find by its full path, the full name (CSV), and pauses that need no keyboard', () => {
  const bat = fs.readFileSync('scripts/release/INSTALL-UPDATE.template.bat', 'utf8');
  const wait = bat.slice(bat.indexOf(':waitclose'), bat.indexOf(':closed'));
  assert.ok(!wait.includes('|'), 'no pipe');   // started by JARVIS, "tasklist | find" waited for ever on the owner's PC
  assert.ok(wait.includes(String.raw`"%SystemRoot%\System32\tasklist.exe" /fi "imagename eq JARVIS Armor Workspace.exe" /fo csv /nh > "%TEMP%\jarvis-running.txt"`));
  assert.ok(wait.includes(String.raw`"%SystemRoot%\System32\find.exe" /i "JARVIS Armor Workspace.exe" "%TEMP%\jarvis-running.txt"`));   // never Git's find from the PATH
  assert.ok(!/timeout \/t/.test(bat), 'timeout fails without a keyboard; ping waits anyway');
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  assert.ok(main.includes("spawn('cmd.exe',['/d','/c'," + BT + 'start "Installing JARVIS" /d "${dir}" cmd.exe /c "${path.join(dir,\'run-update.cmd\')}"' + BT + "],{cwd:dir,detached:true,stdio:'ignore',windowsVerbatimArguments:true,windowsHide:true})"));
  assert.match(fs.readFileSync('src/main/one-click-update.js', 'utf8'), /ping -n 6 127\.0\.0\.1 >nul/);
});

test('the hall shows a waiting update when it opens; Ask JARVIS finds a free key; a failed start is logged', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  assert.ok(main.includes("case 'update-pending':return pendingUpdate||null;"));
  assert.ok(fs.readFileSync('dist/assets/update-ready.js', 'utf8').includes("J.call('update-pending').then(u => { if (u?.update && !el && hiddenFor !== u.latest) { update = u; render(); } })"));
  assert.ok(main.includes("const ASK_KEYS=['Control+Alt+Q','Control+Alt+K','Control+Shift+Alt+J'];"));
  assert.ok(main.includes("function askKeys(chosen){return [...new Set([...(chosen&&chosen!=='Control+Alt+Space'?[chosen]:[]),...ASK_KEYS])];}"));   // 1.94's default, the Claude app's key, is skipped
  assert.ok(main.includes("hotkey:askKey||'',address:addr()};"));
  assert.ok(main.includes('label:askKey?' + BT + 'ASK JARVIS  (${keyName(askKey)})' + BT + ":'ASK JARVIS'"));
  assert.ok(main.includes("}).catch(e=>{try{log('crash'," + BT + 'JARVIS could not start: ${e?.stack||e?.message||e}' + BT + ');}catch{}console.error(e);app.quit();});'));
});
