// 1.97.1: JARVIS Link and Move JARVIS appear in the Settings page JARVIS actually shows (the index bundle's System
// page), not only in the old src/settings/view.js, which the app doesn't ship.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';

test('the hall\'s System page has a JARVIS Link spot after Backup, filled by jarvis-link.js, which index.html loads', () => {
  const bundle = fs.readFileSync('dist/assets/index-DNK6LM5N.js', 'utf8');
  assert.ok(bundle.includes('<p class="small muted" data-backup-msg></p><h3>JARVIS Link</h3><div data-jarvis-link><p class="small muted">Checking…</p></div><h3>Updates</h3>'));
  assert.ok(fs.readFileSync('dist/index.html', 'utf8').includes('<script type="module" src="./assets/jarvis-link.js"></script>'));
  const mod = fs.readFileSync('dist/assets/jarvis-link.js', 'utf8');
  for (const s of ["J.call('link-status')", "J.call('link-peers')", "J.call('link-signin', {host: sel.value", "J.call('link-move')", "J.call('link-signout')", "J.call('move-export', {pause: true})", "J.call('move-plan')", "J.call('move-apply')",
    "document.querySelectorAll('[data-jarvis-link]:not([data-jl-ready])')", "if (J && ['main', 'settings'].includes(VIEW))"]) assert.ok(mod.includes(s), s);
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8')); assert.ok(pkg.build.files.includes('!src/settings/view.js'));   // why: view.js never reaches the app
});
