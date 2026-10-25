// 1.100.0: calls recorded on the ZenBook are written up and kept on the Mac mini, and the halls go quiet while a call records.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {writeUp} from '../../src/meeting/writeup.js';
import {MeetingManager} from '../../src/meeting/manager.js';
import {LinkServer, LinkClient} from '../../src/main/link.js';

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-meet-')));
const meeting = () => ({suitName: 'Hell Bat', hallName: 'Batcave', startedAt: Date.UTC(2026, 9, 25, 10), duration: 600, transcript: '[00:05] We agreed Sam sends the deck by Friday.', recording: null, sources: ['mic', 'system'], warnings: []});
const NOTES = JSON.stringify({summary: 'Agreed the deck.', decisions: ['Sam sends the deck'], actions: [{task: 'Send the deck', owner: 'Sam', deadline: 'Friday', evidence: 'Sam sends the deck by Friday'}], questions: [], work: []});

test('the write-up: notes from Claude when it can be asked, and a plain reason when it cannot', async () => {
  const asked = [], m = meeting();
  const r = await writeUp(m, {summarise: async q => { asked.push(q); return NOTES; }, catalog: {suits: [], floors: []}});
  assert.equal(asked.length, 1); assert.match(asked[0].prompt, /Meeting for the "Hell Bat" workstation \(Batcave\)/); assert.match(asked[0].system, /British English meeting notes from imperfect offline transcription/);
  assert.equal(r.notes.actions[0].task, 'Send the deck');
  assert.ok(r.markdown.startsWith('# Meeting notes: Hell Bat') && r.markdown.includes('- Send the deck — Sam; deadline: Friday') && r.markdown.includes('We agreed Sam sends the deck by Friday') && r.markdown.includes('Recording: not saved'));
  const none = meeting(), r2 = await writeUp(none, {noEngine: 'No summary: add your Claude API key.'});
  assert.equal(r2.notes, null); assert.ok(r2.markdown.includes('> No summary: add your Claude API key.'));
  const broken = meeting(), r3 = await writeUp(broken, {summarise: async () => { throw Error('busy'); }});
  assert.ok(r3.markdown.includes('> No summary this time: busy'));
  const empty = {...meeting(), transcript: ''}, r4 = await writeUp(empty, {summarise: async () => NOTES});
  assert.ok(r4.markdown.includes('Nothing was transcribed') && r4.notes === null);
});

test('signed in to the Mac, a meeting records into the outbox and is forgotten here once the Mac has it; the Mac\'s past meetings join the list', () => {
  const dir = tmp(), docs = tmp(), staging = path.join(dir, 'meeting-outbox');
  const mm = new MeetingManager({dir, docs, scripts: dir});
  mm.startEngine = () => { mm.engine = {ready: false}; };   // no speech engine in a test
  const st = mm.start({theme: 'batcave', hallName: 'Batcave', suitId: 'bc1', suitName: 'Hell Bat', suitFolder: docs, staging});
  assert.equal(path.dirname(mm.m.folder), staging); assert.equal(path.basename(mm.m.folder), st.id);
  assert.ok(!fs.existsSync(path.join(docs, 'Meetings')));   // not in the suit's folder: nothing stays on this computer
  const m = mm.m; mm.forget(m); assert.equal(mm.m, null); assert.equal(mm.history.length, 0);
  mm.remote = [{id: 'r1', theme: 'batcave', suitId: 'bc1', suitName: 'Hell Bat', startedAt: 5, onMac: true}];
  mm.history = [{id: 'h1', theme: 'batcave', suitId: 'bc1', suitName: 'Hell Bat', startedAt: 9}];
  assert.deepEqual(mm.pastFor('batcave').map(h => h.id), ['h1', 'r1']); assert.equal(mm.find('r1').onMac, true);
});

