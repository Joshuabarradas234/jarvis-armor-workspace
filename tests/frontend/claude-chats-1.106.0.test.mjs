// 1.106.0: Claude chats → suit progress. JARVIS reads the Claude Code chats on this computer, asks which suit each new
// one is for, and keeps a progress card on that suit (task, how far along, what's left, questions, next steps).
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {readChat, redact, cardFrom, ClaudeChats} from '../../src/main/claude-chats.js';

const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-cc-')));
const T0 = Date.UTC(2026, 10, 3, 9);
const line = o => JSON.stringify(o) + '\n';
const you = (text, min = 0, extra = {}) => line({type: 'user', message: {role: 'user', content: text}, timestamp: new Date(T0 + min * 60000).toISOString(), cwd: 'C:\\Users\\Sam\\mfs-app', ...extra});
const claude = (content, min = 0) => line({type: 'assistant', message: {role: 'assistant', content}, timestamp: new Date(T0 + min * 60000).toISOString()});
const titled = t => line({type: 'custom-title', customTitle: t, sessionId: 'x'});

test('a chat is read for its words only: your messages and Claude\'s replies, never tool calls, results, thinking or the app\'s own notes', () => {
  const dir = tmp(), f = path.join(dir, 'a.jsonl');
  fs.writeFileSync(f, titled('WhatsApp ordering') + you('Set up WhatsApp ordering for MFS', 0) + claude([{type: 'thinking', thinking: 'secret thoughts'}, {type: 'tool_use', name: 'Bash', input: {command: 'ls'}}], 1)
    + line({type: 'user', message: {role: 'user', content: [{type: 'tool_result', content: 'file list'}]}, timestamp: new Date(T0 + 2 * 60000).toISOString()})
    + claude([{type: 'text', text: 'Done: the script asks for the Phone number ID.'}], 3) + you([{type: 'text', text: 'What next?'}], 4)
    + you('<system-reminder>internal</system-reminder>', 5) + you('a side job', 6, {isSidechain: true}) + line({type: 'queue-operation'}) + '{"type":"user","message":{"content":"half a li');
  const r = readChat(f);
  assert.equal(r.title, 'WhatsApp ordering'); assert.equal(r.cwd, 'C:\\Users\\Sam\\mfs-app');
  assert.deepEqual(r.turns.map(t => [t.role, t.text]), [['you', 'Set up WhatsApp ordering for MFS'], ['claude', 'Done: the script asks for the Phone number ID.'], ['you', 'What next?']]);
  assert.equal(r.lastAt, T0 + 4 * 60000);
  assert.ok(r.offset < r.size, 'a line still being written is left for next time');
  fs.appendFileSync(f, 'ne"},"type":"user"}\n' + claude([{type: 'text', text: 'Next, the access token.'}], 7));
  const more = readChat(f, r.offset); assert.deepEqual(more.turns.map(t => t.text), ['half a line', 'Next, the access token.']); assert.equal(more.offset, more.size);   // the finished line, read whole
});

test('the card is read whole from Claude\'s reply, with or without words or a code fence around it', () => {
  assert.deepEqual(cardFrom('Here: {"task":"A","left":["x"]} done'), {task: 'A', left: ['x']});
  assert.deepEqual(cardFrom('```json\n{"task":"B","next":[]}\n```'), {task: 'B', next: []});
  assert.throws(() => cardFrom('["x"]')); assert.throws(() => cardFrom('no card here'));
});

test('keys, tokens and passwords are blanked out before anything is summarised; web addresses stay', () => {
  const out = redact('key sk-ant-api03-abcdefghijklmnopqrstuv, password: hunter2, token ghp_' + 'a'.repeat(30) + ', AKIAABCDEFGHIJKLMNOP, see https://github.com/Joshuabarradas234/jarvis-armor-workspace/releases/download/v1.105.0 and ' + 'f1e2d3c4b5a6'.repeat(4));
  for (const gone of ['sk-ant-api03', 'hunter2', 'ghp_', 'AKIAABCD', 'f1e2d3c4b5a6f1e2']) assert.ok(!out.includes(gone), gone);
  assert.ok(out.includes('https://github.com/Joshuabarradas234/jarvis-armor-workspace/releases/download/v1.105.0'));
});

function world() {
  const root = tmp(), dir = tmp(); let now = T0 + 10 * 60000;
  const proj = path.join(root, 'C--Users-Sam-mfs-app'); fs.mkdirSync(proj);
  fs.writeFileSync(path.join(proj, 'chat-1.jsonl'), titled('WhatsApp ordering') + you('Set up WhatsApp ordering', 0) + claude([{type: 'text', text: 'Started.'}], 1));
  fs.writeFileSync(path.join(proj, 'run-2.jsonl'), you('summarise this meeting', 0));   // no title: one of JARVIS's own runs
  const own = path.join(root, 'C--Users-Sam-AppData-Local-Temp-jarvis-fence-x'); fs.mkdirSync(own); fs.writeFileSync(path.join(own, 'chat-3.jsonl'), titled('Fence') + you('x', 0));
  const replies = []; const summarise = async ({prompt}) => { replies.push(prompt); return 'Here you are: {"task":"WhatsApp ordering for MFS","summary":"Waiting for the number.","percent":140,"done":["Script"],"left":["SIM","Token","Test","a","b","c","d","e","f"],"questions":["Use the test number?"],"next":["Add Sergio"]}'; };
  const c = new ClaudeChats({dir, root, summarise, now: () => now});
  return {root, dir, proj, c, replies, setNow: t => { now = t; }, getNow: () => now};
}

