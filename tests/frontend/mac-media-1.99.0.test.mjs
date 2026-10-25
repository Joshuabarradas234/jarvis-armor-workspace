// 1.99.0: the Mac app gets the suits, films and sounds it came without, from JARVIS-media.zip (src/main/media.js).
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import zlib from 'node:zlib';
import {mediaFile,mediaCounts,unzip,adoptMedia,MEDIA_TYPES} from '../../src/main/media.js';

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-media-')));
const put = (root, rel, data = 'x') => { const f = path.join(root, ...rel.split('/')); fs.mkdirSync(path.dirname(f), {recursive: true}); fs.writeFileSync(f, data); return f; };
/** A plain zip (stored, not compressed), as the ZenBook's JARVIS-media.zip is laid out. */
function zipOf(entries) {
  const parts = [], central = []; let offset = 0;
  for (const [name, text] of entries) {
    const data = Buffer.from(text), n = Buffer.from(name), crc = zlib.crc32(data) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26);
    const head = Buffer.alloc(46); head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt32LE(crc, 16); head.writeUInt32LE(data.length, 20); head.writeUInt32LE(data.length, 24); head.writeUInt16LE(n.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, n, data); central.push(head, n); offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

test('only media and data files are kept from the zip: no code, programs, hidden files, odd names or links', () => {
  const from = tmp(), to = tmp();
  for (const rel of ['JARVIS-media/suits/ironman/im1.glb', 'JARVIS-media/suits/batcave/bc1.glb', 'JARVIS-media/transitions/ironman.mp4', 'JARVIS-media/transitions/spidey2.webm', 'JARVIS-media/deck/ironman.jpg',
    'JARVIS-media/voice/packs/jarvis/at your service.wav', 'JARVIS-media/handtrack/vision_wasm_module_internal.js', 'JARVIS-media/handtrack/vision_wasm_module_internal.wasm', 'JARVIS-media/run.command',
    'JARVIS-media/wallpaper/index.html', 'JARVIS-media/.DS_Store', 'JARVIS-media/deck/-dash.jpg', 'JARVIS-media/a/b/c/d/e/f/g/h/deep.png']) put(from, rel);
  put(from, '__MACOSX/JARVIS-media/._im1.glb');
  if (process.platform !== 'win32') fs.symlinkSync('/etc/hosts', path.join(from, 'JARVIS-media', 'deck', 'link.jpg'));
  const r = adoptMedia(from, to);
  assert.equal(r.files, 6);
  assert.ok(fs.existsSync(path.join(to, 'suits', 'ironman', 'im1.glb')) && fs.existsSync(path.join(to, 'voice', 'packs', 'jarvis', 'at your service.wav')));   // the JARVIS-media folder itself is dropped
  for (const gone of ['handtrack', 'run.command', 'wallpaper', '.DS_Store', '__MACOSX', 'deck/-dash.jpg', 'deck/link.jpg', 'a']) assert.ok(!fs.existsSync(path.join(to, gone)), gone);
  assert.deepEqual(mediaCounts([to]), {suits: 2, films: 2, backdrops: 1, clips: 1});
  assert.ok(!MEDIA_TYPES.test('x.js') && !MEDIA_TYPES.test('x.mjs') && !MEDIA_TYPES.test('x.wasm') && !MEDIA_TYPES.test('x.html') && !MEDIA_TYPES.test('x.app') && MEDIA_TYPES.test('x.glb'));
  assert.throws(() => adoptMedia(tmp(), tmp()), /no suits, films or sounds/);
});

test('the app\'s own copy of a file wins; the added copy fills the gaps; counts join both', () => {
  const own = tmp(), added = tmp();
  put(own, 'deck/batcave.json', 'own'); put(own, 'suits/ironman/im1.glb'); put(added, 'deck/batcave.json', 'added'); put(added, 'deck/batcave.jpg'); put(added, 'suits/ironman/im1.glb'); put(added, 'suits/ironman/im2.glb');
  assert.equal(mediaFile(own, added, 'deck', 'batcave.json'), path.join(own, 'deck', 'batcave.json'));
  assert.equal(mediaFile(own, added, 'deck', 'batcave.jpg'), path.join(added, 'deck', 'batcave.jpg'));
  assert.equal(mediaFile(own, added, 'deck', 'nothing.jpg'), path.join(own, 'deck', 'nothing.jpg'));   // missing everywhere: the app's path, as before
  assert.equal(mediaFile(own, null, 'deck', 'batcave.jpg'), path.join(own, 'deck', 'batcave.jpg'));
  assert.deepEqual(mediaCounts([own, added, null]), {suits: 2, films: 0, backdrops: 1, clips: 0});
});

test('a real JARVIS-media.zip unpacks with this computer\'s own tool and lands in place', async t => {
  const tool = process.platform === 'darwin' ? '/usr/bin/ditto' : process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : '/usr/bin/unzip';
  if (!fs.existsSync(tool)) return t.skip(`${tool} is not on this computer`);
  const dir = tmp(), zip = path.join(dir, 'JARVIS-media.zip'), incoming = path.join(dir, 'media.incoming'), media = path.join(dir, 'media');
  fs.writeFileSync(zip, zipOf([['JARVIS-media/suits/spiderman/sm1.glb', 'glTF'], ['JARVIS-media/transitions/spiderman.mp4', 'film'], ['JARVIS-media/deck/spiderman.jpg', 'jpg'], ['JARVIS-media/handtrack/x.js', 'alert(1)']]));
  await unzip(zip, incoming);
  assert.equal(adoptMedia(incoming, media).files, 3);
  assert.equal(fs.readFileSync(path.join(media, 'transitions', 'spiderman.mp4'), 'utf8'), 'film');
  assert.ok(!fs.existsSync(path.join(media, 'handtrack')));
  await assert.rejects(unzip(path.join(dir, 'missing.zip'), path.join(dir, 'x')), /That zip could not be opened/);
});

test('main.js finds media in both places, serves them on jarvis://asset/, and adds the zip from Settings → System', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["const assetPath=(...p)=>mediaFile(assets,mediaDir(),...p);", "url.host==='asset'?[assets,mediaDir()]:",
    "[[path.join(mediaDir(),'suits',t),'asset'],[path.join(assets,'suits',t),'asset'],[path.join(userDir,'assets','suits',t),'custom']]",
    "case 'media-status':return {platform:process.platform,...mediaCounts([assets,mediaDir()]),zip:findMediaZip()};",
    "case 'media-add':{if(!['main','settings'].includes(role))throw Error('Add the media from Settings.');return addMediaZip(payload?.choose===true);}",
    "/^JARVIS-media.*\\.zip$/i", "await unzipMedia(zip,incoming);const r=adoptMedia(incoming,mediaDir());", "finally{fs.rmSync(incoming,{recursive:true,force:true});}",
    "voice=new WindowsVoice({scripts,assets,media:mediaDir(),dir:userDir,", "trayImage.resize({width:18,height:18})",
    "await shell.openPath('/System/Applications/Calculator.app')", "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    "[{name:'Applications',extensions:['app']}", "app.dock?.setMenu(Menu.buildFromTemplate([{label:'Ask JARVIS',click:()=>openAsk()}]))"]) assert.ok(main.includes(s), s);
  assert.equal(main.split('path.join(assets,').length - 1, 1);   // every other media path goes through assetPath
  const voice = fs.readFileSync('src/voice/windows.js', 'utf8');
  assert.equal(voice.split("mediaFile(this.assets,this.media,'voice',names[text])").length - 1, 2);
});

test('Settings → System gets a Suits, films and sounds section after JARVIS Link', () => {
  assert.ok(fs.readFileSync('dist/index.html', 'utf8').includes('<script type="module" src="./assets/jarvis-media.js"></script>'));
  const mod = fs.readFileSync('dist/assets/jarvis-media.js', 'utf8');
  for (const s of ["J.call('media-status')", "J.call('media-add', {choose: b.dataset.jm === 'choose'})", "document.querySelectorAll('[data-jarvis-link]')", "link.after(head, box)",
    "head.textContent = 'Suits, films and sounds'", "if (J && ['main', 'settings'].includes(VIEW))", 'Add JARVIS-media.zip from Downloads']) assert.ok(mod.includes(s), s);
});
