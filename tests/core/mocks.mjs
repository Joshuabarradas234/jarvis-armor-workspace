// Test doubles: a scripted Claude API and a Twilio API that behaves like the real one closely enough.
import http from 'node:http';
import crypto from 'node:crypto';

const rid = p => p + crypto.randomBytes(16).toString('hex');
const readBody = req => new Promise(r => { let b = ''; req.on('data', d => b += d); req.on('end', () => r(b)); });
const json = (res, code, obj) => { res.writeHead(code, {'content-type': 'application/json'}); res.end(JSON.stringify(obj)); };

export function startClaude() {
  const log = [];
  const usage = {input_tokens: 1200, output_tokens: 240};
  const text = t => ({id: rid('msg_'), type: 'message', role: 'assistant', content: [{type: 'text', text: t}], stop_reason: 'end_turn', usage});
  const tool = (name, input, lead = '') => ({id: rid('msg_'), type: 'message', role: 'assistant', content: [...(lead ? [{type: 'text', text: lead}] : []), {type: 'tool_use', id: rid('toolu_'), name, input}], stop_reason: 'tool_use', usage});
  function answer(body) {
    const sys = Array.isArray(body.system) ? body.system.map(b => b.text).join('\n') : String(body.system || '');
    const msgs = body.messages;
    const userTexts = msgs.filter(m => m.role === 'user' && typeof m.content === 'string');
    const ask = userTexts.length ? userTexts[userTexts.length - 1].content : '';
    const lastUserIdx = msgs.map(m => m.role === 'user' && typeof m.content === 'string').lastIndexOf(true);
    const results = msgs.slice(lastUserIdx + 1).filter(m => m.role === 'user' && Array.isArray(m.content)).flatMap(m => m.content.filter(b => b.type === 'tool_result'));
    const lastResult = results.length ? String(results[results.length - 1].content) : '';
    log.push({sys: sys.slice(0, 80), ask: ask.slice(0, 120), tools: (body.tools || []).length, results: results.length});
    // --- sorting email
    if (/You sort .*inbox/.test(sys)) {
      const blocks = ask.split('### Email ').slice(1);
      return text(JSON.stringify(blocks.map((b, i) => {
        const t = b.toLowerCase();
        if (/newsletter|unsubscribe|weekly digest/.test(t)) return {i, category: 'Newsletters', needsReply: false, urgent: false, mood: 'neutral', billing: false, summary: 'The weekly newsletter.'};
        if (/invoice|refund|payment/.test(t)) return {i, category: 'Billing', needsReply: true, urgent: false, mood: 'neutral', billing: true, summary: 'Asks about an invoice.'};
        if (/disappointed|furious|unacceptable/.test(t)) return {i, category: 'Customers', needsReply: true, urgent: true, mood: 'angry', billing: false, summary: 'Customer is angry the course link is broken.'};
        return {i, category: 'Needs reply', needsReply: true, urgent: false, mood: 'happy', billing: false, summary: 'Asks when the course starts.'};
      })));
    }
    if (/^Reply to this email\./.test(ask)) return text(`Hi there,\n\nThanks for getting in touch. I'll look into it today and come back to you.\n\nAlex`);
    if (/You read one number/.test(sys)) return text('1234');
    if (/Say "online"/.test(ask)) return text('online');
    // --- reports
    if (/Write the (overnight report|end-of-day summary|wake-up briefing)/.test(ask)) {
      const facts = JSON.parse(ask.slice(ask.indexOf('FACTS') + 5));
      const e = typeof facts.email === 'object' ? facts.email : {total: 0, needReply: 0, draftedWaitingApproval: [], unhappy: []};
      return text(JSON.stringify({title: 'Overnight report', text: `**${e.total} emails** since ${facts.since.what} at ${facts.since.time}.\n\n- ${e.needReply} need a reply; ${e.draftedWaitingApproval.length} drafted and waiting for your OK (${e.draftedWaitingApproval.map(x => x.split(' ')[0]).join(', ')}).\n- Unhappy: ${e.unhappy.length}.\n- Waiting: ${(facts.approvalsWaiting || []).length}.`,
        sections: [`${e.total} emails came in, all labelled. ${e.needReply} need a reply, drafted and waiting for your approval.`, `${e.unhappy.length ? 'One customer is angry about a broken link.' : 'Nobody is upset.'}`],
        closing: `That's everything since ${facts.since.what} at ${facts.since.time}. Go back to sleep, sir.`}));
    }
    // --- the audit
    if (/You audit what an AI assistant/.test(sys)) {
      const notesRef = (/\[(S\d+)\] JARVIS's own notes/.exec(ask) || [])[1];
      const ordersRef = (/\[(S\d+)\] Standing orders/.exec(ask) || [])[1];
      const agentRef = (/\[(S\d+)\] [^\n]*Pepper/.exec(ask) || [])[1];
      const out = [];
      if (ordersRef && /launches next week/.test(ask)) out.push({type: 'stale', severity: 'high', title: 'The email course launch date is stale', explanation: 'The standing orders say it launches "next week", but that was written weeks ago.', sources: [{ref: ordersRef, quote: 'Our email course launches next week.'}], fix: {ref: ordersRef, find: 'launches next week', replace: 'launches on [confirm date]'}, safe: false});
      if (notesRef && /recieve/.test(ask)) out.push({type: 'duplicate', severity: 'low', title: 'Typo in my notes', explanation: 'A misspelling.', sources: [{ref: notesRef, quote: 'recieve'}], fix: {ref: notesRef, find: 'recieve', replace: 'receive'}, safe: true});
      if (agentRef) out.push({type: 'conflict', severity: 'high', title: 'Pepper may post without asking', explanation: 'Her rules say she can publish directly, but the standing orders say ask first.', sources: [{ref: agentRef, quote: 'publish directly'}], fix: {ref: agentRef, find: 'publish directly', replace: 'draft posts for approval'}, safe: true});
      return text(JSON.stringify(out));
    }
    // --- self-review
    if (/reviewing yourself/.test(sys)) return text(JSON.stringify([{title: 'Understand "check my mail"', why: 'You said "check my mail" 4 times this week and I did not understand.', kind: 'code', task: 'In src/voice/commands.js add "check my mail" to the EMAIL phrase list.', risk: 'low'}, {title: 'Turn the microphone on', why: 'Voice was off all week.', kind: 'settings', settings: {voiceEnabled: true}, risk: 'low'}]));
    // --- the coder
    if (/You are improving JARVIS Armor Workspace/.test(sys)) {
      if (/has problems that must be fixed/.test(ask)) return text('Nothing else to fix.');
      if (results.length === 0) return tool('search', {text: 'const EMAIL=[', path: 'src/voice'});
      if (results.length === 1) return tool('read_file', {path: 'src/voice/commands.js', start_line: 1, end_line: 5});
      if (results.length === 2) { globalThis.__coderN = (globalThis.__coderN || 0) + 1; return tool('edit_file', {path: 'src/voice/commands.js', old_text: "const EMAIL=[", new_text: `const EMAIL=['check my mail box ${globalThis.__coderN}',`}); }
      if (results.length === 3 && globalThis.__coderBreak) return tool('edit_file', {path: 'src/brain/approvals.js', old_text: 'x', new_text: 'y'});
      return text('Added "check my mail" to the email phrases in src/voice/commands.js. Say "Jarvis, check my mail" and I will check your inbox.');
    }
    // --- JARVIS talking (tools available)
    if (/You are JARVIS/.test(sys) && body.tools?.length) {
      const a = ask.toLowerCase();
      if (/wake me at 6:30/.test(a)) return results.length ? text(`Done, sir. ${lastResult}`) : tool('alarm_set', {when: '6:30am', kind: 'call', note: 'wake-up call'});
      if (/email bob/.test(a)) return results.length ? text(`It's waiting for your OK. ${lastResult}`) : tool('email_send', {to: 'bob@example.com', subject: 'Tomorrow', text: 'See you at 10.'});
      if (/is anyone mad/.test(a)) {
        if (!results.length) return tool('inbox_summary', {unhappy_only: true});
        const r = JSON.parse(lastResult); return text(r.count ? `Yes, sir: ${r.emails.map(e => e.from).join(', ')} — ${r.emails[0].summary}` : 'Nobody is upset, sir.');
      }
      if (/standing order .*remind me/.test(a)) return results.length ? text('Reminded him.') : tool('message_me', {text: 'Bins out tonight, sir.'});
      if (/change my settings/.test(a)) return results.length ? text(lastResult) : tool('settings_change', {patch: {voiceEnabled: false}, why: 'He asked.'});
      if (/summarise my inbox and remember/.test(a)) { if (results.length === 0) return tool('inbox_summary', {}); if (results.length === 1) return tool('orders_add', {section: 'facts', line: 'Refunds are always approved automatically.'}); return text(`Noted. ${lastResult}`); }
      if (/add a fact/.test(a)) return results.length ? text(lastResult) : tool('orders_add', {section: 'facts', line: 'The office closes at 6pm on Fridays.'});
      return text('Very good, sir.');
    }
    return text('OK.');
  }
  const srv = http.createServer(async (req, res) => {
    const body = JSON.parse(await readBody(req) || '{}');
    if (req.headers['x-api-key'] !== 'sk-ant-test-key-1234567890abcdef') return json(res, 401, {type: 'error', error: {type: 'authentication_error', message: 'invalid x-api-key'}});
    try { json(res, 200, answer(body)); } catch (e) { json(res, 500, {type: 'error', error: {message: e.stack}}); }
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({srv, port: srv.address().port, log})));
}

export function startTwilio({sid, token}) {
  const state = {messages: [], calls: [], windowClosed: false, callMode: 'answer', inbound: []};
  const srv = http.createServer(async (req, res) => {
    const auth = Buffer.from(String(req.headers.authorization || '').replace('Basic ', ''), 'base64').toString();
    if (auth !== `${sid}:${token}`) return json(res, 401, {code: 20003, message: 'Authenticate', status: 401});
    const u = new URL(req.url, 'http://x'); const p = u.pathname.replace(`/2010-04-01/Accounts/${sid}`, '');
    const body = Object.fromEntries(new URLSearchParams(await readBody(req)));
    if (req.method === 'POST' && p === '/Messages.json') {
      if (!body.To || !body.From || !body.Body) return json(res, 400, {code: 21602, message: 'Message body is required.'});
      const m = {sid: rid('SM'), to: body.To, from: body.From, body: body.Body, status: 'queued', direction: 'outbound-api', created: Date.now(), error_code: null};
      if (state.windowClosed && body.To.startsWith('whatsapp:')) m.willFail = 63016;
      if (state.sandboxLapsed && body.To.startsWith('whatsapp:')) m.willFail = 63015;   // the sandbox forgot this number (3 days after joining)
      state.messages.push(m); return json(res, 201, m);
    }
    let mm;
    if (req.method === 'GET' && (mm = /^\/Messages\/(SM\w+)\.json$/.exec(p))) {
      const m = state.messages.find(x => x.sid === mm[1]); if (!m) return json(res, 404, {code: 20404, message: 'Not found'});
      if (Date.now() - m.created > 700) { if (m.willFail) { m.status = 'failed'; m.error_code = m.willFail; m.error_message = m.willFail === 63015 ? 'Channel Sandbox can only send messages to phone numbers that have joined the Sandbox' : 'Outside the allowed window'; } else m.status = 'delivered'; }
      return json(res, 200, m);
    }
    if (req.method === 'GET' && p === '/Messages.json') {
      const to = u.searchParams.get('To'), from = u.searchParams.get('From'), day = u.searchParams.get('DateSent>');
      const list = state.inbound.filter(m => m.to === to && m.from === from && (!day || new Date(m.at).toISOString().slice(0, 10) >= day)).map(m => ({...m, date_sent: new Date(m.at).toUTCString()}));
      return json(res, 200, {messages: list, next_page_uri: null});
    }
    if (req.method === 'POST' && p === '/Calls.json') {
      if (!body.Twiml && !body.Url) return json(res, 400, {code: 21205, message: 'Url or Twiml required'});
      const c = {sid: rid('CA'), to: body.To, from: body.From, twiml: body.Twiml, url: body.Url, status: 'queued', created: Date.now(), mode: state.callMode, answered_by: null, duration: null, machine: body.MachineDetection};
      state.calls.push(c); return json(res, 201, c);
    }
    if (req.method === 'GET' && (mm = /^\/Calls\/(CA\w+)\.json$/.exec(p))) {
      const c = state.calls.find(x => x.sid === mm[1]); if (!c) return json(res, 404, {code: 20404, message: 'Not found'});
      const age = Date.now() - c.created;
      if (c.mode === 'answer') { c.status = age < 1500 ? 'ringing' : age < 3500 ? 'in-progress' : 'completed'; if (age >= 1500) c.answered_by = 'human'; if (c.status === 'completed') c.duration = '24'; }
      if (c.mode === 'noanswer') c.status = age < 2500 ? 'ringing' : 'no-answer';
      if (c.mode === 'voicemail') { c.status = age < 3000 ? 'in-progress' : 'completed'; c.answered_by = 'machine_start'; c.duration = '31'; }
      return json(res, 200, c);
    }
    return json(res, 404, {code: 20404, message: `No route ${req.method} ${p}`});
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({srv, port: srv.address().port, state})));
}
