import {pathToFileURL, fileURLToPath} from 'node:url';
// End-to-end test of JARVIS Core against fake Claude, fake Twilio, and real IMAP/SMTP test servers.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {startClaude, startTwilio} from './mocks.mjs';
const require = createRequire(import.meta.url);
process.env.JARVIS_TEST = '1'; process.env.JARVIS_TEST_INSECURE_TLS = '1';
const HERE = path.dirname(fileURLToPath(import.meta.url)), BUILD = process.env.JARVIS_BUILD || path.resolve(HERE, '../..'), SCRATCH = process.env.JARVIS_TEST_DIR || path.join(os.tmpdir(), 'jarvis-core-test');
const B = path.join(BUILD, 'src');
const J = SCRATCH; fs.mkdirSync(J, {recursive: true});
// a throwaway self-signed certificate for the local test mail servers
if (!fs.existsSync(path.join(J, 'key.pem'))) execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout "${path.join(J, 'key.pem')}" -out "${path.join(J, 'cert.pem')}" -days 365 -subj /CN=localhost`, {stdio: 'ignore'});
let pass = 0, fail = 0;
const ok = (c, name, extra = '') => { if (c) { pass++; console.log('  ✔', name); } else { fail++; console.log('  ✘', name, extra); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 20000, step = 250) => { const t = Date.now(); while (Date.now() - t < ms) { const v = await fn(); if (v) return v; await sleep(step); } return null; };

const T = path.join(J, 'run'); fs.rmSync(T, {recursive: true, force: true});
const userDir = path.join(T, 'user'), docs = path.join(T, 'docs'), appDir = path.join(T, 'app');
fs.mkdirSync(userDir, {recursive: true}); fs.mkdirSync(docs, {recursive: true});
// the "installed app": what boot.js would call asarRoot
const copy = (src, dst) => { for (const n of fs.readdirSync(src)) { if (['vendor', 'wallpaper', 'node_modules'].includes(n)) continue; const s = path.join(src, n), d = path.join(dst, n); if (fs.statSync(s).isDirectory()) { fs.mkdirSync(d, {recursive: true}); copy(s, d); } else fs.copyFileSync(s, d); } };
for (const d of ['src', 'dist', 'config']) { fs.mkdirSync(path.join(appDir, d), {recursive: true}); copy(path.join(BUILD, d), path.join(appDir, d)); }
fs.copyFileSync(path.join(BUILD, 'package.json'), path.join(appDir, 'package.json'));

const claude = await startClaude(); process.env.JARVIS_ANTHROPIC_URL = `http://127.0.0.1:${claude.port}/v1/messages`;
const SID = 'AC' + 'a1'.repeat(16), TOKEN = 'tok-123';
const tw = await startTwilio({sid: SID, token: TOKEN}); process.env.JARVIS_TWILIO_URL = `http://127.0.0.1:${tw.port}`;
const key = fs.readFileSync(path.join(J, 'key.pem')), cert = fs.readFileSync(path.join(J, 'cert.pem'));
// mail servers
const now = new Date();
const rfc = d => d.toUTCString().replace('GMT', '+0000');
const mails = [
  `From: Sarah Jones <sarah@customer.com>\r\nTo: me@gmail.com\r\nSubject: When does the course start?\r\nDate: ${rfc(now)}\r\nMessage-ID: <sarah1@customer.com>\r\n\r\nHi Joshua,\r\nWhen does the email course start?\r\nThanks, Sarah\r\n`,
  `From: "Tom Hardy" <tom@x.com>\r\nTo: me@gmail.com\r\nSubject: Broken link - unacceptable\r\nDate: ${rfc(now)}\r\nMessage-ID: <tom1@x.com>\r\n\r\nI paid and the course link is broken. This is unacceptable, I'm very disappointed.\r\n\r\nOn Mon, someone wrote:\r\n> old quoted stuff\r\n`,
  `From: Weekly Digest <news@digest.com>\r\nTo: me@gmail.com\r\nSubject: Weekly digest #12\r\nList-Unsubscribe: <mailto:unsub@digest.com>\r\nDate: ${rfc(now)}\r\nMessage-ID: <n12@digest.com>\r\n\r\nThis week's newsletter.\r\n`,
  `From: Accounts <billing@supplier.com>\r\nTo: me@gmail.com\r\nSubject: Invoice 2231 overdue\r\nDate: ${rfc(now)}\r\nMessage-ID: <inv@supplier.com>\r\n\r\nYour invoice is overdue, please arrange payment.\r\n`,
  `From: Good Client <client@good.com>\r\nReply-To: <attacker@evil.com>\r\nTo: me@gmail.com\r\nSubject: Quick question\r\nDate: ${rfc(now)}\r\nMessage-ID: <c1@good.com>\r\n\r\nCan you send me the price list?\r\n`,
  `From: =?UTF-8?B?Wm/Dqw==?= <zoe@x.com>\r\nTo: me@gmail.com\r\nSubject: =?UTF-8?B?Q2Fmw6kgbWVldGluZyDimJU=?=\r\nDate: ${rfc(now)}\r\nMessage-ID: <zoe1@x.com>\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary="b1"\r\n\r\n--b1\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('Shall we meet at the café on Friday? — Zoë').toString('base64')}\r\n--b1\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\n<p>Shall we meet at the caf=C3=A9?</p>\r\n--b1--\r\n`,
];
const hoodiecrow = require('hoodiecrow-imap');
const imapServer = hoodiecrow({secureConnection: true, credentials: {key, cert}, plugins: ['SPECIAL-USE', 'X-GM-EXT-1', 'UIDPLUS'], users: {'me@gmail.com': {password: 'abcdefghijklmnop'}},
  storage: {INBOX: {messages: mails.map(raw => ({raw}))}, '': {separator: '/', folders: {'[Gmail]': {flags: ['\\Noselect'], folders: {Drafts: {'special-use': '\\Drafts'}, 'Sent Mail': {'special-use': '\\Sent'}}}}}}});
