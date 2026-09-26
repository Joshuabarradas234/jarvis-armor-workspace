/**
 * JARVIS Core — self-updates. PROTECTED: self-updates may never change this file.
 *
 *  1. stage():    copy the version JARVIS will run next (the newest approved one, or the installed app) into a
 *                 private workshop folder.
 *  2. (the coder edits files there — see coder.js)
 *  3. validate(): look at EVERY file in the workshop against what was copied: nothing protected touched, nothing
 *                 added where updates may not go, no network servers, nothing that changes how approvals or updates
 *                 work, every script still parses, and the whole change small and plain enough to be read in full.
 *  4. You approve it. The approval is tied to a fingerprint of the exact changes, so what you approved is exactly
 *     what gets installed, and it must still build on the version it was made from.
 *  5. install():  the workshop copy becomes a new version; JARVIS restarts into it when you are not using him.
 *     boot.js falls back to the previous version by itself if the new one does not start.
 *  6. undo():     back to the version before, at any time.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';

export const PROTECTED = ['src/main/boot.js', 'src/main/preload.cjs', 'src/brain/selfupdate.js', 'src/brain/approvals.js', 'package.json'];
const EDITABLE = ['src/', 'dist/', 'config/'];
const FORBIDDEN = /(^|\/)\.|^dist\/vendor\/|^dist\/wallpaper\/|(^|\/)node_modules\/|[:<>"|?*\\]|[\u0000-\u001f]/i;   // hidden files, the big shared folders, anything Windows reads as a stream or device
const SKIP_COPY = new Set(['dist/vendor', 'dist/wallpaper', 'node_modules', 'test-results', 'release', '.git']);
const TEXT = /\.(js|mjs|cjs|json|css|html?|md|txt|svg)$/i;
const CODE = /\.(js|mjs|cjs)$/i;
const MACHINERY = ['src/brain/index.js', 'src/brain/tools.js', 'src/main/main.js', 'dist/assets/core.js', 'src/brain/coder.js', 'src/brain/improve.js'];
const MACHINERY_WORDS = /approv|decide|handleReply|markNotified|\.install\(|updater|selfupdate|fingerprint|markGood|markBad|__jarvisBoot|preload|USER_CHANNELS|PROTECTED/i;
const NETWORK_WORDS = /create(?:Secure)?Server\s*\(|new\s+(?:[\w$]+\.)?Server\s*\(|(?<!voice|deck)\.listen\s*\(|\[\s*['"`]listen['"`]\s*\]|createSocket\s*\(|require\(\s*['"](node:)?dgram|from\s+['"](node:)?dgram|cloudflared|trycloudflare|\bngrok\b|localtunnel|localhost\.run|serveo|\bzrok\b|pinggy|pagekite|telebit|localxpose|tailscale\s+funnel|\bfrpc\b/i;
// what an update may not add to any script: modules that talk to other machines or start programs, code built from
// text, and changes to window security. (Approved code runs with JARVIS's full rights, so these stay out entirely.)
const RISKY = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"`](?:node:)?(?:net|http|https|http2|tls|dgram|cluster|worker_threads|child_process|inspector|vm|module|repl)(?:\/[\w/]*)?['"`]|\bcreateRequire\b|process\s*\.\s*(?:binding|_linkedBinding|dlopen)\b|\butilityProcess\b|\beval\s*\(|\bnew\s+Function\s*\(|\bnodeIntegration\w*|\bcontextIsolation\s*:\s*false|\bsandbox\s*:\s*false|\bwebSecurity\b|\bpreload\s*:|\bsetPermission(?:Request|Check)Handler\b|\bregisterSchemesAsPrivileged\b|\bapp\.asar\b|\bresourcesPath\b|\basarRoot\b|\bgetAppPath\b/;
// the approval and self-update machinery, named from any file
const GUARDED = /approvals\.js(?:on)?\b|selfupdate|boot\.js|__jarvisBoot|brain-secrets|preload\.cjs|\bUSER_CHANNELS\b|\bPROTECTED\b|\b(?:state|updates|manifest)\.json\b|['"`]self['"`]\s*[,)]|[\\/]self[\\/]|\b(?:core|brain)\s*\.\s*(?:approvals|updater|decide)\b|\bapprovals\s*\.\s*(?:decide|handleReply|markNotified|create|data|get|save|batch)\b|\bupdater\s*\.\s*\w/;
// code loaded from outside the checked files: a Windows file stream (name:stream), an absolute path, a URL or data:,
// or a name worked out while running
const OUTSIDE = /(?:\b(?:import|export)\b[^'"`;]*?\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"`](?!node:)(?:[^'"`]*:|\/|\\)|\bimport\s*\(\s*(?!['"][^'"`$]*['"]\s*\))|\brequire\s*\(\s*(?!['"][^'"`$]*['"]\s*\))/;
const SENSITIVE = ['src/brain/maildesk.js', 'src/brain/email.js', 'src/brain/phone.js', 'src/brain/store.js', 'src/brain/llm.js', 'src/brain/calls.js'];
const SNEAKY = /[\u202A-\u202E\u2066-\u2069\u200B-\u200F\u2060\uFEFF]/;   // characters that make code look different from what runs
const MAX_LINE = 2000, MAX_DIFF = 150000;
const USER_CHANNELS = ['whatsapp', 'ui', 'voice'];   // never a text message: those can be faked
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const rel = p => p.split(path.sep).join('/');

/**
 * A fingerprint of a build's code (src, dist and config, without the big shared folders). The boot loader sets
 * aside updates made on any other build — even one with the same version number — so they cannot undo it.
 */
