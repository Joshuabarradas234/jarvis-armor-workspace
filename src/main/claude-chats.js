/**
 * Claude chats → suit progress. JARVIS reads the Claude Code chats saved on this computer (~/.claude/projects: one
 * .jsonl file per chat, titled by the Claude app), asks you which suit each new chat belongs to, and keeps a progress
 * card for it on that suit: what the task is, how far along it is, what's left, the questions waiting on you, and the
 * next steps. Only the words you and Claude wrote are read, never tool output. Anything that looks like a key or a
 * password is blanked out before a summary is made. Chats without a title (JARVIS's own background runs) are skipped.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {readJson, writeJson} from '../brain/util.js';

export const chatsRoot = (home = os.homedir()) => path.join(home, '.claude', 'projects');
/** Folders of JARVIS's own Claude Code runs (meeting notes, the Tower, self-updates, these summaries): never your chats. */
const OWN = /jarvis-fence|jv-sum|self-staging|JARVIS-Tower|claude-chats-work|AppData-Local-Temp(?!.*Claude-Data)/i;
const ACTIVE_MS = 3 * 60000, EVERY_MS = 10 * 60000, PER_DAY = 40, WINDOW_TURNS = 60, WINDOW_CHARS = 40000, READ_MAX = 4e6;
const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

/** Blank out anything that looks like a secret before it leaves this computer. */
export function redact(text) {
  return String(text || '')
    .replace(/\bsk-ant-[\w-]{8,}/g, '[key hidden]').replace(/\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{20,}|\bgithub_pat_[\w]{20,}/g, '[token hidden]')
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, '[key hidden]').replace(/\bxox[abposr]-[\w-]{10,}/g, '[token hidden]').replace(/\bAC[0-9a-f]{32}\b/g, '[account hidden]')
    .replace(/\b(pass(?:word|code)?|pwd|secret|token|api[_ -]?key)\b(\s*[:=]\s*|\s+is\s+)(\S+)/gi, (m, k, sep) => `${k}${sep}[hidden]`)
    .replace(/\b(?=[A-Za-z0-9_\-+]*\d)(?=[A-Za-z0-9_\-+]*[A-Za-z])[A-Za-z0-9_\-+]{40,}={0,2}/g, '[hidden]');   // long random strings (letters and digits), not web addresses
}

/** The card in Claude's reply: the whole {...} (fenced or not), even with words around it. */
export function cardFrom(text) {
  const s = String(text || ''), fenced = /```(?:json)?s*([sS]*?)```/.exec(s)?.[1], t = fenced || s, a = t.indexOf('{'), b = t.lastIndexOf('}');
  const o = a >= 0 && b > a ? JSON.parse(t.slice(a, b + 1)) : null; if (!o || typeof o !== 'object' || Array.isArray(o)) throw Error('no card'); return o;
}

/** The words of a chat from byte `from` on: your messages and Claude's replies (no tool calls, results or thinking).
 *  `offset` is where the next read should start: after the last complete line, so a line still being written is read whole next time. */
export function readChat(file, from = 0, max = READ_MAX) {
  const size = fs.statSync(file).size; let start = Math.max(0, Math.min(from, size)); if (size - start > max) start = size - max;
  const turns = []; let title = '', cwd = '', lastAt = 0, offset = start;
  if (size > start) {
    const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(size - start);
    try { fs.readSync(fd, buf, 0, buf.length, start); } finally { fs.closeSync(fd); }
    const end = buf.lastIndexOf(0x0a) + 1; offset = start + end;
    const lines = buf.subarray(0, end).toString('utf8').split('\n'); if (start > 0 && start !== from) lines.shift();   // started mid-line after skipping ahead
    for (const l of lines) {
      if (!l.trim()) continue; let j; try { j = JSON.parse(l); } catch { continue; }
      if (j.type === 'custom-title' && j.customTitle) title = String(j.customTitle);
      if (j.cwd) cwd = String(j.cwd);
      if (j.type !== 'user' && j.type !== 'assistant') continue;
      const c = j.message?.content, parts = typeof c === 'string' ? [c] : Array.isArray(c) ? c.filter(x => x?.type === 'text' && x.text).map(x => x.text) : [];
      const text = parts.join('\n').trim(); if (!text || j.isSidechain) continue;
      if (j.type === 'user' && /^<(command|local-command|system-reminder|task-notification)/.test(text)) continue;   // the app's own notes, not you
      const at = Date.parse(j.timestamp) || 0; if (at > lastAt) lastAt = at;
      turns.push({role: j.type === 'user' ? 'you' : 'claude', text: text.slice(0, 4000), at});
    }
  }
  return {size, offset, title, cwd, turns, lastAt};
}

