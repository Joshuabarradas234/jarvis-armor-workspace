/**
 * Suits, films and sounds for a JARVIS that came without them: the Mac app, whose download would be too big with them.
 * They arrive once as JARVIS-media.zip, sent from the ZenBook with Tailscale, and live in <user>/media. The app's own
 * copy of a file always wins. Only media and data files are kept from the zip: never code, programs or links.
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {replaceFile} from '../brain/util.js';

export const MEDIA_TYPES = /\.(glb|gltf|mp4|webm|m4a|mp3|wav|ogg|png|jpe?g|webp|svg|json|txt|md)$/i;
const PART = /^\w[\w .()+-]{0,120}$/, LIMIT = {files: 5000, bytes: 2 * 1024 ** 3};

/** Where a media file is: the app's own copy if it has one, otherwise the one added from the zip. */
export function mediaFile(assets, media, ...parts) {
  const own = path.join(assets, ...parts); if (!media || fs.existsSync(own)) return own;
  const added = path.join(media, ...parts); return fs.existsSync(added) ? added : own;
}

const walk = (dir, depth, out = [], rel = '') => {
  let list = []; try { list = fs.readdirSync(dir, {withFileTypes: true}); } catch { return out; }
  for (const e of list) { const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) { if (depth > 0) walk(path.join(dir, e.name), depth - 1, out, r); } else if (e.isFile()) out.push(r); }
  return out;
};
/** What there is to see, in the app's folder and the added media together. */
export function mediaCounts(dirs) {
  const all = new Set(); for (const d of dirs.filter(Boolean)) for (const f of walk(d, 5)) all.add(f);
  const n = re => [...all].filter(f => re.test(f)).length;
  return {suits: n(/^suits\/[^/]+\/[^/]+\.glb$/i), films: n(/^transitions\/[^/]+\.(mp4|webm)$/i), backdrops: n(/^deck\/[^/]+\.jpe?g$/i), clips: n(/^voice\/.+\.wav$/i)};
}

/** Unpack a zip with the computer's own tool: ditto on a Mac, tar on Windows, unzip on Linux. */
export function unzip(zip, dest) {
  const [cmd, args] = process.platform === 'darwin' ? ['ditto', ['-x', '-k', zip, dest]]
    : process.platform === 'win32' ? [path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zip, '-C', dest]]
    : ['unzip', ['-q', '-o', zip, '-d', dest]];
  fs.mkdirSync(dest, {recursive: true});
  return new Promise((resolve, reject) => execFile(cmd, args, {timeout: 10 * 60000, windowsHide: true, maxBuffer: 4 * 1024 * 1024}, (e, _out, err) =>
    e ? reject(Error(`That zip could not be opened: ${String(err || e.message).trim().slice(0, 200)}`)) : resolve()));
}

/** Move the media files from an unpacked zip into place. Anything else (code, programs, links, hidden files) stays behind. */
export function adoptMedia(from, to) {
  let root = from;   // JARVIS-media.zip holds one JARVIS-media folder
  for (let i = 0; i < 2; i++) {
    const list = fs.readdirSync(root, {withFileTypes: true}).filter(e => e.name !== '__MACOSX' && !e.name.startsWith('.'));
    if (list.length === 1 && list[0].isDirectory() && /^(jarvis-media.*|assets)$/i.test(list[0].name)) root = path.join(root, list[0].name); else break;
  }
  const files = []; let bytes = 0;
  (function scan(dir, rel, depth) {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
      if (!PART.test(e.name)) continue;
      const p = path.join(dir, e.name), r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (depth < 6) scan(p, r, depth + 1); }
      else if (e.isFile() && MEDIA_TYPES.test(e.name)) { bytes += fs.statSync(p).size; files.push([p, r]); }
    }
  })(root, '', 0);
  if (!files.length) throw Error('There are no suits, films or sounds in that zip.');
  if (files.length > LIMIT.files || bytes > LIMIT.bytes) throw Error('That zip is too big to be JARVIS\'s media.');
  for (const [p, r] of files) { const t = path.join(to, ...r.split('/')); fs.mkdirSync(path.dirname(t), {recursive: true}); replaceFile(p, t); }
  return {files: files.length, bytes};
}
