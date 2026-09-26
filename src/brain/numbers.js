/**
 * JARVIS Core — "watching every number so you don't have to".
 * Each line under "## Watch" in the Standing orders is a number to follow: a JSON link (with a path),
 * a CSV file (with a column), or any page or file (JARVIS reads the number out of it).
 * It keeps a history and tells you when something moves more than you said, or crosses a line.
 */
import fs from 'node:fs';
import {ask} from './llm.js';
import {clip} from './util.js';
import {publicFetch} from './tools.js';

function walkPath(obj, p) {
  let cur = obj;
  for (const part of String(p || '').replace(/^\$\.?/, '').split(/\.|\[(\d+)\]/).filter(x => x !== undefined && x !== '')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[/^\d+$/.test(part) && Array.isArray(cur) ? Number(part) : part];
  }
  return cur;
}
const toNum = v => { if (typeof v === 'number') return v; const m = /-?[\d,]*\.?\d+/.exec(String(v ?? '').replace(/[£$€]/g, '')); return m ? Number(m[0].replace(/,/g, '')) : NaN; };
function csvLast(text, column) {
  const rows = String(text).trim().split(/\r?\n/).map(r => { const out = []; let cur = '', qd = false; for (const ch of r) { if (ch === '"') qd = !qd; else if (ch === ',' && !qd) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); });
  if (rows.length < 2) return NaN;
  const i = rows[0].findIndex(h => h.toLowerCase() === String(column).toLowerCase());
  if (i < 0) throw Error(`There is no column called ${column}.`);
  for (let r = rows.length - 1; r > 0; r--) { const v = toNum(rows[r][i]); if (Number.isFinite(v)) return v; }
  return NaN;
}

export class Numbers {
  constructor({store, key, fetchImpl, log}) { Object.assign(this, {store, key, f: fetchImpl || fetch, log: log || (() => {})}); }
  history() { return this.store.state.numbers || {}; }
  async read(w) {
    let text, json = null;
    if (/^https?:/i.test(w.source)) {
      const r = await publicFetch(w.source);   // public pages only: never this computer or the home network
      if (r.status < 200 || r.status >= 300) throw Error(`The link answered ${r.status}.`);
      text = r.text.replace(/^﻿/, '');
    } else {
      const f = w.source.replace(/^~(?=\/)/, process.env.HOME || process.env.USERPROFILE || '~');
      if (!fs.existsSync(f)) throw Error('That file is not there.');
      text = fs.readFileSync(f, 'utf8').replace(/^﻿/, '');   // files saved by Excel or Notepad can start with a byte-order mark
    }
    if (w.path) { try { json = JSON.parse(text); } catch { throw Error('That link did not return JSON.'); } const v = toNum(walkPath(json, w.path)); if (!Number.isFinite(v)) throw Error(`Nothing at ${w.path}.`); return v; }
    if (w.column) return csvLast(text, w.column);
    try { json = JSON.parse(text); if (typeof json === 'number') return json; } catch {}
    // no path given: let the fast model read it out (a page, a report, anything)
    const key = this.key(); if (!key) throw Error('Add a → path or (column …) for this number, or connect Claude so I can read it.');
    const plainText = text.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 12000);
    const r = await ask({key, model: this.store.get().models.fast, maxTokens: 50, system: 'You read one number out of a page. Answer with the number only (digits, optional decimal point), or NONE.', prompt: `What is the current value of "${w.name}"?\n\n${plainText}`});
    this.store.addSpend(r.cost, 'numbers');
    const v = toNum(r.text); if (!Number.isFinite(v)) throw Error('I could not find that number on the page.'); return v;
  }
  /** Check every number. Returns [{name, value, previous, change, alert, why, error}]. */
  async check(list) {
    const hist = {...this.history()}; const out = [];
    for (const w of list) {
      const row = {name: w.name, value: null, previous: null, change: null, alert: false, why: '', error: ''};
      try {
        const v = await this.read(w); row.value = v;
        const h = (hist[w.id] = (hist[w.id] || []).slice(-199));
        const prev = h.length ? h[h.length - 1].v : null; row.previous = prev;
        if (prev !== null && prev !== 0) row.change = Math.round(((v - prev) / Math.abs(prev)) * 1000) / 10;
        if (row.change !== null && Math.abs(row.change) >= (w.movePct || 20)) { row.alert = true; row.why = `${w.name} ${row.change > 0 ? 'rose' : 'fell'} ${Math.abs(row.change)}% (${prev} → ${v}).`; }
        if (w.below !== null && v < w.below && !(prev !== null && prev < w.below)) { row.alert = true; row.why = `${w.name} dropped below ${w.below}: now ${v}.`; }
        if (w.above !== null && v > w.above && !(prev !== null && prev > w.above)) { row.alert = true; row.why = `${w.name} went above ${w.above}: now ${v}.`; }
        h.push({t: Date.now(), v});
      } catch (e) { row.error = clip(e.message, 200); }
      out.push(row);
    }
    this.store.setState({numbers: hist, numbersChecked: Date.now(), numbersLast: out});
    return out;
  }
}
