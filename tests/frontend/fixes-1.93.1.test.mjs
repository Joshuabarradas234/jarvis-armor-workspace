// 1.93.1: no internet while the PC slept is not reported as the overnight news.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {OFFLINE} from '../../src/brain/index.js';

test('offline errors are told apart from real faults, and the report gives them one quiet line at the end', () => {
  for (const t of ['Could not reach Twilio: net::ERR_NAME_NOT_RESOLVED', 'Mail server: getaddrinfo ENOTFOUND imap.gmail.com', 'fetch failed', 'net::ERR_INTERNET_DISCONNECTED']) assert.ok(OFFLINE.test(t), t);
  for (const t of ['Twilio returned 401: bad token', 'Mail server: Invalid credentials', 'Claude API 529: overloaded']) assert.ok(!OFFLINE.test(t), t);
  const src = fs.readFileSync('src/brain/index.js', 'utf8');
  assert.ok(src.includes('if (real.length) facts.faults =')); assert.ok(src.includes('mention it only in one short line at the very end, never as the main news'));
});
