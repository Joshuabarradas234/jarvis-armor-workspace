// 1.102.0: the wallpaper behind your icons on the Mac, each hall's own voice on the Mac, and suits that open with their
// full effects on a small graphics chip (Auto is a lighter Medium there, with the pulse and sparks kept).
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {renderBudget} from '../../dist/assets/render-budget.js';
import {WindowsVoice, macRate} from '../../src/voice/windows.js';

test('the Mac wallpaper: a desktop-level window on every screen, behind the icons, on every Space, letting clicks through', () => {
  const d = fs.readFileSync('src/display/windows.js', 'utf8');
  for (const s of ["}else if(this.settings().wallpaper&&process.platform==='darwin'){", "type:'desktop'", "focusable:false", "w.setIgnoreMouseEvents(true);try{w.setVisibleOnAllWorkspaces(true);}catch{}",
    "await this.load(w,'wallpaper');", "this.wallpaperStatus=this.wallpapers.length?'ACTIVE BEHIND DESKTOP ICONS':'NO SCREEN';"]) assert.ok(d.includes(s), s);
  assert.ok(d.indexOf("process.platform==='darwin'){   // the Mac: a window at the desktop's own level") > d.indexOf("else if(this.settings().wallpaper&&process.platform==='win32'){"));   // Windows keeps its own way
  assert.ok(!fs.readFileSync('src/main/main.js', 'utf8').includes('and the wallpaper behind your icons are Windows-only'));
});

test('each hall speaks with its own Mac voice: Jarvis Daniel, Alfred a slower British voice, Karen Samantha; only voices the Mac has', () => {
  const themes = JSON.parse(fs.readFileSync('config/themes.json', 'utf8')), list = themes.themes || themes, by = id => list.find(h => h.id === id).voice;
  assert.deepEqual(by('ironman').mac, ['Daniel']); assert.deepEqual(by('batcave').mac, ['Oliver', 'Daniel']); assert.deepEqual(by('spiderman').mac, ['Samantha']);
  const v = new WindowsVoice({log: () => {}}); v.macList = new Set(['Daniel', 'Samantha', 'Alex']);   // a Mac on macOS 12 without the downloaded voices
  assert.equal(v.macVoiceFor({voiceName: ''}, by('ironman')), 'Daniel');
  assert.equal(v.macVoiceFor({voiceName: ''}, by('batcave')), 'Daniel');   // Oliver isn't there: Daniel, at Alfred's slower rate
  assert.equal(v.macVoiceFor({voiceName: ''}, by('spiderman')), 'Samantha');
  v.macList = new Set(['Daniel', 'Samantha', 'Oliver']); assert.equal(v.macVoiceFor({voiceName: ''}, by('batcave')), 'Oliver');
  assert.equal(v.macVoiceFor({voiceName: 'Alex'}, by('spiderman')), 'Samantha');   // a chosen voice the Mac lacks is skipped
  v.macList = new Set(['Daniel', 'Samantha', 'Alex']); assert.equal(v.macVoiceFor({voiceName: 'Alex'}, by('spiderman')), 'Alex');   // one you chose wins
  assert.equal(v.macVoiceFor({voiceName: 'Microsoft Zira Desktop'}, by('spiderman')), 'Samantha');   // a Windows voice name means nothing on the Mac
  assert.ok(macRate(by('batcave').rate) < macRate(by('ironman').rate) && macRate(by('spiderman').rate) > macRate(by('ironman').rate));
  assert.ok(fs.readFileSync('src/main/main.js', 'utf8').includes("add('Hall voices',true,"));
});

test('on a small graphics chip, Auto is a lighter Medium that keeps the suit-opening pulse and sparks; battery and your own choice still win', () => {
  const b = renderBudget({quality: 'auto'}, {}, {weak: true});
  assert.equal(b.quality, 'medium'); assert.equal(b.particles, true); assert.equal(b.detail, true); assert.equal(b.dpr, 1);
  assert.equal(renderBudget({quality: 'auto', reduceOnBattery: true}, {onBattery: true}, {weak: true}).quality, 'low');
  assert.equal(renderBudget({quality: 'low'}, {}, {weak: true}).particles, false);
  assert.equal(renderBudget({quality: 'auto'}, {}, {weak: false}).quality, 'high');
});
