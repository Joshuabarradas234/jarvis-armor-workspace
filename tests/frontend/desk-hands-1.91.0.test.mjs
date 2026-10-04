// 1.91.0: desktop hand control. With JARVIS in the tray, a fist picks up the window under your hand and a throw sends it to the other screen.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {EventEmitter} from 'node:events';
import {readHand,DeskGestures,reachBox} from '../../dist/assets/desk-gestures.js';
import {DeskHands,deskPoint,throwTarget,placeOn,displayOf} from '../../src/main/desk-hands.js';
import {WinControl} from '../../src/main/win-control.js';
import {parseCommand} from '../../src/voice/commands.js';
// a right hand in camera space: wrist low in the middle, knuckles above it, fingers straight up (open), curled into the palm (fist), or open with thumb on index (pinch)
function hand(kind, dx = 0, dy = 0) {
  const P = (x, y) => [x + dx, y + dy, 0], lm = Array(21);
  lm[0] = P(0.5, 0.8); const mcp = {5: 0.44, 9: 0.5, 13: 0.56, 17: 0.62};
  for (const [b, x] of Object.entries(mcp)) {
    const i = Number(b); lm[i] = P(x, 0.6);
    if (kind === 'fist') { lm[i + 1] = P(x, 0.56); lm[i + 2] = P(x, 0.62); lm[i + 3] = P(x, 0.68); }
    else { lm[i + 1] = P(x, 0.5); lm[i + 2] = P(x, 0.42); lm[i + 3] = P(x, 0.32); }
  }
  lm[1] = P(0.44, 0.74); lm[2] = P(0.4, 0.68); lm[3] = P(0.37, 0.64);
  lm[4] = kind === 'pinch' ? P(0.44, 0.34) : P(0.34, 0.62);
  return lm;
}
const TOP = {id: 1, bounds: {x: 0, y: 0, width: 1440, height: 900}, workArea: {x: 0, y: 0, width: 1440, height: 860}};
const LOW = {id: 2, bounds: {x: 0, y: 900, width: 1920, height: 1080}, workArea: {x: 0, y: 900, width: 1920, height: 1040}};

test('an open hand, a fist and a pinch read the same way as in the hall', () => {
  const o = readHand(hand('open')), f = readHand(hand('fist')), p = readHand(hand('pinch'));
  assert.ok(o.open && !o.fist); assert.ok(f.fist && !f.open); assert.ok(p.pinch < 0.4 && !p.fist);
  assert.ok(Math.abs(o.aim.x - (1 - (0.44 * 2 + 0.5) / 3)) < 1e-9);   // the knuckles, mirrored
  assert.deepEqual(reachBox({x0: .1, x1: .2, y0: 0, y1: 1}, true), {x0: 0.40, x1: 0.94, y0: 0.14, y1: 0.66});   // a box too small to use is ignored
});

test('a fist grabs only after an open hand, opening lets go, and a held pinch fills to one', () => {
  const g = new DeskGestures(); let t = 0;
  const step = (k, n = 1) => { let r; for (let i = 0; i < n; i++) { t += 33; r = g.update(hand(k), {now: t, rightHand: true}); } return r; };
  assert.equal(step('fist', 3).grab, false);   // came into view already closed: nothing
  step('open', 2); assert.equal(step('fist', 1).grab, false); assert.equal(step('fist', 1).grab, true);
  assert.equal(step('open', 1).grab, true); assert.equal(step('open', 1).grab, false);
  let r = step('pinch', 1); assert.ok(r.hold < 0.1 && !r.grab); r = step('pinch', 31); assert.equal(r.hold, 1);
  assert.equal(g.update(null, {now: t + 33}).visible, false);
});

