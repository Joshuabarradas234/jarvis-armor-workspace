/**
 * One-click updates on the Mac. After you click Install now, JARVIS downloads the new Mac app (and JARVIS Server, when it
 * runs on this Mac) from the official GitHub release only, checks each file against the SHA-256 fingerprint published
 * with that release, and gets them ready in a folder. Then he quits, and a small script (MAC_INSTALL_SCRIPT) swaps the
 * app in Applications, updates JARVIS Server in place and opens JARVIS again. Only from a click: never by voice or message.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {expectedSum, releaseFile, validVersion, newer} from './one-click-update.js';

export const macDmg = (v, arch = process.arch) => `JARVIS-Armor-Workspace-${v}-mac-${arch === 'arm64' ? 'apple' : 'intel'}.dmg`;
export const serverZip = v => `JARVIS-Server-${v}-mac.zip`;
const APP = 'JARVIS Armor Workspace.app', UA = {headers: {'User-Agent': 'JARVIS-Armor-Workspace'}};
const run = (cmd, args, timeout = 300000) => new Promise((resolve, reject) => execFile(cmd, args, {timeout, maxBuffer: 4 * 1024 * 1024}, (e, out, err) => e ? reject(Error(String(err || e.message).trim().slice(0, 300))) : resolve(String(out))));

/** One file of the release, refused unless it matches its published fingerprint. */
async function checked(fetchImpl, v, file, sums) {
  const want = expectedSum(sums, file); if (!want) throw Error(`The fingerprint file for JARVIS ${v} does not list ${file}.`);
  const res = await fetchImpl(releaseFile(v, file), UA); if (!res.ok) throw Error(`The ${file} download failed (${res.status}).`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (crypto.createHash('sha256').update(bytes).digest('hex') !== want) throw Error(`${file} does not match its published fingerprint, so nothing was installed.`);
  return bytes;
}

/** Download, check and unpack version v into dir. Returns {app: the new .app, server: the new JARVIS Server app folder, or null}. */
export async function prepareMacUpdate({version: v, current, arch = process.arch, dir, server = false, fetchImpl = fetch, onStatus = () => {}, exec = run}) {
  if (!validVersion(v)) throw Error('That is not a JARVIS version number.');
  if (!newer(v, current)) throw Error(`You already have JARVIS ${current}.`);
  onStatus(`Downloading JARVIS ${v}…`);
  const sumsRes = await fetchImpl(releaseFile(v, 'SHA256SUMS.txt'), UA);
  if (!sumsRes.ok) throw Error(`JARVIS ${v} has no fingerprint file yet. Try again in a few minutes.`);
  const sums = await sumsRes.text();
  fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
  const dmg = path.join(dir, macDmg(v, arch)); fs.writeFileSync(dmg, await checked(fetchImpl, v, macDmg(v, arch), sums));
  let zip = null;
  if (server) { onStatus('Downloading JARVIS Server…'); zip = path.join(dir, serverZip(v)); fs.writeFileSync(zip, await checked(fetchImpl, v, serverZip(v), sums)); }
  onStatus('Unpacking…');
  const mnt = path.join(dir, 'mnt'), app = path.join(dir, APP); fs.mkdirSync(mnt, {recursive: true});
  await exec('hdiutil', ['attach', '-nobrowse', '-readonly', '-noverify', '-mountpoint', mnt, dmg]);
  try { if (!fs.existsSync(path.join(mnt, APP))) throw Error('The download has no JARVIS app in it, so nothing was installed.'); await exec('ditto', [path.join(mnt, APP), app]); }
  finally { await exec('hdiutil', ['detach', mnt, '-quiet']).catch(() => exec('hdiutil', ['detach', mnt, '-force', '-quiet']).catch(() => {})); }
  const plist = fs.existsSync(path.join(app, 'Contents', 'Info.plist')) ? fs.readFileSync(path.join(app, 'Contents', 'Info.plist'), 'utf8') : '';
  if (!new RegExp(`<key>CFBundleShortVersionString</key>\\s*<string>${v.replace(/\./g, '\\.')}</string>`).test(plist)) throw Error(`The download is not JARVIS ${v}, so nothing was installed.`);
  let srv = null;
  if (zip) {
    await exec('ditto', ['-x', '-k', zip, path.join(dir, 'server')]); srv = path.join(dir, 'server', 'JARVIS Server', 'app');
    if (!fs.existsSync(path.join(srv, 'src', 'server', 'server.mjs'))) throw Error('The JARVIS Server download is not laid out as expected, so nothing was installed.');
  }
  return {app, server: srv};
}

/**
 * Run after JARVIS quits:  install.sh <JARVIS's pid> <installed .app> <new .app> <new server app or ''> <JARVIS Server folder> <log> <open: yes|no>
 * The old app is kept until the new one is fully in place, and put back if the copy fails; the same for JARVIS Server,
 * which launchd then restarts on the new code.
 */
export const MAC_INSTALL_SCRIPT = `#!/bin/bash
PID="$1"; APP="$2"; NEW="$3"; SRV="$4"; BASE="$5"; LOG="$6"; OPEN="\${7:-yes}"
exec >>"$LOG" 2>&1
echo "$(date) installing $NEW"
for i in $(seq 1 90); do kill -0 "$PID" 2>/dev/null || break; sleep 1; done
if [ -n "$SRV" ] && [ -d "$BASE/app" ]; then
  rm -rf "$BASE/app.new" && mkdir -p "$BASE/app.new" && cp -R "$SRV/." "$BASE/app.new/" && rm -rf "$BASE/app.old" && mv "$BASE/app" "$BASE/app.old" && mv "$BASE/app.new" "$BASE/app"
  if [ -d "$BASE/app" ]; then echo "JARVIS Server updated"; launchctl kickstart -k "gui/$(id -u)/com.jarvis.server" >/dev/null 2>&1
  else echo "JARVIS Server copy failed: putting the old one back"; mv "$BASE/app.old" "$BASE/app"; fi
fi
rm -rf "$APP.old"
if mv "$APP" "$APP.old" && ditto "$NEW" "$APP"; then rm -rf "$APP.old"; echo "app updated"
else echo "app copy failed: putting the old one back"; rm -rf "$APP"; mv "$APP.old" "$APP"; fi
xattr -dr com.apple.quarantine "$APP" 2>/dev/null
if [ "$OPEN" = "yes" ]; then open "$APP"; fi
exit 0
`;
