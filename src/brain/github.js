/**
 * JARVIS Core — your approved self-updates on GitHub. PROTECTED: self-updates may never change this file.
 *
 * After you approve a self-update and JARVIS installs it, he uploads the same change to your GitHub repository as a
 * pull request: a proposed change on its own branch. GitHub's Tests run on it, and nothing reaches the main code until
 * you press Merge there; merging raises the version, so Publish update then releases it. JARVIS never writes to main.
 *
 * The key is a GitHub fine-grained token for that one repository (Contents and Pull requests: read and write), stored
 * encrypted with your other JARVIS keys. Only outbound HTTPS to api.github.com is used.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const API = 'https://api.github.com';
const AREAS = /^(src|dist|config)\//;   // what a self-update can change; package.json and the big shared folders never come from a version copy
const MAX_FILES = 40;                   // more than this means the copy does not match GitHub (say, line endings), not one update
export const validRepo = r => /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(String(r || ''));
export const nextVersion = v => { const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(v || '')); if (!m) throw Error(`GitHub's package.json has no usable version (${v}).`); return `${m[1]}.${m[2]}.${Number(m[3]) + 1}`; };
/** The id git gives a file's contents, so a local copy can be compared with GitHub without downloading it. */
export const gitBlobSha = buf => crypto.createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest('hex');
const plain = s => String(s || '').replace(/[\r\n]+/g, ' ').replace(/[&|<>^%"!`]/g, '').trim().slice(0, 90);

export class GitHubSync {
  constructor({store, selfDir, fetchImpl, log}) { Object.assign(this, {store, selfDir, f: fetchImpl || fetch, log: log || (() => {})}); }
  cfg() { return this.store.get().github; }
  ready() { const c = this.cfg(); return !!(c.pullRequests && validRepo(c.repo) && this.store.secret('githubToken')); }
  async api(method, p, body) {
    const token = this.store.secret('githubToken'); if (!token) throw Error('Add your GitHub key in Settings → JARVIS Core → GitHub.');
    const res = await this.f(API + p, {method, signal: AbortSignal.timeout(30000), body: body ? JSON.stringify(body) : undefined,
      headers: {Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'JARVIS-Armor-Workspace', ...(body ? {'Content-Type': 'application/json'} : {})}});
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = Error(`GitHub ${res.status}: ${data.message || res.statusText}`); e.status = res.status; throw e; }
    return data;
  }
  async test() {
    const c = this.cfg(); if (!validRepo(c.repo)) throw Error('Type the repository as owner/name.');
    const r = await this.api('GET', `/repos/${c.repo}`);
    return `Connected to ${r.full_name}. Approved self-updates will be proposed there as pull requests for you to merge.`;
  }
  async commitOf(ref) {   // a branch or tag name → its commit (annotated tags point at a tag object first)
    const r = await this.api('GET', `/repos/${this.cfg().repo}/git/ref/${ref}`);
    return r.object.type === 'tag' ? (await this.api('GET', `/repos/${this.cfg().repo}/git/tags/${r.object.sha}`)).object.sha : r.object.sha;
  }
  async files(commit) {   // every file in a commit: path → blob id
    const c = await this.api('GET', `/repos/${this.cfg().repo}/git/commits/${commit}`);
    const t = await this.api('GET', `/repos/${this.cfg().repo}/git/trees/${c.tree.sha}?recursive=1`);
    if (t.truncated) throw Error('GitHub sent only part of the file list, so I did not upload anything.');
    return {tree: c.tree.sha, map: new Map(t.tree.filter(e => e.type === 'blob').map(e => [e.path, e.sha]))};
  }
  async text(file) { const r = await this.api('GET', `/repos/${this.cfg().repo}/contents/${file}?ref=main`); return Buffer.from(r.content || '', 'base64').toString('utf8'); }
  walk(dir, sub = '', out = []) {
    for (const e of fs.readdirSync(path.join(dir, sub), {withFileTypes: true})) {
      const r = sub ? `${sub}/${e.name}` : e.name;
      if (e.isDirectory()) this.walk(dir, r, out); else if (e.isFile()) out.push(r);
    }
    return out;
  }
  /**
   * Propose installed self-update `vid` (built on release `base`) as a pull request.
   * The change is everything that version differs from the GitHub release it was built on, so earlier approved
   * self-updates that never reached GitHub travel with it. Returns {url, number, version, files} or {skipped, message}.
   */
  async propose({vid, base, title, why = '', deleted = []}) {
    if (!/^v\d{1,6}$/.test(String(vid))) throw Error('That is not a self-update.');
    const repo = this.cfg().repo, dir = path.join(this.selfDir, 'versions', vid, 'app');
    if (!fs.existsSync(path.join(dir, 'src', 'main', 'main.js'))) throw Error('That self-update is no longer on this PC.');
    let release;
    try { release = await this.files(await this.commitOf(`tags/v${base}`)); }
    catch (e) { if (e.status === 404) throw Error(`GitHub has no release v${base}, the version this update was built on. Publish that version first.`); throw e; }
    const mainCommit = await this.commitOf('heads/main'), main = await this.files(mainCommit);
    const changed = [];
    for (const r of this.walk(dir).filter(r => AREAS.test(r))) {
      const buf = fs.readFileSync(path.join(dir, r));
      if (release.map.get(r) !== gitBlobSha(buf)) changed.push({path: r, buf});
    }
    const removed = deleted.filter(p => AREAS.test(p) && release.map.has(p));
    if (!changed.length && !removed.length) return {skipped: true, message: 'This version matches GitHub already; there is nothing to propose.'};
    if (changed.length + removed.length > MAX_FILES) throw Error(`${changed.length + removed.length} files differ from GitHub's v${base}, which is not what one update looks like. Nothing was uploaded.`);
    // never overwrite work that reached main after that release
    const clash = [...changed.map(x => x.path), ...removed].filter(p => (release.map.get(p) || '') !== (main.map.get(p) || ''));
    if (clash.length) throw Error(`GitHub's main code has changed ${clash.slice(0, 3).join(', ')}${clash.length > 3 ? ' and more' : ''} since v${base}. Install the latest release; JARVIS will rebuild this update on it.`);
    // merging this publishes the next version: raise it here, with notes for the release
    const pkgText = await this.text('package.json'), current = JSON.parse(pkgText).version, version = nextVersion(current);
    const latest = JSON.parse(await this.text('latest.json'));
    const name = plain(title) || 'an approved self-update';
    const notes = `## JARVIS ${version}: ${name}\n\n## What changed\n\n- ${name}${why ? `: ${plain(why)}` : ''}\n\nJARVIS suggested this change. You approved it in the app, and it was installed on your PC as self-update ${vid}. JARVIS then proposed it here. Merging it publishes this version.\n\n## Install\n\n1. Download \`JARVIS-Armor-Workspace-${version}-update.zip\` below, right-click it and choose **Extract All…**.\n2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.\n`;
    const entries = [];
    for (const x of changed) { const b = await this.api('POST', `/repos/${repo}/git/blobs`, {content: x.buf.toString('base64'), encoding: 'base64'}); entries.push({path: x.path, mode: '100644', type: 'blob', sha: b.sha}); }
    for (const p of removed) entries.push({path: p, mode: '100644', type: 'blob', sha: null});
    entries.push({path: 'package.json', mode: '100644', type: 'blob', content: pkgText.replace(/"version":\s*"[^"]*"/, `"version": "${version}"`)});
    entries.push({path: 'latest.json', mode: '100644', type: 'blob', content: JSON.stringify({...latest, version, notes: name}, null, 2) + '\n'});
    entries.push({path: `docs/release-notes/${version}.md`, mode: '100644', type: 'blob', content: notes});
    const tree = await this.api('POST', `/repos/${repo}/git/trees`, {base_tree: main.tree, tree: entries});
    const commit = await this.api('POST', `/repos/${repo}/git/commits`, {message: `JARVIS ${version}: ${name}\n\nSelf-update ${vid}, approved by the owner in JARVIS and installed on their PC. Proposed by JARVIS for review.`, tree: tree.sha, parents: [mainCommit]});
    const branch = `jarvis/self-update-${vid}-${Date.now().toString(36)}`;
    await this.api('POST', `/repos/${repo}/git/refs`, {ref: `refs/heads/${branch}`, sha: commit.sha});
    const pr = await this.api('POST', `/repos/${repo}/pulls`, {title: `JARVIS ${version}: ${name}`, head: branch, base: 'main',
      body: `JARVIS suggested this change, and you approved it in the app; it is already installed on your PC as self-update ${vid}.\n\n**Nothing is published until you press Merge.** Wait for the Tests check to show ✅ first. Merging publishes JARVIS ${version} automatically.\n\n${changed.length + removed.length} file${changed.length + removed.length === 1 ? '' : 's'} changed, built on v${base}.`});
    this.log('github', `Proposed self-update ${vid} as pull request #${pr.number}`);
    return {url: pr.html_url, number: pr.number, version, files: changed.length + removed.length, branch};
  }
}
