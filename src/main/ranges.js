import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';

/**
 * Videos and sounds are read in pieces: the player asks for "Range: bytes=…". Chromium's file fetch returns the
 * right bytes but calls them the whole file (200, no Content-Range), so the player re-buffers over and over and a
 * transition crawls at a few frames a second. This answers a single range properly (206 with Content-Range).
 * Null means "not a range this can answer": the caller falls back to the ordinary file fetch.
 */
const TYPES = {'.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.aac': 'audio/aac', '.flac': 'audio/flac', '.glb': 'model/gltf-binary', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'};
export function byteRange(header, size) {
  const m = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(String(header || ''));
  if (!m || (m[1] === '' && m[2] === '')) return null;
  if (m[1] === '') { const n = Number(m[2]); return n > 0 ? {start: Math.max(0, size - n), end: size - 1} : {bad: true}; }   // "the last n bytes"
  const start = Number(m[1]), end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  return start >= size || start > end ? {bad: true} : {start, end};
}
export function rangeResponse(file, header, extra = {}) {
  let st; try { st = fs.statSync(file); } catch { return null; }
  if (!st.isFile()) return null;
  const r = byteRange(header, st.size); if (!r) return null;
  if (r.bad) return new Response(null, {status: 416, headers: {'Content-Range': `bytes */${st.size}`, ...extra}});
  return new Response(Readable.toWeb(fs.createReadStream(file, {start: r.start, end: r.end})), {status: 206, headers: {
    'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Range': `bytes ${r.start}-${r.end}/${st.size}`,
    'Content-Length': String(r.end - r.start + 1), 'Accept-Ranges': 'bytes', ...extra}});
}
