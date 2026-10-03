/**
 * Small helpers shared by JARVIS Core (the brain, the phone, the scheduler).
 * Everything here is plain Node: no Electron, so it can be tested on its own.
 */
import fs from 'node:fs';
import path from 'node:path';

export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, Math.max(0, n - 1)) + '…' : s; };
export const oneLine = s => String(s ?? '').replace(/\s+/g, ' ').trim();
export const pad2 = n => String(n).padStart(2, '0');
export const hhmm = (d = new Date()) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const minutesOf = t => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "10:40" style clock for a timestamp, in this computer's time zone. */
export const clock = ms => ms ? new Date(ms).toLocaleTimeString('en-GB', {hour: '2-digit', minute: '2-digit'}) : '';
/** A friendly spoken time: "six", "six thirty", "ten forty", "a quarter past seven". */
export function spokenClock(ms) {
  const d = new Date(ms); let h = d.getHours() % 12 || 12; const m = d.getMinutes();
  const W = ['twelve', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  if (m === 0) return W[h];
  if (m < 10) return `${W[h]} oh ${['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'][m]}`;
  return `${W[h]} ${m}`;
}
export function ago(ms) {
  const m = Math.round(ms / 60000); if (m < 2) return 'just now'; if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24); return d === 1 ? 'yesterday' : `${d} days ago`;
}

/* ---------- reading times and days the way people say them ---------- */
const NUM = {zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, ninety: 90, a: 1, an: 1};
/** "twenty five" -> 25, "forty" -> 40, "7" -> 7. Returns null when it is not a number. */
export function wordsToNumber(s) {
  const t = String(s || '').trim().toLowerCase().replace(/-/g, ' ');
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const parts = t.split(/\s+/).filter(w => w && w !== 'and'); if (!parts.length) return null;
  let n = 0;
  for (const w of parts) { if (!(w in NUM)) return null; n += NUM[w]; }
  return n;
}
/**
 * Next moment for a spoken or typed time, from `now`:
 *   "6", "6:30", "6.30", "0630", "six thirty", "half six", "half past six", "quarter to seven",
 *   "7am", "7 pm", "noon", "midnight", "in 5 minutes", "in an hour", "in half an hour",
 *   "tomorrow at 6", "at 6:45 tomorrow".
 * Hours 1-11 without am/pm mean the next time that clock comes round (so at night "6" is 6 in the morning).
 * Returns {at: ms, words} or null.
 */
