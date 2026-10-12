/**
 * Ask JARVIS (dist/ask.html): a window you open from anywhere (Ctrl+Alt+Space, its taskbar icon or "Jarvis, let's
 * think") to ask about any project, see how things are going, or think something through together. Each project
 * keeps its own conversation, and it never runs out: older messages are folded into a short running summary, and
 * "Save to project" writes the thinking into the project's own notes file (JARVIS notes.md), which JARVIS reads
 * every time you ask about that project again.
 */
import fs from 'node:fs';
import path from 'node:path';
import {readJson, writeJson, writeText} from '../brain/util.js';

export const NOTES = 'JARVIS notes.md';
const KEEP = 16, FOLD_AT = 24;   // messages kept word for word; when there are more, the oldest are folded into the summary
const IGNORE = /^(node_modules|\.git|\.next|\.cache|dist|build|out|coverage|__pycache__|\.venv|venv|bin|obj)$/i;
const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n) + '…' : s; };
const tail = (s, n) => { s = String(s || ''); return s.length > n ? '…' + s.slice(-n) : s; };

/** A short look at a project folder: its files (names only), its README, package.json's purpose, and JARVIS's notes. */
export function folderFacts(folder, {deep = false, fsImpl = fs} = {}) {
  if (!folder) return 'No folder yet.';
  if (!fsImpl.existsSync(folder)) return `Folder missing: ${folder}`;
  const lines = [], max = deep ? 150 : 40;
  const walk = (dir, depth, pre) => {
    let list = []; try { list = fsImpl.readdirSync(dir, {withFileTypes: true}); } catch { return; }
    for (const e of list.filter(e => !e.name.startsWith('.') || e.name === '.env.example').sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))) {
      if (lines.length >= max) return;
      if (e.isDirectory()) { lines.push(`${pre}${e.name}/`); if (depth > 0 && !IGNORE.test(e.name)) walk(path.join(dir, e.name), depth - 1, pre + '  '); }
      else lines.push(pre + e.name);
    }
  };
  walk(folder, deep ? 1 : 0, '');
  const read = (name, n) => { try { return fsImpl.readFileSync(path.join(folder, name), 'utf8'); } catch { return ''; } };
  const readme = ['README.md', 'Readme.md', 'readme.md', 'README.txt', 'README'].map(n => read(n)).find(Boolean) || '';
  let pkg = ''; try { const p = JSON.parse(read('package.json')); pkg = [p.name, p.description, p.scripts ? `scripts: ${Object.keys(p.scripts).slice(0, 12).join(', ')}` : ''].filter(Boolean).join(' · '); } catch {}
  const notes = read(NOTES);
  return [`Files${lines.length >= max ? ` (first ${max})` : ''}:\n${lines.join('\n') || '(empty)'}`, pkg && `package.json: ${pkg}`,
    readme && `README:\n${clip(readme, deep ? 5000 : 1200)}`, notes && `${NOTES} (what you and JARVIS decided before):\n${tail(notes, deep ? 8000 : 2000)}`].filter(Boolean).join('\n\n');
}

export const MODES = {
  ask: 'Answer directly and briefly from the facts. If the facts do not say, say so plainly and say what would tell you.',
  think: 'Think it through together, like a sharp co-founder at a whiteboard. Build on the idea rather than repeating it. Offer two or three concrete options with their trade-offs, ask at most two sharp questions, and end with one suggested next step. Use short headings and bullet points.',
};

export class AskJarvis {
  /** d: {dir, ask(system, prompt, {maxTokens, kind}) → text, projects() → [{key, name (the folder), suit, hall, area, folder, tasks}], status() → text, owner() → {name, address}} */
  constructor(d) { this.d = d; this.file = path.join(d.dir, 'ask-threads.json'); this.busy = new Set(); }
  all() { const t = readJson(this.file, {}); return t && typeof t === 'object' && !Array.isArray(t) ? t : {}; }
  thread(key) { const t = this.all()[key]; return {summary: String(t?.summary || ''), messages: Array.isArray(t?.messages) ? t.messages : [], saved: t?.saved || 0}; }
  put(key, th) { const all = this.all(); all[key] = {...th, updated: Date.now()}; writeJson(this.file, all); }
  clear(key) { const all = this.all(); delete all[key]; writeJson(this.file, all); return true; }
  project(key) { return key === 'all' ? null : this.d.projects().find(p => p.key === key) || null; }

