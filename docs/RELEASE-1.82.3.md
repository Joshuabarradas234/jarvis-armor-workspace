# JARVIS 1.82.3: Hand gesture guide and screen moves

## What's new

- Open Hand settings beside HANDS → Hand gesture guide for an illustrated reference that stays open.
- The guide explains each signal, its timing and where it works; Hand settings is available while the camera is off.
- Follow three clear steps to move a suit tab: pinch its title, move towards a screen, then release when the destination appears.
- The guide shows connected screens and offers a mouse screen picker; opening it never starts the camera.
- Includes the 1.82.2 rolling cold mist and pressure-release sound, plus all earlier halls, suits, holograms and work-management features.

## Fixed

- Moving a grabbed suit tab below the main screen no longer cancels the transfer when the hand enters the lower Control Deck area.
- Cancelling a grab with Escape no longer allows the later finger release to click the tab accidentally.
- A delayed failure from an earlier grab no longer cancels a newer grab.
- A tab that closes before a move now gives an error instead of appearing to move successfully.
- The destination hint appears at the top of JARVIS, away from the native page area.
- Opening the hand guide from the feature catalogue restores and hides the web page in order, so the page does not cover the guide.

## Install

1. Right-click the JARVIS tray icon → Quit.
2. Unzip JARVIS-1.82.3-update.zip into %LOCALAPPDATA%\Programs\JARVIS Armor Workspace\resources and choose Replace.
3. Start JARVIS.

Keep your existing suit models and other installed media. app.asar belongs directly inside resources. This cumulative update includes the pending 1.82.2 mist and sound improvements. Enable animations and disable reduced motion for mist; Master and Mechanical volume control the release sound.

The last verified installed base is 1.82.1. Building this ZIP does not install it. Older self-updates are set aside by the new base version; their inaccessible source has not been merged. The owner previously chose to proceed on that basis. The source ZIP is a development backup.

## Undo

Restore the resources backup made before installation, or reinstall the previous update ZIP. Tray → RESTART WITHOUT SELF-UPDATES bypasses self-updates only; it does not undo a base release. The v1.80.1 ZIP remains an older fallback.

## Checks

- All 94 runtime JavaScript files passed node --check.
- Core: npm install --offline and npm test passed, 121/121, with external services mocked.
- Frontend: 96/96 passed. Five new tests exercise production hand recognition/routing and transfer code using synthetic hand landmarks: lower and left screens, hold timing, normal clicks, lost tracking, Escape, one-screen cancellation, delayed discovery and failed moves.
- Existing TabManager tests confirm the same live page is moved and returned, stable display IDs are used, and disconnected destinations are rejected.
- Browser checks passed for both guide entry points, its screen-picker handoff, page hide/restore ordering and zero camera requests. The guide and its gesture cards were visually inspected at 1280 × 720 using mock displays and IPC.
- The cold mist and audio code is unchanged from 1.82.2; its earlier 21-model rendering and real Web Audio checks are recorded in RELEASE-1.82.2.md.
- Windows x64 packaging passed with npx electron-builder --win dir --x64 --config.electronDist=node_modules/electron/dist.
- app.asar is 29,725,721 bytes (29.73 MB), below 30,000,000. All 151 packaged files were verified; version is 1.82.3, main remains src/main/boot.js, and the build section is unchanged.
- Protected boot.js, preload.cjs, selfupdate.js and approvals.js are unchanged. The package version bump is deliberate. No existing tests were weakened.
- Control Deck still binds explicitly to 127.0.0.1. Production network code is unchanged and no new port was added; the temporary local preview was stopped.
- Not tested: physical webcam gestures, movement across the owner's physical monitors, speaker loudness, live paid providers or a full native-app regression. The Twilio setup request is separate from this package; account sign-in was pending when these notes were written.
- This package has not been installed or published to GitHub. Installation is recorded separately after a safe tray Quit.

### Update ZIP contents

| File | Size (bytes) |
| --- | ---: |
| app.asar | 29,725,721 |
| windows/listen.ps1 | 17,045 |
| assets/README.md | 1,537 |
| assets/vehicles/batmobile.glb | 65,804,356 |
| assets/wallpaper/batcave-empty.json | 1,337 |
| assets/wallpaper/batcave-studio.jpg | 678,435 |
| assets/wallpaper/ironman-empty.json | 1,335 |
| assets/wallpaper/ironman-studio.jpg | 658,638 |
| assets/wallpaper/spiderman-empty.json | 1,404 |
| assets/wallpaper/spiderman-studio.jpg | 861,343 |
