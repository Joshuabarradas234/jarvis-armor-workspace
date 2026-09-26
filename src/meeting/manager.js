import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Meeting mode: one meeting at a time, linked to a suit in a hall.
 * The main window records (your microphone plus everything the PC plays, so Zoom, Teams, Meet and
 * phone apps all work) and sends two things here: the compressed recording, and 16 kHz chunks that
 * the Windows speech engine transcribes while the meeting is still going.
 */
const pad = n => String(n).padStart(2, '0');
export const clock = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600); return (h ? h + ':' : '') + pad(Math.floor(s / 60) % 60) + ':' + pad(s % 60); };
const safe = s => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Meeting';

function wav(pcm) {   // 16-bit mono 16 kHz PCM -> a WAV file the speech engine can read
  const h = Buffer.alloc(44), rate = 16000;
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export class MeetingManager {
  constructor({dir, docs, scripts, log, onUpdate}) {
    Object.assign(this, {dir, docs, scripts, log: log || (() => {}), onUpdate: onUpdate || (() => {})});
    this.indexFile = path.join(dir, 'meetings.json');
    try { this.history = JSON.parse(fs.readFileSync(this.indexFile, 'utf8')); } catch { this.history = []; }
    if (!Array.isArray(this.history)) this.history = [];
    this.m = null; this.proc = null; this.waiting = []; this.engine = null;
  }
  get active() { return !!this.m && !this.m.ending; }
  saveIndex() { try { this.history = this.history.slice(-300); fs.writeFileSync(this.indexFile + '.tmp', JSON.stringify(this.history, null, 1)); fs.renameSync(this.indexFile + '.tmp', this.indexFile); } catch (e) { this.log('meeting', e.message); } }
  state() {
    const m = this.m;
    return {active: this.active, ending: !!m?.ending, meeting: m ? {id: m.id, theme: m.theme, suitId: m.suitId, suitName: m.suitName, hallName: m.hallName, startedAt: m.startedAt,
      sources: m.sources, engine: this.engine, pending: m.pending, lines: m.lines.slice(-8).map(l => ({at: clock(l.at), text: l.text}))} : null};
  }
  pastFor(theme, suitId) { return this.history.filter(h => h.theme === theme && (!suitId || h.suitId === suitId)).slice(-6).reverse(); }
  find(id) { return this.history.find(h => h.id === id) || null; }

  /** Folder: the suit's own folder when it has one (Meetings/<date>), else Documents/JARVIS Meetings/<hall>/<suit>/<date>. */
  start({theme, hallName, suitId, suitName, suitFolder}) {
    if (this.m) throw Error(this.m.ending ? 'The last meeting is still being written up. Give it a moment.' : `Already recording the ${this.m.suitName} meeting.`);
    const now = new Date(), stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}.${pad(now.getMinutes())}`;
    const base = suitFolder && fs.existsSync(suitFolder) ? path.join(suitFolder, 'Meetings') : path.join(this.docs, 'JARVIS Meetings', safe(hallName), safe(suitName));
    const folder = path.join(base, stamp);
    fs.mkdirSync(path.join(folder, 'chunks'), {recursive: true});
    this.m = {id: crypto.randomUUID(), theme, hallName, suitId, suitName, startedAt: Date.now(), folder, recording: path.join(folder, 'recording.webm'),
      lines: [], sources: [], pending: 0, chunks: 0, ending: false, warnings: []};
    this.startEngine();
    this.onUpdate(this.state());
    return this.state().meeting;
  }
  capturing(id, sources) { if (this.m?.id !== id) return false; this.m.sources = sources; this.onUpdate(this.state()); return true; }
  audio(id, bytes) { if (this.m?.id !== id) return false; fs.appendFileSync(this.m.recording, Buffer.from(bytes)); return true; }
  /** A 16 kHz chunk: saved as WAV and queued for the speech engine. `start` is its offset into the meeting in seconds. */
  chunk(id, start, bytes) {
    const m = this.m; if (m?.id !== id) return false;
    const file = path.join(m.folder, 'chunks', `${String(++m.chunks).padStart(4, '0')}.wav`);
    fs.writeFileSync(file, wav(Buffer.from(bytes)));
    m.pending++; this.onUpdate(this.state());
    this.transcribe(file).then(parts => { for (const p of parts) m.lines.push({at: start + p.at, text: p.text}); })
      .catch(e => { m.warnings.push(`Part of the audio at ${clock(start)} could not be transcribed (${e.message}).`); })
      .finally(() => { m.pending--; m.lines.sort((a, b) => a.at - b.at); if (this.m === m) this.onUpdate(this.state()); });
    return true;
  }

  /* ---------- the speech engine: one PowerShell process per meeting, fed one chunk at a time ---------- */
  startEngine() {
    if (process.platform !== 'win32') { this.engine = {ready: false, error: 'Transcription needs the Windows speech engine.'}; return; }
    this.engine = {ready: false, starting: true};
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(this.scripts, 'transcribe.ps1')], {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
    this.proc = child; let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', d => {
      out += d; let i;
      while ((i = out.indexOf('\n')) >= 0) {
        const line = out.slice(0, i).trim(); out = out.slice(i + 1); if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if ('ready' in msg) { this.engine = msg.ready ? {ready: true, recognizer: msg.recognizer} : {ready: false, error: msg.error}; if (!msg.ready) this.log('meeting', msg.error); if (this.m) this.onUpdate(this.state()); continue; }
        const w = this.waiting.shift(); if (!w) continue;
        msg.error ? w.reject(Error(msg.error)) : w.resolve(Array.isArray(msg.parts) ? msg.parts : []);
      }
    });
    child.stderr.on('data', d => this.log('meeting', String(d).slice(0, 300)));
    child.stdin.on('error', () => {});
    const gone = () => { if (this.proc === child) this.proc = null; for (const w of this.waiting.splice(0)) w.reject(Error(this.engine?.error || 'the speech engine stopped')); };
    child.on('error', e => { this.engine = {ready: false, error: e.message}; gone(); });
    child.on('exit', gone);
  }
  transcribe(file) {
    return new Promise((resolve, reject) => {
      if (!this.proc) return reject(Error(this.engine?.error || 'the speech engine is not running'));
      this.waiting.push({resolve, reject});            // the engine answers in order, one line per file
      this.proc.stdin.write(file + '\n');
    });
  }

  /** Stop taking audio, wait for the speech engine to catch up (up to `wait` ms), and write transcript.md. */
  async finish({wait = 10 * 60000} = {}) {
    const m = this.m; if (!m) return null;
    m.ending = true; m.endedAt = Date.now(); this.onUpdate(this.state());
    const until = Date.now() + wait;
    while (m.pending > 0 && Date.now() < until) await new Promise(r => setTimeout(r, 400));
    if (m.pending > 0) m.warnings.push('The speech engine had not finished every part when time ran out.');
    try { this.proc?.stdin.end(); } catch {} setTimeout(() => { try { this.proc?.kill(); } catch {} }, 3000);
    try { fs.rmSync(path.join(m.folder, 'chunks'), {recursive: true, force: true}); } catch {}
    const transcript = m.lines.map(l => `[${clock(l.at)}] ${l.text}`).join('\n');
    return {...m, transcript, duration: (m.endedAt - m.startedAt) / 1000};
  }
  /** Write the finished document and record the meeting in the history. */
  record(m, {markdown, emailed, emailError}) {
    const file = path.join(m.folder, 'transcript.md');
    fs.writeFileSync(file, markdown);
    this.history.push({id: m.id, theme: m.theme, hallName: m.hallName, suitId: m.suitId, suitName: m.suitName, startedAt: m.startedAt, endedAt: m.endedAt,
      folder: m.folder, transcript: file, recording: fs.existsSync(m.recording) ? m.recording : null, emailed: !!emailed, emailError: emailError || null});
    this.saveIndex();
    if (this.m === m) this.m = null;
    this.onUpdate(this.state());
    return file;
  }
  /** The recording never started (no microphone, window gone): forget the meeting and its empty folder. */
  discard() {
    const m = this.m; if (!m) return;
    this.m = null;
    try { this.proc?.kill(); } catch {}
    try { if (!fs.existsSync(m.recording)) fs.rmSync(m.folder, {recursive: true, force: true}); } catch {}
    this.onUpdate(this.state());
  }
  /** Quitting mid-meeting: keep whatever has been transcribed so far. */
  saveNow() {
    const m = this.m; if (!m) return;
    try { fs.writeFileSync(path.join(m.folder, 'transcript (unfinished).md'), `# Meeting: ${m.suitName}\n\nJARVIS was closed during this meeting.\n\n` + m.lines.map(l => `[${clock(l.at)}] ${l.text}`).join('\n') + '\n'); } catch {}
    try { this.proc?.kill(); } catch {}
  }
}