  system(key, mode) {
    const o = this.d.owner?.() || {}, p = this.project(key), list = this.d.projects();
    const facts = p ? `The project in front of you: ${p.name} (${p.area}; it lives in the suit ${p.suit||p.name}, in the ${p.hall}).\n${folderFacts(p.folder, {deep: true})}${p.tasks ? `\n\nIts tasks on the control deck:\n${p.tasks}` : ''}`
      : `Projects, one per suit:\n${list.map(x => `- ${x.name} (${x.area}; suit ${x.suit || x.name}, ${x.hall})${x.tasks ? ` · ${clip(x.tasks.replace(/\n/g, '; '), 160)}` : ''}`).join('\n') || '(none yet)'}`;
    return [`You are JARVIS, ${o.name ? `${o.name}'s` : 'the owner\'s'} assistant inside their desktop workspace. Address them as "${o.address || 'sir'}". British English, calm, warm and precise. Never invent facts about their projects; you only know what is below.`,
      MODES[mode] || MODES.ask, `Write plain text with light Markdown (short headings, bullets, **bold**). No tables.`,
      facts, `How things stand right now:\n${this.d.status?.() || '(nothing to report)'}`].join('\n\n');
  }

  /** One question in, one answer out; the conversation is kept for next time. */
  async send({key = 'all', mode = 'ask', text}) {
    text = String(text || '').trim().slice(0, 6000); if (!text) throw Error('Ask me something first.');
    if (key !== 'all' && !this.project(key)) throw Error('That project is no longer in a suit.');
    if (this.busy.has(key)) throw Error('Still thinking about the last one.');
    this.busy.add(key);
    try {
      const th = this.thread(key);
      const talk = [...th.messages.slice(-KEEP).map(m => `${m.role === 'user' ? 'OWNER' : 'JARVIS'}: ${m.content}`), `OWNER: ${text}`].join('\n\n');
      const prompt = `${th.summary ? `What you two said earlier, in short:\n${th.summary}\n\n` : ''}The conversation so far:\n\n${talk}\n\nReply as JARVIS to the last message.`;
      const answer = String(await this.d.ask(this.system(key, mode), prompt, {maxTokens: mode === 'think' ? 2200 : 1200, kind: 'ask jarvis'}) || '').trim() || 'I have nothing useful to add yet, sir.';
      const now = Date.now(), next = {...th, messages: [...th.messages, {role: 'user', content: text, at: now}, {role: 'assistant', content: answer, at: now, mode}]};
      this.put(key, next);
      if (next.messages.length > FOLD_AT) this.fold(key).catch(() => {});   // never holds up the answer
      return {answer, thread: this.thread(key)};
    } finally { this.busy.delete(key); }
  }

  /** Fold the oldest messages into the running summary, so a conversation can go on for ever. */
  async fold(key) {
    const th = this.thread(key); if (th.messages.length <= KEEP) return th;
    const old = th.messages.slice(0, th.messages.length - KEEP), keep = th.messages.slice(-KEEP);
    const summary = String(await this.d.ask('You keep running notes of a conversation between the owner and their assistant JARVIS. Keep every decision, fact, name, number and open question; drop chit-chat. At most 250 words, bullet points.',
      `${th.summary ? `Notes so far:\n${th.summary}\n\n` : ''}Add these messages:\n\n${old.map(m => `${m.role === 'user' ? 'OWNER' : 'JARVIS'}: ${clip(m.content, 3000)}`).join('\n\n')}`, {maxTokens: 700, kind: 'ask jarvis'}) || '').trim();
    if (!summary) return th;
    const now = this.thread(key);   // anything said while folding stays
    this.put(key, {...now, summary, messages: now.messages.slice(old.length)});
    return this.thread(key);
  }

  /** The thinking so far, as a dated section at the end of the project's JARVIS notes.md. */
  async saveNotes(key, {today = new Date()} = {}) {
    const p = this.project(key); if (!p?.folder) throw Error('Choose a project with a folder first.');
    const th = this.thread(key); if (!th.messages.length && !th.summary) throw Error('There is nothing to save yet.');
    const text = String(await this.d.ask('Turn this conversation into project notes for the project folder. Sections: Decisions, Ideas, Next steps, Open questions (leave out empty ones). Bullet points, British English, no preamble.',
      `${th.summary ? `Earlier notes:\n${th.summary}\n\n` : ''}${th.messages.map(m => `${m.role === 'user' ? 'OWNER' : 'JARVIS'}: ${clip(m.content, 4000)}`).join('\n\n')}`, {maxTokens: 1200, kind: 'ask jarvis'}) || '').trim();
    if (!text) throw Error('I could not write the notes just now. Try again.');
    const file = path.join(p.folder, NOTES), date = today.toLocaleDateString('en-GB', {day: 'numeric', month: 'long', year: 'numeric'});
    let before = ''; try { before = fs.readFileSync(file, 'utf8'); } catch {}
    writeText(file, `${before ? before.replace(/\s*$/, '\n\n') : `# ${p.name}: notes with JARVIS\n\nJARVIS reads this file whenever you ask about this project. Edit it freely.\n\n`}## ${date}\n\n${text}\n`);
    this.put(key, {...this.thread(key), saved: Date.now()});
    return {file, text};
  }

  /** A short title and the thinking so far, for an idea card ("Start building"). */
  async brief(key) {
    const th = this.thread(key); if (!th.messages.length) throw Error('Think something through first.');
    const raw = String(await this.d.ask('Summarise what this conversation wants built. Reply as JSON only: {"title": "at most 8 words", "notes": "what to build and why, the decisions made, and the first steps, at most 180 words"}.',
      `${th.summary ? `Earlier:\n${th.summary}\n\n` : ''}${th.messages.slice(-12).map(m => `${m.role === 'user' ? 'OWNER' : 'JARVIS'}: ${clip(m.content, 3000)}`).join('\n\n')}`, {maxTokens: 600, kind: 'ask jarvis'}) || '');
    try { const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)); if (j.title) return {title: clip(j.title, 100), notes: clip(j.notes, 3800)}; } catch {}
    const first = th.messages.find(m => m.role === 'user')?.content || 'New idea';
    return {title: clip(first.replace(/\s+/g, ' '), 80), notes: clip(th.messages.slice(-4).map(m => m.content).join('\n\n'), 3800)};
  }
}