test('points, throws and landings across a top and a lower screen', () => {
  const ds = [TOP, LOW];
  assert.deepEqual(deskPoint(ds, 0, 0), {x: 0, y: 0}); assert.equal(displayOf(ds, deskPoint(ds, 0.5, 0.9)).id, 2);
  const p = deskPoint(ds, 1, 0.1); assert.ok(p.x <= 1439 && p.y < 900);   // beside the narrower top screen: pulled onto it
  assert.equal(throwTarget(ds, TOP, {x: 0, y: 2000}).id, 2); assert.equal(throwTarget(ds, TOP, {x: 0, y: 600}), null); assert.equal(throwTarget(ds, TOP, {x: 2000, y: 0}), null); assert.equal(throwTarget(ds, LOW, {x: 0, y: -2500}).id, 1);
  assert.deepEqual(placeOn({x: 0, y: 0, width: 720, height: 430}, TOP, LOW), {x: 0, y: 900, width: 720, height: 430});
  assert.deepEqual(placeOn({x: 0, y: 1440, width: 3000, height: 500}, LOW, TOP), {x: 0, y: 360, width: 1440, height: 500});   // too wide: made to fit, same height on the screen
});

test('grab a window, carry it, throw it to the lower screen; a maximised one is maximised there; a locked one says so', async () => {
  let t = 0, max = false, deny = false; const calls = [], fb = [], woke = [];
  const win = {
    at: async (x, y) => { calls.push(['at', x, y]); return {ok: true, window: {handle: 7, title: 'Report', process: 'WINWORD', maximized: max, outer: {x: 100, y: 100, w: 800, h: 600}}}; },
    move: async (h, r) => { calls.push(['move', h, r]); return deny ? {ok: false, error: 'Access is denied.'} : {ok: true}; },
    restore: async h => { calls.push(['restore', h]); return {ok: true, window: {outer: {x: 200, y: 150, w: 900, h: 640}}}; },
    max: async h => { calls.push(['max', h]); return {ok: true}; }};
  const same = r => r, d = new DeskHands({displays: () => [TOP, LOW], toPhysical: same, rectToPhysical: same, rectToDip: same, win, feedback: k => fb.push(k), wake: () => woke.push(t), now: () => t});
  const settle = () => new Promise(r => setTimeout(r, 5));
  const tick = async (m, ms = 33) => { t += ms; d.hand({visible: true, hold: 0, ...m}); await settle(); };
  await tick({nx: 0.2, ny: 0.1, grab: false}); await tick({nx: 0.2, ny: 0.1, grab: true});
  assert.equal(calls[0][0], 'at'); assert.deepEqual(fb, ['grabbed']); assert.equal(d.grab.title, 'Report');
  await tick({nx: 0.2, ny: 0.15, grab: true}); assert.ok(calls.some(c => c[0] === 'move'));
  for (const y of [0.3, 0.5, 0.7]) await tick({nx: 0.2, ny: y, grab: true}, 40);   // a quick throw downwards
  await tick({nx: 0.2, ny: 0.8, grab: false}, 40); await new Promise(r => setTimeout(r, 40));
  const last = calls.filter(c => c[0] === 'move').at(-1)[2]; assert.ok(last.y >= 900, 'landed on the lower screen'); assert.equal(fb.at(-1), 'thrown'); assert.ok(!calls.some(c => c[0] === 'max'));
  // a maximised window comes off at its normal size under the hand, and is maximised again where it lands
  calls.length = 0; fb.length = 0; max = true;
  await tick({nx: 0.5, ny: 0.1, grab: false}); await tick({nx: 0.5, ny: 0.1, grab: true}); assert.deepEqual(calls[1], ['restore', 7]);
  for (const y of [0.3, 0.5, 0.7]) await tick({nx: 0.5, ny: y, grab: true}, 40);
  await tick({nx: 0.5, ny: 0.8, grab: false}, 40); await new Promise(r => setTimeout(r, 40)); assert.deepEqual(calls.at(-1), ['max', 7]);
  // a window running as administrator cannot be moved: the ring says so and lets go
  calls.length = 0; fb.length = 0; max = false; deny = true;
  await tick({nx: 0.3, ny: 0.2, grab: false}); await tick({nx: 0.3, ny: 0.2, grab: true}); await tick({nx: 0.32, ny: 0.22, grab: true});
  assert.equal(fb.at(-1), 'denied'); assert.equal(d.grab, null);
  // the hand out of sight while holding: put down where it is
  deny = false; fb.length = 0; await tick({nx: 0.3, ny: 0.2, grab: false}); await tick({nx: 0.3, ny: 0.2, grab: true});
  t += 100; d.hand({visible: false}); t += 500; d.hand({visible: false}); assert.equal(d.grab, null); assert.equal(fb.at(-1), 'dropped');
  // a pinch held to the end opens JARVIS, once
  await tick({nx: 0.3, ny: 0.2, grab: false, hold: 1}); await tick({nx: 0.3, ny: 0.2, grab: false, hold: 1}); assert.equal(woke.length, 1);
});

