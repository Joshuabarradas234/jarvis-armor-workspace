// 1.94.0: Desktop project folders filed into suits (JARVIS asks, never decides), and Ask JARVIS from anywhere.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {scanDesktop, destination, moveFolder, DeskProjects, AREAS} from '../../src/main/desktop-projects.js';
import {AskJarvis, folderFacts, NOTES} from '../../src/main/ask-jarvis.js';
import {parseCommand} from '../../src/voice/commands.js';
import {defaults, validateSettings} from '../../src/settings/schema.js';
const tmp = t => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-194-')); t.after(() => fs.rmSync(d, {recursive: true, force: true})); return d; };
const mk = (...p) => { fs.mkdirSync(path.join(...p), {recursive: true}); return path.join(...p); };
function halls() {
  const themes = [{id: 'ironman', name: 'Armor Hall'}, {id: 'batcave', name: 'Batcave'}, {id: 'spiderman', name: 'Web Lab'}];
  const suits = {ironman: [{id: 'im1', name: 'Mark One', folder: ''}, {id: 'im2', name: 'Mark Two', folder: ''}], batcave: [{id: 'bc1', name: 'Hell Bat', folder: ''}], spiderman: [{id: 'sm1', name: 'Miles', folder: ''}, {id: 'v1', name: 'Car', folder: '', isVehicle: true}]};
  return {themes, suits, theme: id => themes.find(t => t.id === id), suit: (id, th) => { const s = suits[th].find(x => x.id === id); if (!s) throw Error('Unknown suit.'); return s; }, saveSuit(id, patch, th) { Object.assign(this.suit(id, th), patch); }};
}

test('the Desktop scan: folders only, not the workshop, not hidden ones, not ones a suit already holds, not "Not a project"', t => {
  const d = tmp(t), desk = mk(d, 'Desktop');
  for (const n of ['market', 'Corner Shop', '.hidden', 'held', 'old', 'JARVIS-source-1.70.0']) mk(desk, n);
  fs.writeFileSync(path.join(desk, 'desktop.ini'), ''); fs.writeFileSync(path.join(desk, 'notes.txt'), '');
  const got = scanDesktop({desktop: desk, suits: [{folder: path.join(desk, 'held')}], never: ['old'], skip: p => p.endsWith('JARVIS-source-1.70.0')}).map(f => f.name).sort();
  assert.deepEqual(got, ['Corner Shop', 'market']);
  assert.deepEqual(scanDesktop({desktop: path.join(d, 'nope')}), []);
});

test('filing: JARVIS asks the hall and suit; the folder moves into Documents\\JARVIS Workspaces\\<hall> and becomes the suit\'s, or goes inside a suit\'s own folder; Put it back undoes both', t => {
  const d = tmp(t), desk = mk(d, 'Desktop'), docs = mk(d, 'Documents'), w = halls();
  mk(desk, 'market', 'src'); fs.writeFileSync(path.join(desk, 'market', 'README.md'), '# Market'); mk(desk, 'Bakery Site');
  const dp = new DeskProjects({desktop: desk, documents: docs, dir: d, workstations: w, tower: () => ({tower: id => ({org: id === 'ironman' ? 'Acme AI' : ''})})});
  const p = dp.pending();
  assert.deepEqual(p.halls.map(h => [h.id, h.area]), [['ironman', 'Acme AI'], ['batcave', AREAS.batcave], ['spiderman', AREAS.spiderman]]);   // the Tower's company name, else Family business / Personal
  assert.deepEqual(p.halls[2].suits.map(s => s.id), ['sm1']);   // vehicles are not offered
  assert.deepEqual(p.folders.map(f => f.name).sort(), ['Bakery Site', 'market']);
  const r = dp.file({name: 'market', theme: 'ironman', suit: 'im2'});
  const to = path.join(docs, 'JARVIS Workspaces', 'Armor Hall', 'market');
  assert.equal(r.to, to); assert.ok(r.moved); assert.ok(fs.existsSync(path.join(to, 'README.md'))); assert.ok(!fs.existsSync(path.join(desk, 'market')));
  assert.equal(w.suit('im2', 'ironman').folder, to);
  // a suit that already has a folder: the project goes inside it, and the suit keeps its folder
  const own = mk(docs, 'JARVIS Workspaces', 'Batcave', 'Hell Bat'); w.suit('bc1', 'batcave').folder = own;
  const r2 = dp.file({name: 'Bakery Site', theme: 'batcave', suit: 'bc1'});
  assert.equal(r2.to, path.join(own, 'Bakery Site')); assert.equal(w.suit('bc1', 'batcave').folder, own);
  assert.deepEqual(dp.pending().folders, []);
  // put it back
  dp.undo(r.id); assert.ok(fs.existsSync(path.join(desk, 'market', 'README.md'))); assert.equal(w.suit('im2', 'ironman').folder, '');
  dp.undo(r2.id); assert.ok(fs.existsSync(path.join(desk, 'Bakery Site'))); assert.equal(w.suit('bc1', 'batcave').folder, own);
  assert.throws(() => dp.undo(r.id), /no longer on record/);
});