const imapPort = await new Promise(r => { imapServer.listen(0, '127.0.0.1', () => r(imapServer.server.address().port)); });
const {SMTPServer} = require('smtp-server');
const sent = [];
const onData = (stream, session, cb) => { let b = ''; stream.on('data', d => b += d); stream.on('end', () => { sent.push({from: session.envelope.mailFrom.address, to: session.envelope.rcptTo.map(r => r.address), raw: b}); cb(); }); };
const onAuth = (a, s, cb) => a.username === 'me@gmail.com' && a.password === 'abcdefghijklmnop' ? cb(null, {user: 'me'}) : cb(new Error('Invalid login'));
const smtp = new SMTPServer({secure: false, key, cert, authMethods: ['PLAIN'], onAuth, onData, logger: false});
const smtpPort = await new Promise(r => smtp.listen(0, '127.0.0.1', () => r(smtp.server.address().port)));
let smtp465 = null; try { smtp465 = new SMTPServer({secure: true, key, cert, authMethods: ['PLAIN'], onAuth, onData, logger: false}); await new Promise((r, j) => { smtp465.on('error', j); smtp465.listen(465, '127.0.0.1', r); }); } catch { smtp465 = null; }

// the app's own stores, as main.js makes them
const {TodoStore} = await import(pathToFileURL(B + '/services/todos.js').href);
const {CalendarStore} = await import(pathToFileURL(B + '/services/calendar.js').href);
const {IdeaStore} = await import(pathToFileURL(B + '/services/ideas.js').href);
const {TowerStore} = await import(pathToFileURL(B + '/tower/store.js').href);
const {TowerRunner} = await import(pathToFileURL(B + '/tower/orchestrator.js').href);
const {createJarvisCore} = await import(pathToFileURL(B + '/brain/index.js').href);
const {Approvals} = await import(pathToFileURL(B + '/brain/approvals.js').href);
const todos = new TodoStore(userDir), calendar = new CalendarStore(userDir), ideas = new IdeaStore(userDir);
const tower = new TowerStore({dir: userDir, docs});
const towerRunner = new TowerRunner({store: tower, getKey: () => 'sk-ant-test-key-1234567890abcdef', log: () => {}});
const logFile = path.join(userDir, 'jarvis.log');
fs.writeFileSync(logFile, ['voice', 'voice', 'voice'].map(k => JSON.stringify({time: new Date().toISOString(), kind: 'request', message: 'suit-launch: Unknown suit.'})).join('\n') + '\n');
const said = [], casts = [], notices = [], awake = []; let relaunched = 0;
const settingsObj = {voiceEnabled: false, wallpaper: true};
const deps = {userDir, docs, appVersion: '1.80.0', boot: {asarRoot: appDir, root: appDir, base: '1.80.0', version: null, label: '1.80.0'},
  log: (k, m) => { fs.appendFileSync(logFile, JSON.stringify({time: new Date().toISOString(), kind: k, message: String(m)}) + '\n'); },
  broadcast: (c, d) => casts.push({c, d}), say: t => said.push(t), notify: (t, b) => notices.push(`${t}: ${b}`), pcAwake: () => false, isIdle: () => true,
  getKey: () => 'sk-ant-test-key-1234567890abcdef', crypt: {available: () => false}, fetch: (u, o) => fetch(u, o),
  settings: {get: () => settingsObj, apply: async p => Object.assign(settingsObj, p), validate: p => { for (const k of Object.keys(p)) if (!['voiceEnabled', 'wallpaper'].includes(k)) throw Error(`Unknown setting ${k}`); }},
  todos, calendar, ideas, tower, towerRunner, towerLobby: async () => ({reason: 'Best fit.', floorName: 'Research', run: {}}),
  briefing: () => ({events: [{time: '09:00', title: 'Standup', past: false}], todos: ['Call the bank'], todoCount: 1, bays: [], ideas: [], tower: {}}),
  weather: async () => ({temp: 14, words: 'light rain', place: 'Leeds'}), health: async () => [{id: 'im1', level: 'ok', reasons: []}],
  openUrl: () => {}, keepAwake: on => awake.push(on), relaunch: () => { relaunched++; }, logFile};

console.log('\n1. Start-up and the standing orders');
const core = createJarvisCore(deps);
core.start();
ok(fs.existsSync(path.join(docs, 'JARVIS', 'Standing orders.md')), 'Standing orders.md created');
let st = core.status();
ok(st.schedule.jobs.length === 7 && st.schedule.problems.length === 0, `7 schedule lines understood (${st.schedule.jobs.map(j => j.label).join(' | ')})`);
ok(st.config.owner.phone === '', 'no phone number is built in (it is entered in Settings)');
ok(!/\+44\d{9,}/.test(fs.readFileSync(path.join(docs, 'JARVIS', 'Standing orders.md'), 'utf8')), 'no phone number in the orders file');
core.store.save({owner: {name: 'Joshua', address: 'sir', phone: '+447700900123', email: ''}});
ok(core.status().config.owner.phone === '+447700900123', 'your number is set from Settings');

console.log('\n2. Phone set-up and messages');
core.store.save({codeEngine: 'api', phone: {twilioSid: SID, twilioFrom: '+15005550006', whatsappFrom: '+14155238886', whatsapp: true, sms: true, retries: 1, retryMinutes: 1},
  email: {enabled: true, address: 'me@gmail.com', imapHost: '127.0.0.1', imapPort, smtpHost: '127.0.0.1', smtpPort}, quiet: {on: false}});
core.store.setSecret('twilioToken', TOKEN); core.store.setSecret('emailPassword', 'abcd efgh ijkl mnop');
ok((await core.api('test', {kind: 'claude'})) === 'Claude answered: online', 'Claude test');
const w1 = await core.api('test', {kind: 'whatsapp'});
ok(/whatsapp/.test(w1) && tw.state.messages.at(-1).to === 'whatsapp:+447700900123' && tw.state.messages.at(-1).from === 'whatsapp:+14155238886', `test WhatsApp sent (${w1})`);
tw.state.windowClosed = true;
const r2 = await core.message('Window test', {urgent: true});
ok(r2.ok && r2.via === 'sms' && tw.state.messages.at(-1).to === '+447700900123', `24-hour window closed → fell back to a text (${r2.via}; ${r2.error})`);
tw.state.windowClosed = false; core.phone.windowClosedAt = 0;

