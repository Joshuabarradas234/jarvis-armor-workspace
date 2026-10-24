// Runs a test or build command on GitHub and turns each failure into a GitHub annotation, so it shows on the check
// itself (readable from the check-runs API, without opening the log). The command's own output is passed through.
//   node tests/ci-annotate.mjs <command> [args…]
import {spawn} from 'node:child_process';
const [cmd, ...args] = process.argv.slice(2);
const child = spawn(cmd, args, {stdio: ['ignore', 'pipe', 'pipe'], shell: false});
const lines = [], clean = s => s.replace(/\u001b\[[0-9;]*m/g, '');
let buf = '';
const take = chunk => { process.stdout.write(chunk); buf += chunk; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(clean(buf.slice(0, i))); buf = buf.slice(i + 1); } };
child.stdout.on('data', take); child.stderr.on('data', take);
const SKIP = /^(---|duration_ms|type:|failureType:|code:|name:|stack:|at |error: \|-$)/;
child.on('close', code => {
  if (buf) lines.push(clean(buf));
  let shown = 0;
  for (let i = 0; i < lines.length && shown < 40; i++) {
    const l = lines[i];
    const tap = /^\s*not ok \d+ - (.*)$/.exec(l), mark = /^\s*✘\s+(.*)$/.exec(l), spec = /^\s*✖\s+(.*?)(?:\s+\(\d[\d.]*ms\))?$/.exec(l);
    const tool = /^\s*(?:⨯|Error:|error:|fatal error:)\s*(.+)$/.exec(l);   // build tools' errors: electron-builder's ⨯, swiftc's error:
    const name = tap?.[1] || mark?.[1] || spec?.[1] || tool?.[1];
    if (!name || /^(failing tests|tests\b)/.test(name)) continue;
    const block = [];   // TAP's YAML block, or the lines under a ✘
    for (const x of lines.slice(i + 1, i + 40).map(y => y.trim())) { if (x === '...' || /^(not )?ok \d/.test(x) || /^\s*✘/.test(x)) break; block.push(x); }
    const why = tool ? block.slice(0, 4).join(' | ') : block.filter(x => x && !SKIP.test(x) && !/^\S+\.m?js:\d+/.test(x) && !/^(Test|TestContext|process|async)\b.*\(/.test(x)).slice(0, 8).join(' | ');
    console.log(`::error title=${name.replace(/[\r\n:,]/g, ' ').slice(0, 120)}::${(why ? `${name} | ${why}` : name).replace(/[\r\n]/g, ' ').slice(0, 700)}`); shown++;
  }
  process.exit(code ?? 1);
});
