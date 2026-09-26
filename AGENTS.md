# Instructions for AI coding agents (Codex, Claude Code and others)

JARVIS Armor Workspace is a Windows desktop app built on Electron 44. It uses ES modules and has no runtime npm dependencies. The main process has no build step. Read these first:

- `src/brain/ARCHITECTURE.md`: the map of the app, covering processes, folders, IPC, screens and conventions.
- `docs/REVIEW-1.70.md`: what each version fixed, how it was tested, and what is still open.
- `docs/JARVIS-CORE.md`: how JARVIS Core (phone, WhatsApp, approvals, self-updates) works for the user.

## How to work

- Work on a branch and open a pull request. Never push to `main`. The owner reviews every PR before it is merged.
- Keep changes small and focused, one topic per PR. Explain what changed, why, and exactly how you tested it.
- If you could not test something (for example Windows-only code), say so plainly. Do not claim it works.
- Match the surrounding code: compact modern JavaScript, the same naming, and the same comment density. Everything
  the user sees is British English, short and calm, and says what to do next.
- Add a short section to `docs/REVIEW-1.70.md` for anything notable.
- Do not bump the version in `package.json` or `latest.json` unless the owner asks for it.

## Rules that must not be broken

1. **No personal data in the repository.** That means real phone numbers, email addresses, home addresses, names in
   data files, API keys, tokens and passwords. In tests, use `+447700900123` (a UK drama-range number) and
   `@example.com` or `@customer.com` addresses. The owner's details live only in their settings on their PC.
2. **Approvals and self-updates stay safe.** `src/main/boot.js`, `src/main/preload.cjs`, `src/brain/selfupdate.js`,
   `src/brain/approvals.js` and `package.json` are protected. Never weaken any of these:
   - the 4-character approval codes, the wrong-code lockouts, and "a text message (SMS) can never answer a request";
   - `YES ALL` never covering emails or code updates, and code updates never being approved by voice alone;
   - the update validator (no servers, no process or network modules, no references to the approval machinery,
     no imports of Windows streams, full paths, URLs or computed names);
   - the boot loader's check of every file against the manifest written at install.
3. **Nothing listens for connections from the internet.** The only server is the control deck on `127.0.0.1`. Do not
   add tunnels, webhooks that need a public address, or listeners on other interfaces.
4. **Minified bundles.** `dist/assets/index-*.js` and the other hashed files in `dist/assets/` are a prebuilt Vite
   build that is patched by hand:
   - Do not reformat, prettify or re-minify them.
   - Change them only with exact, small string replacements.
   - Inside a long single-line file, use `/* … */` comments, never `//`, because `//` swallows the rest of the line.
   - Prefer adding a new module in `dist/assets/` (like `core.js`, `meeting.js` or `tower.js`) over editing the bundle.
5. **Keep `app.asar` under 30 MB.** Do not add large files to `src/`, `dist/` or `config/`. Big media lives in
   `assets/` (shipped separately) or `dist/vendor/`.
6. **Line endings.** The repository uses `core.autocrlf false`. Do not convert files; some vendor files are CRLF on
   purpose.
7. **Saving files.** Write to a temp file, then rename it. In JARVIS Core, use `writeJson`/`writeText`/`replaceFile`
   from `src/brain/util.js`: Windows can briefly lock a file, and they retry.
8. **Everything that sends, spends money, or changes rules goes through approvals.** That means email, messages,
   settings, agent rules and code (`core.approvals`, or tool level `ask`).

## Testing

Always run these, and report the results in the PR:

```bash
# 1. syntax of every changed script (dist/*.js are ES modules too)
node --check path/to/changed-file.js

# 2. JARVIS Core end-to-end tests: fake Twilio and a scripted Claude, real local IMAP/SMTP servers
cd tests/core && npm install && npm test
```

- Needs Node 22 or newer and `openssl`. The last run passed 121 of 121 tests. Run it more than once if you touch
  timing, saving or polling code.
- Environment variables: `JARVIS_BUILD` (the repo root, found by default) and `JARVIS_TEST_DIR` (the scratch folder).
- A quick voice-parser check:
  `node --input-type=module -e "import {parseCommand} from './src/voice/commands.js'; console.log(parseCommand('jarvis what needs me', {theme:{assistant:'Jarvis'}, themes:[], modules:[]}))"`
- The real-Electron tests (`npm run test:boot` and `npm run test:ui` in `tests/core`) need Linux with Xvfb,
  Playwright, and `npm install` at the repo root (for Electron).
- These cannot run off Windows: the PowerShell helpers in `scripts/windows/` (speech, layout, wallpaper and
  transcription), Windows speech recognition, and window placement across real screens. Leave them unchanged unless
  the task is about them, and say that they were not tested.

## Not for agents

Do not do these; they happen with the owner:

- building the release zip or `app.asar`;
- publishing GitHub releases;
- editing `latest.json`;
- anything involving the owner's accounts (Twilio, Gmail, Anthropic).
