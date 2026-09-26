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

## Still open (lower priority)
- Backup restore writes raw JSON without validating or reloading the stores; SettingsStore resets everything if one key is invalid (validate key by key instead).
- The Ideas-room Claude panel (`claudeView`) is not re-added to a recreated main window after a renderer crash.
- globe.js and floor3d.js render uncapped (120 fps on a 120 Hz screen) and fix the pixel ratio at creation; cap at ~30 fps and re-read devicePixelRatio.
- floor3d `buildTeam` drops desk CanvasTextures without disposing; globe arc material and tower3d rings not disposed.
- CSS: `.selection-caption` bottom set twice; `.dk-empty` is hidden by request, so its markup in deck.js could be removed.
- Idle chatter only starts at launch or on hall change; not when voice is turned on in Settings.

## How to test (Linux, as used here)
- Test hooks (JARVIS_TEST_EVAL / JARVIS_TEST_THEME) are inserted into src/main/main.js only for testing and must be removed before building.
- `JARVIS_TEST_SPLIT="1920x1080,1920x1200[,1920x1080]"` fakes a second (and third) screen under one tall Xvfb screen.
- Build: `npx electron-builder --win dir --x64`; app.asar must stay under 30 MB.