export function parseWhen(input, now = new Date()) {
  let t = ' ' + String(input || '').toLowerCase().replace(/[’']/g, '').replace(/[,!?]/g, ' ').replace(/(\d)\s*([ap])\.?m\.?\b/g, '$1 $2m').replace(/\s+/g, ' ').trim() + ' ';
  const base = new Date(now);
  // "ten minutes from now" means "in ten minutes"
  t = t.replace(/ ((?:[a-z]+ )?[a-z\d]+) (minutes?|mins?|hours?|hrs?) from now /, (m, n, u) => { const k = [n, n.split(' ').pop()].find(x => /^an?$/.test(x) || wordsToNumber(x) !== null); return k ? m.replace(`${k} ${u} from now`, `in ${k} ${u}`) : m; });
  // relative: "in 5 minutes", "in an hour and a half", "in 2 hours", "in half an hour", or just "ten minutes"
  let rel = /\bin (?:(an?|[\w ]+?) (minutes?|mins?|hours?|hrs?)|half an hour|an hour and a half)\b/.exec(t)
    || (!/\b(past|to|at)\b/.test(t) ? /^ (an?|\w+(?: \w+)?) (minutes?|mins?|hours?|hrs?) $/.exec(t) : null);
  if (!rel) { const bare = /\bin (\d{1,3}|[a-z]+(?: [a-z]+)?)(?: wake)? $/.exec(t); if (bare && wordsToNumber(bare[1]) !== null) rel = [bare[0], bare[1], 'minutes']; }   // "call me in 5" = five minutes
  if (rel) {
    let mins;
    if (rel[0].includes('half an hour')) mins = 30;
    else if (rel[0].includes('an hour and a half')) mins = 90;
    else { const n = wordsToNumber(rel[1]); if (n === null) return null; mins = /^h/.test(rel[2]) ? n * 60 : n; }
    if (!(mins > 0 && mins <= 7 * 24 * 60)) return null;
    return {at: base.getTime() + mins * 60000, words: `in ${mins >= 60 && mins % 60 === 0 ? `${mins / 60} hour${mins === 60 ? '' : 's'}` : `${mins} minutes`}`};
  }
  const tomorrow = /\btomorrow\b/.test(t); t = t.replace(/\btomorrow\b|\btoday\b|\btonight\b|\bthis morning\b|\bin the morning\b/g, m => { if (/morning/.test(m)) return ' am '; if (/tonight/.test(m)) return ' pm '; return ' '; });
  let h = null, m = 0, mer = /\b(am|a m|in the morning)\b/.test(t) ? 'am' : /\b(pm|p m|in the evening|at night)\b/.test(t) ? 'pm' : /\bwake\b|\bwaking\b/.test(t) ? 'am' : '';   // "wake me at 6:30" is the morning
  let mm;
  if (/\bnoon\b|\bmidday\b/.test(t)) { h = 12; m = 0; mer = 'pm'; }
  else if (/\bmidnight\b/.test(t)) { h = 0; m = 0; mer = 'x'; }
  else if ((mm = /\b(\d{1,2})[:.](\d{2})\b/.exec(t))) { h = Number(mm[1]); m = Number(mm[2]); }
  else if ((mm = /\b(\d{1,2})(\d{2})\s*(?:hours|hrs)?\b/.exec(t)) && !/\b\d{1,2}\s*(am|pm)/.test(t)) { h = Number(mm[1]); m = Number(mm[2]); if (h > 23 || m > 59) h = null; }
  if (h === null && (mm = /\bhalf (?:past )?([a-z]+|\d{1,2})\b/.exec(t))) { const n = wordsToNumber(mm[1]); if (n !== null) { h = n; m = 30; } }
  if (h === null && (mm = /\bquarter past ([a-z]+|\d{1,2})\b/.exec(t))) { const n = wordsToNumber(mm[1]); if (n !== null) { h = n; m = 15; } }
  if (h === null && (mm = /\bquarter to ([a-z]+|\d{1,2})\b/.exec(t))) { const n = wordsToNumber(mm[1]); if (n !== null) { h = (n + 11) % 12 || 12; m = 45; if (n === 12 || n === 0) h = 11; } }
  if (h === null && (mm = /\b(\d{1,2}|[a-z]+) (?:minutes? )?(past|to) ([a-z]+|\d{1,2})\b/.exec(t))) {
    const a = wordsToNumber(mm[1]), b = wordsToNumber(mm[3]);
    if (a !== null && b !== null && a < 60) { if (mm[2] === 'past') { h = b; m = a; } else { h = (b + 11) % 12 || 12; m = 60 - a; } }
  }
  if (h === null) {
    // "six thirty", "seven forty five", "six", "7", "seven oh five", "6 am"
    const words = t.replace(/\b(at|for|on|by|around|about|oclock|o clock|am|pm|a m|p m|the|please|me|up|wake|call|alarm|set|an|a)\b/g, ' ').replace(/\s+/g, ' ').trim().split(' ');
    const nums = []; let i = 0;
    while (i < words.length && nums.length < 3) {
      const w = words[i]; if (/^\d{1,2}$/.test(w)) { nums.push(Number(w)); i++; continue; }
      if (w in NUM) {
        // join "forty five", "twenty five" into one number; "oh five" is 5 minutes
        let n = NUM[w]; if ((n === 20 || n === 30 || n === 40 || n === 50) && NUM[words[i + 1]] > 0 && NUM[words[i + 1]] < 10) { n += NUM[words[i + 1]]; i++; }
        if (w === 'oh' && NUM[words[i + 1]] !== undefined) { n = NUM[words[i + 1]]; i++; }
        nums.push(n); i++; continue;
      }
      if (nums.length) break; i++;
    }
    if (nums.length) { h = nums[0]; m = nums[1] || 0; }
  }
  if (h === null || h > 23 || m > 59 || !Number.isFinite(h)) return null;
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  const at = new Date(base); at.setSeconds(0, 0); at.setHours(h, m);
  if (!mer && h >= 1 && h <= 11) {
    // no am/pm: pick whichever of h or h+12 comes next
    const pm = new Date(at); pm.setHours(h + 12);
    if (at.getTime() <= base.getTime()) { if (pm.getTime() > base.getTime() && !tomorrow) return {at: pm.getTime(), words: clock(pm.getTime())}; at.setDate(at.getDate() + 1); }
  } else if (at.getTime() <= base.getTime()) at.setDate(at.getDate() + 1);
  if (tomorrow && dayKey(at) === dayKey(base)) at.setDate(at.getDate() + 1);
  return {at: at.getTime(), words: clock(at.getTime())};
}
/** "weekdays", "Mon-Fri", "every day", "Tue, Thu", "weekends" -> [0..6]. Empty text means every day. */
export function parseDays(text) {
  const t = String(text || '').toLowerCase();
  if (!t.trim() || /every ?day|daily|each day|7 days/.test(t)) return [0, 1, 2, 3, 4, 5, 6];
  const out = new Set();
  if (/weekdays?|work ?days|mon(day)?\s*(-|to|–)\s*fri(day)?/.test(t)) [1, 2, 3, 4, 5].forEach(d => out.add(d));
  if (/weekends?/.test(t)) [0, 6].forEach(d => out.add(d));
  const names = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const range = /\b(sun|mon|tue|wed|thu|fri|sat)[a-z]*\s*(?:-|to|–)\s*(sun|mon|tue|wed|thu|fri|sat)[a-z]*/.exec(t);
  if (range && !/mon(day)?\s*(-|to|–)\s*fri/.test(t)) { let a = names.indexOf(range[1]); const b = names.indexOf(range[2]); for (let i = 0; i < 7; i++) { out.add(a); if (a === b) break; a = (a + 1) % 7; } }
  // singular and plural ("Saturdays" used to be missed, so a Saturday-only line ran every day)
  const DAY = ['sun(?:days?)?', 'mon(?:days?)?', 'tue(?:s|sdays?)?', 'wed(?:s|nesdays?)?', 'thu(?:rs|rsdays?)?', 'fri(?:days?)?', 'sat(?:urdays?)?'];
  for (const [i, p] of DAY.entries()) if (new RegExp(`\\b${p}\\b`).test(t)) out.add(i);
  return out.size ? [...out].sort() : [0, 1, 2, 3, 4, 5, 6];
}
export function describeDays(days) {
  const s = [...new Set(days)].sort().join(',');
  if (s === '0,1,2,3,4,5,6') return 'every day'; if (s === '1,2,3,4,5') return 'weekdays'; if (s === '0,6') return 'weekends';
  return days.map(d => DAY_NAMES[d].slice(0, 3)).join(', ');
}

/* ---------- text ---------- */
/** Pull the first JSON object or array out of a model's answer (it may be wrapped in ```json fences or prose). */
export function extractJson(text) {
  const s = String(text || '');
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(s);
  const tries = [fence?.[1], s];
  for (const t of tries) {
    if (!t) continue;
    try { return JSON.parse(t.trim()); } catch {}
    for (const [open, close] of [['[', ']'], ['{', '}']]) {
      const i = t.indexOf(open); if (i < 0) continue;
      let depth = 0, inStr = false, esc = false;
      for (let j = i; j < t.length; j++) {
        const c = t[j];
        if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true; else if (c === open) depth++; else if (c === close && --depth === 0) { try { return JSON.parse(t.slice(i, j + 1)); } catch { break; } }
      }
    }
  }
  return null;
}
/** Plain text for speech and WhatsApp: no Markdown symbols. */
export function plain(md) {
  return String(md || '').replace(/```[\s\S]*?```/g, '').replace(/^#{1,6}\s*/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|\s)\*([^*\n]+)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)').replace(/^\s*[-*]\s+/gm, '• ').replace(/\n{3,}/g, '\n\n').trim();
}
/** WhatsApp understands *bold* and _italic_: turn Markdown headings and bold into that. */
export function whatsappText(md) {
  return String(md || '').replace(/```[\s\S]*?```/g, '').replace(/^#{1,6}\s*(.+)$/gm, '*$1*').replace(/\*\*([^*]+)\*\*/g, '*$1*').replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1: $2').replace(/^\s*[-*]\s+/gm, '• ').replace(/\n{3,}/g, '\n\n').trim();
}
/** Text for a phone voice: short sentences, no symbols a speech engine would read out. */
export function speakableText(s) {
  return plain(s).replace(/•\s*/g, '').replace(/https?:\/\/\S+/g, 'the link').replace(/&/g, ' and ').replace(/[<>#*_|~^]/g, ' ').replace(/\s*\n+\s*/g, '. ').replace(/\.{2,}/g, '.').replace(/\s+/g, ' ').replace(/\.\s*\./g, '.').trim();
}
export const xml = s => String(s ?? '').replace(/[<>&'"]/g, c => ({'<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;'}[c]));

/* ---------- files ---------- */
/** Put a freshly written temp file in place. Windows can hold a file for a moment (antivirus, indexing, backup), so a refused
 *  rename is tried again for up to about a second instead of losing the save. */
const PAUSE = new Int32Array(new SharedArrayBuffer(4));
export function replaceFile(tmp, file) {
  for (let i = 0; ; i++) {
    try { fs.renameSync(tmp, file); return; }
    catch (e) { if (i >= 20 || !['EPERM', 'EACCES', 'EBUSY'].includes(e.code)) { try { fs.rmSync(tmp, {force: true}); } catch {} throw e; } Atomics.wait(PAUSE, 0, 0, 10 + i * 5); }
  }
}
export function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
export function writeJson(file, value, space = 1) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value, null, space)); replaceFile(tmp, file);
}
export function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, text); replaceFile(tmp, file);
}
/**
 * Read a saved JSON file that must not be lost. A damaged one is kept aside (name.broken-<time>) and the last
 * good copy (name.bak, kept by writeJsonKeep) is used instead. Undefined when there is nothing to read.
 */
export function readJsonKeep(file, log = () => {}) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch (e) { if (e.code !== 'ENOENT') log(`${path.basename(file)} could not be read: ${e.message}`); return undefined; }
  try { return JSON.parse(raw); } catch {}
  const aside = `${file}.broken-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  try { fs.copyFileSync(file, aside); } catch {}
  try { const good = JSON.parse(fs.readFileSync(`${file}.bak`, 'utf8')); log(`${path.basename(file)} was damaged, so the last good copy was used. The damaged file is kept as ${path.basename(aside)}.`); return good; }
  catch { log(`${path.basename(file)} was damaged and there is no good copy. It is kept as ${path.basename(aside)}.`); return undefined; }
}
/** Save JSON, keeping the copy it replaces as name.bak when that copy was whole. */
export function writeJsonKeep(file, value, space = 1) {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); fs.copyFileSync(file, `${file}.bak`); } catch {}
  writeJson(file, value, space);
}
export const safeFileName = s => String(s || '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled';
/** Normalise a UK-style phone number to +44… (keeps other international numbers as they are). */
export function e164(n) {
  let s = String(n || '').replace(/\(\s*0\s*\)/g, '').replace(/[^\d+]/g, '');   // "+44 (0)7700 900123": the (0) is only dialled from inside the country
  if (!s) return '';
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('0') && s.length === 11) s = '+44' + s.slice(1);
  if (/^\+440\d{10}$/.test(s)) s = '+44' + s.slice(4);
  if (!s.startsWith('+')) s = '+' + s;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : '';
}
export const maskPhone = n => { const s = String(n || ''); return s.length > 6 ? s.slice(0, 4) + '••••' + s.slice(-3) : s; };
