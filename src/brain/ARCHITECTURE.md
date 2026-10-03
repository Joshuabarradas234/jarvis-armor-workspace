# JARVIS Armor Workspace — map for programmers (and for JARVIS improving himself)

An Electron app (Electron 44, Node 22+, ES modules, **no npm dependencies at runtime, no build step**).
It runs on Joshua's ASUS Zenbook Duo (two screens: the top one shows the hall, the lower one "the deck";
an optional third screen shows "the vista"). Three halls, each with its own assistant:
`ironman` (JARVIS, the Armor Hall), `batcave` (ALFRED), `spiderman` (KAREN, the Web Lab).

## Processes and files

### Main process — `src/`
- `src/main/boot.js` — PROTECTED boot loader. Picks which approved self-update to run; rolls back bad ones.
- `src/main/main.js` — the heart. Windows, tray, hotkeys, the `jarvis://` protocol, voice commands (`dispatch()`,
  `talk()`), briefings, the tower, and the IPC switch `api(event, method, payload)` that every screen calls through
  `window.jarvis.call(method, payload)`. `broadcast(channel, data)` pushes to every screen (channels must be listed in
  `src/main/preload.cjs`, which is PROTECTED — reuse an existing channel such as `core` or `status`).
  `say(text)` speaks through the PC. `log(kind, message)` writes to `jarvis.log`.
- `src/main/panels.js`, `src/main/tabs.js` — web pages shown inside the hall (floating panels, suit tabs).
- `src/main/wake-timer.js` — the Windows task "JARVIS wake-up" that wakes the PC two minutes before the next call,
  message or report (JARVIS Core moves it; `--jarvis-wake` only nudges the running clock).
- `src/display/` — which window goes on which screen (`roles.js`, `windows.js`).
- `src/state/machine.js` — the hall state machine: IDLE → WAKE → HELMET_OPENING → ARMOR_HALL → SUIT_HOVER →
  SUIT_SELECTED → MODULE (a suit is open) → RETURNING / SHUTDOWN.
- `src/voice/commands.js` — `parseCommand(text, context)` turns heard speech into `{action, …}`; `buildGrammar()` lists
  phrases for the Windows recogniser. `src/voice/windows.js` runs `scripts/windows/listen.ps1` / `speak.ps1`
  (installed in `resources/windows`, not editable by self-updates).
- `src/workstations/store.js` — suits (bays) per hall: name, links, apps, folder, layout, session.
- `src/settings/` — `schema.js` validates `settings.json` (strict: unknown keys are refused); `store.js` saves it.
- `src/services/` — calendar, to-dos, ideas (local JSON), weather and the optional OpenAI-style chat.
- `src/control/` — the control deck web server and per-bay agents (missions).
- `src/tower/` — the agent tower: floors of AI agents (`store.js`, `orchestrator.js`, `engines.js`: Claude API and
  Claude Code). A run that stopped, failed or hit its budget can be continued in its own folder,
  keeping finished steps. Claude Code agents may write only in their run folder; knowledge files are read-only.
- `src/brain/` — **JARVIS Core**: the part that works on its own.
  - `index.js` `createJarvisCore(deps)`: the scheduler (every 20 s), reports, phone, approvals, chat, voice actions.
  - `orders.js`: `Documents\JARVIS\Standing orders.md` (Remember and its call rules, schedule, watch list, rules, business facts).
  - `dates.js`: bills, birthdays and other dates, reminded on WhatsApp a few days ahead and on the day (`dates.json`).
  - `llm.js` (Claude API + tool loop), `tools.js` (what JARVIS can do; levels read/auto/user/ask).
  - `phone.js` (Twilio WhatsApp/SMS/calls, CallMeBot) and `calls.js` (one-way calls). Everything phone-related is
    outbound from this computer: JARVIS polls Twilio for your WhatsApp replies. Nothing listens for connections
    from the internet — keep it that way.
  - `maildesk.js` + `email.js` (Gmail over IMAP/SMTP: sort, label, draft), `numbers.js` (watched numbers),
    `audit.js` (Optimize), `improve.js` + `coder.js` (self-review and building changes).
  - `approvals.js` and `selfupdate.js` are PROTECTED.

### Screens — `dist/` (plain browser ES modules, loaded from `jarvis://app/`)
- `dist/index.html` loads the main bundle `assets/index-*.js` (minified Vite build: the hall, settings window, setup
  wizard — **avoid editing it**) and add-on modules: `hands-ideas.js` (hand tracking, Ideas room), `ideas-planner.js` (brainstorms and project plans), `tower.js`
  (the tower screen), `globe.js`, `deck.js` (second screen), `suits3d.js` (3D suits), `core.js` (JARVIS Core panel
  and its Settings tab). Add new features as new modules like these.
- Each page is opened with `?view=main|console|settings|setup|wallpaper|vista`; add-ons check
  `new URLSearchParams(location.search).get('view')` and only run where they belong.
- Talk to the main process: `await window.jarvis.call('method', payload)`; listen: `window.jarvis.on('channel', fn)`.
- Buttons in the hall's top-right icon row: append a `<button class="qp-ico">` to `.qp-icons` (see `tower.js`).
- Styling: append rules to `dist/assets/index-*.css` or inject a `<style>` from your module. Colours: accent
  `#7fd6e8` (Armor Hall), `#f5c542` (Batcave), `#ff4d4d` (Web Lab); `document.body.dataset.theme` is the hall.
- The Content-Security-Policy in `dist/index.html` allows only local scripts; keep it.

### Data (in the user-data folder, `app.getPath('userData')`: `%APPDATA%\jarvis-armor-workspace`, named after package.json)
`settings.json`, `workstations.json`, `tower.json`, `brain.json`, `approvals.json`, `jarvis.log`, and `self\` (updates).
Documents: `Documents\JARVIS\` (standing orders, notes, reports), `Documents\JARVIS Tower\` (agents' work).

## Conventions
- Compact, modern JavaScript; small helper arrows; no classes unless there is state to hold.
- Everything the user sees is British English, short, calm ("sir").
- Errors thrown to the screens are plain sentences that say what to do next.
- New IPC: add a `case 'your-method':` to the `api()` switch in `src/main/main.js`; validate every payload field.
- Anything that sends, spends or changes rules must go through approvals (`core.approvals` / tools with level `ask`).

## Work desk (1.83.0)

`brain/work-desk.js` owns reviewed proposal drafts, branding, cited file answers and accepted Tower trophies. `services/file-library.js` limits local searches and validates source paths; `document-text.js` extracts text in bounded worker threads, with external PDF.js assets. `brain/photo-drop.js` verifies incoming owner media, files originals locally and optionally reads photos with a reserved daily allowance. `brain/personalities.js` selects conversational tone by hall. The Work desk renderer is reachable from Core and the feature guide; its stores are `work-desk.json` and `photo-drop.json`. Generated files live under Documents/JARVIS/Work desk and Photo inbox; keep these folders in your own document backup. Settings backups include the indexes, not these generated files or photos.