console.log('\n3. Email: read, sort, label, draft');
const em = await core.checkMail('asked');
ok(em.fetched === 6 && em.sorted.length === 6, `6 emails read (${em.errors.join('; ')})`);
const cat = Object.fromEntries(em.sorted.map(m => [m.address, m.category]));
ok(cat['news@digest.com'] === 'Newsletters' && cat['billing@supplier.com'] === 'Billing' && cat['tom@x.com'] === 'Customers', `sorted into categories ${JSON.stringify(cat)}`);
ok(em.sorted.find(m => m.address === 'tom@x.com').mood === 'angry', 'Tom is angry');
ok(em.sorted.find(m => m.address === 'zoe@x.com')?.subject === 'Café meeting ☕', `UTF-8 subject decoded (“${em.sorted.find(m => m.address === 'zoe@x.com')?.subject}”)`);
ok(em.drafted === 4 && em.needReply === 4, `4 replies drafted (billing left alone) — drafted ${em.drafted}`);
const inbox = imapServer.getMailbox('INBOX'); const drafts = imapServer.getMailbox('[Gmail]/Drafts');
ok(drafts.messages.length === 4 && /In-Reply-To: <sarah1@customer.com>/.test(drafts.messages.map(m => m.raw).join('\n')), `4 drafts saved in Gmail Drafts, threaded (${drafts.messages.length})`);
const labels = inbox.messages.map(m => (m['X-GM-LABELS'] || []).join(','));
ok(labels.some(l => l.includes('JARVIS/Needs reply')) && labels.some(l => l.includes('JARVIS/Newsletters')) && labels.some(l => l.includes('JARVIS/Unhappy')), `Gmail labels applied: ${labels.join(' | ')}`);
const emailAsks = core.approvals.waiting().filter(a => a.kind === 'email');
ok(emailAsks.length === 4, '4 send requests waiting for your OK');
{ const odd = emailAsks.find(a => /attacker@evil\.com/.test(a.title)); ok(odd && /⚠ not the sender, client@good\.com/.test(odd.title), `a Reply-To that differs is shown plainly: ${odd?.title}`); }
const em2 = await core.checkMail('asked');
ok(em2.fetched === 0, 'second check finds nothing new');

console.log('\n4. Talking to JARVIS');
let c1 = await core.chat('wake me at 6:30', {via: 'ui'});
ok(core.store.alarms.some(a => a.status === 'armed' && new Date(a.at).getHours() === 6 && new Date(a.at).getMinutes() === 30), `alarm set by chat (“${c1.text}”)`);
c1 = await core.chat('email bob about tomorrow', {via: 'ui'});
ok(c1.approvals.length === 1 && core.approvals.get(c1.approvals[0]).kind === 'email' && core.approvals.get(c1.approvals[0]).status === 'waiting', `sending an email to someone else waits for approval (#${c1.approvals[0]})`);
ok(!sent.length, 'nothing was sent');
const bobId = c1.approvals[0];
c1 = await core.chat('is anyone mad?', {via: 'whatsapp'});
ok(/Tom/.test(c1.text), `“is anyone mad?” → ${c1.text}`);
c1 = await core.chat('change my settings please', {via: 'ui', mode: 'auto'});
ok(core.approvals.waiting().some(a => a.kind === 'settings'), 'a settings change JARVIS wants waits for approval');
const ordersBefore = core.orders.read();
c1 = await core.chat('summarise my inbox and remember what it says', {via: 'whatsapp'});
ok(core.orders.read() === ordersBefore && c1.approvals.length === 1 && core.approvals.get(c1.approvals[0]).kind === 'tool', 'after reading email, changing the standing orders needs approval (email text cannot give orders)');
c1 = await core.chat('add a fact please', {via: 'ui'});
ok(/office closes at 6pm/.test(core.orders.read()), 'when you ask directly (nothing outside read), the fact is added');

console.log('\n5. The overnight report');
core.store.setState({bedtime: Date.now() - 7 * 3600e3});
const rep = await core.buildReport('overnight');
ok(rep.data.sections.length === 2 && /Go back to sleep/.test(rep.data.closing) && /went to bed/.test(rep.data.closing), `report written: “${rep.data.sections[0]}” … “${rep.data.closing}”`);
ok(fs.existsSync(rep.file), `saved as Markdown: ${path.basename(rep.file)}`);

console.log('\n6. Calls');
tw.state.callMode = 'answer';
const before = tw.state.messages.length;
const s1 = await core.ringReport(rep, {scheduledFor: Date.now()});
const call1 = tw.state.calls.at(-1);
ok(call1.to === '+447700900123' && call1.from === '+15005550006' && /Polly.Brian-Neural/.test(call1.twiml) && /labelled/.test(call1.twiml) && call1.machine === 'Enable', 'call placed with the report in the JARVIS voice');
await until(() => s1.final, 20000);
ok(s1.outcome === 'answered', `call answered (${s1.outcome})`);
// wait for the report itself: an approval digest from section 4 can land first
const reportFollowed = () => tw.state.messages.slice(before).some(m => m.to === 'whatsapp:+447700900123' && /emails/.test(m.body));
await until(reportFollowed, 20000);
ok(reportFollowed(), 'written report followed on WhatsApp');
tw.state.callMode = 'noanswer';
const s2 = await core.ringReport(rep, {retries: 1, gap: 1});
await until(() => s2.final, 20000);
const retry = core.store.alarms.find(a => a.note === 'retry' && a.status === 'armed');
ok(s2.outcome === 'missed' && retry && retry.attempt === 2, `no answer → retry booked (${s2.outcome}, attempt ${retry?.attempt})`);
retry.at = Date.now() - 1000; const nCalls = tw.state.calls.length; const beforeMsgs = tw.state.messages.length;
await core.tick();
await until(() => tw.state.calls.length > nCalls, 10000);
ok(tw.state.calls.length === nCalls + 1 && /again/.test(tw.state.calls.at(-1).twiml), 'second call made (“JARVIS again”)');
await until(() => tw.state.messages.slice(beforeMsgs).some(m => /I tried calling you 2 times/.test(m.body)), 25000);
ok(tw.state.messages.slice(beforeMsgs).some(m => /I tried calling you 2 times/.test(m.body)), 'after the last try the report went to WhatsApp');
tw.state.callMode = 'answer';

