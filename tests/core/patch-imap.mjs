// Apply the pinned test-server fixes portably; refuse an unexpected dependency version.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'node_modules/hoodiecrow-imap');
const fixes = [
  ['lib/commands/handlers/fetch.js', '        if (query.partial.length === 2 && query.partial[1] > value.length) {\n            query.partial.pop();\n        }', '        /* test patch: do not mutate the shared query (hoodiecrow bug: later messages came back empty) */'],
  ['lib/plugins/x-gm-ext-1.js', 'module.exports = function(server) {', 'module.exports = function(server) {\n    server.registerCapability("X-GM-EXT-1"); /* test patch: real Gmail advertises this */'],
];
for (const [relative, before, after] of fixes) {
  const file = path.join(root, relative), text = fs.readFileSync(file, 'utf8'), nl = text.includes('\r\n') ? '\r\n' : '\n';
  const from = before.replaceAll('\n', nl), to = after.replaceAll('\n', nl);
  if (text.includes(to)) continue;
  if (!text.includes(from)) throw Error('Unexpected hoodiecrow source: ' + relative);
  fs.writeFileSync(file + '.tmp', text.replace(from, to)); fs.renameSync(file + '.tmp', file);
}
console.log('Hoodiecrow test fixes applied.');
