/**
 * JARVIS Core — the Standing orders file: Documents\JARVIS\Standing orders.md
 *
 * "Instructions telling it what to do without you, in a file." This is that file. JARVIS reads it before
 * everything it does on its own and picks up changes the moment you save. Schedule lines look like:
 *     - 06:00 weekdays — Call me with the overnight report.
 *     - Every 30 minutes (07:00–23:00) — Check my email.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {writeText, parseDays, describeDays, minutesOf, pad2} from './util.js';

export function ordersTemplate({name = 'Joshua', address = 'sir', phone = ''} = {}) {
  return `# Standing orders for JARVIS

These are my standing instructions. JARVIS reads this file before everything it does on its own
and picks up any change as soon as it is saved. Keep the headings; edit the lines under them.

## About me
- My name is ${name}. Call me "${address}".
- My phone, for calls and WhatsApp: ${phone}
- I live in the UK: UK time, British English.

## Remember
<!-- What JARVIS should always keep in mind about you. Say "Jarvis, remember …" to add a line, or "forget …".
     Call rules such as "No calls before 08:00 on Saturdays" or "Never call me on Sundays" apply to the calls
     he makes on his own; a wake-up call you set yourself still rings. -->

## Every day
- 02:30 — Run the overnight audit (Optimize): check yourself and every agent for stale facts and conflicting rules. Fix the safe things; ask me about the rest.
- 03:00 — Review yourself: find what is not working or could work better, prepare the changes, and ask me before installing anything.
- 06:00 weekdays — Call me with the overnight report. If I don't answer, try again twice, 5 minutes apart.
- 08:30 weekends — WhatsApp me the overnight report.
- 21:00 — WhatsApp me a summary of the day.
- Every 30 minutes (07:00–23:00) — Check my email: label everything and draft replies to anything that needs one. Never send without asking.
- Every hour — Watch my numbers and tell me if anything moves more than 20%.

## Watch
<!-- One number per line:  - Name: link or file → json.path (alert if it moves 20%)   e.g.
     - Signups: https://example.com/stats.json → data.signups (alert if it moves 25%)
     - Sales today: C:\\Users\\me\\Documents\\sales.csv (column Total) (alert below 100) -->

## You may do on your own
- Sort and label my email, archive newsletters and notifications, and save draft replies.
- Keep your own notes tidy: fix typos, merge duplicates, mark things that have gone stale.
- Retry anything of yours that got stuck.
- Call or message me whenever these orders say so, and whenever something is urgent.

## Always ask me first
- Sending any email or message to anyone except me.
- Anything involving money, billing, refunds or payments.
- Changing any agent's rules, permissions or instructions.
- Changing these standing orders or the facts about my business.
- Updating your own code, settings or features.

## Facts about my business
<!-- JARVIS checks these every night for anything stale or contradictory. Put a date on anything time-sensitive,
     e.g. "The email course launches on 14 October 2026." -->
`;
}

const SECTION_KEYS = [
  ['remember', /^remember|things to remember|preferences/i],
  ['about', /about me|who i am|about you/i],
  ['everyday', /every ?day|schedule|routine|daily|timetable|when to/i],
  ['watch', /watch|numbers|metrics|kpi/i],
  ['allowed', /on your own|you may|allowed|without asking|free to/i],
  ['ask', /ask me|my ok|approval|permission|check with me/i],
  ['facts', /facts?|business|beliefs|context|background/i],
];
const idFor = s => crypto.createHash('sha1').update(String(s).toLowerCase().replace(/\s+/g, ' ').trim()).digest('hex').slice(0, 10);

/** What a schedule line asks for. */
export function jobActions(text) {
  const t = String(text).toLowerCase();
  const a = {deliver: null, content: null, audit: false, improve: false, email: false, numbers: false, task: false};
  if (/\b(call|ring|phone) me\b|\bwake me\b|wake-up call|wake up call/.test(t)) a.deliver = 'call';
  else if (/\b(whatsapp|message|text|send) me\b|\bwhatsapp\b/.test(t)) a.deliver = 'message';
  a.audit = /\baudit\b|\boptimi[sz]e\b/.test(t);
  a.improve = /\b(review|improve|upgrade|update) yourself\b|\bself[- ]?(review|improve|update)|\bimprovements?\b/.test(t);
  a.email = /\be-?mails?\b|\binbox\b/.test(t) && !/\breport\b|\bsummary\b/.test(t);
  a.numbers = /\bnumbers\b|\bmetrics\b|\bwatch (my|the)\b|\bkpis?\b/.test(t) && !/\breport\b|\bsummary\b/.test(t);
  if (/\bsummary\b|\brecap\b|\bday report\b|\bdaily report\b|\bend of (the )?day\b|\bhow (the|my) day went\b/.test(t)) a.content = 'day';
  else if (/\breport\b|\bbrief(ing)?\b|\bwhat happened\b|\bupdate me\b|\bcatch me up\b/.test(t)) a.content = 'overnight';
  else if (a.deliver && /\bwake\b/.test(t)) a.content = 'wake';
  if (a.audit || a.improve) { if (!a.deliver) a.content = null; }
  if (!a.content && !a.audit && !a.improve && !a.email && !a.numbers) a.task = true;   // anything else: JARVIS works it out from the words
  return a;
}

