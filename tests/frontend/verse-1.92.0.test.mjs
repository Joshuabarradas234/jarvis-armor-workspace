// 1.92.0: a Bible verse in every hall, a small faint label that turns over to show the words.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {VERSE} from '../../dist/assets/verse-card.js';

test('the verse: 1 Corinthians 13:4-8 in the World English Bible (public domain), ending "Love never fails."', () => {
  assert.equal(VERSE.ref, '1 Corinthians 13:4–8'); assert.equal(VERSE.label, '1 Cor 13:4–8'); assert.equal(VERSE.version, 'World English Bible');
  assert.match(VERSE.text, /^Love is patient and is kind\. /); assert.match(VERSE.text, /endures all things\. Love never fails\.$/);
});

test('it shows in the halls only, small and faint until you hover, and a stray key cannot turn it over', () => {
  const ui = fs.readFileSync('dist/assets/verse-card.js', 'utf8');
  assert.ok(ui.includes("if (J && VIEW === 'main')")); assert.ok(ui.includes("const HALL = ['ARMOR_HALL', 'SUIT_HOVER'];")); assert.ok(ui.includes('if (!on) flip(false); el.hidden = !on;'));
  assert.match(ui, /\.vc\{position:fixed;left:22px;bottom:58px;z-index:30;width:126px;height:28px;[^}]*opacity:\.5;/);
  assert.ok(ui.includes('if (!(e.isTrusted && e.detail === 0)) el.blur();'));
  assert.ok(ui.includes("el.type = 'button'"));   // a button, so the hand ring can pinch it too
  assert.ok(fs.readFileSync('dist/index.html', 'utf8').includes('<script type="module" src="./assets/verse-card.js"></script>'));
});
