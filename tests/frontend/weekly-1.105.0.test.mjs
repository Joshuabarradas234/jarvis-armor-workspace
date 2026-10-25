// 1.105.0: the weekly review is complete on a computer signed in to the Mac (both of the owner's computers now): the
// meetings kept on the Mac, what the AI cost, the dates ahead and the emails come from JARVIS Core there.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {weekFacts} from '../../src/main/weekly-review.js';

test('signed in to the Mac, the weekly review asks the Mac for the brain\'s side of the week and counts the Mac\'s meetings', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["async function weeklyReview(){", "if(linkClient){await remoteMeetings();try{const w=await linkClient.call('core',{method:'week-facts'});",
    "meetings:[...(meetings?.history||[]),...(meetings?.remote||[])]", "if(action==='weekly-review'){weeklyReview().catch(e=>"]) assert.ok(main.includes(s), s);
  assert.ok(fs.readFileSync('src/brain/index.js', 'utf8').includes("case 'week-facts': {"));
});

test('the Mac\'s meetings and spend make it into the week\'s facts', () => {
  const now = Date.UTC(2026, 9, 25, 18), day = 864e5, key = new Date(now - day); const k = `${key.getFullYear()}-${String(key.getMonth() + 1).padStart(2, '0')}-${String(key.getDate()).padStart(2, '0')}`;
  const f = weekFacts({now, meetings: [{suitName: 'Hell Bat', startedAt: now - 2 * day, endedAt: now - 2 * day + 45 * 60000, onMac: true}], spendHistory: {[k]: {usd: 1.25, byKind: {'meeting notes': 1.25}}}});
  assert.equal(f.meetings.count, 1); assert.deepEqual(f.meetings.names, ['Hell Bat']); assert.equal(Math.round(f.meetings.minutes), 45);
  assert.equal(f.spend.usd, 1.25); assert.deepEqual(f.spend.top, ['meeting notes']);
});
