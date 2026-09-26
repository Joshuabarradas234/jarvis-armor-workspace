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

## Still open
- Nothing known.

## How to test (Linux, as used here)
- Test hooks (JARVIS_TEST_EVAL / JARVIS_TEST_THEME) are inserted into src/main/main.js only for testing and must be removed before building.
- `JARVIS_TEST_SPLIT="1920x1080,1920x1200[,1920x1080]"` fakes a second (and third) screen under one tall Xvfb screen.
- Build: `npx electron-builder --win dir --x64`; app.asar must stay under 30 MB.