export class ClaudeChats {
  /** d: {dir (where JARVIS keeps its data), root (the chats folder), summarise({prompt}) → reply text, log, onChange, now} */
  constructor(d) {
    this.d = {root: chatsRoot(), log: () => {}, onChange: () => {}, now: Date.now, ...d};
    this.file = path.join(this.d.dir, 'claude-chats.json');
    const s = readJson(this.file, null) || {};
    this.state = {enabled: s.enabled !== false, chats: s.chats && typeof s.chats === 'object' ? s.chats : {}, day: s.day || '', used: Number(s.used) || 0};
    this.busy = false; this.untitled = new Map();   // files with no title yet, by size: not read again until they grow
  }
  save() { try { writeJson(this.file, this.state); } catch (e) { this.d.log(`Could not save the Claude chats: ${e.message}`); } }
  setEnabled(on) { this.state.enabled = !!on; this.save(); this.d.onChange(); return this.state.enabled; }
  /** Read what's new in every titled chat. Returns the ids of chats that changed. */
  scan() {
    const changed = []; let dirs = [];
    try { dirs = fs.readdirSync(this.d.root, {withFileTypes: true}).filter(e => e.isDirectory() && !OWN.test(e.name)).map(e => path.join(this.d.root, e.name)); } catch { return changed; }
    for (const dir of dirs) {
      let files = []; try { files = fs.readdirSync(dir).filter(f => /^[\w-]+\.jsonl$/.test(f)); } catch { continue; }
      for (const f of files) {
        const file = path.join(dir, f), id = f.replace(/\.jsonl$/, ''); let st; try { st = fs.statSync(file); } catch { continue; }
        const c = this.state.chats[id] || {id, file, title: '', cwd: '', offset: 0, size: 0, lastAt: 0, mtime: 0, suit: null, ignored: false, window: [], progress: null, updatedAt: 0, seen: 0, asked: 0};
        c.mtime = st.mtimeMs; c.file = file;
        if (st.size === c.size || (!c.title && this.untitled.get(file) === st.size)) continue;
        let r; try { r = readChat(file, c.size < st.size ? c.offset : 0); } catch (e) { this.d.log(`Could not read a Claude chat: ${e.message}`); continue; }
        if (c.size > st.size) c.window = [];   // the file was rewritten: start again
        if (r.title) c.title = r.title; if (r.cwd) c.cwd = r.cwd; if (r.lastAt) c.lastAt = Math.max(c.lastAt, r.lastAt);
        c.window = [...c.window, ...r.turns].slice(-WINDOW_TURNS); while (c.window.reduce((n, t) => n + t.text.length, 0) > WINDOW_CHARS && c.window.length > 4) c.window.shift();
        if (r.turns.length) c.seen = (c.seen || 0) + r.turns.length;
        c.offset = r.offset; c.size = r.size;
        if (!c.title) { this.untitled.set(file, st.size); continue; }   // untitled: one of JARVIS's own runs, or not a chat yet
        this.state.chats[id] = c; changed.push(id);
      }
    }
    if (changed.length) this.save();
    return changed;
  }
  active(c) { return this.d.now() - Math.max(c.mtime || 0, c.lastAt || 0) < ACTIVE_MS; }
  /** Titled chats that don't have a suit yet, newest first. */
  waiting() { return Object.values(this.state.chats).filter(c => c.title && !c.suit && !c.ignored).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)); }
  /** Waiting chats to ask about now: not asked in the last six hours ("Later" waits that long). */
  toAsk() { return this.waiting().filter(c => this.d.now() - (c.asked || 0) > 6 * 3600000); }
  asked(id) { const c = this.state.chats[id]; if (c) { c.asked = this.d.now(); this.save(); } }
  /** suit: {theme, id}, or null for "not for a suit". */
  assign(id, suit) {
    const c = this.state.chats[id]; if (!c) throw Error('That Claude chat is no longer on this computer.');
    if (suit) { if (!/^[a-z]+$/.test(String(suit.theme)) || !/^[\w-]{1,40}$/.test(String(suit.id))) throw Error('Choose a suit.'); c.suit = {theme: suit.theme, id: suit.id}; c.ignored = false; c.updatedAt = 0; }
    else { c.suit = null; c.ignored = true; }
    this.save(); this.d.onChange(); return this.view(c);
  }
  /** Chats with a suit and new words since their card was last written: open ones every ten minutes, the rest once. */
  due() {
    const today = new Date(this.d.now()).toDateString(); if (this.state.day !== today) { this.state.day = today; this.state.used = 0; }
    if (!this.state.enabled || this.state.used >= PER_DAY) return [];
    return Object.values(this.state.chats).filter(c => c.suit && c.window.length && (c.lastAt || 0) > (c.updatedAt || 0) && (!this.active(c) || this.d.now() - (c.updatedAt || 0) >= EVERY_MS))
      .sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0));
  }
  prompt(c, suitName) {
    const talk = c.window.map(t => `${t.role === 'you' ? 'OWNER' : 'CLAUDE'}: ${redact(t.text)}`).join('\n\n');
    return ['You keep a short progress card for a piece of work the owner is doing in a chat with Claude. Write plain, calm British English.',
      `The chat is called "${clip(c.title, 120)}" and belongs to the owner's "${clip(suitName, 60)}" workstation.`,
      c.progress ? `The card so far (update it, keep what still holds):\n${JSON.stringify({task: c.progress.task, summary: c.progress.summary, percent: c.progress.percent, done: c.progress.done, left: c.progress.left, questions: c.progress.questions, next: c.progress.next})}` : 'There is no card yet.',
      `The latest part of the chat, oldest first:\n${talk}`,
      'Reply with JSON only, no other text: {"task":"one line: what this chat is working on","summary":"two sentences: where it stands now","percent":0-100 (how far along the whole task is),"done":["finished pieces, at most 6"],"left":["what is still to do, at most 8"],"questions":["questions waiting on the owner, at most 5"],"next":["the next steps, at most 3"]}',
      'Do not create, read or change any files.'].join('\n\n');
  }
  /** Write (or refresh) one chat's card. */
  async update(id, suitName = '') {
    const c = this.state.chats[id]; if (!c?.suit) throw Error('Link the chat to a suit first.'); if (!c.window.length) return this.view(c);
    const text = await this.d.summarise({prompt: this.prompt(c, suitName)});
    let data; try { data = cardFrom(text); } catch { throw Error('The progress came back in a form JARVIS could not read.'); }
    const list = (v, n) => (Array.isArray(v) ? v : []).filter(x => typeof x === 'string' && x.trim()).slice(0, n).map(x => clip(x, 200));
    c.progress = {task: clip(data?.task, 160) || c.title, summary: clip(data?.summary, 400), percent: Math.max(0, Math.min(100, Math.round(Number(data?.percent) || 0))),
      done: list(data?.done, 6), left: list(data?.left, 8), questions: list(data?.questions, 5), next: list(data?.next, 3)};
    c.updatedAt = this.d.now(); c.error = ''; this.state.used++; this.save(); this.d.onChange(); return this.view(c);
  }
  /** Bring the cards up to date, one chat at a time. */
  async tick(nameFor = () => '') {
    if (this.busy || !this.state.enabled) return; this.busy = true;
    try { this.scan(); for (const c of this.due().slice(0, 3)) { try { await this.update(c.id, nameFor(c.suit)); } catch (e) { this.d.log(`Progress for "${clip(c.title, 60)}": ${e.message}`); c.updatedAt = this.d.now(); c.error = clip(e.message, 240); this.save(); this.d.onChange(); break; } } }
    finally { this.busy = false; }
  }
  view(c) { return {id: c.id, title: c.title, suit: c.suit, ignored: !!c.ignored, active: this.active(c), lastAt: c.lastAt || 0, updatedAt: c.updatedAt || 0, progress: c.progress, pending: (c.lastAt || 0) > (c.updatedAt || 0), error: c.error || ''}; }
  list() { return {enabled: this.state.enabled, chats: Object.values(this.state.chats).filter(c => c.title).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)).map(c => this.view(c))}; }
  forSuit(theme, id) { return Object.values(this.state.chats).filter(c => c.suit?.theme === theme && c.suit?.id === id).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)).map(c => this.view(c)); }
}
