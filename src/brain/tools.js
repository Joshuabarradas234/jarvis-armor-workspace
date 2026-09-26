/**
 * JARVIS Core — the tools: what JARVIS can actually do.
 * Every tool has a level:
 *   read  — looks, never changes anything
 *   auto  — safe to do on its own: your own lists, labels, drafts, alarms, messages to you
 *   user  — fine when you asked for it directly; otherwise it waits for your approval
 *   ask   — always waits for your approval: sending to other people, settings, agents' rules
 * A tool that needs approval is not run: it becomes request #n, and runs only after your YES.
 */
import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';
import {clip, oneLine, parseWhen, clock, dayKey} from './util.js';
import {validAddress} from './email.js';

/** Public web pages only: never this computer, the home network, or a redirect to them. At most 2 MB is read. */
function allowedIp(ip) {
  if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number); return !(a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224); }
  if (!net.isIPv6(ip)) return false;
  // only ordinary global addresses (2000::/3); never mapped/translated IPv4, loopback, private or link-local
  const first = parseInt((ip.startsWith('::') ? '0' : ip.split(':')[0]) || '0', 16);
  return (first & 0xe000) === 0x2000 && !/^2002:/i.test(ip) && !/^2001:0?:/i.test(ip);
}
export async function publicFetch(url, hops = 0) {
  const u = new URL(url);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw Error('Only plain web links.');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  const found = net.isIP(host) ? [{address: host, family: net.isIP(host)}] : await dns.lookup(host, {all: true});
  const pick = found.find(a => allowedIp(a.address));
  if (!pick || found.some(a => !allowedIp(a.address))) throw Error('That address is on this computer or a private network; I only read public pages.');
  // connect to exactly the address that was checked (no second look-up in between)
  const lib = u.protocol === 'https:' ? https : http;
  const res = await new Promise((resolve, reject) => {
    const req = lib.request(u, {method: 'GET', headers: {'User-Agent': 'Mozilla/5.0 JARVIS', Accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5'}, timeout: 20000,
      lookup: (_h, opts, cb) => (opts && opts.all ? cb(null, [{address: pick.address, family: pick.family}]) : cb(null, pick.address, pick.family))}, resolve);
    req.on('timeout', () => req.destroy(Error('The page took too long.'))); req.on('error', reject); req.end();
  });
  const loc = res.headers.location;
  if (res.statusCode >= 300 && res.statusCode < 400 && loc) { res.resume(); if (hops >= 4) throw Error('Too many redirects.'); return publicFetch(new URL(loc, u).href, hops + 1); }
  const chunks = []; let size = 0;
  await new Promise(resolve => { res.on('data', d => { size += d.length; if (size <= 2e6) chunks.push(d); else res.destroy(); }); res.on('end', resolve); res.on('close', resolve); res.on('error', resolve); });
  return {status: res.statusCode, text: Buffer.concat(chunks).toString('utf8')};
}

const S = (props = {}, required = []) => ({type: 'object', properties: props, required});
const str = d => ({type: 'string', description: d});
const int = d => ({type: 'integer', description: d});
const bool = d => ({type: 'boolean', description: d});

export function makeTools(core) {
  const {store, approvals, orders, deps} = core;
  const T = [];
  const add = (name, level, description, input_schema, run, extra = {}) => T.push({name, level, description, input_schema, run, ...extra});

  /* ---------------- read ---------------- */
  add('overview', 'read', 'Where everything stands right now: time, calendar today, to-dos, agents, approvals waiting, next call or alarm, email today, spend.', S(), () => core.overview());
  add('calendar_list', 'read', 'Calendar events for the next few days.', S({days: int('How many days ahead (default 7).')}), ({days = 7}) => {
    const end = Date.now() + Math.min(60, days) * 864e5, start = new Date().setHours(0, 0, 0, 0);
    return deps.calendar.list().filter(e => Date.parse(e.start) >= start && Date.parse(e.start) <= end).map(e => ({id: e.id, title: e.title, start: e.start, end: e.end}));
  });
  add('todo_list', 'read', 'The to-do list.', S(), () => deps.todos.list().slice(0, 60).map(t => ({id: t.id, text: t.text, done: t.done})));
  add('idea_list', 'read', 'Ideas in the Ideas room, with how far along each is.', S(), () => deps.ideas.list().map(i => ({id: i.id, title: i.title, stage: i.stage, progress: i.progress})));
  add('tower_status', 'read', 'The agent tower in each hall: floors, what is running, recent jobs and results.', S(), () => core.towerStatus());
  add('inbox_summary', 'read', 'Email JARVIS has sorted: who wrote, category, mood (angry/unhappy/neutral/happy), whether it needs a reply, whether a draft is waiting. Use this for "is anyone mad?" or "what came in?".',
    S({hours: int('How far back (default 24).'), category: str('Only this category.'), unhappy_only: bool('Only angry or unhappy senders.')}),
    ({hours = 24, category, unhappy_only}) => { const rows = core.mail.since(Date.now() - Math.min(24 * 14, hours) * 3600e3).filter(m => (!category || m.category === category) && (!unhappy_only || ['angry', 'unhappy'].includes(m.mood)));
      return {count: rows.length, emails: rows.slice(-60).map(m => ({uid: m.uid, at: new Date(m.at).toISOString(), from: m.from, subject: m.subject, category: m.category, mood: m.mood, needsReply: m.needsReply, draftWaiting: m.draft ? `#${m.approvalId}` : '', billing: m.billing, summary: m.summary}))}; });
  add('email_search', 'read', 'Search the mailbox (Gmail search syntax works, e.g. "from:sarah newer_than:7d").', S({query: str('What to search for.')}, ['query']), ({query}) => core.mail.search(query));
  add('email_read', 'read', 'Read one email in full, by its number (uid).', S({uid: int('The email number.')}, ['uid']), ({uid}) => core.mail.read(uid));
  add('numbers_check', 'read', 'Check the numbers listed under "Watch" in the standing orders now.', S(), () => core.checkNumbers({alert: false}));
  add('standing_orders_read', 'read', "Read the standing orders file (the owner's instructions).", S(), () => orders.read());
  add('notes_read', 'read', "Read JARVIS's own notes.", S(), () => store.notes() || '(no notes yet)');
  add('approvals_list', 'read', 'Requests waiting for the owner, or recent ones.', S({status: str('waiting (default), approved, denied, done, all')}),
    ({status = 'waiting'}) => approvals.list({status: status === 'all' ? undefined : status, limit: 40}).map(a => ({id: a.id, kind: a.kind, title: a.title, status: a.status, created: new Date(a.createdAt).toISOString()})));
  add('reports_list', 'read', 'Recent reports (overnight reports, audits, summaries).', S(), () => store.reports.slice(-15).reverse().map(r => ({id: r.id, kind: r.kind, title: r.title, at: new Date(r.at).toISOString()})));
  add('report_read', 'read', 'Read one report.', S({id: str('Report id.')}, ['id']), ({id}) => store.report(id)?.text || 'No such report.');
  add('activity', 'read', 'What JARVIS did on its own recently.', S({hours: int('How far back (default 24).')}), ({hours = 24}) => store.recent(Math.min(24 * 7, hours)).slice(-80).map(a => `${new Date(a.t).toLocaleString('en-GB', {weekday: 'short', hour: '2-digit', minute: '2-digit'})} ${a.kind}: ${a.text}`).join('\n') || 'Nothing.');
  add('app_health', 'read', "JARVIS's own health: recent errors, voice commands it did not understand, updates, version.", S(), () => core.health());
  add('weather', 'read', 'The weather at home now.', S(), async () => (await deps.weather()) || 'Weather is unavailable.');
  add('fetch_page', 'read', 'Read a public web page (text only).', S({url: str('https://…')}, ['url']), async ({url}) => {
    if (!/^https?:\/\//i.test(url)) throw Error('Only web links.');
    const r = await publicFetch(url);
    return clip(r.text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' '), 15000);
  }, {guarded: true, title: i => `Read a web page: ${clip(i.url, 120)}`});

  /* ---------------- auto ---------------- */
  add('todo_add', 'auto', 'Add a to-do.', S({text: str('The to-do.')}, ['text']), ({text}) => { deps.todos.add(clip(oneLine(text), 200)); return 'Added.'; });
  add('todo_done', 'auto', 'Tick off a to-do (by id, or by matching its text).', S({id: str('Id'), text: str('Words from the to-do')}), ({id, text}) => {
    const list = deps.todos.list(); const t = list.find(x => x.id === id) || list.find(x => !x.done && text && x.text.toLowerCase().includes(String(text).toLowerCase()));
    if (!t) throw Error('No such to-do.'); if (!t.done) deps.todos.toggle(t.id); return `Done: ${t.text}`;
  });
  add('calendar_add', 'auto', 'Put an event in the calendar.', S({title: str('Title'), start: str('ISO date-time, or words like "tomorrow at 3pm"'), end: str('Optional end, ISO'), reminder: bool('Remind 5 minutes before')}, ['title', 'start']), ({title, start, end, reminder}) => {
    let s = Date.parse(start); if (!Number.isFinite(s)) { const w = parseWhen(start); if (!w) throw Error('I could not read that time.'); s = w.at; }
    deps.calendar.save({title: clip(title, 150), start: new Date(s).toISOString(), end: end && Number.isFinite(Date.parse(end)) ? new Date(end).toISOString() : null, reminder: !!reminder});
    return `Added “${title}” at ${new Date(s).toLocaleString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'})}.`;
  });
  add('idea_add', 'auto', 'Add an idea to the Ideas room.', S({title: str('Idea'), notes: str('Notes')}, ['title']), ({title, notes = ''}) => { deps.ideas.save({title: clip(title, 120), notes: clip(notes, 3000), stage: 'spark', progress: 0, x: 30 + Math.random() * 40, y: 30 + Math.random() * 40}); return 'Saved.'; });
  add('note_to_self', 'user', "Write something down in JARVIS's own notes, to remember later.", S({text: str('The note')}, ['text']), ({text}) => { store.addNote(text); return 'Noted.'; }, {title: i => `Add to my notes: ${clip(i.text, 110)}`, detail: i => i.text});
  add('alarm_set', 'auto', 'Set a one-off wake-up call or reminder: JARVIS calls (or WhatsApps) the owner at that time.', S({when: str('Say am or pm whenever it could be either: "6:30am", "tomorrow at 7pm", "in 20 minutes"'), kind: str('call (default) or whatsapp'), note: str('What it is for'), report: bool('Include the overnight report (default true for morning calls)')}, ['when']),
    ({when, kind = 'call', note = '', report}) => { const w = parseWhen(/wake/i.test(note) && !/\b(am|pm)\b|\d(am|pm)/i.test(when) ? `${when} wake` : when); if (!w) throw Error('I could not read that time.'); const a = core.setAlarm({at: w.at, kind, note, report}); return `Set for ${new Date(a.at).toLocaleString('en-GB', {weekday: 'long', hour: '2-digit', minute: '2-digit'})} (${a.kind}).`; });
  add('alarm_cancel', 'auto', 'Cancel a one-off alarm.', S({id: str('Alarm id')}, ['id']), ({id}) => { core.cancelAlarm(id); return 'Cancelled.'; });
  add('alarm_list', 'read', 'Wake-up calls and scheduled calls coming up.', S(), () => core.upcoming());
  add('message_me', 'auto', 'Send the owner a WhatsApp message (or text). Outside quiet hours it goes now; during quiet hours it waits for the morning unless he asked for it.', S({text: str('The message')}, ['text']),
    async ({text}, ctx) => { const r = await core.message(`💬 ${text}`, {kind: 'chat', urgent: ctx.mode === 'user' || !!ctx.scheduled}); return r.queued ? 'Quiet hours: it will go in the morning.' : r.ok ? `Sent (${r.via}).` : `Could not send: ${r.error}`; });
  add('call_me', 'auto', "Ring the owner's phone now.", S({message: str('What the call is about (spoken first)'), report: bool('Read the overnight report')}),
    async ({message = '', report = false}, ctx) => { if (ctx.mode !== 'user' && !ctx.scheduled && core.inQuiet()) return 'Not calling: it is quiet hours and he did not ask for a call. Leave it for the morning report.'; await core.callNow({message, report}); return 'Calling now.'; });
  add('say_on_pc', 'auto', "Say something out loud through the computer's speakers.", S({text: str('What to say')}, ['text']), ({text}) => { deps.say(clip(text, 400)); return 'Said.'; });
  add('email_check', 'auto', 'Check for new email now: sort, label and draft replies.', S(), async () => { const r = await core.checkMail('asked'); return {sorted: r.sorted.length, drafted: r.drafted, needReply: r.needReply, errors: r.errors}; });
  add('email_label', 'auto', 'Label an email with a category.', S({uid: int('Email number'), category: str('Category')}, ['uid', 'category']), ({uid, category}) => core.mail.label(uid, clip(category, 30)).then(() => 'Labelled.'));
  add('email_archive', 'auto', 'Archive an email (out of the inbox, not deleted).', S({uid: int('Email number')}, ['uid']), ({uid}) => core.mail.archive(uid).then(() => 'Archived.'));
  add('open_on_screen', 'auto', 'Open a web page on the JARVIS screen.', S({url: str('https://…'), title: str('Title')}, ['url']), ({url, title = ''}) => { if (!/^https?:\/\//i.test(url)) throw Error('Only web links.'); deps.openUrl(url, title); return 'Opened.'; }, {guarded: true, title: i => `Open on screen: ${clip(i.url, 120)}`});
  add('run_audit', 'auto', 'Run the Optimize audit now: check JARVIS and every agent for stale facts and conflicting rules.', S(), async () => { const r = await core.runAudit('asked'); return r.summary; });
  add('self_review', 'auto', 'Look for things about JARVIS that are not working or could be better, and prepare updates (each one waits for approval before it is installed).', S(), async () => { const r = await core.selfReview('asked'); return r.summary; });
  add('propose_feature', 'user', 'Build a new feature or change to JARVIS itself (code or settings). It is prepared in a workshop copy and only installed after the owner approves it.', S({request: str('What to build, in detail'), why: str('Why')}, ['request']),
    ({request, why = ''}, ctx) => { core.feature(request, {why, via: ctx.via || 'chat', asked: ctx.mode === 'user' || ctx.mode === 'approved'}); return 'Started preparing it. When it is ready he will be asked to approve the install, with a summary of the changes.'; },
    {title: i => `Build a change to myself: ${clip(i.request, 110)}`, detail: i => `${i.request}${i.why ? `\n\nWhy: ${i.why}` : ''}`});

  /* ---------------- user: fine when he asked, otherwise approval ---------------- */
  add('tower_run', 'user', 'Give a job to a floor of the agent tower (costs API credit).', S({task: str('The job'), floor: str('Floor name (optional: the tower picks)'), hall: str('ironman, batcave or spiderman (optional)')}, ['task']),
    ({task, floor, hall}) => core.towerJob({task, floor, hall}), {title: i => `Give the tower a job: ${clip(i.task, 90)}`});
  add('orders_add', 'user', 'Add a line to the standing orders (e.g. a new daily call: section "everyday", line "06:30 weekdays — Call me with the overnight report").', S({section: str('about | everyday | watch | allowed | ask | facts'), line: str('The line')}, ['section', 'line']),
    ({section, line}) => { orders.addLine(section, line, 'JARVIS'); return 'Added to the standing orders.'; }, {title: i => `Add to standing orders (${i.section}): ${clip(i.line, 100)}`, detail: i => i.line});
  add('orders_edit', 'user', 'Change a line in the standing orders: exact text to find, and its replacement.', S({find: str('Exact text'), replace: str('New text'), why: str('Why')}, ['find', 'replace']),
    ({find, replace, why = ''}) => { orders.replaceOnce(find, replace, why || 'JARVIS'); return 'Changed.'; }, {kind: 'orders', title: i => `Change standing orders: “${clip(i.find, 60)}” → “${clip(i.replace, 60)}”`, detail: i => `${i.why ? i.why + '\n\n' : ''}- ${i.find}\n+ ${i.replace}`});
  add('remember_fact', 'user', 'Record a fact about the business in the standing orders (date anything time-sensitive).', S({fact: str('The fact')}, ['fact']),
    ({fact}) => { orders.addLine('facts', `${fact} (added ${new Date().toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'})})`, 'new fact'); return 'Recorded.'; }, {kind: 'orders', title: i => `Record a business fact: ${clip(i.fact, 110)}`});

  /* ---------------- ask: always approval ---------------- */
  add('email_send', 'ask', 'Send an email to someone. Always waits for the owner\'s approval.', S({to: str('Email address'), subject: str('Subject'), text: str('Body')}, ['to', 'subject', 'text']),
    ({to, subject, text}) => core.mail.sendNew({to, subject, text}).then(() => `Sent to ${to}.`), {kind: 'email', title: i => `Send email to ${i.to}: “${clip(i.subject, 70)}”`, detail: i => `To: ${i.to}\nSubject: ${i.subject}\n\n${i.text}`,
      check: i => { if (!validAddress(String(i.to || '').trim())) throw Error(`“${clip(i.to, 60)}” is not a valid email address.`); }});
  add('settings_change', 'ask', "Change one of JARVIS's settings (the app's settings.json, e.g. {\"voiceEnabled\": true}). Waits for approval.", S({patch: {type: 'object', description: 'Settings to change'}, why: str('Why')}, ['patch']),
    async ({patch}) => { await deps.settings.apply(patch); return 'Settings changed.'; }, {kind: 'settings', title: i => `Change settings: ${clip(Object.entries(i.patch || {}).map(([k, v]) => `${k} → ${JSON.stringify(v)}`).join(', '), 150)}`, detail: i => `${i.why || ''}\n\n${JSON.stringify(i.patch, null, 1)}`, check: i => deps.settings.validate(i.patch)});
  add('agent_update', 'ask', "Change an agent's or a floor's instructions in the tower (exact text to find and replace). Waits for approval.", S({hall: str('ironman / batcave / spiderman'), floor: str('Floor name'), agent: str('Agent name (leave out for the floor itself)'), field: str('prompt | purpose | lessons'), find: str('Exact text'), replace: str('New text'), why: str('Why')}, ['hall', 'floor', 'field', 'find', 'replace']),
    i => core.editAgent(i), {kind: 'tower', title: i => `Change ${i.agent ? `${i.agent} on ${i.floor}` : i.floor} (${i.field})`, detail: i => `${i.why ? i.why + '\n\n' : ''}- ${i.find}\n+ ${i.replace}`, risk: 'normal'});
  // everything a tool returns counts as outside text (it may carry words from an email or a page) — except these,
  // whose answers are fixed words or your own orders
  const CLEAN = new Set(['weather', 'standing_orders_read', 'todo_add', 'todo_done', 'calendar_add', 'idea_add', 'note_to_self', 'alarm_set', 'alarm_cancel', 'message_me', 'call_me', 'say_on_pc', 'email_label', 'email_archive', 'open_on_screen', 'propose_feature', 'orders_add', 'orders_edit', 'remember_fact', 'settings_change', 'agent_update', 'email_send']);
  for (const t of T) t.clean = CLEAN.has(t.name);
  return T;
}

/** The subset used during a phone call: quick, mostly looking things up. */
export const CALL_TOOLS = ['overview', 'inbox_summary', 'calendar_list', 'todo_list', 'tower_status', 'approvals_list', 'weather', 'activity', 'alarm_set', 'alarm_list', 'todo_add', 'message_me', 'numbers_check', 'report_read', 'reports_list', 'note_to_self'];
export {dayKey, clock};
