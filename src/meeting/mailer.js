import tls from 'node:tls';
import crypto from 'node:crypto';

/**
 * Just enough SMTP to send one email through Gmail (smtp.gmail.com:465, TLS from the start),
 * signed in with a Google "app password". No extra packages ship with the app for this.
 */
const b64 = s => Buffer.from(s, 'utf8').toString('base64');
const wrap = s => s.replace(/.{1,76}/g, '$&\r\n');
const header = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;   // non-ASCII subjects and names
export const validEmail = s => typeof s === 'string' && s.length <= 254 && /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[a-z]{2,}$/i.test(s);

function message({from, to, subject, text, attachments = []}) {
  const boundary = 'jarvis-' + crypto.randomBytes(12).toString('hex');
  const lines = [
    `From: JARVIS <${from}>`, `To: <${to}>`, `Subject: ${header(subject)}`, `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@jarvis.local>`, 'MIME-Version: 1.0', `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
    `--${boundary}`, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', wrap(b64(text)).trimEnd(),
  ];
  for (const a of attachments) {
    lines.push(`--${boundary}`, `Content-Type: ${a.type || 'application/octet-stream'}; name="${a.name}"`, 'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${a.name}"`, '', wrap(Buffer.from(a.content).toString('base64')).trimEnd());
  }
  lines.push(`--${boundary}--`, '');
  return lines.join('\r\n');
}

/** Send one email. Resolves when Gmail has accepted it; rejects with a readable reason otherwise. */
export function sendGmail({user, password, to, subject, text, attachments}) {
  return new Promise((resolve, reject) => {
    const sock = tls.connect({host: 'smtp.gmail.com', port: 465, servername: 'smtp.gmail.com'});
    let buf = '', step = 0, settled = false;
    const finish = err => { if (settled) return; settled = true; clearTimeout(timer); try { sock.end(); } catch {} err ? reject(err) : resolve(true); };
    const timer = setTimeout(() => { finish(Error('Gmail did not answer in time.')); sock.destroy(); }, 45000);
    const send = line => sock.write(line + '\r\n');
    const data = message({from: user, to, subject, text, attachments}).replace(/^\./gm, '..');   // dot-stuffing
    // each reply moves the conversation on: greeting -> EHLO -> AUTH -> MAIL -> RCPT -> DATA -> body -> QUIT
    const steps = [
      [220, () => send('EHLO jarvis.local')],
      [250, () => send('AUTH PLAIN ' + Buffer.from(`\0${user}\0${password}`, 'utf8').toString('base64'))],
      [235, () => send(`MAIL FROM:<${user}>`)],
      [250, () => send(`RCPT TO:<${to}>`)],
      [250, () => send('DATA')],
      [354, () => sock.write(data + '\r\n.\r\n')],
      [250, () => { send('QUIT'); finish(); }],
    ];
    sock.setEncoding('utf8');
    sock.on('data', chunk => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^\d{3}-/.test(line)) continue;                 // a multi-line reply: wait for its last line
        const code = Number(line.slice(0, 3));
        const [want, next] = steps[step] || [];
        if (!want) return;
        if (code !== want) {
          const why = code === 535 ? 'Gmail refused the sign-in. Check the Gmail address and the 16-letter app password.' : `Gmail said: ${line.slice(0, 200)}`;
          finish(Error(why)); return;
        }
        step++; next();
      }
    });
    sock.on('error', e => finish(Error('Could not reach Gmail: ' + e.message)));
    sock.on('close', () => finish(step >= steps.length ? null : Error('Gmail closed the connection early.')));
  });
}
