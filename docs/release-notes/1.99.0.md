## JARVIS 1.99.0: the suits and films on your Mac

## New

- **The suits, films and sounds come to the Mac app.** The Mac download leaves them out to keep it small. Now they come over once from your ZenBook as **JARVIS-media.zip**, sent with Tailscale. One click in **Settings → System → Suits, films and sounds** adds them:
  - every suit in every hall;
  - the transition films and their sounds;
  - the second-screen backdrops for each hall, including the Batcave's boat;
  - the voice clips and the welcome film.
- **More of JARVIS works the Mac way.**
  - **Calculator** opens the Mac's Calculator.
  - **Microphone settings** opens the Mac's microphone privacy page.
  - Choosing an app for a suit starts in **Applications**.
  - Right-click JARVIS in the Dock for **Ask JARVIS**.
  - The menu bar shows the JARVIS icon once the media is added.

## Fixed

- **An update is only offered once it is ready to download.** Before, "Install now" could appear a few minutes too early and fail with "no fingerprint file". Now JARVIS waits until the release is fully published, and looks again every five minutes.

## On the Mac mini

1. In Safari, choose **File → New Private Window**, go to `github.com/Joshuabarradas234/jarvis-armor-workspace/releases`, and under **v1.99.0 → Assets** click **JARVIS-Armor-Workspace-1.99.0-mac-intel.dmg**.
2. Quit JARVIS (the word **JARVIS** in the menu bar, then **Quit**). Open the download and drag **JARVIS Armor Workspace** onto **Applications**. Choose **Replace**.
3. Open it from Applications. If macOS says it can't check the app, click **OK**, then open **System Preferences → Security & Privacy → General** and click **Open Anyway**.
4. Open **Settings → System**. Under **Suits, films and sounds**, click **Add JARVIS-media.zip from Downloads**. It takes about a minute, then JARVIS restarts with everything in place.

JARVIS-media.zip was sent to the Mac mini's Downloads with Tailscale. If it isn't there, send it again from the ZenBook: right-click the file, choose **Send with Tailscale**, and pick **brunos-mac-mini**.

## Install on Windows

Click **Install now** on the banner in JARVIS, or **INSTALL JARVIS 1.99.0** in the tray menu.

Or by hand:

1. Download `JARVIS-Armor-Workspace-1.99.0-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_99_0`. JARVIS Server on the Mac mini doesn't need updating for this.
