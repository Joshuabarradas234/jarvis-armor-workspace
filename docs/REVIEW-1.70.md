# JARVIS Armor Workspace: review notes (version 1.70.0)

A full review of the app was done by three reviewers (main process; hands and voice; 3D and screens).
This file lists what was fixed in 1.70.0 and what is still open, so the next pass can start from here.

## Fixed in 1.70.0
- Second screen never appeared if first-time setup ran with the keyboard on (saved "single screen"). Wizard fixed; a one-time migration clears it.
- Screens switched on while JARVIS starts were missed; display listeners now attach before the first build, and a build re-runs if screens changed during it.
- Leaving a suit deleted its saved tabs 1.2 s later (session timer fired during closeAll).
- Waking another hall by voice left the old hall's voice grammar loaded.
- Custom hall transition media reverted after two restarts (customised flag dropped on load).
- Focus mode restart leaked the old timer; "run" voice error path referenced an undefined `S`.
- Throwing a page to a full screen (12 pages) lost it; now refused before moving.
- Renderer crash left tabs/panels running invisibly; now closed first.
- Agent output: every line wrote missions.json synchronously; saves grouped (500 ms, atomic tmp+rename), screen updates throttled (250 ms).
- Tower "has finished" announced again on approve/feedback.
- Hands: camera leak when toggled while starting; worker restarted before model loaded; lower-screen ring stuck after stopping; swipes firing during a lower-screen pinch; clicks after a two-hand zoom; zoom-out mistaken for prayer hands (stand down); flick-down on a single screen; calibration box near the camera edge ignored; Ideas room opening after being closed; voice meter scale; ambience ducking after hall switch.
- Voice: modern-engine fallback left two recognisers running (double to-dos); "hello Jarvis" now greets.
- 3D: tower/floor tags rebuilt every frame so clicks were lost (now updated in place); desk-cam timer outlived its modal; suits' GPU memory leaked on hall switch; hall-switch race showed old suits; canvases resized every frame at 125%/150% scaling; second/third-screen scenes didn't release their WebGL context; muted cave sound kept running; floor folder stack made new GPU buffers on every update; map loaded twice on a fast first zoom.

## Second pass (released as 1.70.1)
Every item from the old "Still open" list is fixed:
- Settings load key by key (`sanitizeSettings` in schema.js): one bad value is dropped and logged, not a full reset (which also re-ran first-time setup).
- Backup restore checks the file, keeps rescue copies, writes atomically and reloads settings, suits, calendar, to-dos and ideas live, with no restart. The backup now includes calendar, to-dos and ideas.
- The Ideas-room Claude panel moves into a main window rebuilt after a crash.
- globe/floor3d capped at ~30 fps, and all three 3D views re-read devicePixelRatio. Desks, globe arcs and tower rings are disposed.
- `.selection-caption` duplicate removed; `.dk-empty` markup removed.
- Idle chatter starts and stops with the microphone setting.

Also found and fixed:
- tower3d rebuilt (and leaked) every floor ring on every update during a run: the store sorts floors high-to-low, the view low-to-high.
- Switching straight from one suit to another, or changing hall while in a suit, didn't save the old suit's tabs or last-visit time (`leaveSuit()`). Quitting inside a suit now saves its tabs too.
- The open suit jumped back to its Launchpad whenever a `theme` broadcast arrived (saving a suit, creating a folder).
- "Create in Documents" failed for a suit in a hall that isn't active.
- Aborted hall transitions kept playing their sounds and leaked a WebGL context. A slow wallpaper from the previous hall could replace the new one.
- The tower/floor 3D views could be left running if the tower closed while they loaded. Deck backdrop and living-scene hall-switch races fixed.
- A hand drag on the floor view always opened a desk cam (synthetic events carry no movementX).
- Voice, speech, voice check and wallpaper PowerShell calls now pass `-ExecutionPolicy Bypass`, as the layout call already did. They failed on machines with the default Restricted policy.
- Tower: two quick starts could both run on one floor. API calls with a stop signal had no timeout. The "post" approval matched any platform containing an "x". A failed `taskkill` could crash the app.
- Control deck page edits now update the hall's progress indicator. Oversized requests are cut off.
- Small ones: second-instance launch during startup; the 15→19.2 s startup migration re-applied every launch; the focus ring reset after ±5; quick-panel typing wiped every 60 s; folder listing race; duplicate holo panels; map lookups now queued (one a second); the PWR stat could hide for good.