test('filing: left on the Desktop and linked; "Ask me next week" and "Not a project"; once a day at most by itself', t => {
  const d = tmp(t), desk = mk(d, 'Desktop'), w = halls(); mk(desk, 'produce-app'); mk(desk, 'Holiday photos'); mk(desk, 'Taxes');
  const dp = new DeskProjects({desktop: desk, documents: mk(d, 'Documents'), dir: d, workstations: w});
  const r = dp.file({name: 'produce-app', theme: 'batcave', suit: 'bc1', move: false});
  assert.equal(r.moved, false); assert.equal(w.suit('bc1', 'batcave').folder, path.join(desk, 'produce-app'));
  assert.throws(() => dp.file({name: 'Taxes', theme: 'batcave', suit: 'bc1', move: false}), /already has a folder/);
  dp.skip({name: 'Holiday photos', never: true}); dp.skip({name: 'Taxes'});
  const p = dp.pending(); assert.deepEqual(p.folders, []); assert.equal(p.waiting, 1);
  assert.equal(dp.dueAuto(), false);   // only the one waiting a week
  fs.rmSync(path.join(d, 'desk-projects.json')); assert.equal(dp.dueAuto(), true); assert.equal(dp.dueAuto(), false);   // then not again for 20 hours
});

test('moving: a folder that is open somewhere stays put with a plain explanation; another drive means it is linked instead', t => {
  const d = tmp(t), locked = {mkdirSync() {}, renameSync() { throw Object.assign(Error('busy'), {code: 'EBUSY'}); }};
  assert.throws(() => moveFolder(path.join(d, 'market'), path.join(d, 'x', 'market'), {fsImpl: locked}), /Something has “market” open .* Close it and try again\./);
  assert.equal(moveFolder('a', 'b', {fsImpl: {mkdirSync() {}, renameSync() { throw Object.assign(Error('x'), {code: 'EXDEV'}); }}}), false);
  const docs = mk(d, 'Documents'); mk(docs, 'JARVIS Workspaces', 'Armor Hall', 'market');
  assert.equal(destination({documents: docs, hallName: 'Armor Hall', suit: {folder: ''}, name: 'market'}).to, path.join(docs, 'JARVIS Workspaces', 'Armor Hall', 'market (2)'));   // never over the top of another
});

test('Ask JARVIS: each project keeps its own conversation; its README, files and JARVIS notes.md go to Claude; the oldest messages fold into a summary', async t => {
  const d = tmp(t), folder = mk(d, 'market'); mk(folder, 'node_modules', 'deep'); mk(folder, 'src');
  fs.writeFileSync(path.join(folder, 'README.md'), 'Fresh produce marketplace.'); fs.writeFileSync(path.join(folder, NOTES), '## 1 Oct\n- Decided: delivery on Fridays');
  const asked = [], ask = async (system, prompt, o) => { asked.push({system, prompt, o}); return o.maxTokens === 700 ? '- they talked a lot' : `answer ${asked.length}`; };
  const projects = () => [{key: 'ironman:im2', id: 'im2', theme: 'ironman', name: 'Mark Two', hall: 'Armor Hall', area: 'Work', folder, tasks: 'Objective: launch'}];
  const aj = new AskJarvis({dir: d, ask, projects, status: () => 'Open to-dos: ring the bank', owner: () => ({name: 'Sam', address: 'sir'})});
  const r = await aj.send({key: 'ironman:im2', mode: 'think', text: 'What next?'});
  assert.equal(r.answer, 'answer 1'); assert.equal(r.thread.messages.length, 2);
  const s = asked[0].system;
  for (const bit of ['Fresh produce marketplace.', 'Decided: delivery on Fridays', 'src/', 'Objective: launch', 'ring the bank', 'co-founder', 'Address them as "sir"']) assert.ok(s.includes(bit), bit);
  assert.ok(!s.includes('deep'), 'node_modules is not walked');
  assert.equal(aj.thread('all').messages.length, 0);   // Everything is its own conversation
  await assert.rejects(aj.send({key: 'ironman:gone', text: 'hi'}), /no longer in a suit/);
  await assert.rejects(aj.send({key: 'all', text: '  '}), /Ask me something first/);
  for (let i = 0; i < 12; i++) await aj.send({key: 'ironman:im2', text: `q${i}`});
  await new Promise(res => setTimeout(res, 20));
  const th = aj.thread('ironman:im2'); assert.equal(th.summary, '- they talked a lot'); assert.ok(th.messages.length <= 18 && th.messages.length >= 16);
  await aj.send({key: 'ironman:im2', text: 'and now?'}); assert.ok(asked.at(-1).prompt.includes('What you two said earlier, in short:\n- they talked a lot'));
});

