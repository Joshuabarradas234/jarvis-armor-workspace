# JARVIS Armor Workspace: review notes (versions 1.70.0 to 1.80.1)

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

## 1.80.1: JARVIS Core merged, reviewed and hardened
JARVIS Core 1.80.0 was built in a separate chat on top of 1.70.0. It is merged here on top of 1.72.2, so meeting mode, the Ideas room work and every 1.70.1–1.72.2 fix are kept. It adds `src/brain/*` (phone, WhatsApp, approvals, schedule, email desk, audit, self-updates), `src/main/boot.js` (package.json `main`) and `dist/assets/core.js`. Setup: `docs/JARVIS-CORE.md`.

The merge:
- main.js keeps both startups (IdeaAssistant with its nightly timer, and createJarvisCore), and both shutdowns (meetings, missions, tower, `core.dispose()`).
- index.html loads both meeting.js and core.js. preload allows `meeting`, `ideas` and `core`. The voice TALK list has page-close and the core phrases.
- engines.js keeps the Claude Code path lookup (`CLAUDE`, now exported) and the fenced Claude Code calls.
- The owner's phone number was built into store.js, orders.js, the docs and the tests. It is gone: the number is typed in Settings → JARVIS Core and stays on the PC. Nothing is sent to a phone until it is set.

A security review found these, now fixed:
- **Boot never re-checked an installed self-update.** install() now writes file contents only, hashes each file as written, and refuses if what was written differs from what was approved. It stores `versions/vN/manifest.json` with that manifest's hash in state.json. boot.js starts a version only when every file matches, with nothing extra or missing. It accepts version names of the form `v<number>` only (no `../`).
- **The update checker was a count-based deny list.** Any added line that looks like a server or tunnel is refused, whether or not lines were removed. More forms are caught: createSecureServer, `new X.Server(`, `['listen']`, more tunnel tools. Also refused in any script:
  - process and network modules, `eval` and `new Function`, and changes to window security;
  - naming the approvals or self-update machinery;
  - imports of Windows streams (`./util.js:x.js`, which folder listings cannot see), full paths, URLs, `data:`, or computed names.
- **Approval codes were 2 characters.** They are now 4 (letter digit letter digit), and old waiting requests get new codes. Wrong codes pause approvals by message for 30 minutes (5 in 10 minutes) or for a day (10 in a day), and a message stops being read once it trips the pause. `YES ALL` takes only the latest message's code, and never covers emails or code updates. Codes are masked in the activity log.
- **Text messages.** SMS can no longer answer a request at all (not even NO). `sms`, `call`, `link` and `chat` are removed from the approval channels in approvals.js and selfupdate.js.
- **Voice.** "Approve <n>" for a code update opens its changes on screen instead of approving.
- **Other fixes:**
  - The coder refuses Claude Code when it cannot be isolated (`--strict-mcp-config`, `--setting-sources`), and finds it off PATH.
  - Watched numbers read public pages only.
  - IMAP label names are stripped of control characters.
  - A `PLAIN:` secrets file is read only in tests.

A bug review found these, now fixed:
- **Phone:**
  - A failed message check moved the watermark, so later messages were lost. It now only moves after a clean check.
  - Commands sent more than 15 minutes before JARVIS saw them (call me, goodnight, undo, quiet, wake-up times, features, audit) are not carried out late; he says so instead.
  - "+44 (0)7…" became an invalid number.
  - `ready()` now needs your number.
  - A WhatsApp message not yet seen as delivered no longer counts as proof that the route works.
  - WhatsApp "call me" now replies when calls are not set up.
- **Email:**
  - A bad HTML entity (`&#x110000;`) stopped every later check.
  - More than 40 new emails skipped the older ones; they are now taken oldest first.
  - A FETCH line without a UID gave NaN.
  - Commands after a dropped connection now fail at once instead of waiting 45 s.
  - A failed login left its socket open.
  - SMTP had no close handler.
  - An email that cannot be read is skipped, not fatal.
- **Voice:**
  - Undo, restart to update, call me, the audit, self-review, features and "message me" need the name, even right after JARVIS speaks.
  - "approve/deny <n>" and "ring me at" are added to the dictation lead-ins, so Windows speech can actually hear them.
