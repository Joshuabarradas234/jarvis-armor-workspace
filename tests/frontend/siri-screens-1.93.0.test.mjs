// 1.93.0: "Jarvis" from the tray like Siri, "start recording", choosing the hall's screen, and Teams/Zoom calls seen in their windows.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {parseCommand} from '../../src/voice/commands.js';
const themes = [{id: 'ironman', assistant: 'Jarvis'}, {id: 'batcave', assistant: 'Alfred'}], modules = [{id: 'm5', name: 'Mark 5'}];
const heard = (t, idle, follow) => parseCommand(t, {theme: {assistant: 'Jarvis'}, themes, modules, idle, follow});

test('from the tray: "Jarvis" gets "Yes, sir?", then recording, suits and screens work, with or without the name', () => {
  assert.deepEqual(heard('jarvis', true), {action: 'attention'});
  assert.deepEqual(heard('start recording', true, true), {action: 'meeting-start'});   // right after "Yes, sir?"
  assert.deepEqual(heard('jarvis record this call', true), {action: 'meeting-start'});
  assert.deepEqual(heard('jarvis open mark 5', true), {action: 'select', id: 'm5'});
  assert.deepEqual(heard('jarvis swap screens', true), {action: 'screen-swap'});
  assert.deepEqual(heard('jarvis wake up', true), {action: 'wake', theme: 'ironman'});
  assert.equal(heard('start recording', true, false), null);   // no name and no "Yes, sir?" first: ignored
  assert.equal(heard('jarvis open settings', true), null);   // only the safe few from the tray
  assert.equal(heard('jarvis what time is it', true), null);
});

test('screens: swap, the TV, a numbered screen and back to the laptop, by voice and from the tray', () => {
  assert.deepEqual(heard('jarvis put it on the tv', false), {action: 'screen-tv'});
  assert.deepEqual(heard('jarvis move to screen 3', false), {action: 'screen-to', n: 3});
  assert.deepEqual(heard('jarvis move the hall to screen two', false), {action: 'screen-to', n: 2});
  assert.deepEqual(heard('jarvis back to my laptop', false), {action: 'screen-home'});
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["const patch={mainDisplay:d.id};if(r?.control?.id===d.id&&r?.main)patch.controlDisplay=r.main.id;", "await applySettings({mainDisplay:r.control.id,controlDisplay:r.main.id});",
    "{label:'HALL SCREEN',submenu:[", "{label:'SWAP SCREENS',", "/\\btv\\b|samsung|\\blg\\b|sony|bravia|hisense|tcl|philips|panasonic|toshiba|vizio/i",
    "||(machine?.value?.state==='IDLE'?meetingSuit():null);"]) assert.ok(main.includes(s), s);   // and from the tray, "start recording" files the meeting under your usual suit
});

test('Teams and Zoom calls are also seen by their Leave button, and such a call is not followed by the microphone record', () => {
  const ps = fs.readFileSync('scripts/windows/meeting-state.ps1', 'utf8'); assert.ok(ps.includes("name = $(if ($proc.ProcessName -match 'zoom') { 'Zoom' } else { 'Teams' })"));
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  assert.ok(main.includes("setInterval(()=>uiaCheck().catch(e=>log('calls',e.message)),15000);uiaCheck(true)"));
  assert.ok(main.includes("if(!first&&!(micWatch?.live||[]).some(c=>c.name===r.name))offerCall({app:r.id,name:r.name||'Teams'});"));
  assert.ok(main.includes("if(ok&&!String(c.app).startsWith('desktop:'))micWatch?.follow(c.app);"));
});
