## JARVIS 1.102.0: the Mac wallpaper, and each hall's own voice

## New

- **The animated wallpaper works on the Mac.** It shows behind your desktop icons on every screen, just as on Windows: the slow grid, the clock and the JARVIS standby title. Clicks go straight through to your desktop. Switch it on in **Settings → General → Run animated desktop wallpaper**.

## Fixed

- **Each hall speaks in its own voice on the Mac.** Before, all three used the same British man's voice, so Karen sounded wrong.
  - Jarvis uses **Daniel**.
  - Alfred uses Daniel more slowly, or **Oliver** if you've downloaded that voice.
  - Karen uses **Samantha**.
  - **Settings → System → This computer** shows which voice each hall uses.
- **Suits open with their full effects on the Mac mini.** 1.101.0 made the hall lighter on the Mac mini's small graphics chip, but that also dropped the energy pulse and sparks when a suit opens. Auto now uses a lighter **Medium** there and keeps those effects, so suits open the way they do on Windows. If the hall still stutters, choose **Settings → Graphics → Low**.

## On the Mac mini

1. In Safari, choose **File → New Private Window**, go to `github.com/Joshuabarradas234/jarvis-armor-workspace/releases`, and under **v1.102.0 → Assets** click **JARVIS-Armor-Workspace-1.102.0-mac-intel.dmg**.
2. Quit JARVIS (the JARVIS menu at the top right, then **Quit**). Open the download and drag **JARVIS Armor Workspace** onto **Applications**. Choose **Replace**.
3. Open it from Applications. If macOS says it can't check the app, click **OK**, then open **System Preferences → Security & Privacy → General** and click **Open Anyway**.

JARVIS Server doesn't need updating for this.

## Install on Windows

Click **Install now** on the banner in JARVIS, or **INSTALL JARVIS 1.102.0** in the tray menu.

Or by hand:

1. Download `JARVIS-Armor-Workspace-1.102.0-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_102_0`.
