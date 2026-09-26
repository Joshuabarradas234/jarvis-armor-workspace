// Runs the real app in Electron (virtual screen), drives it over the DevTools protocol, and takes screenshots.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {startClaude, startTwilio} from './mocks.mjs';
const HERE = path.dirname(new URL(import.meta.url).pathname), BUILD = process.env.JARVIS_BUILD || path.resolve(HERE, '../..'), SCRATCH = process.env.JARVIS_TEST_DIR || path.join(os.tmpdir(), 'jarvis-core-test');
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');

const OUT = path.join(SCRATCH, 'shots'), PROFILE = path.join(BUILD, 'test-results', 'profile');
fs.mkdirSync(OUT, {recursive: true});
const log = (...a) => { const l = a.join(' '); console.log(l); fs.appendFileSync(path.join(OUT, 'run.log'), l + '\n'); };
fs.writeFileSync(path.join(OUT, 'run.log'), '');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MODE = process.argv[2] || 'ui';

const claude = await startClaude();
const SID = 'AC' + 'a1'.repeat(16), TOKEN = 'tok-123';
const tw = await startTwilio({sid: SID, token: TOKEN});
// a clean JARVIS Core state in the test profile
for (const f of ['brain.json', 'brain-secrets.enc', 'brain-state.json', 'approvals.json', 'reports.json', 'activity.jsonl', 'alarms.json', 'brain-spend.json']) fs.rmSync(path.join(PROFILE, f), {force: true});
if (MODE === 'ui') fs.rmSync(path.join(PROFILE, 'self'), {recursive: true, force: true});
fs.writeFileSync(path.join(PROFILE, 'brain.json'), JSON.stringify({phone: {twilioSid: SID, twilioFrom: '+15005550006', whatsappFrom: '+14155238886', whatsapp: true, sms: false}, codeEngine: 'api', quiet: {on: false}}));
fs.writeFileSync(path.join(PROFILE, 'brain-secrets.enc'), 'PLAIN:' + JSON.stringify({twilioToken: TOKEN}));
const now = Date.now();
fs.writeFileSync(path.join(PROFILE, 'approvals.json'), JSON.stringify({next: 15, items: [
  {id: 12, token: 'x'.repeat(24), kind: 'email', title: 'Send my reply to Sarah Jones: “When does the course start?”', detail: 'To: Sarah Jones <sarah@customer.com>\nSubject: Re: When does the course start?\n\nHi Sarah,\n\nThe course starts on [confirm date]. I will send the joining link the day before.\n\nJoshua', payload: {}, risk: 'normal', ref: 'e1', source: 'jarvis', group: 'email', status: 'waiting', createdAt: now - 3 * 3600e3, expiresAt: now + 3 * 864e5, notified: ['whatsapp'], notifiedAt: now - 3 * 3600e3},
  {id: 13, token: 'y'.repeat(24), kind: 'audit', title: 'Audit fix: The email course launch date is stale', detail: 'The standing orders say it launches "next week", but that line was written three weeks ago.\n\nStanding orders\n- launches next week\n+ launches on [confirm date]', payload: {}, risk: 'normal', ref: 'a1', source: 'jarvis', group: 'audit', status: 'waiting', createdAt: now - 4 * 3600e3, expiresAt: now + 3 * 864e5, notified: [], notifiedAt: 0},
  {id: 14, token: 'z'.repeat(24), kind: 'update', title: 'Update myself: Understand “check my mail”', detail: 'Why: You said “check my mail” 4 times this week and I did not understand.\n\nAdded “check my mail” to the email phrases.\n\nFiles (+1 −1 lines):\n~ src/voice/commands.js', payload: {updateId: 'uX', fingerprint: 'f'}, risk: 'high', ref: 'u1', source: 'nightly self-review', group: '', status: 'waiting', createdAt: now - 2 * 3600e3, expiresAt: now + 5 * 864e5, notified: ['whatsapp'], notifiedAt: now - 2 * 3600e3},
  {id: 11, token: 'w'.repeat(24), kind: 'email', title: 'Send my reply to Tom Hardy: “Broken link”', detail: '', payload: {}, risk: 'normal', ref: 'e0', source: 'jarvis', group: 'email', status: 'done', createdAt: now - 9 * 3600e3, decidedAt: now - 8 * 3600e3, via: 'whatsapp', result: 'Sent to Tom Hardy.', expiresAt: now + 864e5, notified: [], notifiedAt: 0}]}));
