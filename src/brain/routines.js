import fs from 'node:fs';
import path from 'node:path';
import {saveArchive, sha256, buildSelfRelease} from './archives.js';
import {dayKey} from './util.js';
import {zonedParts, wallTime} from './travel.js';

const BACKUP_FILES = ['settings.json', 'workstations.json', 'suit-visits.json', 'hall-calibration.json', 'work-suggestions.json', 'tower.json', 'tower-runs.json', 'todos.json', 'calendar.json', 'ideas.json', 'workbench.json', 'brain.json', 'reports.json', 'alarms.json', 'meetings.json', 'meeting-followups.json', 'product-studio.json', 'meeting-work.json', 'work-desk.json', 'photo-drop.json', 'brain-spend-history.json'];
export function weeklyText(core, now = Date.now()) {
  const since = now - 7 * 864e5, runs = (core.deps.tower?.runs || []).filter(r => !r.rehearsal && Number(r.endedAt || r.startedAt) >= since), todos = core.deps.todos?.list() || [];
  const done = todos.filter(t => t.done && t.doneAt >= since), open = todos.filter(t => !t.done);
  const accepted = runs.filter(r => r.status === 'done' && r.verdict === 'APPROVED' && r.feedback?.good === true), rework = runs.filter(r => r.status === 'needs_changes' || r.feedback?.good === false), finished = runs.filter(r => r.status === 'done' && !r.feedback);
  const mails = core.mail.since(since), sent = core.approvals.list({limit: 1000}).filter(a => a.kind === 'email' && a.status === 'done' && Number(a.finishedAt || a.decidedAt || a.createdAt) >= since);
  const events = (core.deps.calendar?.list() || []).filter(e => Date.parse(e.start) >= now && Date.parse(e.start) <= now + 7 * 864e5);
  const ledger = core.store.spendHistory || {}, keys = Object.keys(ledger).filter(k => k >= dayKey(new Date(since)) && k <= dayKey(new Date(now)));
  const spend = keys.reduce((s, k) => s + Number(ledger[k].usd || 0), 0), towerSpend = runs.reduce((s, r) => s + Number(r.cost || 0), 0);
  return `## This week\n- ${done.length} to-dos finished; ${accepted.length} Tower results accepted.\n- ${finished.length} finished results still need your review; ${rework.length} runs need rework.\n- ${mails.length} emails sorted; ${sent.length} approved email actions completed.\n\n## Still open\n${open.slice(0, 8).map(t => '- ' + t.text).join('\n') || '- No open to-dos.'}\n${open.length > 8 ? `- Plus ${open.length - 8} more in your to-dos.\n` : ''}\n## Spend\n- Recorded Core API spend and reserved voice allowances: $${spend.toFixed(2)} across ${keys.length} recorded days.\n- Retained Tower runs: $${towerSpend.toFixed(2)}.\n- Twilio charges and older unrecorded history are not included. Retained history may be incomplete.\n\n## Next week\n${events.slice(0, 10).map(e => `- ${new Date(e.start).toLocaleString('en-GB')}: ${e.title}`).join('\n') || '- No events in JARVIS’s local calendar.'}\n${core.travel.get() ? `\nTrip: ${core.travel.get().city}, ${core.travel.get().start} to ${core.travel.get().end}.` : ''}`;
}
export class Routines {
  constructor(core) { this.core = core; this.busy = false; this.lastTry = 0; }
  folder() { const candidate = this.core.deps.oneDrive || process.env.OneDriveConsumer || process.env.OneDrive || process.env.OneDriveCommercial; if (!candidate || !fs.existsSync(candidate)) throw Error('OneDrive was not found. Sign in to OneDrive on this PC, then try again.'); return path.join(candidate, 'JARVIS Backups'); }
  status() { const c = this.core; let folder = ''; try { folder = this.folder(); } catch {} return {config: c.store.get().routines, folder, backup: c.store.state.lastBackup || null, weekly: c.store.state.lastWeekly || null, releases: c.store.state.selfReleases || [], trip: c.travel.get(), weather: c.store.state.tripWeather || null, flights: c.store.state.flightAlerts || [], voiceReady: !!c.store.secret('openaiKey') && c.store.get().voiceNotes?.enabled}; }
  async backup() {
    const c = this.core, folder = this.folder(), entries = [], missing = []; let total = 0;
    const add = (name, file) => { if (!fs.existsSync(file)) { missing.push(name); return; } const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) throw Error(`Backup skipped an unexpected file: ${name}`); total += stat.size; if (total > 50 * 1024 * 1024) throw Error('Settings backup exceeds 50 MB. Your previous backup is still safe.'); entries.push({name, data: fs.readFileSync(file)}); };
    for (const name of BACKUP_FILES) add(`settings/${name}`, path.join(c.deps.userDir, name));
    for (const name of ['Standing orders.md', 'Notes.md']) add(`documents/JARVIS/${name}`, path.join(c.store.home, name));
    const hashes = entries.map(e => ({name: e.name, size: e.data.length, sha256: sha256(e.data)}));
    entries.push({name: 'manifest.json', data: JSON.stringify({version: c.deps.appVersion, at: Date.now(), files: hashes, absent: missing}, null, 2)});
    entries.push({name: 'RESTORE.txt', data: 'JARVIS settings backup\n\n1. Quit JARVIS from the tray. Keep a copy of the current data folder first.\n2. Copy settings/* into %APPDATA%\\jarvis-armor-workspace.\n3. Copy documents/JARVIS/* into your Documents\\JARVIS folder.\n4. Start JARVIS and check your settings. Reconnect API keys, Twilio, Gmail and website sign-ins.\n\nIncludes suit configuration, local lists, notes, standing orders and saved work history. Does not include passwords, browser sessions, original documents referenced by tasks, Product Studio photos/clips, Work desk exports, trophy result copies, Photo inbox images and files, large suit models, recordings or app files. Back up those separately. Manifest SHA-256 values verify each included file. OneDrive syncing is controlled by OneDrive, not JARVIS.\n'});
    const stamp = new Date().toISOString().replace(/[:.]/g, '-'), file = path.join(folder, `JARVIS-settings-${stamp}.zip`);
    const result = saveArchive(file, entries); c.store.setState({lastBackup: {...result, at: Date.now(), error: ''}}); c.store.act('backup', `Settings backup saved and verified (${result.size} bytes). OneDrive sync is handled by OneDrive.`); return result;
  }
  async weekly(send = false) {
    const c = this.core, text = weeklyText(c), report = c.store.addReport({kind: 'weekly', title: 'Sunday review', text});
    if (!send) return {id: report.id, text};
    const result = await c.message(text, {kind: 'weekly', reportId: report.id});
    c.store.setState({lastWeekly: {at: Date.now(), id: report.id, sent: !!result.ok, via: result.via, error: result.error || '', queued: !!result.queued}}); return result;
  }
  export(version) {
    const c = this.core, old = c.store.state.selfReleases?.find(r => r.selfVersion === version && fs.existsSync(r.file)); if (old) return old;
    const result = buildSelfRelease(c, version), saved = {...result, selfVersion: version, at: Date.now()};
    c.store.setState({selfReleases: [...(c.store.state.selfReleases || []), saved].slice(-20)});
    c.deps.broadcast('core', {type: 'reaction', kind: 'build-passed', at: Date.now()}); return saved;
  }
  async tick(now = Date.now()) {
    if (!this.core.deps.routinesEnabled || this.busy || now - this.lastTry < 30 * 60000) return;
    this.busy = true; this.lastTry = now;
    try {
      const c = this.core, cfg = c.store.get().routines, zone = cfg.zone, p = zonedParts(now, zone), state = c.store.state;
      const backupDay = p.time >= '02:00' ? p.date : new Date(Date.parse(p.date) - 864e5).toISOString().slice(0, 10);
      if (cfg.backup && state.backupDay !== backupDay) {
        try { await this.backup(); c.store.setState({backupDay}); }
        catch (e) { c.store.setState({lastBackup: {...state.lastBackup, error: e.message}}); c.deps.notify('JARVIS backup needs attention', e.message); }
      }
      const back = p.day === 0 && p.time < '18:00' ? 7 : p.day;
      const sunday = new Date(Date.parse(p.date) - back * 864e5).toISOString().slice(0, 10), due = wallTime(sunday, '18:00', zone);
      if (cfg.weekly && now >= due && now - due <= 2 * 864e5 && state.weeklyDay !== sunday) {
        // Record intent first: after a crash an uncertain send is shown for review, never sent twice automatically.
        c.store.setState({weeklyDay: sunday, lastWeekly: {at: now, sent: false, error: 'Delivery started; check Reports if JARVIS stopped during sending.'}});
        try { await this.weekly(true); } catch (e) { c.store.setState({lastWeekly: {at: now, sent: false, error: e.message}}); }
      }
      c.push();
    } finally { this.busy = false; }
  }
}
