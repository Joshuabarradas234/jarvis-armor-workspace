// 1.93.0: the weekly review, accurate meeting transcripts, noticing calls, keeping a meeting recording in the tray, one-click updates.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {weekFacts,buildWeekScenes,reviewDue,minutesText,money,dayKey} from '../../src/main/weekly-review.js';
import {cloudTranscript,transcriptText,costOf,BASE} from '../../src/meeting/cloud-transcript.js';
import {parseMic,callsNow,callName,MicWatch} from '../../src/meeting/mic-watch.js';
import {parseCommand} from '../../src/voice/commands.js';
const DAY = 864e5, NOW = new Date(2026, 9, 4, 18, 0).getTime();   // a Sunday, 6 pm

test('weekly review: the week in facts, then scenes, leaving out what did not happen', () => {
  const f = weekFacts({now: NOW,
    todos: [{text: 'Send the boiler quote', done: true, doneAt: NOW - DAY}, {text: 'Book the MOT', done: true, doneAt: NOW - 2 * DAY}, {text: 'Old one', done: true, doneAt: NOW - 9 * DAY}, {text: 'Open', done: false}],
    meetings: [{suitName: 'Mark 5', startedAt: NOW - 3 * DAY, endedAt: NOW - 3 * DAY + 50 * 60000}, {suitName: 'Mark 5', startedAt: NOW - 2 * DAY, endedAt: NOW - 2 * DAY + 25 * 60000}],
    runs: [{status: 'done', title: 'Competitor report', endedAt: NOW - DAY, cost: 0.8}, {status: 'done', rehearsal: true, title: 'Practice', endedAt: NOW - DAY}],
    ideas: [{title: 'Website', created: NOW - 20 * DAY, project: {phases: [{steps: [{title: 'Pick a domain', done: true, doneAt: NOW - 30 * DAY}, {title: 'Write copy', done: true, doneAt: NOW - DAY}, {title: 'Launch', done: false}, {title: 'Tell people', done: false}]}]}}],
    spendHistory: {[dayKey(NOW - DAY)]: {usd: 1.2, byKind: {'second brain': 0.7, 'screen look': 0.5}}, [dayKey(NOW - 10 * DAY)]: {usd: 9, byKind: {brain: 9}}},
    events: [{title: 'Dentist', start: new Date(NOW + DAY).toISOString()}], dates: [{name: 'Council tax', kind: 'bill', daysLeft: 2}]});
  assert.equal(f.done.count, 2); assert.equal(f.meetings.count, 2); assert.equal(Math.round(f.meetings.minutes), 75); assert.equal(f.agents.count, 1);
  assert.deepEqual(f.projects.map(p => [p.title, p.before, p.progress, p.week]), [['Website', 25, 50, 1]]); assert.equal(f.spend.usd, 2.0);   // AI 1.20 + Tower 0.80, and last week's 9.00 left out
  const s = buildWeekScenes(f, {who: 'sir', part: 'evening'});
  assert.deepEqual(s.map(x => x.id), ['week-open', 'week-done', 'week-meetings', 'week-agents', 'week-projects', 'week-spend', 'next-week', 'close']);
  assert.equal(s[0].line, "Good evening, sir. Here's your week, 27 September to 4 October.");
  assert.equal(s[1].line, 'You ticked off 2 tasks, including Send the boiler quote and Book the MOT.');
  assert.equal(s[2].line, 'You had 2 meetings, 1 hour 15 minutes in all.');
  assert.equal(s[4].line, 'Website moved from 25 to 50 percent.');
  assert.equal(s[5].line, 'The AI cost $2.00 this week, mostly second brain and screen look.');
  assert.equal(s[6].line, 'Next week: 1 thing on the calendar, starting with Dentist, Council tax due and next on Website: Launch.');
  const quiet = buildWeekScenes(weekFacts({now: NOW}));
  assert.deepEqual(quiet.map(x => x.id), ['week-open', 'week-done', 'next-week', 'close']); assert.equal(quiet[2].line, 'Next week is clear so far.');
  assert.equal(minutesText(45), '45 minutes'); assert.equal(minutesText(120), '2 hours'); assert.equal(money(0.004), 'under a penny');
  assert.equal(reviewDue(new Date(NOW), ''), true); assert.equal(reviewDue(new Date(NOW), dayKey(NOW)), false);
  assert.equal(reviewDue(new Date(NOW - 2 * 3600e3), ''), false); assert.equal(reviewDue(new Date(NOW - DAY), ''), false);   // Sunday before 5 pm; Saturday
  const said = p => parseCommand(p, {theme: {assistant: 'Jarvis'}, themes: [], modules: []});
  assert.deepEqual(said('jarvis weekly review'), {action: 'weekly-review'}); assert.deepEqual(said('jarvis how was my week'), {action: 'weekly-review'});
});