- **Saving on Windows:** antivirus or indexing can hold a file for a moment, so the save-by-rename is refused (EPERM). It happened in 2 of 4,000 writes on this PC. In JARVIS Core that aborted handling a WhatsApp message that was already marked read, so the message was lost. It showed up as flaky tests; the log said "Checking your messages: EPERM … rename". JARVIS Core's saves (util.js, approvals.js, selfupdate.js, store.js secrets, boot.js) now retry the rename for up to about a second. With the retry, 8,000 writes gave 0 failures. The older stores (calendar, to-dos, ideas, tower, missions, settings) still rename once; they report an error instead of losing data silently.
- **Other:**
  - A self-update was rolled back whenever Core failed to start (markGood waited for `core`).
  - Keep-awake was never released when switched off.
  - The report buttons sent a new report instead of the one selected.
  - A BOM broke local number files.
  - "alert below $100" lost its threshold.
  - A call still running at 6 minutes counted as missed.

Tested:
- `tests/core/core.test.mjs` on Windows: 121 passed, six runs in a row after the save fix (before it, 2 of 7 runs dropped a message), and once against the files taken out of the release zip. It now imports through `pathToFileURL`, and the Windows stream case is checked as "never copied, and loading it is refused".
- The build started in a copy of the installed app with a copied profile: it runs as 1.80.1 through boot.js, and the hall bar has the meeting, JARVIS Core and Ideas buttons side by side.
- `boot.test.mjs` (Linux/Xvfb) gained a tampered-version case and a made-up-name case, but was not run here.

## Still open
- Live wallpaper on Windows 11 24H2+ desktops where the icon view paints the wallpaper: needs a different technique (a resident helper that owns a layered holder window).
- Idea approvals (`IdeaAssistant.notify`) still go to the screen only. They could use JARVIS Core's WhatsApp digest and codes.
- A merged app idea is not installed by itself. It could be handed to the self-update checks as a staged update.
- Calls are one-way (JARVIS speaks, you answer on WhatsApp). Two-way calls need either an opening from the internet to this PC, or the call logic running on Twilio's side.
- Voice notes and pictures sent on WhatsApp are not read yet.
- Offline dictation is rough on real call audio. A Whisper-compatible engine could be added as an option later.
- On speakers (no headphones), the mic also picks up the call, so some lines may appear twice in the transcript.

## How to test (Linux, as used here)
- Test hooks (JARVIS_TEST_EVAL / JARVIS_TEST_THEME) are inserted into src/main/main.js only for testing and must be removed before building.
- `JARVIS_TEST_SPLIT="1920x1080,1920x1200[,1920x1080]"` fakes a second (and third) screen under one tall Xvfb screen.
- Build: `npx electron-builder --win dir --x64`; app.asar must stay under 30 MB.

## Unreleased: hall artwork and graphics reliability (26 September 2026)

- Replaced the three default hall backdrops with Higgsfield-generated 2592 × 1536 images. Each has seven empty display pods, including a wider Hulkbuster pod and wider Absolute Batman pod. The existing interactive GLB suits remain live. The old wallpaper assets remain available.
- Calibrated all 21 pod bounds, labels, click targets and centre displays to the new artwork. Contain scaling keeps the end pods on-screen at different aspect ratios. Restrained labels use saved workspace names and preserve live progress indicators; generic default names now match their models.
- Fixed the transparent hotspot layer intercepting clicks on name plates. Removed idle background breathing that misaligned the picture and suits; added reduced-motion handling and clearer keyboard focus.
- Prevented late image/GLTF/IPC completions from restoring an old hall after a switch. Released late GLTF results, shared mesh resources and environment render targets; fully tear down the suit WebGL renderer on page exit. Stabilised its backing-buffer resolution during zoom.
- Deck and vista keep the last good image on failure, discard stale scene loads, release their resources, and support plural boat/plane configurations. Living scenes pause their time while hidden and respect reduced motion.
- Made Core test paths and its existing IMAP dependency patch portable on Windows. No production approval or update code changed.

Validation: Core tests passed 121/121 twice on Windows (Node 24, real local IMAP/SMTP, mocked external services). The frontend suite passed 27/27: request ordering, failure/retry, shared resource cleanup, stale GLTF disposal, safe labels, saved names/links and geometry at five viewport sizes. Every changed JavaScript module passed node --check. In-app browser review used the real renderer, all 21 installed GLB assets and centre videos with a mock IPC bridge: checked all three halls, theme switching, mouse and keyboard selection, and 1280 × 720 / 1440 × 900 layouts.