test('only your titled chats are picked up; JARVIS\'s own runs are skipped; a new chat waits for you to choose its suit, and "Later" waits six hours', () => {
  const w = world(); w.c.scan();
  assert.deepEqual(w.c.list().chats.map(c => c.title), ['WhatsApp ordering']);
  assert.deepEqual(w.c.toAsk().map(c => c.id), ['chat-1']); w.c.asked('chat-1'); assert.deepEqual(w.c.toAsk(), []);
  w.setNow(w.getNow() + 7 * 3600000); assert.deepEqual(w.c.toAsk().map(c => c.id), ['chat-1']);
  assert.throws(() => w.c.assign('chat-1', {theme: '../x', id: 'bc1'}), /Choose a suit/);
  w.c.assign('chat-1', null); assert.deepEqual(w.c.waiting(), []);   // "not for a suit": never asked again
  assert.deepEqual(new ClaudeChats({dir: w.dir, root: w.root, summarise: async () => '{}'}).list().chats[0].ignored, true);   // remembered
});

test('a linked chat gets its card: tidied, capped and kept; open chats refresh every ten minutes, finished ones once', async () => {
  const w = world(); w.c.scan(); w.c.assign('chat-1', {theme: 'batcave', id: 'bc1'});
  assert.equal(w.c.due().length, 1);
  const v = await w.c.update('chat-1', 'HELL BAT');
  assert.equal(v.progress.task, 'WhatsApp ordering for MFS'); assert.equal(v.progress.percent, 100); assert.equal(v.progress.left.length, 8); assert.deepEqual(v.progress.questions, ['Use the test number?']);
  assert.match(w.replies[0], /belongs to the owner's "HELL BAT" workstation/); assert.match(w.replies[0], /OWNER: Set up WhatsApp ordering/); assert.match(w.replies[0], /Reply with JSON only/);
  assert.deepEqual(w.c.forSuit('batcave', 'bc1').map(c => c.id), ['chat-1']); assert.deepEqual(w.c.forSuit('batcave', 'bc2'), []);
  assert.equal(w.c.due().length, 0);   // nothing new since the card
  fs.appendFileSync(path.join(w.proj, 'chat-1.jsonl'), you('Got the SIM', 12)); w.setNow(T0 + 12 * 60000); w.c.scan();
  assert.equal(w.c.list().chats[0].active, true); assert.equal(w.c.due().length, 0, 'an open chat waits ten minutes between cards');
  w.setNow(T0 + 23 * 60000); assert.equal(w.c.due().length, 1);
  await w.c.update('chat-1', 'HELL BAT'); assert.match(w.replies[1], /The card so far/);   // the next card builds on the last
});

test('when the card can\'t be written, the suit shows why instead of waiting for ever', async () => {
  const w = world(); w.c.scan(); w.c.assign('chat-1', {theme: 'batcave', id: 'bc1'});
  w.c.d.summarise = async () => { throw Error('Claude Code needs signing in again on this computer (open a terminal, type claude, then /login), and it has no Claude key.'); };
  await w.c.tick(() => 'HELL BAT');
  const v = w.c.forSuit('batcave', 'bc1')[0]; assert.match(v.error, /needs signing in again/); assert.equal(v.progress, null);
  w.c.d.summarise = async () => '{"task":"T","summary":"S","percent":10,"done":[],"left":[],"questions":[],"next":[]}';
  fs.appendFileSync(path.join(w.proj, 'chat-1.jsonl'), you('again', 30)); w.setNow(T0 + 60 * 60000); await w.c.tick(() => 'HELL BAT');
  assert.equal(w.c.forSuit('batcave', 'bc1')[0].error, '');
});

test('JARVIS wires it up: Claude Code on your plan (or your key), the hall asks, the suit shows its card and the case its badge', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["import {ClaudeChats,chatsRoot} from './claude-chats.js';", "if(claudeChats||!fs.existsSync(chatsRoot()))return;", "callClaudeCode({settingsDir:userDir,cwd:work,model:'sonnet',maxTurns:2,timeoutMin:5,extraArgs:['--tools='],fence:NO_TOOLS,prompt})",
    "why='Claude Code needs signing in again on this computer (open a terminal, type claude, then /login)';", "const key=readTowerKey();if(!key)throw Error(`${why}, and it has no Claude key.`);",
    "broadcast('core',{type:'claude-chat-ask',chat:claudeChats.view(c)});", "case 'claude-chat-assign':{", "case 'suit-claude':", "case 'claude-chat-update':", "case 'claude-chat-suits':",
    "try{startClaudeChats();}catch(e){log('claude-chats',e.message);}"]) assert.ok(main.includes(s), s);
  assert.ok(fs.readFileSync('dist/index.html', 'utf8').includes('<script type="module" src="./assets/claude-chats.js"></script>'));
  const mod = fs.readFileSync('dist/assets/claude-chats.js', 'utf8');
  for (const s of ["J.call('claude-chat-assign', {id: chat.id, suit:", "◆ NEW CLAUDE CHAT", "J.call('suit-claude', suit)", "document.querySelector('.workstation .ws-bar')", "WHAT'S LEFT", "QUESTIONS FOR YOU", "NEXT STEPS", "class=\"cc-badge\"", "J.on('core', m =>"]) assert.ok(mod.includes(s), s);
  assert.ok(fs.readFileSync('src/main/preload.cjs', 'utf8').includes("'core'"), 'its news travels on the existing core channel');
});
