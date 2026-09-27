# JARVIS 1.81.1: Suit entry fixes

## What's new

- Iron Man's eyes ignite white-blue with a soft glow, while the reactor charges and sends out a brief cyan energy ring.
- Batman gets a brief bat-symbol projection; Spider-Man gets a web-pattern activation sweep.
- Opening a case plays a soft latch, an airy glass slide and an icy chime, without the old glitchy launch noise.
- Suits turn and move forward gently while keeping their original proportions.
- Larger centre holograms sit on their platforms, and suit close-ups look sharper.

## Fixed

- Running on battery no longer disables glass movement, the close-up transition and suit entry effects.
- The first opening sound works after audio wakes up, including selection through the app's voice/native action path.
- Automatically guessed skeletons no longer stretch arms, fingers or accessories.
- Late-loading suits join the current entry sequence instead of restarting it; calibration no longer overwrites the entry zoom.
- Muted audio starts silently, and opening sounds cancel correctly when interrupted or hidden.

## Install

1. Right-click the JARVIS tray icon → Quit.
2. Unzip JARVIS-1.81.1-update.zip into %LOCALAPPDATA%\Programs\JARVIS Armor Workspace\resources and choose Replace.
3. Start JARVIS.

This drop-in update works over v1.80.1 or v1.81.0. The ZIP includes the three approved halls; the existing suit models and large videos remain in your installation. Do not install the source ZIP: it is the backup for development.

## Undo

Use the tray → RESTART WITHOUT SELF-UPDATES, or reinstall the v1.80.1 zip. The tray option bypasses approved self-updates; reinstall the previous update ZIP to undo this base release. Reinstalling v1.81.0 is also available if you only want to undo this patch.

## Checks

- Syntax: all 85 .js/.mjs/.cjs files in src/ and dist/assets/ passed node --check.
- Core: npm install and npm test passed, 121/121 checks on Windows with local test mail servers and mocked external services.
- Frontend: 67/67 regression checks passed.
- Windows x64 build: npx electron-builder --win dir --x64 passed.
- app.asar is 29,663,625 bytes (29.66 MB), below 30,000,000 bytes. Its version is 1.81.1 and its entry point remains src/main/boot.js.
- All 141 archive files were verified against the build inputs. Existing v1.80.1 archive paths, original vendor libraries and legacy wallpaper are retained.
- The built archive was exercised through the real Windows main process, protected preload and IPC with a fresh test profile and all 21 installed suit models. Every suit passed entry/return, visible lit-eye pixel checks, door travel, close-up zoom, unchanged model-vertex hashes and audio-output checks. Master mute and reduced motion passed. The Batman transition played to completion; Spider-Man's transition played and was skipped successfully.
- The existing Control Deck was observed listening on 127.0.0.1 only. No new production listener, public port or tunnel was added.
- boot.js, preload.cjs, selfupdate.js, approvals.js and the package build section are unchanged from v1.81.0. The package version change to 1.81.1 is deliberate so old self-updates are set aside on the new build.
- Test expectations were deliberately updated for the larger centre displays, sharper close-up pixel limits and removal of guessed skeletons. Async audio tests now wait for audio readiness. Production bugs were fixed; no failing safety tests were bypassed.
- Not tested: subjective loudness on your speakers, physical microphone/voice recognition or hand input, multiple physical monitors, live accounts, the Linux boot/UI suite, or an in-place install and rollback. The installed app and your saved profile were not modified.
- These supplied suit models have no authored skeletons or animation clips. They use rigid, gentle presentation movement; true crouches, arm raises and moving capes need properly rigged replacement models. Existing 1024 × 1024 suit textures and centre-video resolution are unchanged. This patch preserves the approved Batman, Spider-Man and Iron Man hall artwork.

### Update ZIP contents

| File | Size (bytes) |
| --- | ---: |
| app.asar | 29,663,625 |
| windows/listen.ps1 | 17,045 |
| assets/wallpaper/batcave-empty.json | 1,337 |
| assets/wallpaper/batcave-studio.jpg | 678,435 |
| assets/wallpaper/ironman-empty.json | 1,335 |
| assets/wallpaper/ironman-studio.jpg | 658,638 |
| assets/wallpaper/spiderman-empty.json | 1,404 |
| assets/wallpaper/spiderman-studio.jpg | 861,343 |