Not tested: packaged Electron boot/UI suite (Linux/Xvfb required), live voice/hand tracking, PowerShell helpers, real multi-monitor placement, or a release build/app.asar size. The existing installed app and user profile were not modified. Review and build these files through the normal source release process; this is not a self-update payload.

## Unreleased: visible suit entry and revised halls (26 September 2026)

- Regenerated the three backgrounds with the built-in image generator. Kept the approved Batman and Spider-Man designs and redid Iron Man as a brighter red/gold Stark workshop. Recalibrated all pod interiors to the final native dimensions; see HALL-ARTWORK.md and HALL-PROMPTS.md.
- Added two visible glass doors to every pod, with opening, pivoting and return motion, frame reflections and fading latches. Render the active bay last so adjacent scenes cannot erase its open glass, and retain door dimensions while the suit moves.
- Fitted 44 eye-light surfaces to the 21 actual models, including both pairs on Spider-Ham. Baked curved geometry avoids flat patches cutting through lenses; depth testing and pivot parenting preserve alignment. Added the offline bake script.
- Added distinct restrained whole-model stances, a scan, floor pulse and case light response. The supplied meshes have no rig or clips, so articulated limb poses are not claimed. Retained existing state durations and respected still/reduced-motion settings.
- Removed the selection flash that obscured the entry. Constrained end-pod zooms to the artwork bounds to prevent blank areas beside the room.

Validation: 41/41 frontend tests; Core 121/121 twice on Windows with local fake services. Browser checks used the real renderer, actual GLBs and the actual selection/return state machine behind mocked IPC. Checked glass/eye activation, normal three-second entry into the workstation, return, keyboard selection and the three hall layouts. All changed scripts passed syntax checks. Packaged Electron boot/UI, Windows voice/hands and physical multi-monitor checks remain unverified; the installed app/profile and protected files remain unchanged.

## Unreleased: approved Batcave and themed labels (26 September 2026)

- Locked the owner's approved black-bat cave design as the Batcave default. Recalibrated seven model openings, click targets, name plates and the low vehicle platform. The approved Iron Man design is unchanged.
- Refreshed labels across all three halls: arc-reactor crests and red/gold metal for Iron Man, angular black/amber bat plates for Batman, and crimson/blue spider plates for the Web Lab. Live names, keyboard access and progress remain supported. Isolated the label markup from legacy glyph sizing that otherwise clipped names.
- Fixed selection immediately after a hall switch: if the GLB arrives after the selection snapshot, the renderer now applies the fitted-eye suppression and calibrated zoom when it becomes ready. This prevents the legacy eye overlay appearing on a suit's cheeks.

Validation: frontend 41/41, changed JavaScript syntax checks, and browser inspection of all three label families and the new Batman alignment. Reproduced and rechecked keyboard selection immediately after a hall switch; the legacy overlay is hidden and the calibrated zoom is applied. Core 121/121 passed twice earlier for this cumulative patch. Packaged-app, voice/hands and physical multi-monitor checks remain unverified.

## Unreleased: final Web Lab and interface detail pass (26 September 2026)

- Locked the newly approved directly authored Spider-Man lab. Recalibrated all seven pod openings, labels, click targets and the lower centre display; the seventh opening accommodates Iron Spider's accessories. Iron Man and Batman retain their approved artwork.
- Corrected native name plates being shrunk and offset by the legacy SVG fitter. All three label families now stay centred at their calibrated anchors and use consistent, readable text. Repositioned the three centre displays and their labels below the suits.
- Added shared SVG settings, power, close and deck glyphs; retained button handlers and accessible names. Refined toolbar borders, focus outlines, floating-page headers, utility controls and responsive panel styles.
- Added ambient-video lifecycle handling: pause while hidden, in still/reduced-motion mode, during entry/workstation states or behind full-screen Core, Tower, Ideas or Earth panels; resume when eligible. The policy has three regression tests and cleans up observers/listeners on exit.

Validation: frontend 44/44; Core 121/121 twice on Windows after these changes (local IMAP/SMTP, mocked external services); syntax checked for every changed script. Browser review used actual local GLBs and centre videos with mocked IPC: final three halls, readable labels, wide-pod entry/eyes/glass, workstation return, still video pause, Core/Ideas media pause, calendar/to-do, meeting, Tower, deck and Workstations/General/Graphics settings layouts. The preview fixture was extended to supply the Workstations payload; no settings were saved. No browser errors in the inspected hall/entry flows. Geometry tests cover five viewport shapes.