fs.writeFileSync(path.join(PROFILE, 'reports.json'), JSON.stringify([{id: 'r1', kind: 'overnight', title: 'Overnight report', at: now - 60 * 60000, text: '**38 emails** since you went to bed at 22:40 — all labelled.\n\n## Email\n- 11 need a reply: drafted and waiting for your OK (#12 and 10 more).\n- One unhappy customer: Tom Hardy, broken course link — replied (#11).\n- Billing: 2 invoices left for you.\n\n## Agents\n- Research floor finished “Competitor pricing”.\n- Product fix shipped at 02:14 and tested.\n\n## Optimize\n- 6 conflicts found; 2 fixed; 4 waiting for you (#13 …).\n\n## Today\n- 09:00 Standup\n- Light rain, 14°C in Leeds.', spoken: '', data: {sections: [], closing: ''}, delivered: [{via: 'call', ok: true, at: now - 58 * 60000}, {via: 'whatsapp', ok: true, at: now - 57 * 60000}], file: ''}]));
fs.writeFileSync(path.join(PROFILE, 'activity.jsonl'), [
  [9, 'email', 'Sorted 38 emails, drafted 11 replies (waiting for your OK).'], [8.5, 'audit', 'Optimize: 6 findings (4 conflicts, 2 stale). 2 fixed; 4 waiting for your approval.'], [7.8, 'self-update', 'Ready for your approval (#14): Understand “check my mail”'],
  [4, 'call', 'Call answered (report, 96s).'], [3.9, 'message', 'Messaged you (whatsapp): Overnight report — 38 emails…'], [3.5, 'approvals', '#11 done: Send my reply to Tom Hardy — Sent to Tom Hardy.']].map(([h, kind, text]) => JSON.stringify({t: now - h * 3600e3, kind, text, auto: kind !== 'approvals'})).join('\n') + '\n');

