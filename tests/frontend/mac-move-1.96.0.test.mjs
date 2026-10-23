// 1.96.0: JARVIS on a Mac (the Mac mini runs his brain), and moving everything he knows from one computer to another.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {bundle, plan, apply, mapper, rewrite, forThisComputer, findOneDrive, KIND} from '../../src/main/move-jarvis.js';
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-196-')); t.after(() => fs.rmSync(d, {recursive: true, force: true})); return d; };
const W = {home: 'C:\\Users\\Sam', userDir: 'C:\\Users\\Sam\\AppData\\Roaming\\jarvis-armor-workspace', docsDir: 'C:\\Users\\Sam\\OneDrive\\Documents'};

function oldComputer(t) {
  const d = tmp(t), userDir = path.join(d, 'data'), docsDir = path.join(d, 'Documents');
  fs.mkdirSync(path.join(docsDir, 'JARVIS', 'Reports'), {recursive: true}); fs.mkdirSync(userDir);
  const json = (n, v) => fs.writeFileSync(path.join(userDir, n), JSON.stringify(v));
  json('settings.json', {setupComplete: true, mainDisplay: 123, controlDisplay: 456, voiceName: 'Microsoft George', wallpaper: true, ideas: {sourceRepo: 'C:\\Users\\Sam\\OneDrive\\Desktop\\JARVIS-source'}});
  json('workstations.json', {activeTheme: 'ironman', suits: {ironman: [{id: 'im1', name: 'Mark One', folder: 'C:\\Users\\Sam\\OneDrive\\Documents\\JARVIS Workspaces\\Armor Hall\\market'}, {id: 'im2', name: 'Mark Two', folder: 'C:\\Users\\Sam\\Projects\\shop'}, {id: 'im3', name: 'Mark XXXIX', folder: ''}]}});
  json('todos.json', [{id: 'a', text: 'Ring the bank', done: false}]);
  json('approvals.json', [{id: 9, status: 'pending', code: 'AB12'}]);   // stale requests stay behind
  json('voice-grammar.json', {big: true});
  fs.writeFileSync(path.join(userDir, 'activity.jsonl'), '{"t":1,"kind":"x"}\n');
  fs.writeFileSync(path.join(userDir, 'anthropic-key.enc'), 'SECRET');   // keys stay behind
  fs.writeFileSync(path.join(userDir, 'brain-secrets.enc'), 'SECRET');
  fs.writeFileSync(path.join(docsDir, 'JARVIS', 'Standing orders.md'), '- 21:00 daily — summary');
  fs.writeFileSync(path.join(docsDir, 'JARVIS', 'Reports', 'week.md'), '# Week');
  fs.writeFileSync(path.join(docsDir, 'JARVIS', 'photo.png'), 'not text');
  return {userDir, docsDir};
}

test('the move file carries his data and notes, never a key, a stale approval or a file JARVIS rebuilds', t => {
  const o = oldComputer(t), b = bundle({...o, version: '1.96.0', home: W.home, platform: 'win32'});
  assert.equal(b.kind, KIND);
  assert.deepEqual(Object.keys(b.files).sort(), ['activity.jsonl', 'settings.json', 'todos.json', 'workstations.json']);
  assert.deepEqual(Object.keys(b.documents).sort(), ['Reports/week.md', 'Standing orders.md']);
  assert.ok(!JSON.stringify(b).includes('SECRET'));
});

