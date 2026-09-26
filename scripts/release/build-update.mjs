#!/usr/bin/env node
/**
 * Build the update package for the version in package.json:
 *   release/JARVIS-Armor-Workspace-<version>-update.zip
 *     INSTALL-UPDATE.bat              closes JARVIS, backs up app.asar, copies update\ into the app's resources, restarts it
 *     update/app.asar                 src, dist and config (as electron-builder packs them) with a trimmed package.json
 *     update/windows/*.ps1            the PowerShell helpers (resources\windows)
 *     update/assets/...               the few files from assets/ listed in EXTRA_ASSETS
 *     update/THIRD-PARTY-NOTICES.txt
 *
 * Usage:  node scripts/release/build-update.mjs [--out <folder>]
 * Works on Windows, macOS and Linux (GitHub Actions). Needs Node 22+, git and npx (for @electron/asar).
 * It packs the files git tracks, so build from a clean, committed tree for a real release.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import {execFileSync, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MAX_ASAR = 30_000_000;   // the installer and the self-update workshop are built around this
// files from assets/ that an update must bring (the rest of assets/ is large and already installed); add to this list
// when a release changes something in assets/
const EXTRA_ASSETS = ['assets/voice/packs/map.json', 'assets/voice/packs/voicemap.template.json'];
const PKG_KEYS = ['name', 'version', 'description', 'author', 'private', 'type', 'main', 'license'];

const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback; };
const out = path.resolve(ROOT, arg('--out', 'release'));
const git = (...a) => execFileSync('git', a, {cwd: ROOT, encoding: 'utf8'}).trim();
const fail = msg => { console.error(`\n✘ ${msg}`); process.exit(1); };

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const version = pkg.version;
if (!/^\d+\.\d+\.\d+$/.test(version || '')) fail(`package.json has no usable version (${version}).`);
const dirty = git('status', '--porcelain', '--', 'src', 'dist', 'config', 'package.json', 'scripts/windows', ...EXTRA_ASSETS);
if (dirty) console.warn(`! Building from uncommitted changes:\n${dirty}\n`);

/* ---------- 1. app.asar ---------- */
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-asar-'));
const excluded = new Set((pkg.build?.files || []).filter(f => f.startsWith('!')).map(f => f.slice(1)));   // e.g. !src/settings/view.js
const files = git('ls-files', '-z', '--', 'src', 'dist', 'config').split('\0').filter(Boolean).filter(f => !excluded.has(f));
if (!files.includes('src/main/main.js') || !files.includes(pkg.main)) fail(`The app's entry files are missing (${pkg.main}).`);
for (const f of files) {
  const from = path.join(ROOT, f); if (!fs.existsSync(from)) continue;   // deleted but not yet committed
  fs.mkdirSync(path.dirname(path.join(stage, f)), {recursive: true}); fs.copyFileSync(from, path.join(stage, f));
}
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(Object.fromEntries(PKG_KEYS.filter(k => k in pkg).map(k => [k, pkg[k]])), null, 2) + '\n');
const asarFile = path.join(os.tmpdir(), `jarvis-${version}-${process.pid}.asar`);
// npx is run through node itself: on Windows it is a .cmd file, which cannot be started without a shell (and a shell would split paths with spaces)
const npxCli = [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npx-cli.js'), path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js')].find(f => fs.existsSync(f));
const asarArgs = ['--yes', '@electron/asar@3', 'pack', stage, asarFile];
const packed = npxCli ? spawnSync(process.execPath, [npxCli, ...asarArgs], {stdio: 'inherit'}) : spawnSync('npx', asarArgs, {stdio: 'inherit'});
if (packed.status !== 0 || !fs.existsSync(asarFile)) fail('@electron/asar could not pack app.asar.');
const asar = fs.readFileSync(asarFile); fs.rmSync(asarFile, {force: true}); fs.rmSync(stage, {recursive: true, force: true});
if (asar.length >= MAX_ASAR) fail(`app.asar is ${asar.length} bytes, over the ${MAX_ASAR}-byte limit. Move large files out of src/, dist/ or config/.`);

