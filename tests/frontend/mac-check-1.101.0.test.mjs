// 1.101.0: hand control on the Mac (the hand tracker ships with the app), Auto quality that drops to Low on a small
// graphics chip (the 2014 Mac mini's HD 5000), and Settings → System → This computer, a check-up of what works here.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {renderBudget,weakGpu} from '../../dist/assets/render-budget.js';

test('Auto quality: Low on older Intel HD and Iris graphics or software drawing, High elsewhere; a chosen quality is kept', () => {
  for (const n of ['Intel(R) HD Graphics 5000', 'ANGLE (Intel Inc., Intel(R) HD Graphics 5000, OpenGL 4.1)', 'Intel Iris Pro Graphics 5200', 'Google SwiftShader']) assert.equal(weakGpu(n), true, n);
  for (const n of ['Intel(R) Arc(TM) 140T GPU (16GB)', 'Intel(R) Iris(R) Xe Graphics', 'Intel(R) UHD Graphics 620', 'Apple M1', 'NVIDIA GeForce RTX 4060', '']) assert.equal(weakGpu(n), false, n);
  assert.equal(renderBudget({quality: 'auto'}, {}, {weak: true}).quality, 'low');
  assert.equal(renderBudget({quality: 'auto'}, {}, {weak: false}).quality, 'high');
  assert.equal(renderBudget({quality: 'high'}, {}, {weak: true}).quality, 'high');   // your own choice wins
  assert.equal(renderBudget({}, {}).quality, 'high');   // no page to ask (a test, a worker): as before
  assert.equal(renderBudget({quality: 'auto', reduceOnBattery: true}, {onBattery: true}, {weak: false}).quality, 'low');
});

test('the hand tracker ships inside the app, so hand control works on the Mac too', () => {
  for (const f of ['hand_landmarker.task', 'vision_wasm_module_internal.wasm', 'vision_wasm_module_internal.js']) assert.ok(fs.statSync(`assets/handtrack/${f}`).size > 100000, f);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.ok(pkg.build.extraResources.some(r => r.from === 'assets' && r.to === 'assets'));
  assert.ok(fs.readFileSync('scripts/release/build-mac.mjs', 'utf8').includes("'assets', 'handtrack', 'hand_landmarker.task'"));
  assert.ok(fs.readFileSync('THIRD-PARTY-NOTICES.txt', 'utf8').includes('assets/handtrack/hand_landmarker.task'));
  for (const f of ['dist/assets/hands-ideas.js', 'dist/assets/desk-hands.js']) assert.ok(fs.readFileSync(f, 'utf8').includes("base: 'jarvis://asset/handtrack'"), f);
});

test('Settings → System → This computer: voice, permissions, hand control, media, the brain, both Claude keys, graphics, and what is Windows-only', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["case 'machine-check':return machineCheck();", "systemPreferences.getMediaAccessStatus(t)", "['microphone','Microphone','voice and recording calls'],['camera','Camera','hand control'],['screen','Screen Recording',",
    "assetPath('handtrack',n)", "await linkClient.call('server-info')", "add('Claude key on the Mac mini',!!sv.claudeKey,", "add('Claude key on this computer',!!readTowerKey(),", "if(mac)add('Not on the Mac yet',null,"]) assert.ok(main.includes(s), s);
  assert.ok(fs.readFileSync('dist/index.html', 'utf8').includes('<script type="module" src="./assets/jarvis-check.js"></script>'));
  const mod = fs.readFileSync('dist/assets/jarvis-check.js', 'utf8');
  for (const s of ["J.call('machine-check')", "import {gpuName, weakGpu} from './render-budget.js';", "head.textContent = 'This computer'", "document.querySelectorAll('[data-jarvis-media], [data-jarvis-link]')", "data-jc=\"again\""]) assert.ok(mod.includes(s), s);
});

test('on a small graphics chip, the hall and its background video pause behind a playing transition film, so the film runs smoothly', async () => {
  const {concealedHall} = await import('../../dist/assets/render-budget.js');
  const doc = sel => ({hidden: false, querySelector: q => q.split(',').some(x => x.trim() === sel) ? {} : null});
  assert.equal(concealedHall(doc('.hall-transition.playing'), true), true);
  assert.equal(concealedHall(doc('.hall-transition.playing'), false), false);   // the ZenBook keeps drawing behind the film, as before
  assert.equal(concealedHall(doc('.jc.in'), false), true);
  assert.ok(fs.readFileSync('dist/assets/interface-quality.js', 'utf8').includes("||(weakGpu()&&!!document.querySelector('.hall-transition.playing'))"));
  assert.ok(fs.readFileSync('dist/assets/transition-CppjmnER.js', 'utf8').includes('className=`hall-transition`'));   // the film's own element, which gets "playing"
});