## 1.70.2
The three items left open after 1.70.1:
- Hall-only timers (`__pullBoard`, quick-panel refresh, `__lockPlatesToHall`) run in the main window only. The Skip-button poll runs in main and console, where transitions play. The plate loop checks every 200 ms instead of every frame outside ARMOR_HALL/SUIT_HOVER.
- The main window now listens to `layout-result`. Errors always show, and voice "arrange my screens" / "launch everything" (sent with `manual:true`) report what was placed and what wasn't open. The routine tidy-up when a suit opens stays quiet. The console's "Launch links & apps" now broadcasts `launch-result`, so failures show on the suit page.
- "close this page" / "close the page" / "close the tab" are a new `page-close` action: inside a suit with tabs it closes the tab in front (with the hall's tab-close line); otherwise it closes the floating panel. "close tab" / "close this tab" stay tab-only.

## 1.71.0: meeting mode
- The hall bar gets a meeting button (`dist/assets/meeting.js`). Voice: "start a meeting for <suit>", "end the meeting" (`meeting-start` / `meeting-end`). A red REC bar with an End button shows in every state while recording.
- The main window records the microphone plus system audio (legacy `chromeMediaSource: 'desktop'` loopback, so any call app works). The permission handler allows audio only while a meeting exists. `meeting-worklet.js` makes 16 kHz chunks cut at pauses (15–30 s). `src/meeting/manager.js` queues them to `scripts/windows/transcribe.ps1` (System.Speech dictation from WAV) during the meeting.
- Files: `<suit folder>/Meetings/<date time>/`, or `Documents/JARVIS Meetings/<hall>/<suit>/<date time>/` when the suit has no folder. Contents: `recording.webm` and `transcript.md`. History is kept in `meetings.json`.
- On end: Claude summary via the tower key (`plannerModel`), then email through Gmail SMTP (`src/meeting/mailer.js`, app password stored with safeStorage in `gmail-app-password.enc`). Settings key `meeting: {to, from}`.
- Tested on Windows: transcribe.ps1 on a synthesized WAV; the manager end to end (chunk offset, transcript, clean-up, history); the Gmail TLS/EHLO/AUTH flow with fake credentials (clear refusal message). Not yet tested: live capture inside Electron, and a real send.

## 1.72.0: ideas that get worked on
- Ideas carry a `target`: `{kind:'app'}`, `{kind:'suit',theme,id,name}` or null. They also carry an `assist` record, which only the main process writes (`IdeaStore.setAssist`). The editor has a "What is it for?" picker: this hall's suits including the centre bay, or the JARVIS app.
- `src/ideas/assistant.js`, `think` → **waiting**: Claude (tower key, else Claude Code) returns a JSON plan. Suit plans pick a tower floor. `approve`:
  - suit → `towerRunner.start(..., {ideaId})` → **working**; `towerFinished` (hooked in `towerUpdate`) → **done**/**failed**.
  - app → `git worktree add` on a `jarvis/idea-*` branch under `<userData>/idea-builds`. Claude Code (fenced to Read/Edit, no shell) builds it, JARVIS commits, and every changed .js is checked with `node --check`, with one repair pass if needed. Added lines that look like phone numbers, keys or personal emails are flagged → **review**. A second approve merges (`--no-ff`) into the source repo; discard removes the worktree and branch. Nothing is pushed or installed automatically.
  - unlinked → the plan is appended to the notes.
- Night shift: between 1 and 5 am, once a night, up to 3 ideas untouched for 3+ days get drafted plans. They wait for approval, and the morning briefing lists them. Setting: `ideas: {sourceRepo, nightly}`, found automatically at the app root or `Desktop/JARVIS-source-1.70.0`.
- UI (`hands-ideas.js`): card tags and status pills, the JARVIS section in the editor (Get JARVIS on it / Approve / Change it / Not now / View the changes / Merge / Discard), a ⚙ setup panel, and a badge on the lightbulb for pending approvals. Broadcast channel `ideas`.
- Tested: 17 end-to-end checks with stand-in engines against a real temp git repo (plain, suit, app merge, app discard, syntax repair, privacy flag, guard rails); the UI rendered in a browser harness (cards, new-idea picker, approval, review, setup).

## 1.72.1: live check in the running app
Checked in a copy of the installed app with a copied profile, driven over the DevTools protocol (screenshots of each window, the state set from code):
- **3D suits vanished for good after opening any suit.** suits3d checked `.workstation:not(.hidden)`, but the suit page is hidden through `.module-host`/`.module-content`, so the 3D layer switched itself off. Every case then fell back to the painted hall: case 4 (Mark V, which has no painted suit) looked empty. Now it checks `.module-host:not(.hidden) .workstation`.
- The centre hologram stands in front of a case in each hall (Mark V, Absolute Batman, Ghost-Spider). While a suit behind it is hovered or shown, the hologram fades (`.hall-overlay.sx-see-through`).
- A "show me" fly-in whose timer never ran stayed zoomed, even across a hall switch. It now resets when the hall changes or when nothing is being shown.
- One Skip press skipped only the lead-in clip of a hall switch; it now ends the whole sequence (`__skipAll` in transition-*.js).
- The hall bar showed on top of hall-switch videos; it is hidden while `.hall-transition` exists.
- The footer and the control deck printed the state name "ARMOR HALL" in every hall; they now show the hall's name.
- The note bar's × button overflowed its box (general button padding).
- The deck fetched `<hall>.json` living scenes that only exist for the Batcave (404s); `deck-backdrop` now says whether a scene exists.
- From the user's real jarvis.log: `TabManager.list` threw on a tab whose page had been destroyed (23 crashes, and tab switching failed). Tabs and panels now drop dead pages (`prune`). The control deck server wrote headers twice on late errors (7 crashes) and computed the board after starting its reply; both fixed.
- Also confirmed from that log: 1.70.0's speech and wallpaper scripts are blocked by the PC's PowerShell policy ("not digitally signed"), which 1.70.1's `-ExecutionPolicy Bypass` fixes.
- Every case in all three halls holds the right suit, and each plate matches its suit.
- User settings to tidy (not code): the Batcave centre bay is named "BATMOBLIE BAY"; a suit's Screens list starts an app called "cluade", which fails to open. There is no Claude API key and no Claude Code on this PC yet, so the tower runs in rehearsal mode and idea plans and meeting summaries can't run.

## 1.72.2
- Meeting summaries fall back to Claude Code (`claude -p`, sonnet, 2 turns, cwd = the meeting folder, fence file in userData) when no tower API key is set. Tested with a sample transcript: about 8 s, all four sections.
- `engines.js` runs Claude Code from `~/.local/bin/claude.exe` when that exists: the native installer does not always add it to PATH.
- Meeting panel: typed email fields survive redraws and closing the panel (`this.draft`); `meeting-state` reports `hasPassword` separately from `gmailReady`.
- The live wallpaper cannot show on this PC (Windows 11 25H2): its icon view paints the wallpaper itself, so a window placed under the icons (between SHELLDLL_DefView and the WorkerW inside Progman, layered, as other wallpaper apps do) stays hidden. The attempt was reverted, and the status stays UNAVAILABLE.

## Still open
- Live wallpaper on Windows 11 24H2+ desktops where the icon view paints the wallpaper: needs a different technique (a resident helper that owns a layered holder window).
- Approvals by phone or WhatsApp come with the other chat's work: hook them into `IdeaAssistant.notify`.
- Installing an approved and merged app change needs the self-update system (also from the other chat).
- Offline dictation is rough on real call audio. A Whisper-compatible engine could be added as an option later.
- On speakers (no headphones), the mic also picks up the call, so some lines may appear twice in the transcript.

## How to test (Linux, as used here)
- Test hooks (JARVIS_TEST_EVAL / JARVIS_TEST_THEME) are inserted into src/main/main.js only for testing and must be removed before building.
- `JARVIS_TEST_SPLIT="1920x1080,1920x1200[,1920x1080]"` fakes a second (and third) screen under one tall Xvfb screen.
- Build: `npx electron-builder --win dir --x64`; app.asar must stay under 30 MB.