export function buildId(root) {
  const h = crypto.createHash('sha256');
  const walk = sub => {
    let names = []; try { names = fs.readdirSync(path.join(root, sub)).sort(); } catch { return; }
    for (const n of names) {
      const r = `${sub}/${n}`;
      if (n.startsWith('.') || n === 'node_modules' || r === 'dist/vendor' || r === 'dist/wallpaper') continue;
      let st; try { st = fs.statSync(path.join(root, r)); } catch { continue; }
      if (st.isDirectory()) walk(r);
      else if (/\.(m?js|cjs|json|html?|css)$/i.test(n)) { h.update(`${r}\n`); try { h.update(fs.readFileSync(path.join(root, r))); } catch {} }
    }
  };
  for (const d of ['src', 'dist', 'config']) walk(d);
  return h.digest('hex').slice(0, 16);
}

/** A plain line diff (common prefix/suffix, then LCS on the middle). Shows every changed line in full. */
export function lineDiff(a, b, context = 2) {
  const A = String(a).split('\n'), B = String(b).split('\n');
  let s = 0; while (s < A.length && s < B.length && A[s] === B[s]) s++;
  let ea = A.length - 1, eb = B.length - 1; while (ea >= s && eb >= s && A[ea] === B[eb]) { ea--; eb--; }
  const midA = A.slice(s, ea + 1), midB = B.slice(s, eb + 1);
  let ops = [];
  if (midA.length * midB.length > 4e6) ops = [...midA.map(l => ['-', l]), ...midB.map(l => ['+', l])];
  else {
    const n = midA.length, m = midB.length; const L = Array.from({length: n + 1}, () => new Uint32Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = midA[i] === midB[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    let i = 0, j = 0;
    while (i < n && j < m) { if (midA[i] === midB[j]) { ops.push([' ', midA[i]]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) ops.push(['-', midA[i++]]); else ops.push(['+', midB[j++]]); }
    while (i < n) ops.push(['-', midA[i++]]); while (j < m) ops.push(['+', midB[j++]]);
  }
  const pre = A.slice(Math.max(0, s - context), s).map(l => [' ', l]), post = A.slice(ea + 1, ea + 1 + context).map(l => [' ', l]);
  const cut = l => l.length > 300 ? l.slice(0, 300) + ` …(+${l.length - 300} chars)` : l;   // unchanged context lines only
  const lines = [...pre.map(([k, l]) => k + ' ' + cut(l)), ...ops.map(([k, l]) => k + ' ' + (k === ' ' ? cut(l) : l)), ...post.map(([k, l]) => k + ' ' + cut(l))];
  return {added: ops.filter(o => o[0] === '+').map(o => o[1]), removed: ops.filter(o => o[0] === '-').map(o => o[1]), text: `@@ line ${s + 1} @@\n` + lines.join('\n')};
}

export class SelfUpdater {
  constructor({userDir, boot, approvals, log}) {
    this.selfDir = path.join(userDir, 'self');
    this.stateFile = path.join(this.selfDir, 'state.json');
    this.updatesFile = path.join(this.selfDir, 'updates.json');
    this.boot = boot; this.approvals = approvals; this.log = log || (() => {});
    this.running = boot.root;
    this.installed = boot.asarRoot || boot.root;
  }
  readJson(f, d) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } }
  writeJson(f, v) { fs.mkdirSync(path.dirname(f), {recursive: true}); const t = `${f}.${process.pid}.tmp`; fs.writeFileSync(t, JSON.stringify(v, null, 1)); fs.renameSync(t, f); }
  state() { const s = this.readJson(this.stateFile, null); return s && s.versions ? {current: null, events: [], n: 0, ...s} : {current: null, versions: {}, events: [], n: 0}; }
  updates() { const u = this.readJson(this.updatesFile, []); return Array.isArray(u) ? u : []; }
  saveUpdates(list) { this.writeJson(this.updatesFile, list.slice(-60)); }
  update(id) { return this.updates().find(u => u.id === id) || null; }
  patch(id, p) { const list = this.updates(); const u = list.find(x => x.id === id); if (!u) return null; Object.assign(u, p); this.saveUpdates(list); return u; }
  /** A fingerprint of the installed build, so an update made on a different build of the same version is not used (the same one boot.js checks). */
  baseId() { return this._baseId ??= buildId(this.installed); }
  isProtected(p) { return PROTECTED.includes(String(p).toLowerCase()); }
  /** The folder of the version JARVIS will run next: the selected update, or the installed app. */
  selected() {
    const s = this.state(); const id = s.current;
    const dir = id ? path.join(this.selfDir, 'versions', id, 'app') : this.installed;
    return fs.existsSync(path.join(dir, 'src', 'main', 'main.js')) ? {id: id || 'installed', dir} : {id: 'installed', dir: this.installed};
  }
  status() {
    const s = this.state();
    const versions = Object.values(s.versions).sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 12)
      .map(v => ({id: v.id, n: v.n, title: v.title, base: v.base, created: v.created, good: !!v.good, bad: !!v.bad, reason: v.reason || '', undone: !!v.undone, superseded: !!v.superseded, current: v.id === s.current, running: v.id === this.boot.version}));
    return {base: this.boot.base, running: this.boot.version, label: this.boot.label, current: s.current, pendingRestart: (s.current || null) !== (this.boot.version || null),
      versions, updates: this.updates().slice(-20).reverse().map(({baseDir, ...u}) => u), events: (s.events || []).slice(-10), safeMode: !!this.boot.safeMode};
  }

  /* ---------- 1. the workshop copy ---------- */
  /** Directory listing that also works inside app.asar (Electron reads it like a folder). */
  list(dir) {
    let names = []; try { names = fs.readdirSync(dir); } catch { return []; }
    return names.map(name => { try { const st = fs.lstatSync(path.join(dir, name)); return {name, dir: st.isDirectory(), file: st.isFile(), link: st.isSymbolicLink()}; } catch { return null; } }).filter(Boolean);
  }
  copyTree(src, dst, sub = '', manifest = {}) {
    for (const e of this.list(path.join(src, sub))) {
      const r = sub ? `${sub}/${e.name}` : e.name;
      if (SKIP_COPY.has(r) || e.name.startsWith('.') || e.link) continue;
      if (e.dir) { this.copyTree(src, dst, r, manifest); continue; }
      if (!e.file) continue;
      if (!EDITABLE.some(p => r.startsWith(p)) && r !== 'package.json') continue;
      let buf; try { buf = fs.readFileSync(path.join(src, r)); } catch { continue; }
      if (buf.length > 3 * 1024 * 1024) continue;   // big pictures and models stay where they are (the app reads them from the installed copy)
      fs.mkdirSync(path.dirname(path.join(dst, r)), {recursive: true});
      fs.writeFileSync(path.join(dst, r), buf); manifest[r] = sha(buf);
    }
    return manifest;
  }
  stage({title = '', why = '', request = '', source = 'jarvis'} = {}) {
    const id = 'u' + Date.now().toString(36) + crypto.randomBytes(2).toString('hex');
    const dir = path.join(this.selfDir, 'staging', id, 'app');
    fs.mkdirSync(dir, {recursive: true});
    const base = this.selected();
    const manifest = this.copyTree(base.dir, dir);
    if (!manifest['src/main/main.js']) throw Error('Could not copy JARVIS into the workshop.');
    this.writeJson(path.join(this.selfDir, 'staging', id, 'manifest.json'), manifest);
    const list = this.updates();
    list.push({id, title: String(title).slice(0, 160), why: String(why).slice(0, 2000), request: String(request).slice(0, 2000), source, status: 'drafting', createdAt: Date.now(), from: base.id, baseDir: base.dir, base: this.boot.base, baseId: this.baseId(), files: [], cost: 0});
    this.saveUpdates(list);
    return {id, dir};
  }
  dir(id) { return path.join(this.selfDir, 'staging', id, 'app'); }
  /** Every file in the workshop, hidden ones and all (links are reported, never followed). */
  walk(root, sub = '', out = []) {
    for (const e of this.list(path.join(root, sub))) { const r = sub ? `${sub}/${e.name}` : e.name; if (e.link) out.push(r); else if (e.dir) this.walk(root, r, out); else out.push(r); }
    return out;
  }
  /* ---------- 3. what changed, and is it safe to install ---------- */
  changes(id) {
    const dir = this.dir(id); const manifest = this.readJson(path.join(this.selfDir, 'staging', id, 'manifest.json'), {});
    const now = new Set(this.walk(dir)); const out = [];
    for (const r of now) {
      let st; try { st = fs.lstatSync(path.join(dir, r)); } catch { continue; }
      if (!st.isFile()) { out.push({path: r, status: 'added', hash: 'not-a-file', size: 0, odd: true}); continue; }
      const buf = fs.readFileSync(path.join(dir, r)); const h = sha(buf);
      if (!(r in manifest)) out.push({path: r, status: 'added', hash: h, size: buf.length});
      else if (manifest[r] !== h) out.push({path: r, status: 'modified', hash: h, size: buf.length});
    }
    for (const r of Object.keys(manifest)) if (!now.has(r)) out.push({path: r, status: 'deleted', hash: '', size: 0});
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }
  fingerprint(changes) { return sha(changes.map(c => `${c.status}:${c.path}:${c.hash}`).join('\n')); }
  baseDirOf(id) { const u = this.update(id); return u?.baseDir && fs.existsSync(u.baseDir) ? u.baseDir : this.running; }
  fileDiffs(id) {
    const dir = this.dir(id), base = this.baseDirOf(id); const out = [];
    for (const c of this.changes(id)) {
      if (c.odd || !TEXT.test(c.path)) { out.push({c, d: null}); continue; }
      const before = c.status === 'added' ? '' : (() => { try { return fs.readFileSync(path.join(base, c.path), 'utf8'); } catch { return ''; } })();
      const after = c.status === 'deleted' ? '' : fs.readFileSync(path.join(dir, c.path), 'utf8');
      out.push({c, d: lineDiff(before, after)});
    }
    return out;
  }
  /** The full diff (every changed line). `max` only trims what is sent to a phone. */
  diff(id, max = MAX_DIFF + 20000) {
    let text = '', added = 0, removed = 0;
    for (const {c, d} of this.fileDiffs(id)) {
      if (!d) { text += `\n=== ${c.path} (${c.status}, not text)\n`; continue; }
      added += d.added.length; removed += d.removed.length;
      text += `\n=== ${c.path} (${c.status}, +${d.added.length} −${d.removed.length})\n${d.text}\n`;
    }
    return {added, removed, text: text.length > max ? text.slice(0, max) + '\n…(the rest is in JARVIS Core → Needs you → See the changes)' : text};
  }
  checkSyntax(file) {
    return new Promise(resolve => {
      let err = '', done = false; const end = r => { if (!done) { done = true; resolve(r); } };
      let child;
      try { child = spawn(process.execPath, ['--check', file], {env: {...process.env, ELECTRON_RUN_AS_NODE: '1'}, windowsHide: true}); }
      catch (e) { return end({ok: false, error: `Could not check it: ${e.message}`}); }
      child.stderr.on('data', d => { err += d; });
      child.on('error', e => end({ok: false, error: `Could not check it: ${e.message}`}));
      child.on('close', code => end(code === 0 ? {ok: true} : {ok: false, error: err.split('\n').filter(l => l.trim()).slice(0, 6).join('\n') || `The checker stopped (${code}).`}));
      setTimeout(() => { try { child.kill(); } catch {} end({ok: false, error: 'The syntax check took too long.'}); }, 30000);
    });
  }
  async validate(id) {
    const dir = this.dir(id); const changes = this.changes(id); const problems = [], warnings = [];
    if (!changes.length) problems.push('Nothing was changed.');
    const diffs = this.fileDiffs(id); let size = 0;
    for (const {c, d} of diffs) {
      if (c.odd) { problems.push(`${c.path} is not an ordinary file.`); continue; }
      if (this.isProtected(c.path)) problems.push(`${c.path} is protected and may not be changed.`);
      if (FORBIDDEN.test(c.path)) problems.push(`${c.path} is in a place updates may not write to.`);
      if (!EDITABLE.some(p => c.path.startsWith(p))) problems.push(`${c.path} is outside the parts of JARVIS that updates may change.`);
      if (c.size > 2 * 1024 * 1024) problems.push(`${c.path} is too big (${Math.round(c.size / 1e6)} MB).`);
      if (c.status === 'deleted' && /^src\/(main|brain)\//.test(c.path)) problems.push(`${c.path} may not be deleted.`);
      if (!d) { if (c.status !== 'deleted') problems.push(`${c.path} is not a text file, so you could not read what it does.`); continue; }
      const changed = [...d.added, ...d.removed];
      size += changed.reduce((n, l) => n + l.length + 3, 0);
      if (changed.some(l => l.length > MAX_LINE)) problems.push(`${c.path} changes a line longer than ${MAX_LINE} characters, which is too long for you to read. (The minified bundle may not be edited; add a new module instead.)`);
      const first = re => { const l = d.added.find(x => re.test(x)); return l === undefined ? '' : ` (“${l.trim().slice(0, 140)}”)`; };
      let w;
      if ((w = first(NETWORK_WORDS))) problems.push(`${c.path} adds a network server or a tunnel${w}. Updates may not open this computer to other machines.`);
      if (CODE.test(c.path) || /\.html?$/i.test(c.path)) {
        if ((w = first(RISKY))) problems.push(`${c.path} uses something updates may not add${w}: modules that reach other machines or start programs, code built from text, or changes to window security.`);
        if ((w = first(GUARDED))) problems.push(`${c.path} refers to the approvals or self-update machinery${w}. Updates may not do that.`);
        if ((w = first(OUTSIDE))) problems.push(`${c.path} loads code from outside the checked files${w}: a hidden Windows file stream (a name with ':'), a full path, a web or data: address, or a name worked out while running.`);
      }
      if (changed.some(l => SNEAKY.test(l))) problems.push(`${c.path} contains invisible or direction-changing characters, so what you would read is not what would run.`);
      if (MACHINERY.includes(c.path.toLowerCase()) && changed.some(l => MACHINERY_WORDS.test(l))) problems.push(`${c.path} changes how approvals or self-updates work. Updates may not do that.`);
      else if (d.added.some(l => MACHINERY_WORDS.test(l))) warnings.push(`${c.path} mentions approvals or self-updates — read those lines closely.`);
      if (SENSITIVE.includes(c.path.toLowerCase())) warnings.push(`${c.path} handles email, messages, calls or stored passwords — read this change closely.`);
      if (c.status === 'deleted') continue;
      const f = path.join(dir, c.path);
      if (CODE.test(c.path)) { const r = await this.checkSyntax(f); if (!r.ok) problems.push(`${c.path} has an error:\n${r.error}`); }
      if (/\.json$/i.test(c.path)) { try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { problems.push(`${c.path} is not valid JSON: ${e.message}`); } }
      if (c.path === 'dist/index.html') {
        const h = fs.readFileSync(f, 'utf8');
        if (!/assets\/index-[\w-]+\.js/.test(h)) problems.push('dist/index.html no longer loads the main screen.');
        if (!/Content-Security-Policy/.test(h)) problems.push('dist/index.html lost its security policy.');
      }
    }
    if (size > MAX_DIFF) problems.push(`The change is too big to read in one go (${Math.round(size / 1000)} KB of changed lines). It needs splitting into smaller updates.`);
    const must = [['src/main/main.js', /__jarvisBoot\?\.markGood/, 'no longer tells the boot loader when it has started, so every update would be rolled back'], ['src/main/main.js', /from '\.\.\/brain\/index\.js'/, 'no longer loads JARVIS Core'], ['src/main/main.js', /preload\.cjs/, 'no longer uses the protected preload bridge'],
      ['src/brain/index.js', /from '\.\/approvals\.js'/, 'no longer uses the protected approvals'], ['src/brain/index.js', /from '\.\/selfupdate\.js'/, 'no longer uses the protected self-update checks']];
    for (const [file, re, why] of must) { let t = ''; try { t = fs.readFileSync(path.join(dir, file), 'utf8'); } catch {} if (!re.test(t)) problems.push(`${file} ${why}.`); }
    const d = this.diff(id);
    const fingerprint = this.fingerprint(changes);
    this.patch(id, {files: changes.map(c => ({path: c.path, status: c.status})), added: d.added, removed: d.removed, fingerprint, problems, warnings, checkedAt: Date.now()});
    return {ok: !problems.length, problems, warnings, changes, fingerprint, added: d.added, removed: d.removed};
  }
  /** Mark a staged update as ready and record the approval that will govern it. */
  ready(id, {summary = '', cost = 0, approvalId = 0} = {}) { return this.patch(id, {status: 'ready', summary: String(summary).slice(0, 4000), cost, approvalId}); }
  failed(id, error) { return this.patch(id, {status: 'failed', error: String(error).slice(0, 2000)}); }
  rejected(id) { const u = this.patch(id, {status: 'rejected', rejectedAt: Date.now()}); this.dropStaging(id); return u; }
  dropStaging(id) { try { fs.rmSync(path.join(this.selfDir, 'staging', id), {recursive: true, force: true}); } catch {} }

  /* ---------- 5. install, only with your approval of these exact changes ---------- */
  install(id) {
    const u = this.update(id); if (!u) throw Error('That update is not on record.');
    if (u.status !== 'ready') throw Error(`That update is ${u.status}, not ready to install.`);
    const a = this.approvals.get(u.approvalId);
    if (!a || a.kind !== 'update' || a.status !== 'approved' || !USER_CHANNELS.includes(a.via) || a.payload?.updateId !== id) throw Error('That update has not been approved by you.');
    const changes = this.changes(id);
    if (this.fingerprint(changes) !== a.payload.fingerprint || u.fingerprint !== a.payload.fingerprint) throw Error('The update changed after you approved it, so I have not installed it.');
    if (changes.some(c => this.isProtected(c.path) || FORBIDDEN.test(c.path) || c.odd)) throw Error('The update touches files it may not.');
    const s = this.state();
    const outdated = why => { const e = Error(why); e.code = 'OUTDATED'; this.patch(id, {status: 'outdated'}); return e; };
    if ((s.current || 'installed') !== u.from) throw outdated(`It was built on ${u.from === 'installed' ? 'the installed version' : `self-update ${u.from}`}, but I have moved on since, so installing it would undo other changes.`);
    if (u.base !== this.boot.base || (u.baseId && u.baseId !== this.baseId())) throw outdated('It was built for a different installed build of JARVIS, so it would undo what that build brought.');
    s.n = (s.n || 0) + 1;
    const vid = `v${s.n}`; const dest = path.join(this.selfDir, 'versions', vid, 'app');
    fs.rmSync(path.dirname(dest), {recursive: true, force: true}); fs.mkdirSync(dest, {recursive: true});
    // the new version is written file by file, from exactly the files checked above: nothing else rides along
    // (file contents only, so a hidden Windows stream never comes with it), and what was written is hashed as written
    const src = this.dir(id); const wrote = {};
    for (const r of this.walk(src)) {
      if (FORBIDDEN.test(r)) continue;
      const st = fs.lstatSync(path.join(src, r)); if (!st.isFile()) continue;
      const buf = fs.readFileSync(path.join(src, r));
      fs.mkdirSync(path.dirname(path.join(dest, r)), {recursive: true}); fs.writeFileSync(path.join(dest, r), buf); wrote[r] = sha(buf);
    }
    const staged = this.readJson(path.join(this.selfDir, 'staging', id, 'manifest.json'), {});
    const written = [...Object.entries(wrote).filter(([r, h]) => staged[r] !== h).map(([r, h]) => ({path: r, status: r in staged ? 'modified' : 'added', hash: h})),
      ...Object.keys(staged).filter(r => !(r in wrote)).map(r => ({path: r, status: 'deleted', hash: ''}))].sort((x, y) => x.path.localeCompare(y.path));
    if (this.fingerprint(written) !== a.payload.fingerprint) { fs.rmSync(path.dirname(dest), {recursive: true, force: true}); throw Error('The update changed while it was being installed, so I stopped.'); }
    // the boot loader checks every file against this list before it starts the version
    const list = JSON.stringify(wrote); fs.writeFileSync(path.join(path.dirname(dest), 'manifest.json'), list);
    s.versions[vid] = {id: vid, n: s.n, updateId: id, title: u.title, base: this.boot.base, baseId: this.baseId(), parent: s.current || null, created: Date.now(), good: false, attempts: 0, approvedVia: a.via, approval: a.id, manifest: sha(list)};
    s.current = vid; s.events = [...(s.events || []), {t: Date.now(), kind: 'installed', text: `${vid}: ${u.title}`}].slice(-40);
    this.writeJson(this.stateFile, s);
    this.patch(id, {status: 'installed', version: vid, installedAt: Date.now()});
    this.dropStaging(id);
    this.log('self-update', `Installed ${vid}: ${u.title} (restart to use it)`);
    return {version: vid, title: u.title};
  }
  /** Go back one version (or to the version you installed). Takes effect on restart. */
  undo() {
    const s = this.state(); const cur = s.current; if (!cur) throw Error('I am already on the version you installed.');
    const v = s.versions[cur]; if (v) v.undone = true;
    s.current = v?.parent || null; s.events = [...(s.events || []), {t: Date.now(), kind: 'undo', text: `Undid ${cur}: ${v?.title || ''}`}].slice(-40);
    this.writeJson(this.stateFile, s);
    if (v?.updateId) this.patch(v.updateId, {status: 'undone', undoneAt: Date.now()});
    return {from: cur, to: s.current, title: v?.title || ''};
  }
  /** Back to exactly the version you installed, ignoring every self-update. */
  reset() { const s = this.state(); s.current = null; s.events = [...(s.events || []), {t: Date.now(), kind: 'reset', text: 'Back to the installed version'}].slice(-40); this.writeJson(this.stateFile, s); return true; }
  /** Tidy the workshop: old drafts go; the running version, the next one, and the six newest versions stay. */
  gc() {
    const s = this.state(); const keep = new Set(); let id = s.current; while (id && s.versions[id] && !keep.has(id)) { keep.add(id); id = s.versions[id].parent; }
    if (this.boot.version) keep.add(this.boot.version);
    Object.values(s.versions).sort((a, b) => (b.created || 0) - (a.created || 0)).slice(0, 6).forEach(v => keep.add(v.id));
    const vdir = path.join(this.selfDir, 'versions');
    for (const d of (fs.existsSync(vdir) ? fs.readdirSync(vdir) : [])) if (!keep.has(d)) { try { fs.rmSync(path.join(vdir, d), {recursive: true, force: true}); } catch {} }
    const sdir = path.join(this.selfDir, 'staging'); const live = new Map(this.updates().map(u => [u.id, u]));
    for (const d of (fs.existsSync(sdir) ? fs.readdirSync(sdir) : [])) {
      const u = live.get(d); const age = Date.now() - (u?.createdAt || 0);
      if (!u || (!['ready', 'drafting'].includes(u.status) && age > 864e5) || age > 14 * 864e5) { try { fs.rmSync(path.join(sdir, d), {recursive: true, force: true}); } catch {} }
    }
  }
}
export {rel};
