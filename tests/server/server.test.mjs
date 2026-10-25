// JARVIS Server, end to end: start the real server (test mode: it listens on 127.0.0.1 only), pair the way the ZenBook
// does, use JARVIS Core, the to-dos and the calendar over the link, save the Claude key sealed, send it a meeting to write
// up (with a scripted Claude), and move a brain into it.
// Runs on Windows, Linux and macOS with plain Node (no Electron).   node tests/server/server.test.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {LinkClient, PORT} from '../../src/main/link.js';
import {makeCrypt} from '../../src/server/secrets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASE = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-server-')), DATA = path.join(BASE, 'data');
let pass = 0, fail = 0; const ok = (c, name, extra = '') => { if (c) { pass++; console.log(`  ✔ ${name}`); } else { fail++; console.log(`  ✘ ${name}${extra ? ` (${extra})` : ''}`); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
// a scripted Claude for the meeting write-up: it answers every request with these notes
const NOTES = {summary: 'Agreed the deck.', decisions: ['Sam sends the deck'], actions: [{task: 'Send the deck', owner: 'Sam', deadline: 'Friday', evidence: 'Sam sends the deck by Friday'}], questions: [], work: []};
let claudeCalls = 0;
const claude = http.createServer((req, res) => { req.resume(); req.on('end', () => { claudeCalls++; res.writeHead(200, {'content-type': 'application/json'}); res.end(JSON.stringify({id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5', content: [{type: 'text', text: JSON.stringify(NOTES)}], stop_reason: 'end_turn', usage: {input_tokens: 10, output_tokens: 10}})); }); });
await new Promise(r => claude.listen(0, '127.0.0.1', r));
const env = {...process.env, JARVIS_SERVER_DIR: BASE, JARVIS_SERVER_TEST: '1', HOME: BASE, USERPROFILE: BASE, JARVIS_ANTHROPIC_URL: `http://127.0.0.1:${claude.address().port}/v1/messages`};   // HOME too: the pairing note goes on this test's own "Desktop"
fs.mkdirSync(path.join(BASE, 'Desktop'), {recursive: true});
// a leftover from before a restart, naming a process that is alive but isn't JARVIS Server (this test itself): it must not stop the server
if (process.platform !== 'win32') { fs.mkdirSync(DATA, {recursive: true}); fs.writeFileSync(path.join(DATA, 'server.pid'), String(process.pid)); }
const server = spawn(process.execPath, [path.join(ROOT, 'src', 'server', 'server.mjs')], {env, stdio: ['ignore', 'pipe', 'pipe']});
let out = ''; server.stdout.on('data', d => out += d); server.stderr.on('data', d => out += d);
const stopAll = () => { try { server.kill(); } catch {} try { claude.close(); } catch {} };
process.on('exit', stopAll);
try {
  console.log('JARVIS Server:');
  let code = '';
  for (let i = 0; i < 60 && !code; i++) { await sleep(500); try { code = JSON.parse(fs.readFileSync(path.join(DATA, 'pair-code.json'), 'utf8')).code; } catch {} }
  ok(/^[A-Z2-9]{6}$/.test(code), 'with nothing paired, it shows a pairing code straight away', code || out.slice(-800));
  ok(fs.existsSync(path.join(BASE, 'Desktop', 'JARVIS pairing code.txt')), 'and leaves it on the Desktop as a note');
  await sleep(1500);
  const host = '127.0.0.1';
  let wrong = ''; try { await LinkClient.pair({host, code: 'AAAAAA', name: 'Test'}); } catch (e) { wrong = e.message; }
  ok(/wrong or has run out/.test(wrong), 'a wrong code is refused', wrong);
  const p = await LinkClient.pair({host, code, name: 'ZenBook'});
  ok(p.token && p.token.length >= 40 && p.device.name === 'ZenBook', 'the right code pairs, once, and gives a long key');
  ok(!fs.existsSync(path.join(BASE, 'Desktop', 'JARVIS pairing code.txt')), 'the note goes once the code is used');
  let again = ''; try { await LinkClient.pair({host, code, name: 'Other'}); } catch (e) { again = e.message; }
  ok(/wrong or has run out/.test(again), 'the same code never works twice');
  const devices = JSON.parse(fs.readFileSync(path.join(DATA, 'link-devices.json'), 'utf8'));
  ok(devices.length === 1 && !JSON.stringify(devices).includes(p.token), 'the server keeps only a fingerprint of the key');

  const events = [], c = new LinkClient({host, token: p.token, onEvent: (ch, d) => events.push({ch, d})}); c.listen();
  const info = await c.call('server-info'); ok(info.version && info.core === 'running', 'JARVIS Core is running on the server', JSON.stringify(info));
  const status = await c.call('core', {method: 'status'}); ok(status && typeof status === 'object' && 'enabled' in status, 'JARVIS Core answers over the link (status)');
  const week = await c.call('core', {method: 'week-facts'}); ok(week && typeof week.spendHistory === 'object' && Array.isArray(week.dates) && 'emails' in week, 'the brain gives a signed-in computer its side of the week, for the weekly review', JSON.stringify(week).slice(0, 200));
  await sleep(500);
  const todos = await c.call('todo-add', {text: 'Ring the bank'}); ok(todos.some(t => t.text === 'Ring the bank'), 'a to-do added over the link is kept on the server');
  await sleep(300); ok(events.some(e => e.ch === 'todos'), 'and the change comes back as news');
  ok(Array.isArray(await c.call('calendar-list')), 'the calendar answers');
  let stays = ''; try { await c.post('/call', {method: 'tower-open', payload: 'x'}, 5000); } catch (e) { stays = e.message; }
  ok(/stays on the computer/.test(stays), 'anything that would open a window or a folder is refused');
  ok(await c.call('tower-key', 'sk-ant-test-0123456789abcdefghij'), 'the Claude key can be set from the ZenBook');
  const sealed = fs.readFileSync(path.join(DATA, 'anthropic-key.enc'));
  ok(!sealed.toString('latin1').includes('sk-ant-test'), 'and is kept sealed, never as plain text');
  ok((await c.call('server-info')).claudeKey === true, 'the server reports it has the key');
  let unknown = 0; try { await new LinkClient({host, token: 'z'.repeat(43)}).call('todo-list'); } catch (e) { unknown = /not signed in/.test(e.message); }
  ok(unknown, 'a computer that is not paired is turned away');

  // a meeting recorded on the ZenBook: the Mac keeps it and writes it up
  const rec = path.join(BASE, 'recording.webm'); fs.writeFileSync(rec, crypto.randomBytes(300000));
  const mid = crypto.randomUUID(), meeting = {id: mid, theme: 'batcave', hallName: 'Batcave', suitId: 'bc1', suitName: 'Hell Bat', startedAt: Date.now() - 600000, endedAt: Date.now(), duration: 600,
    transcript: '[00:05] We agreed Sam sends the deck by Friday.', sources: ['mic', 'system'], warnings: [], to: 'client@example.com'};
  const sent = await c.sendMeeting(meeting, rec);
  const kept = sent?.folder ? path.join(sent.folder, 'recording.webm') : '';
  ok(sent.id === mid && kept.startsWith(path.join(BASE, 'JARVIS', 'Meetings', 'Batcave', 'Hell Bat')) && fs.existsSync(kept) && fs.readFileSync(kept).equals(fs.readFileSync(rec)), 'a meeting from the ZenBook arrives whole, in ~/JARVIS/Meetings on the Mac', JSON.stringify(sent));
  for (let i = 0; i < 40 && !events.some(e => e.ch === 'meeting' && e.d?.type === 'saved' && e.d.id === mid); i++) await sleep(250);
  const saved = events.find(e => e.ch === 'meeting' && e.d?.type === 'saved' && e.d.id === mid)?.d;
  ok(saved && saved.followup === true && saved.suitName === 'Hell Bat', 'the Mac writes it up and tells the ZenBook', JSON.stringify(saved));
  const md = fs.existsSync(path.join(sent.folder, 'transcript.md')) ? fs.readFileSync(path.join(sent.folder, 'transcript.md'), 'utf8') : '';
  ok(claudeCalls > 0 && md.includes('Send the deck — Sam; deadline: Friday') && md.includes('We agreed Sam sends the deck by Friday'), 'the notes (from Claude) and the transcript are in the meeting\'s folder', md.slice(0, 300));
  ok((await c.call('todo-list')).some(t => t.text.startsWith('Send the deck — Sam')), 'its action items become to-dos on the Mac');
  const hist = await c.call('meeting-history'); ok(hist.some(h => h.id === mid && h.suitName === 'Hell Bat' && !('folder' in h)), 'the ZenBook can list it (without the Mac\'s paths)');
  ok((await c.call('meeting-read', {id: mid})).markdown.startsWith('# Meeting notes: Hell Bat'), 'and read its notes');
  const twice = await c.sendMeeting(meeting, rec); ok(twice.already === true && (await c.call('meeting-history')).filter(h => h.id === mid).length === 1, 'sent twice (after a lost answer), it is kept once');
  let bad = ''; try { await c.sendMeeting({id: '../../x', suitName: 'Bad'}, null); } catch (e) { bad = e.message; }
  ok(/not a meeting/.test(bad), 'something that is not a meeting is turned away', bad);
  ok(!fs.readdirSync(path.join(DATA, 'incoming')).length, 'nothing is left half-received');

  // Move JARVIS: the ZenBook hands everything over
  const bundle = {kind: 'jarvis-move', version: '1.97.0', savedAt: new Date().toISOString(), from: {platform: 'win32', home: 'C:\\Users\\Sam', userDir: 'C:\\Users\\Sam\\AppData\\Roaming\\jarvis-armor-workspace', docsDir: 'C:\\Users\\Sam\\OneDrive\\Documents'},
    files: {'todos.json': JSON.stringify([{id: 'm1', text: 'Moved over', done: false, created: 1, doneAt: null, source: '', owner: '', deadline: ''}])}, documents: {'Standing orders.md': '- 21:00 daily — summary'}};
  const moved = await c.move(bundle);
  ok(moved.files === 1 && moved.documents === 1, 'moving JARVIS writes his data on the server', JSON.stringify(moved).slice(0, 200));
  ok(fs.readFileSync(path.join(BASE, 'Documents', 'JARVIS', 'Standing orders.md'), 'utf8').includes('21:00'), 'his standing orders arrive in the server\'s own Documents');
  await sleep(1500);
  ok((await c.call('server-info')).core === 'running', 'JARVIS Core starts again on the moved data');
  c.close();
  const log = fs.readFileSync(path.join(DATA, 'jarvis.log'), 'utf8');
  ok(!/"kind":"crash"/.test(log), 'nothing was logged as a crash', (log.match(/.*"crash".*/g) || []).join(' | ').slice(0, 600));
  const crypt = makeCrypt(Buffer.alloc(32, 7)); ok(crypt.decrypt(crypt.encrypt('hello')) === 'hello', 'sealing round-trips');
} catch (e) { fail++; console.log(`  ✘ ${e.stack}`); }
stopAll(); await sleep(500);
if (fail) console.log('\nServer output:\n' + out.slice(-3000));
console.log(`\n${pass} passed, ${fail} failed.`);
try { fs.rmSync(BASE, {recursive: true, force: true}); } catch {}
process.exit(fail ? 1 : 0);