// you joined the WhatsApp sandbox a moment ago (JARVIS notes it, to remind you before it lapses)
tw.state.inbound.push({sid: 'SM' + 'j'.repeat(32), to: 'whatsapp:+14155238886', from: 'whatsapp:+447700900123', body: 'join happy-tiger', direction: 'inbound', at: Date.now(), num_media: '0'});
const env = {...process.env, JARVIS_TEST: '1', JARVIS_ANTHROPIC_URL: `http://127.0.0.1:${claude.port}/v1/messages`, JARVIS_TWILIO_URL: `http://127.0.0.1:${tw.port}`, ELECTRON_ENABLE_LOGGING: '1'};
const app = spawn('xvfb-run', ['-a', '-s', '-screen 0 2560x1600x24', path.join(BUILD, 'node_modules/.bin/electron'), '.', '--remote-debugging-port=9333', '--no-sandbox', '--disable-gpu-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'], {cwd: BUILD, env, detached: true, stdio: ['ignore', fs.openSync(path.join(OUT, 'electron.log'), 'w'), fs.openSync(path.join(OUT, 'electron.log'), 'a')]});
const stop = () => { try { process.kill(-app.pid, 'SIGTERM'); } catch {} };
process.on('exit', stop);
let browser;
for (let i = 0; i < 60 && !browser; i++) { await sleep(1000); try { browser = await chromium.connectOverCDP('http://127.0.0.1:9333'); } catch {} }
if (!browser) { log('could not connect'); stop(); process.exit(1); }
const pages = () => browser.contexts().flatMap(c => c.pages());
const find = async (view, ms = 60000) => { const t = Date.now(); while (Date.now() - t < ms) { const p = pages().find(p => p.url().includes(`view=${view}`)); if (p) return p; await sleep(500); } return null; };
const main = await find('main');
log('main page', !!main, main?.url());
await sleep(12000);
const shot = async (p, name) => { try { await p.screenshot({path: path.join(OUT, name), timeout: 60000}); log('shot', name); } catch (e) { log('shot failed', name, e.message.split('\n')[0]); } };
const ev = async (p, fn, arg) => { try { return await p.evaluate(fn, arg); } catch (e) { log('eval failed', e.message.split('\n')[0]); return null; } };
const st = await ev(main, () => window.jarvis.call('core', {method: 'status'}));
log('core status', st ? `${st.approvals.length} waiting · ${st.schedule.jobs.length} jobs · version ${st.version} · key ${st.key}` : 'none');
await ev(main, () => window.jarvis.call('tower-key', 'sk-ant-test-key-1234567890abcdef').catch(e => e.message));
if (MODE === 'boot') {
  const b = JSON.parse(fs.readFileSync(path.join(PROFILE, 'self', 'state.json'), 'utf8'));
  log('boot state', JSON.stringify({current: b.current, versions: Object.fromEntries(Object.entries(b.versions).map(([k, v]) => [k, {good: v.good, bad: v.bad, attempts: v.attempts, reason: v.reason}])), rolledBack: b.rolledBack}));
  const diag = await ev(main, () => window.jarvis.call('diagnostics'));
  log('running', diag?.running);
  await sleep(8000);
  const b2 = JSON.parse(fs.readFileSync(path.join(PROFILE, 'self', 'state.json'), 'utf8'));
  log('boot state after', JSON.stringify({current: b2.current, versions: Object.fromEntries(Object.entries(b2.versions).map(([k, v]) => [k, {good: v.good, bad: v.bad, attempts: v.attempts, reason: v.reason}])), rolledBack: b2.rolledBack}));
  const marker = await ev(main, () => document.documentElement.dataset.selfUpdateMarker || '');
  log('marker from the update', JSON.stringify(marker));
  stop(); process.exit(0);
}
// wake the hall so the icon row is there
await ev(main, () => window.jarvis.call('action', {action: 'wake'}));
await sleep(20000);
await shot(main, '01-hall.png');
const hasIcon = await ev(main, () => !!document.querySelector('.qp-icons [data-core]') && document.querySelector('.qp-icons [data-core]').dataset.count);
log('core icon + badge', hasIcon);
await ev(main, () => window.__jarvisCore.show('needs'));
await sleep(2500); await shot(main, '02-needs.png');
await ev(main, () => window.__jarvisCore.show('reports', 'r1'));
await sleep(2500); await shot(main, '03-reports.png');
await ev(main, () => window.__jarvisCore.show('activity'));
await sleep(1500); await shot(main, '04-activity.png');
await ev(main, () => window.__jarvisCore.show('schedule'));
await sleep(2000); await shot(main, '05-schedule.png');
await ev(main, () => window.__jarvisCore.show('updates'));
await sleep(1500); await shot(main, '06-updates.png');
await ev(main, () => window.__jarvisCore.show('talk'));
await sleep(800);
await ev(main, async () => { const f = document.querySelector('.jc-ask'); f.querySelector('input').value = 'wake me at 6:30'; f.requestSubmit(); });
await sleep(6000);
await ev(main, async () => { const f = document.querySelector('.jc-ask'); f.querySelector('input').value = 'email bob about tomorrow'; f.requestSubmit(); });
await sleep(6000); await shot(main, '07-talk.png');
const st2 = await ev(main, () => window.jarvis.call('core', {method: 'status'}));
log('after chat', st2 ? `${st2.approvals.length} waiting · alarms ${st2.upcoming.filter(u => u.source === 'alarm').length}` : 'none');
// approve from the panel: the audit one (#13) has no payload -> shows the failure path; decline #12
await ev(main, () => window.__jarvisCore.show('needs'));
await sleep(1500);
await ev(main, () => document.querySelector('.jc [data-act="no"][data-id="12"]').click());
await sleep(2500); await shot(main, '08-after-decline.png');
await ev(main, () => window.__jarvisCore.close());
// settings window
await ev(main, () => window.jarvis.call('action', {action: 'settings'}));
const setp = await find('settings', 30000);
log('settings page', !!setp);
if (setp) {
  await sleep(4000);
  await ev(setp, () => { const b = [...document.querySelectorAll('.settings-shell nav [data-tab]')].find(x => x.dataset.tab === 'JARVIS Core'); b?.click(); return !!b; });
  await sleep(3000); await shot(setp, '09-settings.png');
  await ev(setp, () => { const c = document.querySelector('.settings-content'); c.scrollTop = 900; });
  await sleep(800); await shot(setp, '10-settings-phone.png');
  await ev(setp, () => { const c = document.querySelector('.settings-content'); c.scrollTop = 2200; });
  await sleep(800); await shot(setp, '11-settings-email.png');
  const test = await ev(setp, async () => { document.querySelector('[data-test="whatsapp"]').click(); await new Promise(r => setTimeout(r, 6000)); return document.querySelector('[data-msg="phone"]').textContent; });
  log('settings test WhatsApp:', test, '| twilio messages:', tw.state.messages.length, tw.state.messages.at(-1)?.body?.slice(0, 60));
  // the sandbox forgets you after three days: the test message fails with 63015 and the panel says how to renew
  tw.state.sandboxLapsed = true;
  const lapse = await ev(setp, async () => { document.querySelector('[data-test="whatsapp"]').click(); await new Promise(r => setTimeout(r, 9000)); return document.querySelector('[data-msg="phone"]').textContent; });
  log('lapsed test WhatsApp:', lapse);
  await ev(main, () => window.__jarvisCore.show('needs'));
  await sleep(2500); await shot(main, '12-lapsed.png');
  const chip = await ev(main, () => [...document.querySelectorAll('.jc-chip')].map(c => c.textContent).join(' | ') + ' || ' + (document.querySelector('.jc-warn')?.textContent || ''));
  log('lapsed panel:', chip);
}
const elog = fs.readFileSync(path.join(OUT, 'electron.log'), 'utf8');
log('electron errors:', (elog.match(/Uncaught|Error:|TypeError|ReferenceError/g) || []).length);
const jl = fs.readFileSync(path.join(PROFILE, 'jarvis.log'), 'utf8').trim().split('\n').slice(-25).filter(l => /brain|crash|request|self|core/i.test(l));
log('app log tail:\n' + jl.join('\n'));
stop(); await sleep(500); process.exit(0);
