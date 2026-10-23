#!/usr/bin/env node
/**
 * Packs JARVIS Server, the brain on its own for a Mac that stays on (any Mac with Node.js 22, macOS 11 or later,
 * Intel or Apple chip):
 *
 *   release/JARVIS-Server-<version>-mac.zip
 *     JARVIS Server/Install JARVIS Server.command   double-click (right-click → Open the first time)
 *     JARVIS Server/Pair a device.command
 *     JARVIS Server/Uninstall JARVIS Server.command
 *     JARVIS Server/READ ME.txt
 *     JARVIS Server/app/                            src/, config/ and package.json, as committed
 *
 * Only committed files go in (like build-update.mjs). Runs on macOS (ditto) or Linux (zip), which keep the
 * .command files executable; GitHub builds it for every release.   node scripts/release/build-server.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fail = msg => { console.error(`✘ ${msg}`); process.exit(1); };
if (process.platform === 'win32') fail('Pack JARVIS Server on macOS or Linux, so the .command files stay executable. GitHub does this for every release.');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const tracked = execFileSync('git', ['ls-files', '-z', '--', 'src', 'config', 'package.json'], {cwd: ROOT}).toString('utf8').split('\0').filter(Boolean);
const out = path.join(ROOT, 'release', 'server'), top = path.join(out, 'JARVIS Server'), app = path.join(top, 'app');
fs.rmSync(out, {recursive: true, force: true}); fs.mkdirSync(app, {recursive: true});
let bytes = 0;
for (const rel of tracked) { const src = path.join(ROOT, rel); if (!fs.statSync(src).isFile()) continue; const dst = path.join(app, rel); fs.mkdirSync(path.dirname(dst), {recursive: true}); fs.copyFileSync(src, dst); bytes += fs.statSync(dst).size; }
for (const name of ['Install JARVIS Server.command', 'Pair a device.command', 'Uninstall JARVIS Server.command', 'READ ME.txt']) {
  const text = fs.readFileSync(path.join(ROOT, 'scripts', 'server', name), 'utf8');
  if (name.endsWith('.command') && text.includes('\r')) fail(`${name} has Windows line endings; macOS can't run it.`);
  fs.writeFileSync(path.join(top, name), text, {mode: name.endsWith('.command') ? 0o755 : 0o644});
}
for (const must of ['src/server/server.mjs', 'src/main/link.js', 'src/brain/index.js', 'config/themes.json']) if (!fs.existsSync(path.join(app, must))) fail(`${must} is missing: is it committed?`);
const zip = path.join(ROOT, 'release', `JARVIS-Server-${version}-mac.zip`); fs.rmSync(zip, {force: true});
if (process.platform === 'darwin') execFileSync('ditto', ['-c', '-k', '--keepParent', top, zip]);
else execFileSync('zip', ['-r', '-q', '-X', zip, 'JARVIS Server'], {cwd: out});
console.log(`✔ ${path.relative(ROOT, zip)}  (${(fs.statSync(zip).size / 1e6).toFixed(1)} MB; ${tracked.length} files, ${(bytes / 1e6).toFixed(1)} MB unpacked)`);