/** Parse "- 06:00 weekdays — Call me…" / "- Every 30 minutes (07:00–23:00) — Check my email." */
export function parseScheduleLine(raw) {
  const line = String(raw).replace(/^\s*[-*•]\s*/, '').trim();
  if (!line || line.startsWith('<!--') || /^\(.*\)$/.test(line)) return null;
  let sep = /\s[—–]\s|\s-{1,2}\s/.exec(line);
  let when, text;
  if (sep) { when = line.slice(0, sep.index).trim(); text = line.slice(sep.index + sep[0].length).trim(); }
  else {
    const m = /^((?:\d{1,2}[:.]\d{2}\s*(?:am|pm)?|every [^:]+?)(?:\s+[a-z ,–-]+?)?)\s*:\s+(.+)$/i.exec(line);
    if (!m) return {error: 'I could not find the time. Use a line like "- 06:00 weekdays — Call me with the overnight report."'};
    when = m[1].trim(); text = m[2].trim();
  }
  if (!text) return {error: 'There is a time but no instruction after it.'};
  const w = when.toLowerCase();
  let time = null, every = null, window = null, days;
  let m = /^(\d{1,2})[:.](\d{2})\s*(am|pm)?\b\s*(.*)$/.exec(w) || /^(\d{1,2})()\s*(am|pm)\b\s*(.*)$/.exec(w);
  if (m) {
    let h = Number(m[1]); const mi = Number(m[2] || 0);
    if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0;
    if (h > 23 || mi > 59) return {error: 'That time does not exist.'};
    time = `${pad2(h)}:${pad2(mi)}`; days = parseDays(m[4]);
  } else if ((m = /^every\s+(half an hour|half hour|hour|(\d+|a|an|one|two|three|four|five|ten|fifteen|twenty|thirty|forty five|sixty)\s*(minutes?|mins?|hours?|hrs?))\b\s*(.*)$/.exec(w))) {
    const word = {a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, ten: 10, fifteen: 15, twenty: 20, thirty: 30, 'forty five': 45, sixty: 60};
    if (/half/.test(m[1])) every = 30; else if (m[1] === 'hour') every = 60;
    else { const n = /^\d+$/.test(m[2]) ? Number(m[2]) : word[m[2]]; every = /^h/.test(m[3]) ? n * 60 : n; }
    if (!(every >= 5 && every <= 24 * 60)) return {error: 'Repeat between every 5 minutes and every 24 hours.'};
    let rest = m[4];
    const win = /(\d{1,2})[:.](\d{2})\s*(?:–|-|to|and)\s*(\d{1,2})[:.](\d{2})/.exec(rest);
    if (win) { window = [Number(win[1]) * 60 + Number(win[2]), Number(win[3]) * 60 + Number(win[4])]; rest = rest.replace(win[0], ' '); }
    days = parseDays(rest.replace(/[()]/g, ' ').replace(/\bbetween\b|\bfrom\b/g, ' '));
  } else return {error: 'I could not read the time. Use 24-hour time like 06:00, or "Every 30 minutes".'};
  const actions = jobActions(text);
  const r = /try again (once|twice|(\d+|two|three|four|five) times)/i.exec(text), gap = /(\d+)\s*min(?:ute)?s? apart/i.exec(text);
  const retries = r ? (r[1] === 'once' ? 1 : r[1] === 'twice' ? 2 : Number(r[2]) || {two: 2, three: 3, four: 4, five: 5}[r[2]] || 2) : null;
  return {id: idFor(line), raw: line, time, every, window, days, text, actions, retries, retryMinutes: gap ? Math.min(30, Number(gap[1])) : null,
    label: time ? `${time} ${describeDays(days)}` : `every ${every >= 60 && every % 60 === 0 ? (every === 60 ? 'hour' : `${every / 60} hours`) : `${every} minutes`}${window ? ` (${pad2(Math.floor(window[0] / 60))}:${pad2(window[0] % 60)}–${pad2(Math.floor(window[1] / 60))}:${pad2(window[1] % 60)})` : ''}${days.length < 7 ? ' ' + describeDays(days) : ''}`};
}

