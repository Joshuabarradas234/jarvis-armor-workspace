## JARVIS 1.103.0: one-click updates on the Mac

## New

- **Install now works on the Mac.** When a new JARVIS is out, click **Install now** on the banner, in the JARVIS menu at the top right, or in **Settings → System → Updates**. JARVIS then:
  - downloads the new Mac app and the new JARVIS Server, from the official release only;
  - checks each file against the fingerprint published with the release, and installs nothing that doesn't match;
  - closes, swaps in the new app and JARVIS Server, and opens again by itself, all in about a minute.

  The old app is kept until the new one is fully in place, and put back if anything goes wrong. No more downloading, dragging into Applications or clicking Open Anyway.

## On the Mac mini (the last time by hand)

1. In Safari, choose **File → New Private Window**, go to `github.com/Joshuabarradas234/jarvis-armor-workspace/releases`, and under **v1.103.0 → Assets** click **JARVIS-Armor-Workspace-1.103.0-mac-intel.dmg**.
2. Quit JARVIS (the JARVIS menu at the top right, then **Quit**). Open the download and drag **JARVIS Armor Workspace** onto **Applications**. Choose **Replace**.
3. Open it from Applications. If macOS says it can't check the app, click **OK**, then open **System Preferences → Security & Privacy → General** and click **Open Anyway**.

From the next update on, just click **Install now**.

After an update, macOS may ask again for the microphone or camera, because each new version counts as a new app to it. Click **OK**.

## Install on Windows

Click **Install now** on the banner in JARVIS, or **INSTALL JARVIS 1.103.0** in the tray menu.

Or by hand:

1. Download `JARVIS-Armor-Workspace-1.103.0-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_103_0`.
