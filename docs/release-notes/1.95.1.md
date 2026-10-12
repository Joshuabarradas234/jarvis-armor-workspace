## JARVIS 1.95.1: Install now finishes by itself

## Fixed

- **Install now finishes by itself.** The installer could get stuck on a blank black window while it checked whether JARVIS had closed. It now runs in a proper window you can watch, closes JARVIS, copies the update in and starts JARVIS again without help.
- **The update banner shows whenever you open the hall,** not only if the hall happened to be open when JARVIS checked.
- **Ask JARVIS is on Ctrl + Alt + Q.** Ctrl + Alt + Space belongs to the Claude app's quick-entry box. If another app ever takes your chosen key, JARVIS picks a free one by himself. The tray menu (**Ask JARVIS**) and the Ask JARVIS window show which key it is. You can still choose your own in Settings → General → Keyboard shortcuts.
- **If JARVIS ever fails while starting,** he now writes down why (Settings → System → Open log) instead of closing without a word.

## Install

Click **Install now** on the banner in JARVIS, or **INSTALL JARVIS 1.95.1** in the tray menu.

The fixed installer is part of this update, so it should finish by itself. If a black window sits there showing nothing for more than a minute, close it and run the update by hand:

1. Download `JARVIS-Armor-Workspace-1.95.1-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_95_1`.
