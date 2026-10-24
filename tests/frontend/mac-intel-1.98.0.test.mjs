// 1.98.0: the Mac app opens on macOS 12 (Electron 43, Intel and Apple chips, as disk images), and on a Mac that runs
// JARVIS Server it never starts a second brain; it offers "This Mac" in JARVIS Link instead.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';

test('the Mac build: Electron 43.8.3 for both chips, LSMinimumSystemVersion 12.0 checked in the built app, ad hoc signed, drag-to-Applications disk images', () => {
  const b = fs.readFileSync('scripts/release/build-mac.mjs', 'utf8');
  for (const s of ["const MAC_ELECTRON = '43.8.3', MAC_MINIMUM = '12.0';", "[['x64', 'mac', 'intel'], ['arm64', 'mac-arm64', 'apple']]", '`-c.electronVersion=${MAC_ELECTRON}`', 
    "execFileSync('plutil', ['-extract', 'LSMinimumSystemVersion', 'raw',", "run('codesign', ['--force', '--deep', '--sign', '-', app]);", "fs.symlinkSync('/Applications', path.join(stage, 'Applications'));", "run('hdiutil', ['create',", "if (size >= 30e6) fail("]) assert.ok(b.includes(s), s);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.build.mac.minimumSystemVersion, '12.0'); assert.ok(pkg.build.mac.extendInfo.NSSpeechRecognitionUsageDescription);
  assert.equal(pkg.devDependencies.electron, '44.4.3');   // Windows stays on Electron 44
  const ci = fs.readFileSync('.github/workflows/test.yml', 'utf8'); assert.ok(ci.includes('node scripts/release/build-mac.mjs --arch x64') && ci.includes('runs-on: macos-15-intel'));
  assert.ok(fs.readFileSync('tests/mac/smoke.mjs', 'utf8').includes("process.arch === 'arm64' ? 'mac-arm64' : 'mac'"));
});

test('on a Mac running JARVIS Server, the app starts without a brain of its own and offers This Mac to sign in to', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["path.join(app.getPath('home'),'Library','Application Support','JARVIS Server','data','server.pid')", "if(!pid)return false;try{process.kill(pid,0);return true;}catch(e){return e.code==='EPERM';}",
    "else if(localServer()){core=null;coreError='JARVIS Server runs the brain on this Mac.", "me=localServer()&&j.Self?.TailscaleIPs?.[0]?[{name:'This Mac (JARVIS Server)',host:j.Self.TailscaleIPs[0],os:'macOS',online:true}]:[]"]) assert.ok(main.includes(s), s);
  assert.ok(main.indexOf("if(linkCfg.role==='client'){core=null;") < main.indexOf('else if(localServer()){core=null;'));   // signed in already: the link wins
  assert.ok(fs.readFileSync('dist/assets/index-DNK6LM5N.js', 'utf8').includes('/Mac/.test(navigator.platform)?`Start when the Mac starts`:`Start with Windows`'));
});

test('JARVIS\'s voice on a Mac: Apple\'s speech recogniser through jarvis-listen (same lines as Windows), and say with a British voice', async () => {
  const {macRate, MAC_VOICES} = await import('../../src/voice/windows.js');
  assert.equal(macRate(0), 180); assert.equal(macRate(-10), 120); assert.equal(macRate(10), 260); assert.equal(macRate(undefined), 180); assert.equal(MAC_VOICES[0], 'Daniel');
  const v = fs.readFileSync('src/voice/windows.js', 'utf8');
  for (const s of ["if(process.platform==='darwin'){\n      if(!this.helper||!fs.existsSync(this.helper))", "spawn(this.helper,['--locale','en-GB']", "attach(child){", "spawn('say',['-v',v,'-r',String(macRate(profile?.rate)),'--',", "spawn('afplay',", "onMark(i);const child=this.saySpawn(parts[i],settings,profile);"]) assert.ok(v.includes(s), s);
  const sw = fs.readFileSync('scripts/mac/listen.swift', 'utf8');
  for (const s of ['SFSpeechRecognizer.requestAuthorization', 'AVCaptureDevice.requestAccess(for: .audio)', 'if onDevice { r.requiresOnDeviceRecognition = true }', 'guard mine == generation else { return }', 'emit(["text": t, "confidence": confidence, "dictation": true])']) assert.ok(sw.includes(s), s);
  assert.match(fs.readFileSync('scripts/mac/listen-Info.plist', 'utf8'), /NSSpeechRecognitionUsageDescription/);
  const b = fs.readFileSync('scripts/release/build-mac.mjs', 'utf8');
  for (const s of ["'-target', `${t}-apple-macos${MAC_MINIMUM}`", "'__info_plist', '-Xlinker', 'scripts/mac/listen-Info.plist'", "run('lipo', ['-create',", "execFileSync(helper, ['--version'])"]) assert.ok(b.includes(s), s);
  assert.deepEqual(JSON.parse(fs.readFileSync('package.json', 'utf8')).build.mac.extraResources, [{from: 'release/mac-helper', to: 'mac'}]);
  assert.ok(fs.readFileSync('src/main/main.js', 'utf8').includes("helper:app.isPackaged?path.join(process.resourcesPath,'mac','jarvis-listen')"));
});
