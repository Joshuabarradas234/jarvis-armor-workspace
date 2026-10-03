## JARVIS 1.89.1: smooth transitions and the right hall

## Fixed

- **Transitions and the welcome play smoothly again.** The hall transition videos and the JARVIS welcome when the app opens were crawling at a few frames a second. This PC's graphics chip was decoding them very slowly; JARVIS now decodes video on the processor, which plays them at full speed. The app also now sends video files to the player in the pieces it asks for.
- **Switching to Spider-Man shows the Web Lab, not the Batcave.** When you changed hall, the new background picture could be thrown away if it took longer than half a second to load, leaving the old hall's background behind the new suits. The hall now always shows its own background.

## Good to know

- The hall transitions are the full film clips (about 45 seconds). Press **Skip ▸▸** in the corner if you want to go straight in.

## Install

1. Download `JARVIS-Armor-Workspace-1.89.1-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_89_1`.
