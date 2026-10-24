#!/usr/bin/env node
/**
 * Builds JARVIS for the Mac as disk images (drag JARVIS onto Applications):
 *
 *   release/JARVIS-Armor-Workspace-<version>-mac-intel.dmg    Intel Macs, such as the owner's 2014 Mac mini
 *   release/JARVIS-Armor-Workspace-<version>-mac-apple.dmg    Macs with an Apple chip
 *
 * The Mac builds use Electron 43 (MAC_ELECTRON), the last one that runs on macOS 12 Monterey: Electron 44, which
 * Windows uses, needs macOS 13. Both images open on macOS 12.0 or later (LSMinimumSystemVersion). There is no Apple
 * developer account, so each app is signed ad hoc and macOS asks once before the first start (Open Anyway).
 * Like the Windows update, it fails if app.asar would reach 30 MB. Mac only; GitHub builds it for every release.
 *
 *   node scripts/release/build-mac.mjs [--arch x64|arm64]     (both by default; needs `npm install` at the root)
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const MAC_ELECTRON = '43.8.3', MAC_MINIMUM = '12.0';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fail = msg => { console.error(`✘ ${msg}`); process.exit(1); };
if (process.platform !== 'darwin') fail('Build the Mac app on a Mac. GitHub builds it for every release.');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const pick = process.argv.includes('--arch') ? process.argv[process.argv.indexOf('--arch') + 1] : '';
const arches = [['x64', 'mac', 'intel'], ['arm64', 'mac-arm64', 'apple']].filter(([a]) => !pick || a === pick);
if (!arches.length) fail('Use --arch x64 or --arch arm64.');
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, {cwd: ROOT, stdio: 'inherit', ...opts});

// 0. JARVIS's ears on the Mac (scripts/mac/listen.swift): one helper for both chips, with its own Info.plist so macOS can
//    ask for the microphone and speech recognition; package.json copies release/mac-helper into the app's Resources/mac
const helperDir = path.join(ROOT, 'release', 'mac-helper'); fs.rmSync(helperDir, {recursive: true, force: true}); fs.mkdirSync(helperDir, {recursive: true});
const slices = ['x86_64', 'arm64'].map(t => { const out = path.join(helperDir, `jarvis-listen-${t}`); run('swiftc', ['-O', '-swift-version', '5', '-target', `${t}-apple-macos${MAC_MINIMUM}`, 'scripts/mac/listen.swift', '-o', out, '-Xlinker', '-sectcreate', '-Xlinker', '__TEXT', '-Xlinker', '__info_plist', '-Xlinker', 'scripts/mac/listen-Info.plist']); return out; });
const helper = path.join(helperDir, 'jarvis-listen'); run('lipo', ['-create', ...slices, '-output', helper]); for (const x of slices) fs.rmSync(x);
run('codesign', ['--force', '--sign', '-', helper]);
if (!/"status"/.test(execFileSync(helper, ['--version']).toString())) fail('jarvis-listen does not run.');

for (const [arch, dir, label] of arches) {
  // 1. the app bundle on Electron 43, unsigned, for this chip
  fs.rmSync(path.join(ROOT, 'release', dir), {recursive: true, force: true});
  run('npx', ['--no-install', 'electron-builder', '--mac', 'dir', `--${arch}`, '--publish', 'never', `-c.electronVersion=${MAC_ELECTRON}`, '-c.mac.identity=null']);   // macOS 12.0 comes from package.json build.mac.minimumSystemVersion (on the command line, 12.0 becomes the number 12)
  const app = path.join(ROOT, 'release', dir, 'JARVIS Armor Workspace.app');
  if (!fs.existsSync(app)) fail(`electron-builder did not make ${app}`);
  const size = fs.statSync(path.join(app, 'Contents', 'Resources', 'app.asar')).size;
  if (size >= 30e6) fail(`app.asar is ${size} bytes; keep it under 30 MB.`);
  const plist = execFileSync('plutil', ['-extract', 'LSMinimumSystemVersion', 'raw', path.join(app, 'Contents', 'Info.plist')]).toString().trim();
  if (plist !== MAC_MINIMUM) fail(`The app says it needs macOS ${plist}, not ${MAC_MINIMUM}.`);
  // 2. signed ad hoc (an Apple chip won't run an unsigned app at all) and checked
  if (!fs.existsSync(path.join(app, 'Contents', 'Resources', 'mac', 'jarvis-listen'))) fail('The app has no jarvis-listen (package.json build.mac.extraResources).');
  run('codesign', ['--force', '--deep', '--sign', '-', app]);
  run('codesign', ['--verify', '--deep', '--strict', app]);
  // 3. a disk image with the app and a link to Applications, to drag it across
  const stage = path.join(ROOT, 'release', `dmg-${arch}`); fs.rmSync(stage, {recursive: true, force: true}); fs.mkdirSync(stage, {recursive: true});
  run('ditto', [app, path.join(stage, 'JARVIS Armor Workspace.app')]); fs.symlinkSync('/Applications', path.join(stage, 'Applications'));
  const dmg = path.join(ROOT, 'release', `JARVIS-Armor-Workspace-${version}-mac-${label}.dmg`); fs.rmSync(dmg, {force: true});
  run('hdiutil', ['create', '-volname', `JARVIS ${version}`, '-srcfolder', stage, '-ov', '-format', 'UDZO', dmg]);
  fs.rmSync(stage, {recursive: true, force: true});
  console.log(`✔ ${path.relative(ROOT, dmg)}  (${(fs.statSync(dmg).size / 1e6).toFixed(1)} MB; Electron ${MAC_ELECTRON}, ${arch}, macOS ${MAC_MINIMUM}+)\n  app.asar ${size} bytes (limit 30000000)`);
}