Not verified: packaged Electron boot/UI, real accounts, Windows voice/hands, PowerShell helpers, physical multi-monitor placement or release app.asar size. Existing GLBs are unrigged, so activation remains whole-model movement rather than articulated poses. Centre holograms retain the supplied videos; their source resolution has not been increased. Protected files, versions, the installed application and user profile remain unchanged.

## Unreleased: calibrated suit showcase (26 September 2026)

Widened the Iron Man end chambers, made Batcave openings taller, increased uniform suit fill and fitted the centre projections. Added the on-screen calibration editor with validated atomic local persistence and trusted-window IPC, including pod/label/hologram placement, eye-pair alignment, pose strength, preview, undo and reset.

Introduced a shared graphics budget for suits, tower/floor/deck scenes and ambient media; sharper bounded close-ups and anisotropic texture sampling. Added volume-controlled mechanical entry/return cues with cancellation and lifecycle cleanup. Added approximate runtime display rigs for 20 static models, head/chest-attached lights and optional authored signature-clip playback. Spider-Ham stays static. The Web Lab has a native 2430 × 1440 render; the two generated halls remain 1630 × 965. Original suit textures remain 1024 × 1024.

Validation: 56 frontend checks, Core 121/121 twice on Windows, changed-script syntax checks, actual-model geometry audit and isolated browser review. Exact feature limits and packaged-app checks are documented in SHOWCASE-CALIBRATION.md. No installed-app/profile, protected-file, version, account or release changes.

## Release 1.81.0 packaging

Packaged the cumulative suit showcase as version 1.81.0 with the unchanged build configuration and protected source files. Restored the original vendor libraries and legacy wallpaper files omitted from the source-only handoff. All 84 requested syntax checks, 121 Core checks and 56 frontend checks pass. The Windows x64 app.asar is 29660232 bytes. See RELEASE-1.81.0.md for the exact package contents, install/undo steps, verified local-only Control Deck binding and testing limits.

## Release 1.81.1: suit entry fixes

Restored entry on battery and audio readiness, removed guessed skinning and overlapping launch noise, strengthened Iron Man eye/reactor power-up, added brief Batman/Web Lab projections, and enlarged centre displays. Validated all 21 real models in the Windows package with unchanged vertices, visible eye pixels, glass movement, audio, reduced motion and mute. Core 121/121, frontend 67/67 and 85 syntax checks pass. app.asar is 29663625 bytes. Protected source files, build configuration and the loopback Control Deck are unchanged. See RELEASE-1.81.1.md for installation, exact ZIP contents and remaining limits.

## Release 1.81.2: Batmobile hologram and live suit progress

Connected the supplied Batmobile GLB to a rotating, uniformly scaled centre hologram and restored clear progress on every active suit. Fresh runs reset old progress, final unterminated output is retained, and status updates survive hall changes. Verified the built Windows app with all 21 suit progress cards, real local Control Deck agents, vehicle rotation, pause/resume, theme re-entry and the loopback-only listener. Core 121/121 twice, frontend 72/72 and 87 syntax checks pass. app.asar is 29676475 bytes. Protected files and build configuration are unchanged. See RELEASE-1.81.2.md for exact ZIP contents and limits.

## Release 1.81.3 preview: cold glass pressure release

Added a brief procedural mist burst to the lower seals on all suit cases. It shares the entry clock and renderer, clears within 1.24 seconds, scales with graphics quality and disables with reduced motion. Core 121/121 twice, frontend 75/75 and 88 runtime syntax checks passed. Offline Windows x64 build passed; app.asar is 29679367 bytes. The existing renderer test fixture now loads the mist module. Native visual checks and GitHub publication were blocked by the current permissions; this remains a local preview. Protected files, networking and build configuration are unchanged. See RELEASE-1.81.3.md for installation, ZIP contents and validation limits.

## Release 1.82.0 review build: useful work and clearer controls

Review gates now fail closed, retry once and block handoff; structured briefs pause on critical gaps. Only owner-accepted real results become examples and earn XP. Added retained-history usefulness metrics, approved workflow reuse, local bounded Think suggestions, a searchable feature guide and explicit screen/gesture tab moves. Removed the calibration toolbar icon, retaining calibration in the guide, and included the unpublished cold-mist effect. Core 121/121 twice, frontend 90/90, 93 runtime syntax checks and Windows x64 packaging passed. Native UI and GPU validation could not complete: isolated Electron crashed during GPU initialisation and its process was closed; Browser policy blocked the local preview file. Physical gestures, monitors and live AI remain untested. Protected files, Control Deck networking and build configuration are unchanged. See RELEASE-1.82.0.md for details.