/**
 * A call rule from the Remember section: "No calls before 08:00 on Saturdays", "No calls after 9pm",
 * "Never call me on Sundays". Null when the line is not about calls.
 */
export function parseCallRule(raw) {
  const t = String(raw || '').toLowerCase().replace(/[’']/g, '');
  if (!/\b(no (phone )?calls?|(do not|dont|never) (ring|call|phone))\b/.test(t)) return null;
  const clock = s => {
    const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/.exec(String(s || '').trim()); if (!m) return null;
    let h = Number(m[1]); const mi = Number(m[2] || 0);
    if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0;
    return h > 23 || mi > 59 ? null : `${pad2(h)}:${pad2(mi)}`;
  };
  const time = '(\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?)', before = new RegExp(`\\bbefore\\s+${time}`).exec(t), after = new RegExp(`\\bafter\\s+${time}`).exec(t);
  let rest = t; for (const m of [before, after]) if (m) rest = rest.replace(m[0], ' ');
  return {notBefore: before ? clock(before[1]) : null, notAfter: after ? clock(after[1]) : null, days: parseDays(rest), text: String(raw).trim()};
}
/** The first call rule that forbids a call at `at` (ms), or null. */
export function callBlocked(rules, at = Date.now()) {
  const d = new Date(at), hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  return (rules || []).find(r => r.days.includes(d.getDay()) && ((!r.notBefore && !r.notAfter) || (r.notBefore && hm < r.notBefore) || (r.notAfter && hm >= r.notAfter))) || null;
}

/** "- Signups: https://x/stats.json → data.signups (alert if it moves 25%)" */
export function parseWatchLine(raw) {
  const line = String(raw).replace(/^\s*[-*•]\s*/, '').trim();
  if (!line || /^\(.*\)$/.test(line) || line.startsWith('<!--')) return null;
  const c = line.indexOf(':'); if (c < 1) return {error: 'Use "- Name: link or file".'};
  const name = line.slice(0, c).trim(); let rest = line.slice(c + 1).trim();
  const url = /https?:\/\/[^\s)]+/.exec(rest), file = /([a-zA-Z]:\\[^()→>]+?\.(?:json|csv|txt|md))\b|((?:\/|~\/)[^\s()]+\.(?:json|csv|txt|md))\b/.exec(rest);
  const source = url ? url[0] : file ? (file[1] || file[2]).trim() : '';
  if (!source) return {error: 'Give a web link (https://…) or a file path for this number.'};
  const jp = /(?:→|->)\s*([\w.$[\]-]+)/.exec(rest), col = /\(column ([^)]+)\)/i.exec(rest);
  const move = /moves?\s*(?:more than|by|over)?\s*(\d+(?:\.\d+)?)\s*%/i.exec(rest), below = /below\s*[£$€]?\s*([\d.,]+)/i.exec(rest), above = /above\s*[£$€]?\s*([\d.,]+)/i.exec(rest);
  const n = s => Number(String(s).replace(/,/g, ''));
  return {id: idFor(name), name, source, path: jp ? jp[1] : '', column: col ? col[1].trim() : '', movePct: move ? Number(move[1]) : 20,
    below: below ? n(below[1]) : null, above: above ? n(above[1]) : null, ai: /\(ask ai\)|\(read it\)/i.test(rest), raw: line};
}

