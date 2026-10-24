// 1.98.1: JARVIS Server starts after the Mac restarts. A leftover server.pid naming another program no longer makes
// it think a server is already running, and the installer clears the leftover and only says "running" once it answers.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';

test('the one-at-a-time check asks whether that process really is JARVIS Server; the installer clears the leftover and checks it answers', () => {
  const s = fs.readFileSync('src/server/server.mjs', 'utf8');
  assert.ok(s.includes("execFileSync('ps', ['-p', String(pid), '-o', 'command='], {encoding: 'utf8', timeout: 5000})"));
  assert.ok(s.includes("if (pid && pid !== process.pid && isServer(pid)) {"));
  const inst = fs.readFileSync('scripts/server/Install JARVIS Server.command', 'utf8');
  assert.ok(inst.includes('rm -f "$BASE/data/server.pid"'));
  assert.ok(inst.indexOf('rm -f "$BASE/data/server.pid"') < inst.indexOf('launchctl bootstrap'));
  assert.ok(inst.includes('[ -n "$PID" ] && kill -0 "$PID" 2>/dev/null && break'));
  assert.ok(inst.includes('if ! "$NODE" "$BASE/app/src/server/server.mjs" pair; then'));
  assert.ok(!inst.includes('\r'));
  assert.ok(fs.readFileSync('tests/server/server.test.mjs', 'utf8').includes("fs.writeFileSync(path.join(DATA, 'server.pid'), String(process.pid))"));
});