test('on the Mac: OneDrive paths find the Mac\'s OneDrive, else Desktop or Documents; JARVIS\'s own folder maps to his; other places are left alone', () => {
  const home = '/Users/sam', oneDrive = '/Users/sam/Library/CloudStorage/OneDrive-Personal', userDir = '/Users/sam/Library/Application Support/jarvis-armor-workspace';
  const m = mapper({from: W, home, oneDrive, userDir, exists: () => true});
  assert.equal(m('C:\\Users\\Sam\\OneDrive\\Documents\\JARVIS Workspaces\\market'), path.join(oneDrive, 'Documents', 'JARVIS Workspaces', 'market'));
  assert.equal(m('c:/users/sam/onedrive/Desktop/x'), path.join(oneDrive, 'Desktop', 'x'));   // any case, either slash
  assert.equal(m('C:\\Users\\Sam\\AppData\\Roaming\\jarvis-armor-workspace\\recordings\\a.webm'), path.join(userDir, 'recordings', 'a.webm'));
  assert.equal(m('C:\\Users\\Sam\\Projects\\shop'), path.join(home, 'Projects', 'shop'));
  assert.equal(m('C:\\Program Files\\Something'), null); assert.equal(m('https://example.com'), null); assert.equal(m('Mark One'), null);
  const noOneDrive = mapper({from: W, home, userDir, exists: () => false});
  assert.equal(noOneDrive('C:\\Users\\Sam\\OneDrive\\Desktop\\market'), path.join(home, 'Desktop', 'market'));
  const seen = {n: 0}; assert.deepEqual(rewrite({a: ['C:\\Users\\Sam\\Projects\\x', 5, null], b: 'plain'}, m, seen), {a: [path.join(home, 'Projects', 'x'), 5, null], b: 'plain'}); assert.equal(seen.n, 1);
  assert.deepEqual(forThisComputer({mainDisplay: 1, controlDisplay: 2, voiceName: 'George', wallpaper: true, fps: 60}, 'darwin'), {mainDisplay: null, controlDisplay: null, voiceName: '', wallpaper: false, fps: 60});
  assert.equal(forThisComputer({wallpaper: true}, 'win32').wallpaper, true);
});

test('bringing JARVIS over: a plan first, then everything written with this computer\'s paths, keeping what it replaces', t => {
  const o = oldComputer(t), b = bundle({...o, version: '1.96.0', home: W.home, platform: 'win32'});
  b.from = W;   // as saved on the Windows PC
  b.files['../escape.json'] = '{}'; b.documents['../outside.md'] = 'no'; b.documents['ok/../../x.md'] = 'no';
  const d = tmp(t), home = path.join(d, 'home'), userDir = path.join(home, 'data'), docsDir = path.join(home, 'Documents'), oneDrive = path.join(home, 'OneDrive-Personal');
  fs.mkdirSync(userDir, {recursive: true}); fs.mkdirSync(path.join(oneDrive, 'Documents', 'JARVIS Workspaces', 'Armor Hall', 'market'), {recursive: true});
  fs.writeFileSync(path.join(userDir, 'todos.json'), '[{"text":"already here"}]');
  const where = {home, oneDrive, userDir, docsDir};
  const p = plan(b, where);
  assert.equal(p.files, 4); assert.equal(p.documents, 4);
  assert.deepEqual(p.folders.map(f => [f.suit, f.found]), [['Mark One', true], ['Mark Two', false]]);   // market is in this OneDrive; Projects\shop is not here
  const r = apply(b, {...where, platform: 'darwin', now: 1});
  assert.equal(r.files, 4); assert.equal(r.documents, 2);
  const w = JSON.parse(fs.readFileSync(path.join(userDir, 'workstations.json'), 'utf8'));
  assert.equal(w.suits.ironman[0].folder, path.join(oneDrive, 'Documents', 'JARVIS Workspaces', 'Armor Hall', 'market'));
  assert.equal(w.suits.ironman[1].folder, path.join(home, 'Projects', 'shop')); assert.equal(w.suits.ironman[2].folder, '');
  const st = JSON.parse(fs.readFileSync(path.join(userDir, 'settings.json'), 'utf8'));
  assert.equal(st.mainDisplay, null); assert.equal(st.voiceName, ''); assert.equal(st.wallpaper, false); assert.equal(st.setupComplete, true);
  assert.equal(fs.readFileSync(path.join(docsDir, 'JARVIS', 'Standing orders.md'), 'utf8'), '- 21:00 daily — summary');
  assert.ok(fs.existsSync(path.join(docsDir, 'JARVIS', 'Reports', 'week.md')));
  assert.equal(fs.readFileSync(path.join(userDir, 'before-move-1', 'todos.json'), 'utf8'), '[{"text":"already here"}]');   // what it replaced is kept
  assert.ok(!fs.existsSync(path.join(d, 'escape.json')) && !fs.existsSync(path.join(home, 'escape.json')) && !fs.existsSync(path.join(home, 'outside.md')));
  assert.throws(() => plan({kind: 'something else', files: {}}, where), /not a JARVIS move file/);
});