export class StandingOrders {
  constructor({docs, owner, log, onChange}) {
    this.dir = path.join(docs, 'JARVIS');
    this.file = path.join(this.dir, 'Standing orders.md');
    Object.assign(this, {owner: owner || (() => ({})), log: log || (() => {}), onChange: onChange || (() => {})});
    this.cache = null; this.mtime = 0; this.watching = false;
  }
  ensure() {
    if (!fs.existsSync(this.file)) { writeText(this.file, ordersTemplate(this.owner())); this.log('brain', 'Created Standing orders.md'); }
    return this.file;
  }
  read() { this.ensure(); return fs.readFileSync(this.file, 'utf8').replace(/\r\n/g, '\n'); }
  parse(force = false) {
    let st, text;
    try { this.ensure(); st = fs.statSync(this.file); if (this.cache && !force && st.mtimeMs === this.mtime) return this.cache; text = this.read(); }
    catch (e) {
      if (this.cache) return this.cache;
      return {text: '', mtime: 0, file: this.file, sections: {remember: [], about: [], everyday: [], watch: [], allowed: [], ask: [], facts: [], other: []}, jobs: [], watch: [], callRules: [], problems: [{line: 0, text: '', why: `I could not open the standing orders: ${e.message}`}]};
    }
    const lines = text.split('\n');
    const sections = {remember: [], about: [], everyday: [], watch: [], allowed: [], ask: [], facts: [], other: []};
    let cur = 'other', inComment = false;
    const out = {text, mtime: st.mtimeMs, file: this.file, sections, jobs: [], watch: [], callRules: [], problems: []};
    lines.forEach((l, i) => {
      if (inComment) { if (l.includes('-->')) inComment = false; return; }
      if (/^\s*<!--/.test(l)) { if (!l.includes('-->')) inComment = true; return; }
      const h = /^#{2,4}\s+(.+?)\s*$/.exec(l);
      if (h) { cur = (SECTION_KEYS.find(([, re]) => re.test(h[1])) || ['other'])[0]; return; }
      if (!/^\s*[-*•]\s+\S/.test(l)) return;
      const item = {line: i + 1, text: l.replace(/^\s*[-*•]\s+/, '').trim()};
      if (/^\(.*\)$/.test(item.text)) return;   // a placeholder in brackets
      sections[cur].push(item);
      if (cur === 'remember') { const r = parseCallRule(item.text); if (r) out.callRules.push({...r, line: i + 1}); }
      else if (cur === 'everyday') {
        const j = parseScheduleLine(l);
        if (j?.error) out.problems.push({line: i + 1, text: item.text, why: j.error});
        else if (j) out.jobs.push({...j, line: i + 1});
      } else if (cur === 'watch') {
        const w = parseWatchLine(l);
        if (w?.error) out.problems.push({line: i + 1, text: item.text, why: w.error});
        else if (w) out.watch.push({...w, line: i + 1});
      }
    });
    this.cache = out; this.mtime = st.mtimeMs;
    return out;
  }
  /** Keep a copy of every version, so any change JARVIS makes can be undone. */
  write(text, why = '') {
    const prev = fs.existsSync(this.file) ? fs.readFileSync(this.file, 'utf8') : '';
    if (prev) {
      const hist = path.join(this.dir, '.history'); fs.mkdirSync(hist, {recursive: true});
      const stamp = new Date().toISOString().slice(0, 23).replace(/[:T.]/g, '-');
      fs.writeFileSync(path.join(hist, `Standing orders ${stamp}.md`), prev);
      const old = fs.readdirSync(hist).filter(f => f.startsWith('Standing orders ')).sort(); for (const f of old.slice(0, -30)) try { fs.unlinkSync(path.join(hist, f)); } catch {}
    }
    writeText(this.file, String(text).replace(/\r\n?/g, '\n').replace(/\n/g, process.platform === 'win32' ? '\r\n' : '\n'));
    this.log('brain', `Standing orders changed${why ? ': ' + why : ''}`);
    const p = this.parse(true); this.onChange(p); return p;
  }
  /** Exact, single replacement: the text to find must be there exactly once. */
  replaceOnce(find, replace, why) {
    const text = this.read(); const f = String(find || '');
    if (!f) throw Error('Nothing to find.');
    const i = text.indexOf(f); if (i < 0) throw Error('That text is not in the standing orders any more.');
    if (text.indexOf(f, i + f.length) >= 0) throw Error('That text appears more than once; I need something unique.');
    return this.write(text.slice(0, i) + String(replace ?? '') + text.slice(i + f.length), why);
  }
  /** Add a bullet at the end of a section (creating the section if it is missing). */
  addLine(section, line, why) {
    const text = this.read().replace(/\s+$/, '') + '\n'; const lines = text.split('\n');
    const titles = {remember: 'Remember', about: 'About me', everyday: 'Every day', watch: 'Watch', allowed: 'You may do on your own', ask: 'Always ask me first', facts: 'Facts about my business'};
    const re = (SECTION_KEYS.find(([k]) => k === section) || [null, null])[1];
    let start = -1; lines.forEach((l, i) => { const h = /^#{2,4}\s+(.+?)\s*$/.exec(l); if (h && re && re.test(h[1]) && start < 0) start = i; });
    const bullet = `- ${String(line).replace(/^\s*[-*•]\s*/, '').replace(/\s+/g, ' ').trim()}`;
    if (start < 0) return this.write(`${text}\n## ${titles[section] || section}\n${bullet}\n`, why);
    let end = lines.length; for (let i = start + 1; i < lines.length; i++) if (/^#{1,4}\s/.test(lines[i])) { end = i; break; }
    let at = end; while (at > start + 1 && !lines[at - 1].trim()) at--;
    lines.splice(at, 0, bullet);
    return this.write(lines.join('\n'), why);
  }
  /** Remove the first bullet containing `match`; with `section`, only from that section. */
  removeLine(match, why, section = null) {
    const text = this.read(); const lines = text.split('\n'); const m = String(match).trim().toLowerCase();
    if (section && !SECTION_KEYS.some(([k]) => k === section)) throw Error('Unknown section.');
    let cur = 'other'; const inSection = lines.map(l => { const h = /^#{2,4}\s+(.+?)\s*$/.exec(l); if (h) cur = (SECTION_KEYS.find(([, r]) => r.test(h[1])) || ['other'])[0]; return !section || cur === section; });
    const i = m ? lines.findIndex((l, n) => inSection[n] && /^\s*[-*•]\s/.test(l) && l.toLowerCase().includes(m)) : -1;
    if (i < 0) throw Error('No line like that in the standing orders.');
    lines.splice(i, 1); return this.write(lines.join('\n'), why);
  }
  /** Polls the file (fs.watch misses edits from some editors) and re-reads it on change. */
  watch() {
    if (this.watching) return; this.watching = true;
    fs.watchFile(this.file, {interval: 4000}, (cur, prev) => { if (cur.mtimeMs !== prev.mtimeMs) { try { this.onChange(this.parse(true)); } catch (e) { this.log('brain', e.message); } } });
  }
  unwatch() { if (this.watching) { fs.unwatchFile(this.file); this.watching = false; } }
}
export const everyLabel = j => j.label;
export {minutesOf};