## Unreleased: full-body cold mist reveal (28 September 2026)

Replaced the faint ankle-height wisps with a dense full-body pressure burst that fills the case and clears by 2.25 seconds. Low/battery mode retains the same coverage with four layers; medium/high use six/eight. Cloud depth no longer lets projecting armour hide the release. Returning, still/reduced motion and late model loads retain their existing timing rules.

Validation: 93 runtime syntax checks, frontend 91/91, Core 121/121, and browser-rendered checks with all 21 actual models in low/high modes. Confirmed upper/body/foot coverage, clearing and cancellation, then inspected the reveal frames. The older tests were deliberately updated for the requested longer, full-height burst. Installation is deferred: Windows denied inspection of the approved self-updates shown by the owner, so their exact changes and activation could not be verified or safely incorporated. No installed files, protected source files, version, build settings or production listeners changed. See COLD-MIST-REVEAL.md.

## Release 1.82.1: full-body cold mist reveal

Packaged the stronger mist as a complete local drop-in update with the earlier 1.82.0 features. Version/latest.json deliberately raised to 1.82.1; main, build configuration, protected files and networking are unchanged. Checks: 93 runtime syntax checks, frontend 91/91, Core 121/121 and browser checks on all 21 actual suits. Windows x64 packaging and byte verification passed; app.asar is 29715757 bytes. The exact JARVIS self-update code remains unreadable despite permission grants, so it has not been merged. The installed app is unchanged; installation and publication remain deferred. See RELEASE-1.82.1.md for archive contents and limitations.

## Release 1.82.2: rolling mist and pressure-release sound

Refined the full-body cloud with moving turbulence, varied edges, shaded billows and less opaque overlap. Added a short filtered-air release as the seals open; it tapers with falling pressure and follows both volume controls. Return, mute, hidden windows and teardown cancel it. Core 121/121, frontend 91/91, 93 syntax checks, real Web Audio rendering and all 21 real suit preview checks passed. Windows x64 package verified; app.asar 29716500 bytes. No protected file, build configuration or production networking changes. The source-count tests now expect the deliberate extra pressure cue. The approved 1.82.1 update was installed earlier in the session; 1.82.2 installation is recorded separately. See RELEASE-1.82.2.md.

## Release 1.82.3: hand gesture guide and screen moves

Added a persistent gesture reference reachable before starting the camera, with timings, scopes and a three-step tab move guide. Fixed lower-screen routing cancelling a grabbed suit tab, Escape causing a later click, stale display lookup cancelling a newer grab and silent failed moves. The destination hint is at the top of JARVIS. Core 121/121, frontend 96/96 and 94 runtime syntax checks passed. Browser guide navigation and page hide/restore were checked with mock displays and no camera. Physical webcam and multi-monitor use remain unverified. Windows x64 build verified; app.asar 29725721 bytes. Protected files, build settings and network code are unchanged. The pending 1.82.2 mist and sound are included; this package is not yet installed. See RELEASE-1.82.3.md.

## Release 1.83.0: Work desk and everyday routines

Added reviewed proposals/quotes, sourced document answers, hall personalities, owner-accepted trophy displays and opt-in photo filing, alongside the attention shelf, tab briefs, screen snapping, meeting follow-ups, travel and scheduled routines. Core 121/121 and frontend 154/154 passed, with all 113 runtime scripts syntax checked. Real PDF extraction, a packaged document worker and isolated browser flows were checked. PDF printing remains unverified after an isolated Electron renderer failure; current HTML exports are preserved on failure. Live providers, physical devices and the full installed-app regression remain unverified. Protected files and build settings are unchanged. See RELEASE-1.83.0.md for the final archive size, contents and checks.

## Release 1.84.0: smoother work and meeting follow-through

Added the Work menu, browser shortcuts, Product Studio and transcript-backed meeting tasks, proposals and ideas. Internal agent work can be approved together or enabled for automatic starts. Source quotes, complete briefs, estimated allowances, text-only agent access and duplicate guards protect the handoff. Core 121/121, frontend 182/182 and 122 syntax checks passed. See RELEASE-1.84.0.md for setup, limitations, complete checks and archive contents.

