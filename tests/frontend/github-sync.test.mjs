// Approved self-updates proposed on GitHub as pull requests (against a stand-in GitHub; no real repository is touched).
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import os from 'node:os';
import {GitHubSync,gitBlobSha,nextVersion,validRepo} from '../../src/brain/github.js';
import {PROTECTED} from '../../src/brain/selfupdate.js';

const PKG='{\n  "name": "jarvis-armor-workspace",\n  "version": "1.85.3",\n  "main": "src/main/boot.js"\n}\n';
function fakeGitHub({release,main=release,tagMissing=false}){
  const calls=[],sha=s=>gitBlobSha(Buffer.from(s)),tree=files=>({tree:Object.entries(files).map(([p,c])=>({path:p,type:'blob',sha:sha(c)}))});
  let blobs=0;
  const fetchImpl=async(url,o={})=>{
    const u=new URL(url),p=u.pathname.replace('/repos/owner/jarvis',''),m=o.method||'GET',body=o.body?JSON.parse(o.body):null;calls.push({m,p,body,auth:o.headers?.Authorization});
    const ok=d=>new Response(JSON.stringify(d),{status:200}),no=s=>new Response(JSON.stringify({message:'Not Found'}),{status:s});
    if(m==='GET'&&p==='/git/ref/tags/v1.85.3')return tagMissing?no(404):ok({object:{type:'commit',sha:'tagc'}});
    if(m==='GET'&&p==='/git/ref/heads/main')return ok({object:{type:'commit',sha:'mainc'}});
    if(m==='GET'&&p==='/git/commits/tagc')return ok({tree:{sha:'tagt'}});
    if(m==='GET'&&p==='/git/commits/mainc')return ok({tree:{sha:'maint'}});
    if(m==='GET'&&p==='/git/trees/tagt')return ok(tree(release));
    if(m==='GET'&&p==='/git/trees/maint')return ok(tree(main));
    if(m==='GET'&&p.startsWith('/contents/')){const f=p.slice(10);return ok({content:Buffer.from(main[f]??'').toString('base64')});}
    if(m==='POST'&&p==='/git/blobs')return ok({sha:'blob'+(++blobs)});
    if(m==='POST'&&p==='/git/trees')return ok({sha:'newtree'});
    if(m==='POST'&&p==='/git/commits')return ok({sha:'newcommit'});
    if(m==='POST'&&p==='/git/refs')return ok({ref:body.ref});
    if(m==='POST'&&p==='/pulls')return ok({number:7,html_url:'https://github.com/owner/jarvis/pull/7'});
    return no(500);
  };
  return {calls,fetchImpl};
}
function version(t,files){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'jarvis-gh-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  for(const [p,c] of Object.entries(files)){const f=path.join(dir,'versions','v2','app',p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,c);}
  return dir;
}
const store=(token='github_pat_test')=>({get:()=>({github:{repo:'owner/jarvis',pullRequests:true}}),secret:k=>k==='githubToken'?token:''});
const release={'src/main/main.js':'main','src/a.js':'old a','src/b.js':'b','dist/x.css':'x{}','package.json':PKG,'latest.json':'{\n  "version": "1.85.3",\n  "notes": "old"\n}\n'};
const local={'src/main/main.js':'main','src/a.js':'new a','src/b.js':'b','dist/x.css':'x{}','package.json':'{"name":"trimmed","version":"1.85.3"}'};

