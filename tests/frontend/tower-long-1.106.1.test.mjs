// 1.106.1: a floor's long pieces of work (a fortnight of posts with picture briefs) are no longer cut off: the reviewer,
// who rewrites the whole piece, may write 16,000 tokens (each step 8,000), and a long answer gets longer to arrive.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';

test('the reviewer may write a long piece in full, and the waiting time grows with it', () => {
  const orch = fs.readFileSync('src/tower/orchestrator.js', 'utf8');
  assert.ok(orch.includes("let maxTokens = kind === 'review' ? 16000 : 8000, hold = 0;"));
  assert.ok(orch.includes("if (res.truncated) { note('The answer reached the length limit and was cut off.');"), 'a cut-off answer is still caught, never passed as finished');
  const eng = fs.readFileSync('src/tower/engines.js', 'utf8');
  assert.ok(eng.includes('AbortSignal.timeout(Math.max(300000, maxTokens * 30))'));
  assert.equal(Math.max(300000, 16000 * 30), 480000); assert.equal(Math.max(300000, 4000 * 30), 300000);   // eight minutes for the longest; five as before for short ones
});