test('the Mac\'s OneDrive is found in ~/Library/CloudStorage, the personal one first', () => {
  const fake = {readdirSync: () => ['GoogleDrive-x', 'OneDrive-Company', 'OneDrive-Personal']};
  assert.equal(findOneDrive({home: '/Users/sam', platform: 'darwin', fsImpl: fake}), path.join('/Users/sam', 'Library', 'CloudStorage', 'OneDrive-Personal'));
  assert.equal(findOneDrive({home: '/Users/sam', platform: 'darwin', fsImpl: {readdirSync: () => { throw Error('none'); }}}), '');
  assert.equal(findOneDrive({home: 'C:\\Users\\Sam', platform: 'win32', env: {OneDrive: 'C:\\Users\\Sam\\OneDrive'}}), 'C:\\Users\\Sam\\OneDrive');
});

test('on a Mac: menu-bar word, simple full screen, start at login, awake, download instead of install, and a start without any screen', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["if(process.platform==='darwin'&&icon.isEmpty())tray.setTitle('JARVIS');", "powerSaveBlocker.start('prevent-app-suspension');log('mac',",
    "else if('startWithWindows'in patch&&process.platform==='darwin')app.setLoginItemSettings({openAtLogin:result.startWithWindows});",
    "if(process.platform==='darwin'){await shell.openExternal(RELEASES);return {opened:true};}", "label:process.platform==='darwin'?`DOWNLOAD JARVIS ${pendingUpdate.latest}`",
    "if(app.isPackaged&&process.platform==='win32')try{app.setUserTasks(", "if(!displays.work&&!screen.getAllDisplays().length&&!bootMarked&&(core||coreError)){bootMarked=true;globalThis.__jarvisBoot?.markGood?.();",
    "case 'move-export':{\n      if(!['settings','main'].includes(role))return false;", "case 'move-apply':{\n      if(!['settings','main'].includes(role))return false;",
    "if(!pendingMove||Date.now()-pendingMove.at>15*60000)throw Error('Choose the move file again.');"]) assert.ok(main.includes(s), s);
  assert.ok(fs.readFileSync('src/display/windows.js', 'utf8').includes("if(mac)w.setSimpleFullScreen(true);else w.setFullScreen(true);"));
  assert.ok(fs.readFileSync('src/settings/view.js', 'utf8').includes("/Mac/.test(navigator.platform)?'Start when the Mac starts':'Start with Windows'"));
  assert.ok(fs.readFileSync('dist/assets/update-ready.js', 'utf8').includes("if (r?.opened) render({busy:"));
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.deepEqual(pkg.build.mac.target, [{target: 'zip', arch: ['arm64']}]); assert.equal(pkg.build.mac.identity, null); assert.ok(pkg.build.mac.extendInfo.NSMicrophoneUsageDescription);
  const ci = fs.readFileSync('.github/workflows/test.yml', 'utf8'); assert.ok(ci.includes('runs-on: macos-14') && ci.includes('node tests/ci-annotate.mjs node tests/mac/smoke.mjs'));
  const rel = fs.readFileSync('.github/workflows/release.yml', 'utf8'); assert.ok(rel.includes('gh release upload "v$V" "release/$zip" "release/$server" --clobber'));   // 1.97: the JARVIS Server zip goes up with it
  assert.ok(fs.readFileSync('scripts/release/build-mac.mjs', 'utf8').includes("if (size >= 30e6) fail("));
});