test('weekly review: the film knows the new scenes and its title, and main plays it on Sunday evenings', () => {
  const ui = fs.readFileSync('dist/assets/briefing-cinema.js', 'utf8');
  for (const id of ['week-open', 'week-done', 'week-meetings', 'week-agents', 'week-projects', 'week-spend', 'next-week']) assert.ok(ui.includes(`case '${id}':`), id);
  assert.ok(ui.includes("run.kind === 'week' ? 'WEEKLY REVIEW'"));
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  assert.ok(main.includes("playCinema(id,buildWeekScenes(facts,{who:addr(),part:partOfDay()}),'week');"));
  assert.ok(main.includes("if(reviewDue(new Date(),visits.get('__','weekly').day))"));
  assert.ok(main.includes("send({start:true,kind,scenes,voiced,"));
});

test('accurate transcripts: upload, transcribe on the EU servers with speaker labels, then delete it there', async () => {
  const calls = []; let polls = 0;
  const res = (status, body) => ({ok: status < 300, status, json: async () => body});
  const fetchImpl = async (url, opt = {}) => {
    calls.push([opt.method || 'GET', url.replace(BASE, ''), opt.body && typeof opt.body === 'string' ? JSON.parse(opt.body) : opt.body?.length]);
    if (url.endsWith('/v2/upload')) return res(200, {upload_url: 'https://cdn.example.com/a'});
    if (url.endsWith('/v2/transcript') && opt.method === 'POST') return res(200, {id: 't1', status: 'queued'});
    if (opt.method === 'DELETE') return res(200, {});
    polls++; return res(200, polls < 2 ? {id: 't1', status: 'processing'} : {id: 't1', status: 'completed', audio_duration: 1800, text: 'Hello there. Hi.', utterances: [{speaker: 'A', start: 250, end: 2000, text: 'Hello there.'}, {speaker: 'B', start: 65000, end: 66000, text: 'Hi.'}]});
  };
  const status = [];
  const r = await cloudTranscript({bytes: Buffer.from('webm'), key: 'k', fetchImpl, onStatus: t => status.push(t), sleep: async () => {}});
  assert.equal(BASE, 'https://api.eu.assemblyai.com');
  assert.deepEqual(calls[0], ['POST', '/v2/upload', 4]);
  assert.deepEqual(calls[1], ['POST', '/v2/transcript', {audio_url: 'https://cdn.example.com/a', speaker_labels: true, language_code: 'en_uk', speech_models: ['universal-3-5-pro', 'universal-2']}]);
  await new Promise(r => setTimeout(r, 0)); assert.deepEqual(calls.at(-1).slice(0, 2), ['DELETE', '/v2/transcript/t1']);
  assert.equal(transcriptText(r.utterances), '[0:00] Speaker A: Hello there.\n[1:05] Speaker B: Hi.');
  assert.equal(Math.round(r.cost * 1000) / 1000, 0.115); assert.equal(costOf(3600), 0.23);
  assert.ok(status.some(t => /who said what/.test(t)));
});

test('accurate transcripts: a refused key, an unknown model name, a failed job and no recording all say so plainly', async () => {
  const res = (status, body) => ({ok: status < 300, status, json: async () => body});
  await assert.rejects(cloudTranscript({bytes: Buffer.from('x'), key: 'bad', fetchImpl: async () => res(401, {error: 'Invalid API key'}), sleep: async () => {}}), /did not accept the key/);
  await assert.rejects(cloudTranscript({bytes: Buffer.alloc(0), key: 'k', fetchImpl: async () => res(200, {}), sleep: async () => {}}), /no recording/);
  const bodies = []; let deleted = false;
  const fetchImpl = async (url, opt = {}) => {
    if (url.endsWith('/upload')) return res(200, {upload_url: 'u'});
    if (opt.method === 'POST') { const b = JSON.parse(opt.body); bodies.push(b); return b.speech_models ? res(400, {error: 'unknown model'}) : res(200, {id: 't2', status: 'error', error: 'file does not contain audio'}); }
    if (opt.method === 'DELETE') { deleted = true; return res(200, {}); }
    return res(200, {});
  };
  await assert.rejects(cloudTranscript({bytes: Buffer.from('x'), key: 'k', fetchImpl, sleep: async () => {}}), /could not transcribe the recording: file does not contain audio/);
  assert.equal(bodies.length, 2); assert.ok(!('speech_models' in bodies[1]));   // tried again with the service's default model
  await new Promise(r => setTimeout(r, 0)); assert.ok(deleted);   // even a failed job is removed from their servers
});

