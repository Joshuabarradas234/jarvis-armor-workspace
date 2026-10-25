// 1.104.0: the second screen's buttons do their job there: Earth opens the earth on the deck itself, Arrange brings every
// open tab and page down from the top screen and tiles them, and the check-up shows how much memory JARVIS uses.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';

test('Earth on the deck opens the earth on the deck; voice and the hall still open it on the main screen', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  assert.ok(main.includes("case 'deck-earth':{broadcast('globe',{cmd:'earth',on:role==='console'?'console':'main'});return true;}"));
  const globe = fs.readFileSync('dist/assets/globe.js', 'utf8');
  assert.ok(globe.includes("if (!m || (m.on || 'main') !== VIEW) return;") && globe.includes("if (J && (VIEW === 'main' || VIEW === 'console')) {"));
  assert.ok(fs.readFileSync('dist/assets/deck.js', 'utf8').includes('title="Show the earth on this screen"'));
  const css = fs.readFileSync('dist/assets/index-ChQi7yvo.css', 'utf8');
  const z = cls => Number(new RegExp('(?:^|})\\s*\\.' + cls + '\\{[^}]*z-index:(\\d+)', 'm').exec(css)?.[1]);   // the rule itself, not one nested under another selector
  assert.ok(z('gx') > z('dk'), `the earth sits above the deck (${z('gx')} over ${z('dk')})`);
  // the globe's own commands: only the screen named handles them
  const handles = (m, view) => !(!m || (m.on || 'main') !== view);
  assert.equal(handles({cmd: 'earth', on: 'console'}, 'console'), true); assert.equal(handles({cmd: 'earth', on: 'console'}, 'main'), false);
  assert.equal(handles({cmd: 'earth'}, 'main'), true); assert.equal(handles({cmd: 'place', q: 'Leeds'}, 'console'), false);
});

test('Arrange on the deck gathers the top screen\'s pages and tabs (up to 12) and tiles them; Send all up sends them back', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  for (const s of ["case 'deck-gather':{if(role!=='console')return 0;return gatherToDeck();}", "for(const p of panels.list()){if(deckPanels.list().length>=12)break;try{if(throwPanelDown(p.id))n++;}",
    "for(const t of tabs.list().filter(t=>!t.popped)){if(deckPanels.list().length>=12)break;const r=tabs.release(t.id);if(!r)continue;const pid=deckPanels.adopt(r);broadcast('deck',{type:'adopted',id:pid,url:r.url,title:r.title});n++;}",
    "case 'deck-send-all-up':"]) assert.ok(main.includes(s), s);
  const deck = fs.readFileSync('dist/assets/deck.js', 'utf8');
  assert.ok(deck.includes("const n = await call('deck-gather')") && deck.includes("this.note('No tabs or pages are open to arrange.')") && deck.includes('title="Bring your open tabs and pages here, tidied into a grid"'));
});

test('the check-up shows how much memory JARVIS uses, and what to do when it is tight', () => {
  const main = fs.readFileSync('src/main/main.js', 'utf8');
  assert.ok(main.includes("app.getAppMetrics().reduce((a,m)=>a+(m.memory?.workingSetSize||0),0)*1024") && main.includes("add('Memory',used<total*.35,"));
});
