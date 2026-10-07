/**
 * One-click updates: when a newer JARVIS is out, he offers it and, after you click Install, downloads the update zip
 * from the official GitHub releases (nowhere else), checks it against the SHA-256 fingerprint published with that
 * release, unpacks it and runs its INSTALL-UPDATE.bat, the same installer you would run by hand. JARVIS closes first
 * and the installer starts him again. Only from a click in JARVIS or the tray menu: never by voice or by message.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';

export const REPO = 'Joshuabarradas234/jarvis-armor-workspace';
export const validVersion = v => /^\d{1,3}\.\d{1,3}\.\d{1,4}$/.test(String(v || ''));
export const zipName = v => `JARVIS-Armor-Workspace-${v}-update.zip`;
export const releaseFile = (v, name) => `https://github.com/${REPO}/releases/download/v${v}/${name}`;
export function newer(a, b) {
  const p = v => String(v || '0').split('.').map(n => parseInt(n, 10) || 0), [x, y, z] = p(a), [i, j, k] = p(b);
  return x > i || (x === i && (y > j || (y === j && z > k)));
}
/** The fingerprint for `file` in a SHA256SUMS.txt ("<64 hex>  <file name>" per line), or ''. */
export function expectedSum(text, file) {
  for (const line of String(text || '').split(/\r?\n/)) { const m = /^([0-9a-f]{64})\s+\*?(.+)$/i.exec(line.trim()); if (m && m[2].trim() === file) return m[1].toLowerCase(); }
  return '';
}
// Windows' own tar (System32), by its full path: another tar earlier on the PATH (Git's) reads 'C:' as a network host
const TAR = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
export const extractZip = (zip, dir) => new Promise((resolve, reject) => execFile(TAR, ['-xf', zip, '-C', dir], {windowsHide: true, timeout: 120000}, e => e ? reject(Error('The update could not be unpacked: ' + e.message)) : resolve()));

/**
 * Download, check and unpack version `v` into `dir`. Returns the folder holding INSTALL-UPDATE.bat.
 * fetchImpl follows GitHub's redirect to its file storage itself.
 */
export async function prepareUpdate({version: v, current, dir, fetchImpl = fetch, extract = extractZip, onStatus = () => {}}) {
  if (!validVersion(v)) throw Error('That is not a JARVIS version number.');
  if (!newer(v, current)) throw Error(`You already have JARVIS ${current}.`);
  onStatus(`Downloading JARVIS ${v}…`);
  const sumsRes = await fetchImpl(releaseFile(v, 'SHA256SUMS.txt'), {headers: {'User-Agent': 'JARVIS-Armor-Workspace'}});
  if (!sumsRes.ok) throw Error(`JARVIS ${v} has no fingerprint file, so it can't be installed in one click. Install it from the releases page instead.`);
  const want = expectedSum(await sumsRes.text(), zipName(v));
  if (!want) throw Error(`The fingerprint file for JARVIS ${v} does not list its update zip.`);
  const zipRes = await fetchImpl(releaseFile(v, zipName(v)), {headers: {'User-Agent': 'JARVIS-Armor-Workspace'}});
  if (!zipRes.ok) throw Error(`The JARVIS ${v} download failed (${zipRes.status}).`);
  const bytes = Buffer.from(await zipRes.arrayBuffer());
  onStatus('Checking the download…');
  const got = crypto.createHash('sha256').update(bytes).digest('hex');
  if (got !== want) throw Error('The download does not match its published fingerprint, so it was not installed.');
  fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
  const zip = path.join(dir, zipName(v)); fs.writeFileSync(zip, bytes);
  onStatus('Unpacking…');
  await extract(zip, dir);
  if (!fs.existsSync(path.join(dir, 'INSTALL-UPDATE.bat')) || !fs.existsSync(path.join(dir, 'update', 'app.asar'))) throw Error('The update zip is not laid out as expected, so it was not installed.');
  // waits for JARVIS to close by himself (saving what is open) before the installer, which would otherwise end him at once
  fs.writeFileSync(path.join(dir, 'run-update.cmd'), '@echo off\r\ntitle Installing JARVIS ' + v + '\r\ntimeout /t 5 /nobreak >nul\r\ncall "%~dp0INSTALL-UPDATE.bat"\r\n');
  return dir;
}
