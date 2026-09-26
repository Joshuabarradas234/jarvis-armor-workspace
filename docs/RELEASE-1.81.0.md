# JARVIS 1.81.0: Suit showcase

## What's new

- Redesigned Iron Man, Batman and Spider-Man halls with seven complete pods and matching labels and icons.
- Larger, naturally proportioned suits that fill their pods, with room for bulky armour and accessories.
- Visible glass doors open when you enter a suit, with fitted eye lights and subtle mechanical sounds.
- Different display movements for Iron Man, Batman and Spider-Man, with adjustable pose strength.
- An on-screen calibration editor for pod positions, labels, eyes and centre holograms, with preview, undo and reset.
- Sharper close-up rendering and consistent quality, frame-rate, battery and reduced-motion controls.
- A new 2430 × 1440 Spider-Man hall image and better-sized centre holograms in all three rooms.

## Fixed

- Suit labels respond to clicks and stay readable and centred.
- Switching halls quickly no longer brings back an old image or model.
- Entering an end pod keeps the room visible instead of exposing a blank edge.
- Eye lighting stays aligned when a suit finishes loading after selection.
- Hidden scenes and holograms pause, and unused graphics resources are released.
- Saved workspace names and links survive the updated default suit names.
- Calls that never start show the underlying error instead of saying you failed to answer; approval examples show four-character codes.
- The Core test setup now works on Windows without Unix tools. Test changes fix file-URL handling, Windows stream-path assertions and the test mail-server patch; production approval checks were not relaxed.

## Install

1. Right-click the JARVIS tray icon → Quit.
2. Unzip JARVIS-1.81.0-update.zip into %LOCALAPPDATA%\Programs\JARVIS Armor Workspace\resources and choose Replace.
3. Start JARVIS.

This is a drop-in update for an existing v1.80.1 installation, which already contains the suits, videos and other large assets. app.asar is at the top level of the ZIP; there is no extra update folder.

## Undo

Use the tray → RESTART WITHOUT SELF-UPDATES, or reinstall the v1.80.1 zip. The tray option bypasses approved self-updates; reinstalling v1.80.1 also rolls back this base release.

## Checks

- Syntax: all 84 JavaScript files in src/ and dist/assets/ passed node --check.
- Core: npm install and npm test passed, 121/121 checks on Windows, with local test mail servers and mocked external services.
- Frontend: 56/56 checks passed.
- Windows x64 build: npx electron-builder --win dir --x64 passed.
- app.asar: 29,660,232 bytes (29.66 MB), below the 30,000,000-byte limit. Packaged version is 1.81.0; the entry point remains src/main/boot.js.
- All 140 packaged files were checked against the build inputs. Every existing v1.80.1 archive entry is retained, including its original vendor libraries and legacy wallpaper files.
- The build section is unchanged. boot.js, preload.cjs, selfupdate.js and approvals.js are unchanged from the supplied source. Compared with the older published v1.80.1 archive, approvals.js only carries the source's pre-existing comment correction to four-character examples; its executable code is unchanged.
- The three hall images and calibration files stay outside app.asar. Only listen.ps1 is included from Windows scripts; all those scripts are unchanged.
- Network check: the packaged Control Deck was tested and bound only to 127.0.0.1 (IPv4), never 0.0.0.0. Its server code is unchanged from v1.80.1. The production-code review found no new port-opening code, public server or tunnel. The temporary test listener was closed afterwards.
- Earlier visual checks used all 21 actual suit models with a simulated app connection, and all 20 approximate display rigs passed geometry checks.
- Not tested: launching this packaged release, the Electron boot/UI suite, live Windows voice or hand input, physical multi-monitor placement, hardware audio mixing, live accounts, or an in-place installation and rollback.
- Original suit textures remain 1024 × 1024 and centre videos retain their original resolution. Iron Man and Batman halls are 1630 × 965. Display poses use approximate rigs; Spider-Ham remains static. Full signature performances need artist-authored models and animation clips.

### Update ZIP contents

| File | Size (bytes) |
| --- | ---: |
| app.asar | 29,660,232 |
| windows/listen.ps1 | 17,045 |
| assets/wallpaper/batcave-empty.json | 1,337 |
| assets/wallpaper/batcave-studio.jpg | 678,435 |
| assets/wallpaper/ironman-empty.json | 1,335 |
| assets/wallpaper/ironman-studio.jpg | 658,638 |
| assets/wallpaper/spiderman-empty.json | 1,404 |
| assets/wallpaper/spiderman-studio.jpg | 861,343 |
