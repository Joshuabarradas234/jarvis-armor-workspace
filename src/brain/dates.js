import path from 'node:path';
import crypto from 'node:crypto';
import {readJson, writeJson, pad2} from './util.js';

/**
 * Bills and birthdays: dates JARVIS reminds you about on WhatsApp a few days ahead, and again on the day.
 * Kept in dates.json in JARVIS's data folder (and in the nightly backup).
 *   kind:   bill | birthday | other
 *   repeat: monthly (day of the month) | yearly (day and month) | once (a full date)
 */
export const KINDS = ['bill', 'birthday', 'other'], REPEATS = ['monthly', 'yearly', 'once'];
const line = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const iso = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const midnight = at => { const d = new Date(at); d.setHours(0, 0, 0, 0); return d; };
const lastDay = (y, m) => new Date(y, m + 1, 0).getDate();   // m is 0-based

export function cleanDate(p, prev = {}) {
  const name = line(p.name ?? prev.name, 80); if (!name) throw Error('Give it a name, for example "Council tax" or "Mum\'s birthday".');
  const kind = KINDS.includes(p.kind) ? p.kind : prev.kind || 'other';
  const repeat = REPEATS.includes(p.repeat) ? p.repeat : prev.repeat || (kind === 'bill' ? 'monthly' : 'yearly');
  const day = int(p.day ?? prev.day, 1, 31), month = int(p.month ?? prev.month, 1, 12), year = int(p.year ?? prev.year, 1900, 2200);
  if (!day) throw Error('Which day of the month is it?');
  if (repeat !== 'monthly' && !month) throw Error('Which month is it in?');
  if (repeat === 'once' && !year) throw Error('Which year is it?');
  if (repeat !== 'monthly' && day > lastDay(year || 2024, month - 1)) throw Error('That date does not exist.');
  const ahead = int(p.ahead ?? prev.ahead, 0, 30) ?? 3;
  return {id: prev.id || crypto.randomUUID(), name, kind, repeat, day, month: repeat === 'monthly' ? null : month, year: repeat === 'monthly' ? null : year,
    amount: line(p.amount ?? prev.amount, 30), note: line(p.note ?? prev.note, 200), ahead, sent: prev.sent || [], created: prev.created || Date.now()};
}
/** The next time it falls due, from today (midnight, local time); null for a one-off date that has passed. */
export function nextDue(d, now = Date.now()) {
  const today = midnight(now);
  if (d.repeat === 'once') { const at = new Date(d.year, d.month - 1, d.day); return at >= today ? at : null; }
  if (d.repeat === 'monthly') {
    for (let k = 0; k < 2; k++) { const y = today.getFullYear(), m = today.getMonth() + k, at = new Date(y, m, Math.min(d.day, lastDay(y, m))); if (at >= today) return at; }
  }
  for (let k = 0; k < 2; k++) { const y = today.getFullYear() + k, at = new Date(y, d.month - 1, Math.min(d.day, lastDay(y, d.month - 1))); if (at >= today) return at; }   // 29 February falls on the 28th
  return null;
}
const daysBetween = (a, b) => Math.round((midnight(b) - midnight(a)) / 864e5);
const when = at => at.toLocaleDateString('en-GB', {weekday: 'long', day: 'numeric', month: 'long'});
/** What to say about one date `left` days ahead of `at` (0 = today). */
export function reminderText(d, at, left) {
  const amount = d.amount ? ` (${d.amount})` : '', soon = left === 1 ? 'tomorrow' : `on ${when(at)}, in ${left} days`;
  if (d.kind === 'birthday') {
    const who = /birthday/i.test(d.name) ? d.name : `${d.name}'s birthday`, age = d.year && d.repeat === 'yearly' && d.year < at.getFullYear() ? at.getFullYear() - d.year : 0;
    return left === 0 ? `🎂 It's ${who} today${age ? ` (${age})` : ''}.` : `🎂 ${who} is ${soon}${age ? ` (turning ${age})` : ''}. Time for a card or a present.`;
  }
  if (d.kind === 'bill') return left === 0 ? `💷 ${d.name}${amount} is due today.` : `💷 ${d.name}${amount} is due ${soon}.`;
  return left === 0 ? `📅 Today: ${d.name}${amount}.` : `📅 ${d.name}${amount} is ${soon}.`;
}

export class Dates {
  constructor({dir}) { this.file = path.join(dir, 'dates.json'); }
  load() { const l = readJson(this.file, []); return Array.isArray(l) ? l.filter(x => x && typeof x.id === 'string' && typeof x.name === 'string') : []; }
  save(list) { writeJson(this.file, list, 1); }
  /** Everything, soonest first, with when it next falls due. */
  list(now = Date.now()) {
    return this.load().map(d => { const at = nextDue(d, now); return {...d, next: at ? at.getTime() : null, daysLeft: at ? daysBetween(now, at) : null}; })
      .sort((a, b) => (a.next ?? Infinity) - (b.next ?? Infinity));
  }
  add(p) { const list = this.load(); if (list.length >= 200) throw Error('Up to 200 dates.'); const d = cleanDate(p); list.push(d); this.save(list); return d; }
  update(id, p) { const list = this.load(), i = list.findIndex(x => x.id === id); if (i < 0) throw Error('That date is not there any more.'); list[i] = cleanDate(p, list[i]); this.save(list); return list[i]; }
  remove(match) {
    const list = this.load(), m = String(match || '').trim().toLowerCase();
    const i = list.findIndex(x => x.id === match || (m && x.name.toLowerCase() === m)), j = i >= 0 ? i : list.findIndex(x => m && x.name.toLowerCase().includes(m));
    if (j < 0) throw Error('No date like that.');
    const [gone] = list.splice(j, 1); this.save(list); return gone;
  }
  /**
   * Reminders owed now: once inside the "days ahead" window (even if JARVIS was off on the exact day), and on the day.
   * Each is sent once per occurrence; call markSent with the keys after sending.
   */
  due(now = Date.now()) {
    const out = [];
    for (const d of this.load()) {
      const at = nextDue(d, now); if (!at) continue;
      const left = daysBetween(now, at), key = left === 0 ? `${iso(at)}:day` : `${iso(at)}:ahead`;
      if (left > d.ahead || (d.sent || []).includes(key) || (left > 0 && d.ahead === 0)) continue;
      out.push({id: d.id, key, left, text: reminderText(d, at, left)});
    }
    return out.sort((a, b) => a.left - b.left);
  }
  markSent(items) {
    const list = this.load();
    for (const it of items) { const d = list.find(x => x.id === it.id); if (d) d.sent = [...(d.sent || []), it.key].slice(-12); }
    this.save(list);
  }
}
