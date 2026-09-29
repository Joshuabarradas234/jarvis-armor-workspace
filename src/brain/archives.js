import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {writeText} from './util.js';

export const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const safe = name => typeof name === 'string' && name.length < 240 && !name.split('/').some(x => !x || x === '.' || x === '..') && !/^[\/]|[\\:\x00-\x1f]/.test(name);
const table = Array.from({length: 256}, (_, n) => { for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
const crc32 = b => { let c = 0xffffffff; for (const v of b) c = table[(c ^ v) & 255] ^ c >>> 8; return (c ^ 0xffffffff) >>> 0; };
export function zipBytes(entries) {
  const names = new Set(), parts = [], heads = []; let offset = 0;
  if (entries.length > 10000) throw Error('Too many archive files.');
  for (const {name, data: value} of entries) {
    if (!safe(name) || names.has(name)) throw Error('Invalid or duplicate archive filename.'); names.add(name);
    const data = Buffer.from(value), nameBytes = Buffer.from(name), body = zlib.deflateRawSync(data, {level: 6}), crc = crc32(data), local = Buffer.alloc(30), head = Buffer.alloc(46);
    local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6); local.writeUInt16LE(8, 8); local.writeUInt16LE(33, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    head.writeUInt32LE(0x02014b50); head.writeUInt16LE(20, 4); head.writeUInt16LE(20, 6); head.writeUInt16LE(0x800, 8); head.writeUInt16LE(8, 10); head.writeUInt16LE(33, 14);
    head.writeUInt32LE(crc, 16); head.writeUInt32LE(body.length, 20); head.writeUInt32LE(data.length, 24); head.writeUInt16LE(nameBytes.length, 28); head.writeUInt32LE(offset, 42);
    parts.push(local, nameBytes, body); heads.push(head, nameBytes); offset += local.length + nameBytes.length + body.length;
  }
  const central = Buffer.concat(heads), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, central, end]);
}
export function asarBytes(entries) {
  const header = {files: Object.create(null)}, bodies = []; let offset = 0;
  for (const {name, data: value} of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!safe(name)) throw Error('Invalid app filename.'); const data = Buffer.from(value); let dir = header.files;
    const bits = name.split('/'); const leaf = bits.pop();
    for (const bit of bits) { if (dir[bit] && !dir[bit].files) throw Error('Conflicting app filename.'); dir[bit] ||= {files: Object.create(null)}; dir = dir[bit].files; }
    if (dir[leaf]) throw Error('Duplicate app filename.');
    const blocks = []; for (let n = 0; n < data.length; n += 4194304) blocks.push(sha256(data.subarray(n, n + 4194304)));
    dir[leaf] = {size: data.length, offset: String(offset), integrity: {algorithm: 'SHA256', hash: sha256(data), blockSize: 4194304, blocks}}; bodies.push(data); offset += data.length;
  }
  const json = Buffer.from(JSON.stringify(header)), pickle = Buffer.alloc(8 + Math.ceil(json.length / 4) * 4), size = Buffer.alloc(8);
  pickle.writeUInt32LE(pickle.length - 4); pickle.writeUInt32LE(json.length, 4); json.copy(pickle, 8); size.writeUInt32LE(4); size.writeUInt32LE(pickle.length, 4);
  return Buffer.concat([size, pickle, ...bodies]);
}
export function saveArchive(file, entries) {
  const data = zipBytes(entries); writeText(file, data);
  if (sha256(fs.readFileSync(file)) !== sha256(data)) throw Error('Archive verification failed.');
  return {file, size: data.length, sha256: sha256(data), files: entries.map(e => ({name: e.name, size: Buffer.byteLength(e.data)}))};
}
export function buildSelfRelease(core, version) {
  const {updater, deps} = core, v = updater.state().versions[version];
  if (!v || !/^v\d+$/.test(version) || !['ui', 'whatsapp'].includes(v.approvedVia)) throw Error('This release requires an installed update approved on screen or WhatsApp.');
  const dir = path.join(updater.selfDir, 'versions', version), raw = fs.readFileSync(path.join(dir, 'manifest.json'));
  if (sha256(raw) !== v.manifest) throw Error('The approved update manifest changed.');
  const manifest = JSON.parse(raw), entries = [];
  for (const [name, hash] of Object.entries(manifest)) {
    if (!safe(name)) throw Error('Unsafe name in the update manifest.');
    const data = fs.readFileSync(path.join(dir, 'app', name)); if (sha256(data) !== hash) throw Error('An approved update file changed.');
    if (/^(src|dist|config)\//.test(name)) entries.push({name, data});
  }
  const required = ['src/main/boot.js','src/main/main.js','src/main/preload.cjs','src/brain/selfupdate.js','src/brain/approvals.js','dist/index.html'];
  for (const name of required) if (!entries.some(e => e.name === name && e.data.length)) throw Error('Approved release is incomplete: '+name);
  if (!Number.isSafeInteger(v.created) || v.created <= 0) throw Error('Invalid approved update date.');
  const base = deps.boot.asarRoot;
  // Only the two shared directories omitted by the self-update workshop are taken from the installed base.
  const walk = name => { const f = path.join(base, name); if (!fs.existsSync(f)) return; for (const child of fs.readdirSync(f)) { const sub = `${name}/${child}`, stat = fs.lstatSync(path.join(base, sub)); if (stat.isSymbolicLink()) throw Error('Linked files cannot enter a release.'); if (stat.isDirectory()) walk(sub); else if (stat.isFile()) entries.push({name: sub, data: fs.readFileSync(path.join(base, sub))}); } };
  walk('dist/vendor'); walk('dist/wallpaper');
  const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
  if (!/^\d+\.\d+\.\d+(?:-self\.\d+)?$/.test(pkg.version)) throw Error('The installed app version is invalid.');
  const release = `${pkg.version.replace(/-self\.\d+$/, '')}-self.${v.created}`;
  pkg.version = release; pkg.main = 'src/main/boot.js'; entries.push({name: 'package.json', data: Buffer.from(JSON.stringify(pkg, null, 2))});
  const app = asarBytes(entries); if (app.length >= 30000000) throw Error('The app archive exceeds the 30 MB release limit.');
  const out = path.join(core.store.home, 'Releases', release); fs.mkdirSync(out, {recursive: true});
  const update = [{name: 'app.asar', data: app}];
  if (deps.scripts) for (const name of fs.readdirSync(deps.scripts).filter(n => /^[\w-]+\.ps1$/i.test(n))) update.push({name: `windows/${name}`, data: fs.readFileSync(path.join(deps.scripts, name))});
  const file = path.join(out, `JARVIS-${release}-update.zip`), result = saveArchive(file, update);
  const note = `# JARVIS ${release}\n\n## What's new\n- ${v.title}\n\n## Fixed\n- Contains the code changes you approved in self-update ${version}.\n\n## Install\n1. Right-click the JARVIS tray icon → Quit.\n2. Unzip ${path.basename(file)} into %LOCALAPPDATA%\\Programs\\JARVIS Armor Workspace\\resources and choose Replace.\n3. Start JARVIS.\n\nThis local release needs the media assets from installed build ${v.base}. It does not publish to GitHub.\n\n## Undo\nReinstall your previous update ZIP. A packaged release becomes the base build; RESTART WITHOUT SELF-UPDATES only disables later overlays.\n\n## Checks\nApproved manifest verified; all files hashed; archive ${app.length} bytes, below 30 MB. The existing self-update validator ran before install. Full core tests, electron-builder and hardware tests were not run by this exporter. Test the local update before sharing it.\n\n## Files\n${result.files.map(f => `- ${f.name}: ${f.size} bytes`).join('\n')}\n`;
  const notes = path.join(out, `RELEASE-${release}.md`); writeText(notes, note);
  const source = saveArchive(path.join(out, `JARVIS-source-${release}.zip`), entries.filter(e => !e.name.startsWith('dist/vendor/')));
  return {...result, notes, source: source.file, version: release, asarSize: app.length};
}