test('Ask JARVIS: Save to project notes adds a dated section to JARVIS notes.md; Start building gives a title and notes for an idea card', async t => {
  const d = tmp(t), folder = mk(d, 'shop');
  const replies = ['- Decision: start with three cafés', '{"title": "Café loyalty app", "notes": "Build a stamp card."}', 'not json at all'];
  const aj = new AskJarvis({dir: d, ask: async (s, p, o) => o.maxTokens === 1200 && !s.startsWith('Turn') ? 'An answer' : replies.shift(), projects: () => [{key: 'batcave:bc1', id: 'bc1', theme: 'batcave', name: 'Hell Bat', hall: 'Batcave', area: 'Family business', folder}]});
  await assert.rejects(aj.saveNotes('batcave:bc1'), /nothing to save/);
  await assert.rejects(aj.saveNotes('all'), /Choose a project/);
  await aj.send({key: 'batcave:bc1', text: 'Shall we start small?'});
  const n = await aj.saveNotes('batcave:bc1', {today: new Date(2026, 9, 12)});
  const text = fs.readFileSync(path.join(folder, NOTES), 'utf8');
  assert.equal(n.file, path.join(folder, NOTES)); assert.match(text, /^# Hell Bat: notes with JARVIS\n/); assert.ok(text.includes('## 12 October 2026\n\n- Decision: start with three cafés'));
  assert.deepEqual(await aj.brief('batcave:bc1'), {title: 'Café loyalty app', notes: 'Build a stamp card.'});
  assert.equal((await aj.brief('batcave:bc1')).title, 'Shall we start small?');   // a reply that isn't JSON still makes a card
  assert.ok(folderFacts(folder).includes(NOTES));
});

test('Ask JARVIS is opened by Ctrl+Alt+Space, its own taskbar icon, the taskbar jump list, the tray and by voice; only its own window can use it', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["askKey='';for(const k of askKeys(values.ask)){try{if(globalShortcut.register(k,()=>toggleAsk())){askKey=k;break;}}catch{}}",
    "w.setAppDetails({appId:ASK_ID,appIconPath:process.execPath,appIconIndex:0,relaunchCommand:askCommand(),relaunchDisplayName:'Ask JARVIS'});",
    "app.setUserTasks([{program:process.execPath,arguments:ASK_ARG,", "if((argv||[]).includes(ASK_ARG)){openAsk();return;}", "else if(process.argv.includes(ASK_ARG))openAsk();",
    "click:()=>openAsk()},", "{label:'FILE DESKTOP PROJECTS',click:()=>fileDesktop()},", "w.loadURL('jarvis://app/ask.html?view=ask')",
    "case 'ask-send':{if(role!=='ask')return false;", "case 'ask-notes':{if(role!=='ask')return false;", "case 'ask-build':{if(role!=='ask')return false;",
    "case 'desk-project-file':{if(role!=='main')return false;", "case 'desk-project-undo':{if(role!=='main')return false;", "isWorkshop:p=>IdeaAssistant.isRepo(p)",
    "if(machine?.value?.state==='ARMOR_HALL'&&deskProjects?.dueAuto())broadcast('core',{type:'desk-projects'});"]) assert.ok(main.includes(s), s);
  assert.ok(fs.readFileSync('dist/ask.html', 'utf8').includes('<script type="module" src="./assets/ask-jarvis.js"></script>'));
  assert.ok(fs.readFileSync('dist/index.html', 'utf8').includes('<script type="module" src="./assets/desk-projects.js"></script>'));
  assert.ok(fs.readFileSync('dist/assets/ask-jarvis.js', 'utf8').includes("VIEW === 'ask'")); assert.ok(fs.readFileSync('dist/assets/desk-projects.js', 'utf8').includes("J.call('desk-project-file'"));
  assert.equal(defaults.hotkeys.ask, 'Control+Alt+Q');   // 1.95.1: Ctrl+Alt+Space is the Claude app's quick entry
  assert.equal(validateSettings({hotkeys: {ask: 'F13'}}, structuredClone(defaults)).hotkeys.ask, 'F13');
  assert.throws(() => validateSettings({hotkeys: {ask: defaults.hotkeys.wake}}, structuredClone(defaults)), /different/);
  const heard = (p, idle, follow) => parseCommand(p, {theme: {assistant: 'Jarvis'}, themes: [{id: 'ironman', assistant: 'Jarvis'}], modules: [], idle, follow});
  assert.deepEqual(heard("jarvis let's think", false), {action: 'ask-open', mode: 'think'});
  assert.deepEqual(heard('jarvis i have a question', true), {action: 'ask-open', mode: 'ask'});   // from the tray too
  assert.deepEqual(heard("jarvis let's think about the summer menu", false), {action: 'ask-open', mode: 'think', topic: 'the summer menu'});
  assert.deepEqual(heard('jarvis tidy my desktop', false), {action: 'desk-file'});
  assert.equal(heard("let's think", true, false), null);   // no name, no "Yes, sir?": ignored in the tray
});