## Release 1.85.0: automatic task skills

Finished reviewed Tower work now saves a durable recipe automatically. Owner acceptance enables reuse by default; an explicit setting allows reuse after agent review. Matching stays within the same hall and floor, with bounded prompts, rejection exclusions, usage provenance and a searchable Skills tab. The library survives run-history trimming and uses the existing settings backup. Core 121/121, frontend 190/190 and 124 syntax checks passed; browser controls tested with example data. Protected files and Control Deck are unchanged. See RELEASE-1.85.0.md and AUTOMATIC-TASK-SKILLS.md.

## Release 1.85.1: fixes from the 1.85.0 review

Fixed the dead ends and weak links found in the 1.85.0 review (docs: the review file on the owner's Desktop):
- Meeting emails: a send that never reached the server returns to draft; an interrupted one asks the owner to confirm against Sent mail.
- Meeting tasks: a refused or interrupted handoff returns its reservation and can be retried or dismissed; floor daily budgets are checked before reserving; finished runs settle to their actual cost; stopped runs can be retried under a new source key.
- Skills: matching uses the owner's words (template wording stripped), rare words weigh more, outcome-based ranking, automatic pause after repeated returns, and a per-floor with/without tally kept beyond the 80-run history.
- Cut-off answers: callApi reports max_tokens and continues pause_turn; a cut-off review is treated as CHANGES.
- Budgets: an empty brief budget means the floor's cap (was 5 cents); meeting reservations leave the run cost when a call fails; resumed meeting runs keep their limits.
- Backup restore reloads stores in place; Electron's default menu is removed and Ctrl+R / F5 reload the active tab.
- Removed the unused non-SIMD MediaPipe build (6.2 MB) from dist/vendor/hands.
- Tests: 203 frontend (13 new) and 121 core, on Windows.

## Release 1.85.2: quieter start-up

Suit hotkeys register Ctrl+Alt+1..7 only (Win+1..7 belong to the Windows taskbar). The live wallpaper stops retrying after "WorkerW not found": a window closed because attaching failed no longer counts as a screen change, and the attempt is skipped until the wallpaper setting is switched off and on. These replace JARVIS self-update proposals #7 and #8, which were staged on an older base and would have removed the tower-skills IPC cases.

## Release 1.85.3: modern speech engine

listen.ps1 called `$recognizer.Constraints.Add(...)`, which Windows PowerShell 5.1 cannot resolve on the WinRT IVector (seen as a bare `__ComObject`), so the modern engine always failed and the legacy engine took over (227 log entries). `Add-Constraint` now tries the direct call, then invokes `ICollection[ISpeechRecognitionConstraint].Add` by reflection. Verified on the owner's PC: `-Diagnose` reports compile Success, and a live run reports MICROPHONE LISTENING on the modern engine. Both GitHub workflows stay at the owner's choice: **Tests** checks every change, and **Publish update** publishes a release automatically when the version on main goes up, but only after the tests pass. scripts/release/build-update.mjs stays because Codex builds its update zips with it.

## Release 1.86.0: approved self-updates proposed on GitHub

`src/brain/github.js` (protected) compares the installed version folder with the GitHub release it was built on, using git blob ids, so nothing needs downloading. It uploads only the files that differ in src/, dist/ and config/, raises the patch version in package.json and latest.json, adds release notes, and opens a pull request from a `jarvis/self-update-*` branch. It never writes to main. It refuses if main changed the same files since that release, if more than 40 files differ, or if the release tag is missing. The fine-grained token lives in brain-secrets and is named in GUARDED, so no self-update can reference it. Triggered right after an approved self-update installs, and retryable from My updates. Tests: 5 new, against a stand-in GitHub.

## Release 1.87.0: resumable Tower runs, holding budgets, fenced agents

- **Resume:** `TowerRunner.continue(runId, {budget})` (API `tower-continue`, a button on the run) carries on a stopped, failed or budget run in its own folder. Done steps are read back from their files and kept; the rest are queued again; planning moved into `plan()` so a run with steps skips it. Step instructions are now saved in the run summary. The lead plans again if the team changed. Refused for meeting work (use its Retry), rehearsals, a moved folder, or when the tightest cap (floor per run, what is left of the day, task budget minus earlier floors) has no room. `dayBase` makes an older run's new spend count against today.
- **Budgets:** each API or Claude Code call holds an estimate (`r.held`); a call waits while others are in flight if the run could not cover them all, so parallel steps no longer overshoot together. Claude Code gets `--max-budget-usd` with what is left (probed via `claude --help`). An answer that took the run past its cap is kept; the next call stops. A brief budget now covers the whole assembly line (`chainSpent`), and the lobby router's cost counts in the run it starts.
- **Fence:** Tower agents may write only in their run folder (`Edit(./runs/<run>/**)`, glob characters replaced by `?`), with `Edit(./knowledge/**)` denied, using a per-call settings file removed afterwards. The lobby router gets no tools. Verified with Claude Code 2.1.283 on Windows: a write into a run folder named with spaces, brackets and braces worked; writes to `knowledge/` and to another run were refused.
- **Approvals:** `meeting_work_start` and `product_render` are high risk with readable details (their screen-built approvals already were); `files_search` is guarded after outside text; approval details keep 20,000 characters and `email_send` refuses over 15,000, so a whole email is visible; WhatsApp "details" says where to read the rest.
- **Small fixes:** settings.json and workstations.json keep a `.bak` and quarantine a damaged file (`readJsonKeep`/`writeJsonKeep` in brain/util.js); a failing backup notifies once per backup day; backups pruned to 30 and self-release exports to 5; "N minutes from now" is relative and travel clock times use the trip zone; tower cards on the Attention shelf can be cleared until the run changes; meeting work makes room at 100 by dropping the oldest settled meeting; Product Studio backs off to 2-minute checks and gives up after a day.
- Not changed: the voice hall switch (it only happens from idle, where the fuller `setTheme` would open the hall twice).
- Tests: 225 frontend (14 new in `fixes-1.87.0.test.mjs`, 1 updated for the saved instructions) and 121 core twice, on Windows.

## Release 1.88.0: brainstorm and plan projects, wake for calls

- **Planner** (`src/ideas/planner.js`, screen `dist/assets/ideas-planner.js`, opened from the Ideas room): `brainstorm` returns up to 3 questions and 6 cleaned project ideas (last 10 sessions in `ideas-brainstorms.json`; "go again" passes earlier titles and the owner's answers). `adopt` turns one into a card. `plan` stores `idea.project` (phases, steps with who/time/cost, risks, needs, totals, this week, questions); a rewrite keeps ticked steps and how-tos by title. `howTo` explains a step once (cached; "again" asks anew). `step` ticks a step, and progress follows the plan (stage moves to building). `toTodos` copies steps with a per-step source, so there are no duplicates. IdeaStore keeps `project` (main process only, `setProject`). `IdeaAssistant.ask` takes `maxTokens`, records cost through `spent` (Core's spend ledger), and its Claude Code fallback now has a no-tools fence.
- **Wake timer** (`src/main/wake-timer.js`): one task, "JARVIS wake-up", in the user's account. It is created from XML (UTF-16) with `WakeToRun`, an interactive token, battery allowed and a 5-minute limit, and runs the JARVIS exe with `--jarvis-wake`. Core's clock moves it to 2 minutes before the next `upcoming()` entry more than 3 minutes away, retries a failure after 30 minutes, and clears it when Core is off or `wakePc` is false. `second-instance` with `--jarvis-wake` calls `core.woke()`, which holds the power blocker for 6 minutes and ticks at once, without opening the hall; a cold start with the flag stays in the tray. `powerMonitor` resume also calls `woke()`. The task is removed on quit (`clearNow`). Settings show the next wake time and the power plan's "Allow wake timers" (read with powercfg, never changed).
- Verified on the owner's PC (Windows 11): the task was created for 2030, read back with WakeToRun true, the right time, command and argument, moved, and deleted. Allow wake timers reads as on when plugged in and off on battery.
- Tests: 232 frontend (7 new in `ideas-wake-1.88.0.test.mjs`) and 121 core twice, on Windows.

## Release 1.89.0: memory, bills and birthdays, tell me when done, plan night shift, project wall

- **Memory:** a `Remember` section in the standing orders (heading matched before "About me"; older files gain it on the first `addLine`). The whole file was already in the brain's prompt; a rule now says what the section is for. Tools `remember` and `forget` (level user, kind orders) and `removeLine(match, why, section)`. `parseCallRule` reads "No calls before HH:MM on <days>", "No calls after HH:MM" and "Never call me on <days>". `core.callBlock()` applies them to scheduled report calls (`ringReport` with a job and no alarm), approval calls, `call_me` when the owner did not ask, and Tower notifications. Alarms you set and calls you ask for are never blocked. A blocked call becomes a WhatsApp.
- **Bills and birthdays** (`src/brain/dates.js`, `dates.json`, now in the backup): monthly, yearly or once; month ends and 29 February clamp to the last day. `due()` sends once inside the days-ahead window (even if JARVIS was off on the exact day) and once on the day, as one WhatsApp from 09:00 outside quiet hours; it marks the reminders sent before sending. Tools `date_add` and `date_remove` (auto) and `dates_list`; a Remember tab in JARVIS Core shows both lists.
- **Tell me when done:** `run.notify` (message or call) is set from the task form, `tower-tell` on a live run, `tower_run {tell}` or `tower_tell_me`. It is carried through hand-offs, and main calls `core.towerTell` on the final status of the last floor. A call becomes a WhatsApp in quiet hours (queued for the morning) or under a call rule. Stopped runs say nothing. `towerAnnounced` forgets a run that goes live again, so continued runs are announced.
- **Plan night shift** (`IdeaPlanner.queueNight` / `nightShift` / `runFinished`): steps marked jarvis or agents go to a chosen floor of the idea's hall. `planStep` links the run; the brief is filled from the plan, so `briefGaps` is empty. Steps start between 01:00 and 05:00, one per free floor. `upcoming()` feeds Core's wake timer for 01:00. The result shows on the step as ready or failed with the reason, and an assembly line follows its hand-off.
- **Project wall:** `ideas-planner.js` draws up to five projects in progress (newest first) as SVG rings round the Ideas core, coloured by stage. The arc shows progress and animates when it changes; the labels open the plan or the idea.
- **Fix:** `parseDays` now reads plural and short day names ("Saturdays", "tues", "thurs"), so a Saturdays-only schedule line no longer runs every day ("thus" is not read as Thursday).
- Tests: 242 frontend (10 new in `remember-1.89.0.test.mjs`) and 121 core twice, on Windows. The core run sent 49 messages, not 48; 1.88.0 sends the same at this time of day.

## Release 1.89.1: smooth start-up, transitions and halls

- **Video decoding:** on the owner's PC (Intel Arc 140T, D3D11VideoDecoder) the H.264 transition, welcome and ring videos decoded at about 4 frames a second, while VP9 webm and audio ran at full speed. Measured in the test copy with Chromium's media log: about 1 second of playback per 5. With `--disable-accelerated-video-decode` (FFmpegVideoDecoder) the same files play in real time: a full 43-second Spider-Man transition took 43 seconds, and the welcome video reached 15.4 seconds at 16 seconds. main.js appends the switch before ready unless `JARVIS_HW_VIDEO=1`.
- **Ranges:** `net.fetch(file://)` honoured `Range` but answered 200 without Content-Range. `src/main/ranges.js` answers single ranges itself (206, Content-Range, Content-Length, type by extension, 416 when out of range). Other requests still go through net.fetch.
- **Hall background:** `ImageHall.setTheme` applied the new wallpaper only when `this.theme === t`. `hall-calibration.js` replaces `hall.theme` with a clone on its 500 ms sync after the modules change, so a wallpaper that loaded after that sync was dropped: Spider-Man suits stayed in front of the Batcave background. The onload/onerror check now compares the wallpaper URL with the current theme's (an exact edit in `hall-fZdHx-gJ.js`). Checked in the test copy: Batcave, Iron Man and Spider-Man in quick succession, and a switch from idle, all end on the right background.
- **One greeting at start-up:** welcome.mp3 and voice/ironman-ready.wav carry the same JARVIS line (checked with Windows dictation), and "System starting up." was spoken by Windows TTS over the recording. When a start-up sound is enabled, WAKE now only shows the caption, and the HELMET_OPENING → ARMOR_HALL step skips `sayReady` (the next ready greeting uses the short pack clip, as before). Logged in the test copy: only welcome.mp3 plays and no speech process starts while the app opens.
- Tests: 247 frontend (5 new in `fixes-1.89.1.test.mjs`) and 121 core, on Windows. Smoke run in the test copy: the opening, three hall switches, the Ideas room and planner, Core tabs and the Tower, with no page errors.