test('an approved self-update becomes a pull request with only its change, a raised version and release notes',async t=>{
  const gh=fakeGitHub({release}),sync=new GitHubSync({store:store(),selfDir:version(t,local),fetchImpl:gh.fetchImpl});
  const r=await sync.propose({vid:'v2',base:'1.85.3',title:'Faster suit switching',why:'Tabs reload less'});
  assert.deepEqual({url:r.url,number:r.number,version:r.version,files:r.files},{url:'https://github.com/owner/jarvis/pull/7',number:7,version:'1.85.4',files:1});
  const blobs=gh.calls.filter(c=>c.p==='/git/blobs');assert.equal(blobs.length,1);assert.equal(Buffer.from(blobs[0].body.content,'base64').toString(),'new a');
  const tree=gh.calls.find(c=>c.p==='/git/trees'&&c.m==='POST').body;assert.equal(tree.base_tree,'maint');
  const paths=tree.tree.map(e=>e.path).sort();assert.deepEqual(paths,['docs/release-notes/1.85.4.md','latest.json','package.json','src/a.js']);
  assert.match(tree.tree.find(e=>e.path==='package.json').content,/"version": "1\.85\.4"/);assert.match(tree.tree.find(e=>e.path==='package.json').content,/"main": "src\/main\/boot\.js"/,'the real package.json, not the trimmed copy');
  assert.equal(JSON.parse(tree.tree.find(e=>e.path==='latest.json').content).version,'1.85.4');
  assert.match(tree.tree.find(e=>e.path==='docs/release-notes/1.85.4.md').content,/^## JARVIS 1\.85\.4: Faster suit switching/);
  assert.deepEqual(gh.calls.find(c=>c.p==='/git/commits'&&c.m==='POST').body.parents,['mainc']);
  const ref=gh.calls.find(c=>c.p==='/git/refs').body.ref;assert.match(ref,/^refs\/heads\/jarvis\/self-update-v2-/);
  assert.equal(gh.calls.find(c=>c.p==='/pulls').body.base,'main');
  assert.ok(!gh.calls.some(c=>c.m!=='GET'&&/heads\/main/.test(c.p)),'JARVIS never writes to main');
  assert.ok(gh.calls.every(c=>c.auth==='Bearer github_pat_test'));
});
test('nothing is uploaded when GitHub\'s main code changed the same file since that release',async t=>{
  const gh=fakeGitHub({release,main:{...release,'src/a.js':'someone else changed a'}}),sync=new GitHubSync({store:store(),selfDir:version(t,local),fetchImpl:gh.fetchImpl});
  await assert.rejects(()=>sync.propose({vid:'v2',base:'1.85.3',title:'X'}),/has changed src\/a\.js since v1\.85\.3/);
  assert.ok(!gh.calls.some(c=>c.m==='POST'),'no blobs, commits, branches or pull requests');
});
test('a version that matches GitHub, a missing release and an implausibly large change are refused calmly',async t=>{
  const same=fakeGitHub({release});assert.equal((await new GitHubSync({store:store(),selfDir:version(t,{...local,'src/a.js':'old a'}),fetchImpl:same.fetchImpl}).propose({vid:'v2',base:'1.85.3',title:'X'})).skipped,true);
  const missing=fakeGitHub({release,tagMissing:true});await assert.rejects(()=>new GitHubSync({store:store(),selfDir:version(t,local),fetchImpl:missing.fetchImpl}).propose({vid:'v2',base:'1.85.3',title:'X'}),/no release v1\.85\.3/);
  const many=Object.fromEntries(Array.from({length:45},(_,i)=>['src/gen/f'+i+'.js','x'+i]));const big=fakeGitHub({release});
  await assert.rejects(()=>new GitHubSync({store:store(),selfDir:version(t,{...local,...many}),fetchImpl:big.fetchImpl}).propose({vid:'v2',base:'1.85.3',title:'X'}),/not what one update looks like/);
  assert.ok(!big.calls.some(c=>c.m==='POST'));
  await assert.rejects(()=>new GitHubSync({store:store(),selfDir:version(t,local),fetchImpl:big.fetchImpl}).propose({vid:'../x',base:'1.85.3',title:'X'}),/not a self-update/);
});
test('helpers and safety: blob ids match git, versions step by one, the key stays required, self-updates cannot touch this',()=>{
  assert.equal(gitBlobSha(Buffer.from('hello\n')),'ce013625030ba8dba906f756967f9e9ca394464a');   // git hash-object of "hello\n"
  assert.equal(nextVersion('1.85.3'),'1.85.4');assert.throws(()=>nextVersion('1.85'));
  assert.ok(validRepo('owner/jarvis'));assert.ok(!validRepo('owner/jarvis/../x'));assert.ok(!validRepo('https://github.com/x'));
  assert.equal(new GitHubSync({store:store(''),selfDir:'.'}).ready(),false);assert.equal(new GitHubSync({store:store(),selfDir:'.'}).ready(),true);
  assert.ok(PROTECTED.includes('src/brain/github.js'));
  assert.ok(fs.readFileSync('src/brain/selfupdate.js','utf8').includes('brain-secrets|githubToken|github\\.js|'),'no self-update may name the key or the GitHub module');
});
test('an installed approved self-update is proposed on GitHub straight away, and the screens can open or retry it',()=>{
  const core=fs.readFileSync('src/brain/index.js','utf8');
  assert.ok(/store\.setState\(\{pendingRestart:[^\n]*\n\s*proposeOnGitHub\(r\.version\);/.test(core),'proposed right after the install is recorded');
  assert.ok(core.includes("case 'github-propose':")&&core.includes("case 'github-open':"));
  assert.ok(core.includes('/^https:\\/\\/github\\.com\\//.test(g.url)'),'only github.com pull request links are opened');
  const ui=fs.readFileSync('dist/assets/core.js','utf8');assert.ok(ui.includes('data-test="github"')&&ui.includes('function ghLine(s, v)'));
  assert.ok(ui.indexOf('function ghLine')<ui.lastIndexOf('})();'),'inside the module scope, next to esc()');
});
