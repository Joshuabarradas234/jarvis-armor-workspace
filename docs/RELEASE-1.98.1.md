## JARVIS 1.98.1: JARVIS Server starts after the Mac restarts

## Fixed

- **JARVIS Server starts properly after the Mac mini restarts.**
  - Before, a note left from before the restart could make it think another copy was already running, so it stopped itself every 10 seconds and the ZenBook couldn't reach it.
  - Now it checks that the other copy really is JARVIS Server.
- **The installer tells the truth.** It clears that leftover note before starting, only says "running" once the server is actually up, and shows what went wrong if it isn't answering.

## Update JARVIS Server on the Mac mini

1. In Safari, choose **File → New Private Window**, go to `github.com/Joshuabarradas234/jarvis-armor-workspace/releases`, and under **v1.98.1 → Assets** click **JARVIS-Server-1.98.1-mac.zip**.
2. Open the new **JARVIS Server** folder in Downloads. Right-click **Install JARVIS Server** and choose **Open**. Your data and pairing stay as they are.

## Install on Windows

Click **Install now** on the banner in JARVIS, or **INSTALL JARVIS 1.98.1** in the tray menu.

Or by hand:

1. Download `JARVIS-Armor-Workspace-1.98.1-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_98_1`.
