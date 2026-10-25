// 1.98.2: an update is offered only once it is published (its download and fingerprint are up), not the moment it is merged.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const BT = '`';

test('the update check waits for the release: this computer\'s file must be listed in SHA256SUMS.txt, else it looks again in five minutes', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of [
    "const file=process.platform==='darwin'?" + BT + "JARVIS-Armor-Workspace-${data.version}-mac-${process.arch==='arm64'?'apple':'intel'}.dmg" + BT + ":zipName(data.version);",
    'publishing=!(r.ok&&(await r.text()).includes(file));',
    'if(publishing){update=false;clearTimeout(checkForUpdate.again);checkForUpdate.again=setTimeout(()=>checkForUpdate().catch(()=>{}),5*60000);}',
    'JARVIS ${data.version} is still being published.']) assert.ok(main.includes(s), s);
  assert.ok(main.indexOf('publishing=!(r.ok') < main.indexOf('pendingUpdate=update?out:null;'));   // decided before the banner and the tray see it
});
