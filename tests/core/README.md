# JARVIS Core tests

Development only. These files are never packaged into the app, because electron-builder ships only `src/`, `dist/`, `config/` and `package.json`.

| Test | What it checks | How to run |
|---|---|---|
| `core.test.mjs` | End to end: approvals and codes, WhatsApp replies, calls, alarms, reports, email (real IMAP/SMTP test servers), the audit, self-updates (stage → validate → approve → install → undo) and quiet hours. It uses a scripted Claude and a fake Twilio from `mocks.mjs`. | `npm install && npm test`. Needs `openssl` on the PATH; the certificate for the local mail servers is made on first run. |
| `boot.test.mjs` | The protected boot loader in real Electron: an approved update runs; a broken one rolls itself back; safe mode. | `npm run test:boot`. Needs Linux with `Xvfb` and Playwright. |
| `electron.test.mjs` | Drives the real app (virtual screen, SwiftShader) and takes screenshots of JARVIS Core and its Settings tab. | `npm run test:ui`. Needs `xvfb-run` and Playwright. |

## Environment variables

- `JARVIS_BUILD` is the repo root. By default it is two folders up from these tests.
- `JARVIS_TEST_DIR` is the scratch folder for test output. By default it is `<tmp>/jarvis-core-test`.
- `PLAYWRIGHT_MODULE` is where to import Playwright from, if it is installed globally.

## Hoodiecrow patch

`hoodiecrow.patch` fixes two things in the IMAP test server; `npm install` applies it:

- **A partial-FETCH bug.** Later messages in a FETCH came back empty.
- **The missing X-GM-EXT-1 capability.** Real Gmail advertises it.
