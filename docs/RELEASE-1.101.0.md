## JARVIS 1.101.0: smoother on the Mac, with hand control

## New

- **Hand control works on the Mac mini.** The hand tracker now comes with the app. Before, the camera switched on but nothing followed your hand.
- **Smoother on the 2014 Mac mini.**
  - With Graphics set to **Auto**, JARVIS now notices a small graphics chip, like the Mac mini's Intel HD 5000, and draws the hall at **Low**. That means fewer effects and a lighter picture, so it stops stuttering. On the ZenBook, Auto still means High.
  - On that small chip, the hall and its background video also pause while a transition film plays, so the film gets the chip to itself and runs smoothly.
- **A check-up of each computer.** **Settings → System → This computer** shows what works on that computer and exactly what to do about anything that doesn't: voice, the microphone, camera and screen permissions, hand control, the suits and films, JARVIS's brain, both Claude keys and the graphics. It also lists the few things that are still Windows-only.

## On the Mac mini

1. In Safari, choose **File → New Private Window**, go to `github.com/Joshuabarradas234/jarvis-armor-workspace/releases`, and under **v1.101.0 → Assets** click **JARVIS-Armor-Workspace-1.101.0-mac-intel.dmg**.
2. Quit JARVIS (the JARVIS menu at the top right, then **Quit**). Open the download and drag **JARVIS Armor Workspace** onto **Applications**. Choose **Replace**.
3. Open it from Applications. If macOS says it can't check the app, click **OK**, then open **System Preferences → Security & Privacy → General** and click **Open Anyway**.
4. Open **Settings → System → This computer**. It shows what's left to switch on.

Your suits, films and settings stay as they are. JARVIS Server doesn't need updating for this.

## Install on Windows

Click **Install now** on the banner in JARVIS, or **INSTALL JARVIS 1.101.0** in the tray menu.

Or by hand:

1. Download `JARVIS-Armor-Workspace-1.101.0-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_101_0`.