test('the link takes a meeting as a stream into a file, refuses oversized details, and leaves nothing behind', async () => {
  const dir = tmp(), got = [];
  const srv = new LinkServer({dir, port: 0, address: () => '127.0.0.1', allow: ip => /127\.0\.0\.1$/.test(String(ip)), call: async () => null,
    onMeeting: async (details, file) => { got.push({details, bytes: fs.readFileSync(file)}); fs.rmSync(file); return {id: details.id}; }}).start();
  try {
    await new Promise(r => { const t = setInterval(() => { if (srv.server?.listening) { clearInterval(t); r(); } }, 10); });
    const port = srv.server.address().port, {code} = srv.startPairing(5);
    const {token} = await LinkClient.pair({host: '127.0.0.1', port, code, name: 'ZenBook'});
    const c = new LinkClient({host: '127.0.0.1', port, token});
    const rec = path.join(dir, 'rec.webm'), bytes = Buffer.alloc(1_500_000, 3); fs.writeFileSync(rec, bytes);
    assert.deepEqual(await c.sendMeeting({id: 'meeting-1', suitName: 'Hell Bat'}, rec), {id: 'meeting-1'});
    assert.equal(got[0].details.suitName, 'Hell Bat'); assert.ok(got[0].bytes.equals(bytes));
    assert.deepEqual(await c.sendMeeting({id: 'meeting-2'}, null), {id: 'meeting-2'}); assert.equal(got[1].bytes.length, 0);
    await assert.rejects(c.sendMeeting({id: 'big', pad: 'x'.repeat(8_100_000)}, null), /too big to send/);
    // the server's own guard, for a sender that does not check: details said to be over 8 MB are refused before anything is kept
    const http = await import('node:http'), len = Buffer.alloc(4); len.writeUInt32LE(9_000_000);
    const refused = await new Promise(resolve => { const rq = http.request({host: '127.0.0.1', port, path: '/meeting', method: 'POST', headers: {authorization: `Bearer ${token}`}}, res => { res.resume(); resolve(res.statusCode); }); rq.on('error', () => resolve('closed')); rq.write(len); rq.write(Buffer.alloc(64 * 1024)); rq.end(); });
    assert.ok(refused === 413 || refused === 'closed', String(refused));
    await assert.rejects(new LinkClient({host: '127.0.0.1', port, token: 'y'.repeat(43)}).sendMeeting({id: 'meeting-3'}, rec), /no longer signed in|not signed in/);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'incoming')), []);
  } finally { srv.stop(); }
});

test('the ZenBook hands a finished meeting to the Mac, keeps it safe if the Mac is away, and lists and opens the Mac\'s meetings', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["  if(linkClient)return sendMeetingToMac(m);\n", "staging:linkClient?path.join(userDir,'meeting-outbox'):null", "try{await linkClient.sendMeeting(meta,fs.existsSync(m.recording)?m.recording:null);}",
    "try{fs.rmSync(m.folder,{recursive:true,force:true});}", "writeJson(path.join(m.folder,'meeting.json'),meta)", "if(!linkClient||linkState!=='connected'||flushMeetingOutbox.busy)return;",
    "if(st==='connected'){linkSync();remoteMeetings();flushMeetingOutbox();}", "setInterval(()=>flushMeetingOutbox(),5*60000);", "else if(channel==='meeting')macMeeting(data);",
    "meetings.remote=list.map(h=>({...h,onMac:true}))", "const r=await linkClient.call('meeting-read',{id:h.id});", "emailError:h.emailError,onMac:!!h.onMac}))",
    "const w=await writeUp(m,{assemblyKey:core?.store?.secret?.('assemblyaiKey')"]) assert.ok(main.includes(s), s);
  assert.ok(main.indexOf('if(linkClient)return sendMeetingToMac(m);') > main.indexOf('const m=await meetings.finish();') && main.indexOf('if(linkClient)return sendMeetingToMac(m);') < main.indexOf('const w=await writeUp('));
  const server = fs.readFileSync('src/server/server.mjs', 'utf8');
  for (const s of ["link = new LinkServer({dir: DATA, call, onMove, onMeeting, log,", "m.folder = path.join(DOCS, 'JARVIS Meetings', safe(m.hallName), safe(m.suitName),", "const r = await ask({key, model: tower.settings().plannerModel, system, prompt, maxTokens: 5000});",
    "followup = meetingFollowups.capture(m, notes, m.to);", "cast('meeting', {type: 'saved', id: m.id,", "if (known || writing.has(m.id)) { fs.rmSync(file, {force: true});"]) assert.ok(server.includes(s), s);
});

test('a call being recorded silences the hall\'s soundscape and the second screen\'s backdrop sound, and they come back after', () => {
  const amb = fs.readFileSync('dist/assets/hands-ideas.js', 'utf8');
  for (const s of ["const target = recording ? 0 : Focus.state ? 0.25 :", "J.on('meeting', m => { if (m?.type === 'start') recording = true; else if (m?.type === 'state') recording = !!m.state?.active; else if (['stop', 'done', 'failed'].includes(m?.type)) recording = false; });",
    "J.call('meeting-state').then(st => { recording = !!st?.active; })"]) assert.ok(amb.includes(s), s);
  const deck = fs.readFileSync('dist/assets/deck.js', 'utf8');
  for (const s of ["if (this.sound) on && !this.recording ? this.sound.start() : this.sound.stop();", "if (D.sound) on || !D.soundPref() ? D.sound.stop() : D.sound.start();",
    "J.on('meeting', m => { if (m?.type === 'start') quiet(true); else if (m?.type === 'state') quiet(!!m.state?.active);"]) assert.ok(deck.includes(s), s);
});