/* ---------- 2. the rest of the package ---------- */
const entries = [];
const add = (name, data) => entries.push({name, data: Buffer.isBuffer(data) ? data : Buffer.from(data)});
const notes = path.join(ROOT, 'docs', 'release-notes', `${version}.md`);
let title = 'update';
if (fs.existsSync(notes)) { const m = /^##\s*(?:JARVIS\s+[\d.]+\s*[:—-]\s*)?(.+)$/m.exec(fs.readFileSync(notes, 'utf8')); if (m) title = m[1].trim(); }
else console.warn(`! No docs/release-notes/${version}.md: the release will have a plain description.`);
title = title.replace(/[&|<>^%"!]/g, '').slice(0, 80) || 'update';   // it is echoed by a batch file
const bat = fs.readFileSync(path.join(ROOT, 'scripts', 'release', 'INSTALL-UPDATE.template.bat'), 'utf8').replace(/\r\n/g, '\n')
  .replaceAll('{{VERSION_U}}', version.replaceAll('.', '_')).replaceAll('{{VERSION}}', version).replaceAll('{{TITLE}}', title);
if (/\{\{\w+\}\}/.test(bat)) fail('INSTALL-UPDATE.template.bat has a placeholder this script does not fill.');
add('INSTALL-UPDATE.bat', bat.replace(/\n/g, '\r\n'));   // cmd.exe needs CRLF
add('update/app.asar', asar);
for (const f of git('ls-files', '--', 'scripts/windows').split('\n').filter(f => f.endsWith('.ps1'))) add(`update/windows/${path.basename(f)}`, fs.readFileSync(path.join(ROOT, f)));
for (const f of EXTRA_ASSETS) { if (!fs.existsSync(path.join(ROOT, f))) fail(`${f} (in EXTRA_ASSETS) does not exist.`); add(`update/${f}`, fs.readFileSync(path.join(ROOT, f))); }
add('update/THIRD-PARTY-NOTICES.txt', fs.readFileSync(path.join(ROOT, 'THIRD-PARTY-NOTICES.txt')));

/* ---------- 3. the zip (written here, so no zip tool is needed) ---------- */
const crcTable = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = zlib.crc32 || (b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; });
function zip(list) {
  const now = new Date(), time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = []; let offset = 0;
  for (const {name, data} of list) {
    const n = Buffer.from(name, 'utf8'), crc = crc32(data) >>> 0, deflated = zlib.deflateRawSync(data, {level: 9});
    const stored = deflated.length >= data.length, body = stored ? data : deflated, method = stored ? 0 : 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(method, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(n.length, 26); local.writeUInt16LE(0, 28);
    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0x0800, 8); head.writeUInt16LE(method, 10); head.writeUInt16LE(time, 12); head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16); head.writeUInt32LE(body.length, 20); head.writeUInt32LE(data.length, 24); head.writeUInt16LE(n.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, n, body); central.push(head, n); offset += 30 + n.length + body.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(list.length, 8); end.writeUInt16LE(list.length, 10); end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, dir, end]);
}
fs.mkdirSync(out, {recursive: true});
const zipFile = path.join(out, `JARVIS-Armor-Workspace-${version}-update.zip`);
const z = zip(entries); fs.writeFileSync(zipFile, z);

console.log(`\n✔ ${path.relative(ROOT, zipFile)}  (${(z.length / 1048576).toFixed(1)} MB)`);
console.log(`  app.asar ${asar.length} bytes (limit ${MAX_ASAR}), ${files.length} files, commit ${git('rev-parse', '--short', 'HEAD')}${dirty ? ' + uncommitted changes' : ''}`);
console.log(`  installer title: ${title}`);
console.log(`  sha256 ${crypto.createHash('sha256').update(z).digest('hex')}`);
for (const e of entries) console.log(`  ${String(e.data.length).padStart(10)}  ${e.name}`);