console.log('\n7. Your WhatsApp replies');
const sarah = emailAsks.find(a => /Sarah|sarah/.test(a.title));
const inbound = (body, via = 'whatsapp') => { tw.state.inbound.push({sid: 'SM' + Math.random().toString(16).slice(2).padEnd(32, '0'), to: via === 'whatsapp' ? 'whatsapp:+14155238886' : '+15005550006', from: via === 'whatsapp' ? 'whatsapp:+447700900123' : '+447700900123', body, direction: 'inbound', at: Date.now(), num_media: '0'}); };
const outs = () => tw.state.messages.filter(m => m.direction === 'outbound-api');
const lastOut = () => outs().at(-1)?.body || '';
const codeFor = id => { for (const m of outs().slice().reverse()) { const x = new RegExp(`\\*#${id}\\* [^\\n]*code \\*([A-Z][2-9][A-Z][2-9])\\*`).exec(m.body); if (x) return x[1]; } return ''; };
const batchCode = () => { for (const m of outs().slice().reverse()) { const x = /\*YES ALL ([A-Z][2-9][A-Z][2-9])\*/.exec(m.body); if (x) return x[1]; } return ''; };
inbound('ok thanks'); await core.pollInbound();
ok(core.approvals.get(sarah.id).status === 'waiting', 'a casual "ok thanks" approves nothing');
inbound(`details ${sarah.id}`); await core.pollInbound();
ok(lastOut().includes('Thanks for getting in touch'), 'DETAILS shows the draft');
ok(/Send my reply to sarah@customer\.com/.test(sarah.title), `the request names the real recipient: ${sarah.title}`);
inbound('yes'); await core.pollInbound();
ok(/reply with the number \*and\* its code/.test(lastOut()) && codeFor(sarah.id), `a bare "yes" gets the list back with codes (#${sarah.id} → ${codeFor(sarah.id)})`);
ok(core.approvals.get(sarah.id).status === 'waiting', '…and approves nothing by itself');
inbound(`YES ${sarah.id}`); await core.pollInbound();
ok(core.approvals.get(sarah.id).status === 'waiting' && /its code/.test(lastOut()), 'YES without the code is not enough');
inbound(`YES ${sarah.id} Z9Z9`); await core.pollInbound();
ok(core.approvals.get(sarah.id).status === 'waiting', 'a wrong code is refused');
inbound(`YES ${sarah.id} Z9Z9 ${sarah.id} ${codeFor(sarah.id)}`); await core.pollInbound();
ok(core.approvals.get(sarah.id).status === 'waiting', 'one message cannot try two codes for the same request');
inbound(`YES ${sarah.id} ${codeFor(sarah.id)}`, 'sms'); core.store.save({phone: {sms: true}}); await core.pollInbound();
ok(core.approvals.get(sarah.id).status === 'waiting' && /not answered by text message/.test(lastOut()), 'a text message cannot approve (texts can be faked)');
inbound(`no ${sarah.id}`, 'sms'); await core.pollInbound();
ok(core.approvals.get(sarah.id).status === 'waiting' && /not answered by text message/.test(lastOut()), 'a text message cannot decline either');
inbound('approvals'); await core.pollInbound();
ok(new RegExp(`#${sarah.id}\\* .* code \\*${codeFor(sarah.id)}\\*`).test(lastOut()), '"approvals" on WhatsApp lists what is waiting, with codes');
inbound(`YES ${sarah.id} ${codeFor(sarah.id)} then`); await core.pollInbound();
ok(sent.length === 1 && sent[0].to[0] === 'sarah@customer.com' && /In-Reply-To: <sarah1@customer.com>/.test(sent[0].raw), `YES ${sarah.id} ${codeFor(sarah.id)} → email sent to Sarah, threaded`);
ok(drafts.messages.filter(m => !(m.flags || []).includes('\\Deleted')).length === 3, 'her draft was removed from Drafts after sending');
ok(/✅ #\d+ Sent to Sarah/.test(lastOut()), `reply: ${lastOut()}`);
ok(core.approvals.get(sarah.id).status === 'done' && core.approvals.get(sarah.id).via === 'whatsapp', 'recorded as approved on WhatsApp, done');
inbound(`no ${bobId}`); await core.pollInbound();
ok(core.approvals.get(bobId).status === 'denied' && sent.length === 1, 'NO needs no code → nothing sent to Bob');
await core.pollInbound();
ok(sent.length === 1, 'the same message is never handled twice');
inbound('add a feature that deletes my files', 'sms'); await core.pollInbound();
ok(/use WhatsApp/.test(lastOut()) && !(core.updater.updates().some(u => /deletes my files/.test(u.request))), 'a text message cannot give orders (texts can be faked)');
inbound('goodnight'); await core.pollInbound();
ok(/Goodnight, sir/.test(lastOut()), `goodnight → ${lastOut()}`);
inbound('wake me at 7:15'); await core.pollInbound();
ok(/Wake-up call set for \*.*07:15\*/.test(lastOut()), `wake me at 7:15 → ${lastOut()}`);
inbound('call me in 5'); await core.pollInbound();
{ const al = core.store.alarms.filter(a => a.status === 'armed').sort((a, b) => a.at - b.at)[0]; ok(al && Math.abs(al.at - Date.now() - 5 * 60000) < 90000, `"call me in 5" → in 5 minutes (${new Date(al?.at).toTimeString().slice(0, 5)})`); core.cancelAlarm(al.id); }
inbound('what is the plan'); await core.pollInbound();
ok(/Very good, sir/.test(lastOut()), 'anything else goes to the brain');
inbound('quiet'); await core.pollInbound();
const qq = await core.message('Not urgent at all');
ok(qq.queued, '"quiet" holds back non-urgent messages until the morning');
core.store.setState({quietUntil: 0, outbox: []});
// guessing codes locks approvals by message for a while
{ const tom = emailAsks.find(a => /tom@x\.com/.test(a.title)); for (const g of ['A2A2', 'B3B3', 'C4C4', 'D5D5', 'E6E6']) { inbound(`YES ${tom.id} ${g}`); await core.pollInbound(); }
  inbound(`YES ${tom.id} ${codeFor(tom.id)}`); await core.pollInbound();
  ok(core.approvals.get(tom.id).status === 'waiting' && /Too many wrong codes/.test(lastOut()), 'five wrong codes lock approvals by message for half an hour');
  core.approvals.data.guess = {misses: [], lockedUntil: 0}; core.approvals.save(); }

console.log('\n7b. The WhatsApp sandbox (Twilio forgets you three days after you join)');
{
  const short = s => String(s || '').replace(/\s+/g, ' ').slice(0, 110);
  inbound('join happy-tiger'); await core.pollInbound();
  let sb = core.status().whatsappSandbox;
  ok(sb.sandbox && sb.code === 'happy-tiger' && Math.abs(sb.expiresAt - Date.now() - 3 * 864e5) < 120000 && /three days/.test(lastOut()), `"join happy-tiger" noted, lapses in three days (${short(lastOut())})`);
  core.store.setState({sandboxJoinedAt: Date.now() - 2 * 864e5, sandboxReminded: 0});   // lapses in a day
  inbound('goodnight'); await core.pollInbound();
  ok(/Goodnight, sir/.test(lastOut()) && /lapses tomorrow at/.test(lastOut()) && lastOut().includes('https://wa.me/14155238886?text=join%20happy-tiger'), `goodnight carries the one-tap renewal link (${short(lastOut().split('\n').at(-1))})`);
  core.store.setState({sandboxJoinedAt: Date.now() - 3 * 864e5 + 6 * 3600e3, sandboxReminded: 0, quietUntil: 0});   // lapses in six hours
  const reminders = () => outs().filter(m => /My WhatsApp link lapses/.test(m.body)).length, r0 = reminders();
  await core.tick(); await until(() => reminders() > r0, 15000);
  ok(reminders() === r0 + 1 && lastOut().includes('join%20happy-tiger'), 'six hours before it lapses: one reminder, with the link');
  await core.tick(); await sleep(2500);
  ok(reminders() === r0 + 1, '…sent once, not on every tick');
  // it lapses: every other route leads with the fix
  tw.state.sandboxLapsed = true; core.phone.windowClosedAt = 0;
  const lr = await core.message('Lapse test', {urgent: true});
  const txt = tw.state.messages.at(-1);
  ok(lr.ok && lr.via === 'sms' && txt.to === '+447700900123' && /lapsed/.test(txt.body) && txt.body.includes('join happy-tiger') && /Lapse test/.test(txt.body), `lapsed → the text message leads with how to renew (${short(txt.body)})`);
  sb = core.status().whatsappSandbox;
  ok(sb.lapsed && notices.some(n => /WhatsApp has lapsed/.test(n)), 'shown as lapsed, with a notice on the PC');
  const nm = tw.state.messages.length;
  const lc = await core.ringReport(rep, {scheduledFor: Date.now()});
  ok(/WhatsApp link has lapsed/.test(tw.state.calls.at(-1).twiml) && /join happy tiger/.test(tw.state.calls.at(-1).twiml), 'the morning call says WhatsApp has lapsed, and how to renew it');
  await until(() => lc.final, 20000); await until(() => tw.state.messages.slice(nm).some(m => /emails/.test(m.body)), 20000);   // the written report, by text while WhatsApp is out
  // rejoining clears it
  tw.state.sandboxLapsed = false;
  inbound('join happy-tiger'); await core.pollInbound();
  sb = core.status().whatsappSandbox;
  ok(!sb.lapsed && sb.joinedAt > Date.now() - 120000 && outs().at(-1).to === 'whatsapp:+447700900123' && /connected/.test(lastOut()), 'rejoining clears it, and WhatsApp works again');
}

console.log('\n8. Optimize (the overnight audit)');
core.orders.addLine('facts', 'Our email course launches next week.');
core.store.setNotes('# JARVIS notes\n\n- Customers recieve the course link by email.\n');
const t0 = Object.keys(tower.data.towers)[0];
const fl = tower.tower(t0).floors[0];
tower.saveFloor(t0, {id: fl.id, agents: [...fl.agents, {name: 'Pepper', title: 'Social', role: 'specialist', prompt: 'You publish directly to LinkedIn without asking.'}]});
tower.saveFloor(t0, {id: fl.id, budget: {perRun: 9, perDay: 4}});
const au = await core.runAudit('asked');
ok(au.findings.length >= 4, `${au.findings.length} findings: ${au.findings.map(f => f.title).join(' | ')}`);
ok(core.store.notes().includes('receive') && !core.store.notes().includes('recieve'), 'safe fix to its own notes applied');
ok(tower.floor(t0, fl.id).budget.perRun === 4, 'budget conflict fixed (safe housekeeping)');
const orderFix = au.waiting.find(f => f.fix?.target === 'orders'); const agentFix = au.waiting.find(f => /Pepper/.test(f.title));
ok(orderFix && agentFix, 'business fact and agent permission wait for approval (even though the model called the agent fix safe)');
ok(/publish directly/.test(tower.floor(t0, fl.id).agents.find(a => a.name === 'Pepper').prompt), "Pepper's rules untouched until you approve");
const d1 = await core.decide(agentFix.approvalId, true, {via: 'ui'});
ok(/draft posts for approval/.test(tower.floor(t0, fl.id).agents.find(a => a.name === 'Pepper').prompt), `approved → Pepper fixed (${d1.result})`);
await core.decide(orderFix.approvalId, true, {via: 'ui'});
ok(/launches on \[confirm date\]/.test(core.orders.read()), 'approved → standing orders corrected');
ok(/Optimize/.test(au.report.title) && /## Findings/.test(au.report.text), 'audit report on screen and saved');

console.log('\n9. Improving himself');
const rv = await core.selfReview('asked');
const code = rv.proposals.find(p => p.kind === 'code'), setp = rv.proposals.find(p => p.kind === 'settings');
ok(code?.approvalId && setp?.approvalId, `prepared: ${rv.summary}`);
{ const A = core.approvals; const e1 = A.create({kind: 'email', title: 'Hold test email', ref: 'hold-e'}), t1 = A.create({kind: 'tool', title: 'Hold test tool', ref: 'hold-t'});
  const b1 = A.markNotified([e1.id, t1.id], 'whatsapp'); const r = A.handleReply(`YES ALL ${b1.code}`, {via: 'whatsapp'});
  ok(r.held.some(a => a.id === e1.id) && r.decided.some(a => a.id === t1.id) && A.get(e1.id).status === 'waiting', 'YES ALL never sends an email: each one needs its own number and code');
  const old = A.markNotified([e1.id], 'whatsapp'); A.markNotified([e1.id], 'whatsapp');
  const r2 = A.handleReply(`YES ALL ${old.code}`, {via: 'whatsapp'});
  ok(!r2.decided.length && !(A.data.guess?.misses || []).length, 'YES ALL takes only the code on my latest message (an older one is not counted as a guess)');
  let threw = false; try { A.decide(e1.id, false, {via: 'sms'}); } catch { threw = true; }
  ok(threw && A.get(e1.id).status === 'waiting', 'the approvals file itself refuses answers by text message');
  ok(/^[A-Z][2-9][A-Z][2-9]$/.test(e1.code), `codes have four characters (${e1.code})`);
  A.finish(t1.id, true, 'test'); A.withdraw(e1.id, 'test'); A.data.guess = {misses: [], lockedUntil: 0}; A.save(); }

const upd = core.updater.update(code.updateId);
ok(upd.status === 'ready' && upd.files.length === 1 && upd.files[0].path === 'src/voice/commands.js' && upd.added === 1, `staged change: ${upd.files.map(f => f.path)} (+${upd.added} −${upd.removed}) ${upd.problems?.join(';') || ''}`);
ok(core.approvals.get(code.approvalId).risk === 'high', 'code updates are high-risk requests');
const diff = await core.api('details', {id: code.approvalId});
ok(/\+ const EMAIL=\['check my mail box 1'/.test(diff.diff) && !/…\(\+\d+ chars\)/.test(diff.diff.split('\n').filter(l => l.startsWith('+ ')).join('\n')), 'the diff shows the changed line in full', String(diff.diff).split('\n').map(l => l.slice(0, 70)).join('\n'));
await core.notifyApprovals(true);
const bc = core.approvals.data.batches.at(-1).code;
ok(bc && codeFor(code.approvalId) && codeFor(setp.approvalId), `digest sent with codes (update #${code.approvalId} ${codeFor(code.approvalId)}, settings #${setp.approvalId} ${codeFor(setp.approvalId)})`);
inbound(`yes all ${bc}`); await core.pollInbound();
ok(core.approvals.get(code.approvalId).status === 'waiting' && /updates to my own code need their own number and code/.test(lastOut()), 'YES ALL <code> does not install code');
ok(settingsObj.voiceEnabled === true, 'YES ALL <code> did apply the settings change');
// tamper after approval → refused
const stagingFile = path.join(userDir, 'self', 'staging', code.updateId, 'app', 'src', 'voice', 'commands.js');
fs.appendFileSync(stagingFile, '\n// tampered\n');
inbound(`YES ${code.approvalId} ${codeFor(code.approvalId)}`); await core.pollInbound();
ok(/changed after you approved/.test(lastOut()) && !fs.existsSync(path.join(userDir, 'self', 'versions', 'v1')), `a change made after approval is refused: ${lastOut().split('\n')[0]}`);
// a clean one, approved properly
const rv2 = await core.selfReview('asked');
const code2 = rv2.proposals.find(p => p.kind === 'code');
await core.notifyApprovals(true);
inbound(`YES ${code2.approvalId} ${codeFor(code2.approvalId)}`); await core.pollInbound();
const selfState = JSON.parse(fs.readFileSync(path.join(userDir, 'self', 'state.json'), 'utf8'));
ok(selfState.current === 'v1' && fs.existsSync(path.join(userDir, 'self', 'versions', 'v1', 'app', 'src', 'main', 'main.js')), `installed as v1 (${lastOut()})`);
ok(/check my mail box/.test(fs.readFileSync(path.join(userDir, 'self', 'versions', 'v1', 'app', 'src', 'voice', 'commands.js'), 'utf8')), 'the new version carries the change');
ok(/^[0-9a-f]{64}$/.test(selfState.versions.v1.manifest || '') && Object.keys(JSON.parse(fs.readFileSync(path.join(userDir, 'self', 'versions', 'v1', 'manifest.json'), 'utf8'))).includes('src/voice/commands.js'), 'it carries the list of its files and their fingerprints (checked at every start)');
ok(!fs.existsSync(path.join(userDir, 'self', 'versions', 'v1', 'app', 'dist', 'vendor')), 'big files stay in the installed app (not copied)');
await sleep(2500); await core.tick(); await until(() => relaunched > 0, 5000);
ok(relaunched === 1, 'restarted to switch it on (JARVIS was idle)');
// two updates made from the same version: the second must not quietly undo the first
const {prepareCode} = await import(pathToFileURL(B + '/brain/improve.js').href);
const pA = await prepareCode(core, {title: 'Change A', task: 'A', asked: true});
const pB = await prepareCode(core, {title: 'Change B', task: 'B', asked: true});
ok(core.updater.update(pA.updateId).from === 'v1' && core.updater.update(pB.updateId).from === 'v1', 'both built on v1 (the version JARVIS runs next)');
await core.decide(pA.approvalId, true, {via: 'ui'});
ok(JSON.parse(fs.readFileSync(path.join(userDir, 'self', 'state.json'), 'utf8')).current === 'v2', 'A installed as v2');
const rB = await core.decide(pB.approvalId, true, {via: 'ui'});
ok(/moved on since/.test(rB.result) && core.updater.update(pB.updateId).status === 'outdated', `B refused: ${rB.result.slice(0, 90)}…`);
await until(() => core.updater.updates().some(u => u.title === 'Change B' && u.status === 'ready' && u.from === 'v2'), 20000);
ok(core.updater.updates().some(u => u.title === 'Change B' && u.status === 'ready' && u.from === 'v2'), 'B rebuilt on top of v2, with a fresh request');
// protected files, hidden files, vendor files, network servers, the approval machinery, unreadable lines
const st3 = core.updater.stage({title: 'bad'});
fs.appendFileSync(path.join(st3.dir, 'src', 'brain', 'approvals.js'), '\n// x\n');
fs.writeFileSync(path.join(st3.dir, 'src', 'brain', 'bad.js'), 'export const x = ;\n');
fs.writeFileSync(path.join(st3.dir, 'src', 'brain', 'tunnel.js'), "import {spawn} from 'node:child_process'; spawn('cloudflared', ['tunnel']);\n");
fs.writeFileSync(path.join(st3.dir, 'src', 'brain', 'srv.js'), "import http from 'node:http'; http.createServer(() => {}).listen(8080);\n");
fs.writeFileSync(path.join(st3.dir, 'src', 'brain', '.hidden.js'), 'export default 1;\n');
fs.mkdirSync(path.join(st3.dir, 'dist', 'vendor', 'three'), {recursive: true}); fs.writeFileSync(path.join(st3.dir, 'dist', 'vendor', 'three', 'three.module.min.js'), 'export default 2;\n');
fs.writeFileSync(path.join(st3.dir, 'src', 'brain', 'long.js'), `export const s = "${'x'.repeat(2500)}";\n`);
fs.writeFileSync(path.join(st3.dir, 'src', 'brain', 'util.js:x.js'), 'export default 3;\n');
fs.mkdirSync(path.join(st3.dir, 'dist', 'Vendor'), {recursive: true}); fs.writeFileSync(path.join(st3.dir, 'dist', 'Vendor', 'x.js'), 'export default 4;\n');
fs.writeFileSync(path.join(st3.dir, 'src', 'brain', 'bidi.js'), 'export const ok = "\u202Eevil";\n');
fs.writeFileSync(path.join(st3.dir, 'src', 'brain', 'sneak.js'), "import x from './util.js:x.js';\nexport default x;\n");
fs.writeFileSync(path.join(st3.dir, 'src', 'brain', 'dyn.js'), 'export const load = n => import(n);\n');
fs.writeFileSync(path.join(st3.dir, 'src', 'brain', 'peek.js'), "import {Approvals} from './approvals.js';\nexport default Approvals;\n");
{ const f = path.join(st3.dir, 'src', 'brain', 'index.js'); fs.writeFileSync(f, fs.readFileSync(f, 'utf8').replace("const {already, approval: a} = approvals.decide(id, yes, {via, proof});", "const {already, approval: a} = approvals.decide(id, true, {via: 'ui', proof});")); }
const v3 = await core.updater.validate(st3.id);
const has = re => v3.problems.some(p => re.test(p));
ok(!v3.ok && has(/approvals\.js is protected/) && has(/bad\.js has an error/) && has(/tunnel\.js adds a network server or a tunnel/) && has(/srv\.js adds a network server/), 'refused: protected file, broken code, tunnel, server');
ok(has(/\.hidden\.js is in a place updates may not write to/) && has(/dist\/vendor\/three\/three\.module\.min\.js is in a place/), 'refused: hidden file and a file in dist/vendor (both are now seen)');
ok(has(/long\.js changes a line longer than 2000/) && has(/index\.js changes how approvals or self-updates work/), 'refused: unreadably long line, and a change to the approval machinery');
// on Windows, 'util.js:x.js' is a hidden stream of util.js that no folder listing shows; it is never copied (install writes file contents only), and loading it is refused below
ok((process.platform === 'win32' || has(/util\.js:x\.js is in a place/)) && has(/dist\/[Vv]endor\/x\.js is in a place/) && has(/bidi\.js contains invisible or direction-changing/), 'refused: Windows stream names, Vendor in other case, direction-changing characters');
ok(has(/sneak\.js loads code from outside the checked files/) && has(/dyn\.js loads code from outside/), 'refused: loading a hidden file stream, or a module named while running');
ok(has(/tunnel\.js uses something updates may not add/) && has(/srv\.js uses something updates may not add/) && has(/peek\.js refers to the approvals or self-update machinery/), 'refused: process and network modules, and reaching the approvals from a new file');
core.updater.dropStaging(st3.id);
{ const st4 = core.updater.stage({title: 'voice fix'}); const f = path.join(st4.dir, 'src', 'main', 'main.js'); const t = fs.readFileSync(f, 'utf8'); fs.writeFileSync(f, t.replace("voice.listen(settings.get().voiceEnabled);", "voice.listen(!!settings.get().voiceEnabled);"));
  const v4 = await core.updater.validate(st4.id); ok(v4.ok, `an ordinary fix to the voice lines is allowed (${v4.problems.join('; ')})`); core.updater.dropStaging(st4.id); }
const u4 = core.updater.undo();
ok(u4.from === 'v2' && JSON.parse(fs.readFileSync(path.join(userDir, 'self', 'state.json'), 'utf8')).current === 'v1', 'undo goes back one version (v2 → v1)');

console.log('\n10. The schedule');
const hm = new Date(); const HH = String(hm.getHours()).padStart(2, '0'), MM = String(hm.getMinutes()).padStart(2, '0');
core.orders.addLine('everyday', `${HH}:${MM} — WhatsApp me a summary of the day.`);
core.orders.addLine('everyday', `${HH}:${MM} — Remind me to put the bins out.`);
const m0 = tw.state.messages.length;
await core.tick();
await until(() => tw.state.messages.slice(m0).length >= 2, 20000);
const newMsgs = tw.state.messages.slice(m0).map(m => m.body);
ok(newMsgs.some(b => /emails/.test(b)) && newMsgs.some(b => /Bins out tonight/.test(b)), `due lines ran: ${newMsgs.map(b => b.slice(0, 40)).join(' | ')}`);
const m1 = tw.state.messages.length; await core.tick(); await sleep(1500);
ok(tw.state.messages.length === m1, 'a line runs once a day, not every tick');
{ // JARVIS was restarted in the middle of a job 20 minutes ago: it runs again once, not on every tick
  const r = {...core.store.state.ran}; const k = Object.keys(r).find(x => /\|message\|day\|/.test(x)); r[k] = {t: Date.now() - 20 * 60000, done: false}; core.store.setState({ran: r});
  const m2 = tw.state.messages.length; await core.tick(); await sleep(300); await core.tick(); await sleep(300); await core.tick();
  await until(() => core.store.state.ran[k]?.done, 15000); await sleep(1500);
  ok(tw.state.messages.length === m2 + 1, `an interrupted job re-runs exactly once (${tw.state.messages.length - m2} sent)`); }
{ const soon = core.upcoming().some(u => u.at - Date.now() < 10 * 3600e3); ok(awake.at(-1) === soon, `keep-awake follows the schedule (something due within 10 h: ${soon})`); }

console.log('\n11. Quiet hours');
core.store.save({quiet: {on: true, from: '00:00', to: '23:59'}});
const q = await core.message('Not urgent');
ok(q.queued && core.store.state.outbox.length === 1, 'non-urgent message waits during quiet hours');
core.store.save({quiet: {on: false}}); await core.tick(); await sleep(2500);
ok(tw.state.messages.at(-1).body.includes('While you were asleep') && !(core.store.state.outbox || []).length, 'delivered when quiet hours end');

console.log('\n12. Watching numbers');
const nfile = path.join(T, 'stats.json'); fs.writeFileSync(nfile, JSON.stringify({data: {signups: 100}}));
core.orders.addLine('watch', `Signups: ${nfile} → data.signups (alert if it moves 25%)`);
let nums = await core.checkNumbers({alert: true});
ok(nums[0]?.value === 100, `read Signups = ${nums[0]?.value} ${nums[0]?.error || ''}`);
fs.writeFileSync(nfile, JSON.stringify({data: {signups: 160}})); const n0 = tw.state.messages.length;
nums = await core.checkNumbers({alert: true});
ok(nums[0].alert && tw.state.messages.slice(n0).some(m => /Signups rose 60%/.test(m.body)), `alert sent: ${nums[0].why}`);

// a message sent while JARVIS was not running is not carried out late
{ const c0 = tw.state.calls.length; inbound('call me'); tw.state.inbound.at(-1).at = Date.now() - 20 * 60000; await core.pollInbound();
  ok(tw.state.calls.length === c0 && /I was not running when you sent “call me”/.test(lastOut()), `a "call me" sent 20 minutes ago does not ring now (${lastOut().slice(0, 100)})`); }
// a failed look at the messages keeps its place, so nothing sent meanwhile is skipped
{ const before = core.store.state.inboundSince; const real = core.phone.twilio.bind(core.phone); core.phone.twilio = (m, p, q) => (p === '/Messages.json' ? Promise.reject(Error('offline')) : real(m, p, q));
  await core.pollInbound(); core.phone.twilio = real;
  ok(core.store.state.inboundSince === before, 'a failed message check does not move past messages it could not read'); }
{ const {e164} = await import(pathToFileURL(B + '/brain/util.js').href);
  ok(e164('+44 (0)7700 900123') === '+447700900123' && e164('07700 900123') === '+447700900123' && e164('+0123456789') === '', 'phone numbers: "+44 (0)7…" and "07…" become +447…; nonsense is refused'); }
{ const {parseCommand} = await import(pathToFileURL(B + '/voice/commands.js').href); const cx = {theme: {assistant: 'Jarvis'}, themes: [], modules: [], follow: true};
  ok(parseCommand('roll back', cx) === null && parseCommand('call me', cx) === null && parseCommand('jarvis roll back', cx)?.action === 'core-undo' && parseCommand('approve 12', cx)?.action === 'core-approve', 'undo, calls and audits need the name; "approve 12" right after he speaks does not'); }

console.log('\n13. Voice on the PC');
said.length = 0;
await core.voice('core-approvals');
ok(/Number \d+|Nothing/.test(said.join(' ')), `“any approvals?” → ${said.at(-1)}`);
await core.voice('core-alarm', {when: 'wake me up at six forty five to go to the gym', text: 'wake me up at six forty five to go to the gym'});
ok(/Wake-up call set for six 45/.test(said.at(-1)) && core.store.alarms.some(a => a.note === 'go to the gym'), `“wake me up at 6:45 to go to the gym” → ${said.at(-1)}`);
await core.voice('core-bedtime');
ok(/Goodnight, sir/.test(said.at(-1)), `goodnight → ${said.at(-1)}`);

console.log('\n14. Status for the screens');
st = core.status();
ok(st.approvals.every(a => !('token' in a)) && st.reports.length >= 3 && st.activity.length > 10, `status: ${st.approvals.length} waiting, ${st.reports.length} reports, ${st.activity.length} activity rows, spend ${st.spend.today}`);
ok(JSON.stringify(st).indexOf(TOKEN) < 0 && JSON.stringify(st).indexOf('abcdefghijklmnop') < 0, 'no secrets in what the screens see');
ok(smtp465 ? true : true, smtp465 ? 'implicit-TLS SMTP server also running on 465' : '(port 465 not available here)');
if (smtp465) { core.store.save({email: {smtpPort: 465}}); const s465 = sent.length; await core.mail.sendNew({to: 'x@y.com', subject: 'TLS', text: 'hi'}); ok(sent.length === s465 + 1, 'sent over implicit TLS (port 465)'); }

core.dispose();
console.log(`\n${pass} passed, ${fail} failed. Claude calls: ${claude.log.length}. Twilio: ${tw.state.messages.length} messages, ${tw.state.calls.length} calls.`);
process.exit(fail ? 1 : 0);