test('the window helper speaks one JSON line each way, stopping answers anything still waiting, and it can only find and move windows', async () => {
  const lines = []; let child;
  const spawnImpl = () => {
    child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.kill = () => {};
    child.stdin = {write: l => { const q = JSON.parse(l); lines.push(q); if (q.cmd === 'at') setTimeout(() => child.stdout.emit('data', JSON.stringify({id: q.id, ok: true, window: null}) + '\n'), 5); }, end() {}};
    setTimeout(() => child.stdout.emit('data', '{"ready":true}\n'), 5); return child;
  };
  const w = new WinControl({scripts: 'scripts/windows', skipPid: 42, spawnImpl, timeout: 200});
  assert.deepEqual(await w.at(10.6, 20.2), {id: 1, ok: true, window: null}); assert.deepEqual(lines[0], {id: 1, cmd: 'at', x: 11, y: 20});
  const pending = w.move(7, {x: 1, y: 2, w: 3, h: 4}); await new Promise(r => setTimeout(r, 10)); w.stop(); assert.equal((await pending).ok, false);
  const ps = fs.readFileSync('scripts/windows/winctl.ps1', 'utf8');
  for (const bad of ['SendInput', 'mouse_event', 'keybd_event', 'PostMessage', 'SendMessage', 'DestroyWindow', 'CloseWindow', 'SetForegroundWindow']) assert.ok(!ps.includes(bad), `the helper never uses ${bad}`);
});

test('the ring window, the camera rule, switching with the tray, and the voice commands', () => {
  const page = fs.readFileSync('dist/hands.html', 'utf8'); assert.ok(page.includes('<script type="module" src="./assets/desk-hands.js"></script>')); assert.match(page, /script-src 'self' 'wasm-unsafe-eval'/);
  const ui = fs.readFileSync('dist/assets/desk-hands.js', 'utf8'); assert.ok(ui.includes("Q.get('view') === 'hands'")); assert.ok(ui.includes("J.call('desk-hand', o)")); assert.ok(ui.includes('setInterval(pump, 33)'));
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["backgroundThrottling:['wallpaper','hands'].includes(role)?false:true",
    "if(!t||!['main','hands'].includes(t.role))return false;if(t.role==='hands'&&(details?.mediaTypes||[]).includes('audio'))return false;",   // the ring window may use the camera, never the microphone
    "displays?.setActive(s.state!=='IDLE');syncDeskHands();", "powerMonitor.on('lock-screen',()=>{screenLocked=true;syncDeskHands();})",
    "const deskWanted=()=>deskOn&&process.platform==='win32'&&machine?.value?.state==='IDLE'&&!screenLocked&&!quitting;",
    "w.setIgnoreMouseEvents(true);", "case 'desk-hand':{if(role!=='hands')return false;", "{label:'HAND CONTROL WHEN CLOSED',type:'checkbox',checked:deskOn,", "try{closeDeskHands();}catch{}", "broadcast('hologram',{kind:'hands-start'})"]) assert.ok(main.includes(s), s);
  assert.ok(main.includes("deskOn=readJson(deskFile(),{})?.on===true;"));   // off unless you turned it on
  assert.ok(fs.readFileSync('dist/assets/hands-ideas.js', 'utf8').includes("if (m.kind === 'hands-start') return startHands();"));
  const heard = (p, idle) => parseCommand(p, {theme: {assistant: 'Jarvis'}, themes: [{id: 'ironman', assistant: 'Jarvis'}], modules: [], idle});
  assert.deepEqual(heard('jarvis hand control on', false), {action: 'desk-hands', on: true}); assert.deepEqual(heard('jarvis turn off hand control', true), {action: 'desk-hands', on: false});
});