const REG = `HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone
    Value    REG_SZ    Allow
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\5319275A.WhatsAppDesktop_cv1g1gvanyjgm
    LastUsedTimeStart    REG_QWORD    0x1dd50482d8560d3
    LastUsedTimeStop    REG_QWORD    STOP_WA
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\MSTeams_8wekyb3d8bbwe
    LastUsedTimeStart    REG_QWORD    0x1dd50482d8560d3
    LastUsedTimeStop    REG_QWORD    0x1dd504ca57ca22f
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged\\C:#Windows#System32#WindowsPowerShell#v1.0#powershell.exe
    LastUsedTimeStart    REG_QWORD    0x1dd50482d8560d3
    LastUsedTimeStop    REG_QWORD    0x0
HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\CapabilityAccessManager\\ConsentStore\\microphone\\NonPackaged\\C:#Program Files#Google#Chrome#Application#chrome.exe
    LastUsedTimeStart    REG_QWORD    0x1dd50482d8560d3
    LastUsedTimeStop    REG_QWORD    STOP_CH`;
const reg = (wa, ch = '0x1dd504ca57ca22f') => REG.replace('STOP_WA', wa).replace('STOP_CH', ch);

test('noticing calls: the microphone record is read, JARVIS\'s own listening is ignored, and only call apps count', () => {
  const rows = parseMic(reg('0x0', '0x0'));
  assert.equal(rows.length, 4); assert.equal(rows.find(r => /Teams/.test(r.app)).stop > 0, true);
  assert.deepEqual(callsNow(rows).map(c => c.name), ['WhatsApp', 'your browser']);   // powershell is JARVIS listening for "Jarvis"
  assert.equal(callName('C:\\Users\\x\\AppData\\Roaming\\Zoom\\bin\\Zoom.exe'), 'Zoom'); assert.equal(callName('Microsoft.ScreenSketch_8wekyb3d8bbwe'), '');
});

test('noticing calls: an offer once a call app holds the microphone, nothing for a call already on at start, and the end of the followed call after a grace', async () => {
  let text = reg('0x1dd504ca57ca22f'), t = 0; const offers = [], ends = [];
  const w = new MicWatch({read: async () => text, onCall: c => offers.push(c.name), onHangUp: c => ends.push(c.name), now: () => t, every: 4000, grace: 20000});
  await w.tick(); assert.deepEqual(offers, []);
  text = reg('0x0'); t += 4000; await w.tick(); assert.deepEqual(offers, []);   // first sight: could be a blip
  t += 4000; await w.tick(); assert.deepEqual(offers, ['WhatsApp']);
  t += 4000; await w.tick(); assert.deepEqual(offers, ['WhatsApp']);   // offered once
  w.follow('5319275A.WhatsAppDesktop_cv1g1gvanyjgm');
  text = reg('0x1dd504ca57ca22f'); t += 4000; await w.tick(); t += 15000; await w.tick(); assert.deepEqual(ends, []);
  text = reg('0x0'); t += 4000; await w.tick(); text = reg('0x1dd504ca57ca22f'); t += 4000; await w.tick(); t += 19000; await w.tick(); assert.deepEqual(ends, []);   // picked up again inside the grace: still on
  t += 2000; await w.tick(); assert.deepEqual(ends, ['WhatsApp']);
  const late = new MicWatch({read: async () => reg('0x0'), onCall: c => offers.push('late ' + c.name), now: () => t});
  await late.tick(); t += 8000; await late.tick(); assert.ok(!offers.includes('late WhatsApp'));   // already in the call when JARVIS started
});
