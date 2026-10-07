// 1.93.0: one-click updates, the call offer, and a meeting that keeps recording in the tray.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {prepareUpdate,expectedSum,newer,validVersion,releaseFile,zipName,REPO} from '../../src/main/one-click-update.js';
import {parseCommand} from '../../src/voice/commands.js';
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-193-')); t.after(() => fs.rmSync(d, {recursive: true, force: true})); return d; };

test('updates: version numbers, the fingerprint file, and only the official releases', () => {
  assert.ok(newer('1.94.0', '1.93.0')); assert.ok(newer('1.93.10', '1.93.9')); assert.ok(!newer('1.93.0', '1.93.0')); assert.ok(!newer('1.9.9', '1.93.0'));
  assert.ok(validVersion('1.93.0')); assert.ok(!validVersion('1.93')); assert.ok(!validVersion('../1.0.0'));
  assert.equal(releaseFile('1.94.0', zipName('1.94.0')), `https://github.com/${REPO}/releases/download/v1.94.0/JARVIS-Armor-Workspace-1.94.0-update.zip`);
  const h = 'a'.repeat(64); assert.equal(expectedSum(`${h}  JARVIS-Armor-Workspace-1.94.0-update.zip\n`, 'JARVIS-Armor-Workspace-1.94.0-update.zip'), h); assert.equal(expectedSum(`${h}  other.zip`, 'JARVIS-Armor-Workspace-1.94.0-update.zip'), '');
});

test('updates: a matching download is unpacked with its installer; a wrong fingerprint, a missing one or an old version are refused', async t => {
  const zip = Buffer.from('pretend zip'), sum = crypto.createHash('sha256').update(zip).digest('hex'), asked = [];
  const res = (ok, body, status = ok ? 200 : 404) => ({ok, status, text: async () => String(body), arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.length)});
  const fetchImpl = sums => async url => { asked.push(url); return url.endsWith('SHA256SUMS.txt') ? (sums === null ? res(false, '') : res(true, sums)) : res(true, zip); };
  const extract = async (file, dir) => { fs.mkdirSync(path.join(dir, 'update'), {recursive: true}); fs.writeFileSync(path.join(dir, 'INSTALL-UPDATE.bat'), 'rem'); fs.writeFileSync(path.join(dir, 'update', 'app.asar'), 'asar'); };
  const dir = path.join(tmp(t), 'u'), status = [];
  await prepareUpdate({version: '1.94.0', current: '1.93.0', dir, fetchImpl: fetchImpl(`${sum}  ${zipName('1.94.0')}`), extract, onStatus: x => status.push(x)});
  assert.ok(asked.every(u => u.startsWith(`https://github.com/${REPO}/releases/download/v1.94.0/`)));
  assert.match(fs.readFileSync(path.join(dir, 'run-update.cmd'), 'utf8'), /timeout \/t 5 \/nobreak >nul\r\ncall "%~dp0INSTALL-UPDATE\.bat"/);
  assert.deepEqual(status, ['Downloading JARVIS 1.94.0…', 'Checking the download…', 'Unpacking…']);
  await assert.rejects(prepareUpdate({version: '1.94.0', current: '1.93.0', dir, fetchImpl: fetchImpl(`${'b'.repeat(64)}  ${zipName('1.94.0')}`), extract}), /does not match its published fingerprint/);
  await assert.rejects(prepareUpdate({version: '1.94.0', current: '1.93.0', dir, fetchImpl: fetchImpl(null), extract}), /no fingerprint file/);
  await assert.rejects(prepareUpdate({version: '1.93.0', current: '1.93.0', dir, fetchImpl: fetchImpl(''), extract}), /already have JARVIS 1\.93\.0/);
  await assert.rejects(prepareUpdate({version: '1.94.0', current: '1.93.0', dir, fetchImpl: fetchImpl(`${sum}  ${zipName('1.94.0')}`), extract: async () => {}}), /not laid out as expected/);
});

test('updates: installed only from a click in JARVIS, the tray or Settings; checked every six hours; releases carry the fingerprint', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  assert.ok(main.includes("case 'update-install':{if(!['main','settings'].includes(role))throw Error('Updates are installed from JARVIS itself.');"));
  assert.ok(main.includes("if(meetings?.active)throw Error('A meeting is being recorded. End it first, then install the update.');"));
  assert.ok(main.includes("label:`INSTALL JARVIS ${pendingUpdate.latest}`"));
  assert.ok(main.includes('setInterval(()=>checkForUpdate().catch(()=>{}),6*3600e3)'));
  assert.ok(!/update-install/.test(fs.readFileSync('src/brain/tools.js', 'utf8')) && !/update-install/.test(fs.readFileSync('src/voice/commands.js', 'utf8')));   // never by voice or by message
  const wf = fs.readFileSync('.github/workflows/release.yml', 'utf8');
  assert.ok(wf.includes('sha256sum "JARVIS-Armor-Workspace-$V-update.zip" > SHA256SUMS.txt')); assert.ok(wf.includes('"release/SHA256SUMS.txt"'));
  const ui = fs.readFileSync('dist/assets/update-ready.js', 'utf8'); assert.ok(ui.includes("J.call('update-install', {version: update.latest})"));
  assert.ok(fs.readFileSync('dist/index.html', 'utf8').includes('<script type="module" src="./assets/update-ready.js"></script>'));
});

test('calls and the tray: the offer card, recording kept going in the tray, and "end the meeting" heard from the tray', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["case 'call-offer-answer':{if(role!=='offer')return false;", "const ok=startMeeting(meetingSuit(),{autoEnd:true,quiet:true});if(ok)micWatch?.follow(c.app);",
    "if(autoEnd&&micWatch&&!micWatch.followed&&micWatch.live.length===1)micWatch.follow(micWatch.live[0].app);", "try{displays?.work?.webContents.setBackgroundThrottling(!on);}",
    "if(s.state==='IDLE'&&meetings?.active)meetingToTray();", "{label:'END THE MEETING',", "{label:'OFFER TO RECORD CALLS',type:'checkbox',checked:callOffer.on,",
    "micWatch?.follow(null);", "if(!callOffer.on||meetings?.m||callOffer.never.includes(c.name))return;", "offerTimer=setTimeout(hideOffer,30000);"]) assert.ok(main.includes(s), s);
  const page = fs.readFileSync('dist/offer.html', 'utf8'); assert.ok(page.includes('<script type="module" src="./assets/call-offer.js"></script>'));
  const card = fs.readFileSync('dist/assets/call-offer.js', 'utf8'); assert.ok(card.includes("VIEW === 'offer'")); assert.ok(card.includes("J.call('call-offer-answer', {answer: b.dataset.co})"));
  const heard = (p, idle) => parseCommand(p, {theme: {assistant: 'Jarvis'}, themes: [{id: 'ironman', assistant: 'Jarvis'}], modules: [], idle});
  assert.deepEqual(heard('jarvis end the meeting', true), {action: 'meeting-end'}); assert.deepEqual(heard('jarvis stop recording', false), {action: 'meeting-end'});
  assert.ok(fs.readFileSync('src/brain/store.js', 'utf8').includes("'githubToken', 'assemblyaiKey'];"));
  assert.ok(fs.readFileSync('dist/assets/core.js', 'utf8').includes("secret('assemblyaiKey', s.secrets.assemblyaiKey, 'AssemblyAI API key'"));
  assert.ok(main.includes("const akey=core?.store?.secret?.('assemblyaiKey');") && main.includes("m.transcript=transcriptText(r.utterances);m.accurate=true;"));
});
