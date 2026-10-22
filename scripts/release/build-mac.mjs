#!/usr/bin/env node
/**
 * Builds JARVIS for a Mac with an Apple chip (the owner's Mac mini):
 *
 *   release/JARVIS-Armor-Workspace-<version>-mac.zip      JARVIS Armor Workspace.app, ready to drag into Applications
 *
 * It runs on a Mac only (GitHub builds it on a macos-14 runner, see .github/workflows). The app is not signed with an
 * Apple developer account, so it is signed ad hoc: macOS asks once before the first start (System Settings →
 * Privacy & Security → Open Anyway). Like the Windows update, it fails if app.asar would reach 30 MB.
 *
 *   node scripts/release/build-mac.mjs           (needs `npm install` at the repo root first, for electron-builder)
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fail = msg => { console.error(`✘ ${msg}`); process.exit(1); };
if (process.platform !== 'darwin') fail('Build the Mac app on a Mac. GitHub builds it for every release (macos-14).');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const run = (cmd, args) => execFileSync(cmd, args, {cwd: ROOT, stdio: 'inherit'});

// 1. the app bundle, unsigned (no developer identity), Apple silicon only
fs.rmSync(path.join(ROOT, 'release', 'mac-arm64'), {recursive: true, force: true});
run('npx', ['--no-install', 'electron-builder', '--mac', 'dir', '--arm64', '--publish', 'never', '-c.mac.identity=null']);
const app = path.join(ROOT, 'release', 'mac-arm64', 'JARVIS Armor Workspace.app');
if (!fs.existsSync(app)) fail(`electron-builder did not make ${app}`);
const asar = path.join(app, 'Contents', 'Resources', 'app.asar'), size = fs.statSync(asar).size;
if (size >= 30e6) fail(`app.asar is ${size} bytes; keep it under 30 MB.`);

// 2. signed ad hoc, so an Apple chip will run it at all, and checked
run('codesign', ['--force', '--deep', '--sign', '-', app]);
run('codesign', ['--verify', '--deep', '--strict', app]);

// 3. zipped the way macOS expects (keeps the bundle's links and attributes)
const zip = path.join(ROOT, 'release', `JARVIS-Armor-Workspace-${version}-mac.zip`);
fs.rmSync(zip, {force: true});
run('ditto', ['-c', '-k', '--sequesterRsrc', '--keepParent', app, zip]);
console.log(`✔ ${path.relative(ROOT, zip)}  (${(fs.statSync(zip).size / 1e6).toFixed(1)} MB)\n  app.asar ${size} bytes (limit 30000000)`);
