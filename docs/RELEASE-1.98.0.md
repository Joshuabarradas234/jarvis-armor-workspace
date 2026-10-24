## JARVIS 1.98.0: JARVIS opens on your Mac mini

## New

- **The JARVIS app now opens on your Mac mini.** Each release has two Mac disk images:
  - **JARVIS-Armor-Workspace-1.98.0-mac-intel.dmg** for Intel Macs, including your 2014 Mac mini on macOS 12;
  - **…-mac-apple.dmg** for Macs with an Apple chip.

  The Mac app is built on the last engine that runs on macOS 12. The Windows app is unchanged.
- **One brain on each Mac.** On a Mac that runs JARVIS Server, the app never starts a second brain, so he never phones you twice. In **Settings → System → JARVIS Link**, **Find my Mac** offers **This Mac (JARVIS Server)** to sign in to it.
- **JARVIS's voice on the Mac.** He speaks with the Mac's own British voice, **Daniel**. He listens with Apple's speech recogniser, on the Mac itself where the Mac supports it, and hears "Jarvis…" just as he does on Windows.
- **Start when the Mac starts:** Settings → General has this tick box on a Mac.

## On the Mac mini

1. In Safari, choose **File → New Private Window**, go to `github.com/Joshuabarradas234/jarvis-armor-workspace/releases`, and under **v1.98.0 → Assets** click **JARVIS-Armor-Workspace-1.98.0-mac-intel.dmg**.
2. Open it from Downloads and drag **JARVIS Armor Workspace** onto **Applications**.
3. Open it from Applications. The first time, macOS says it can't check the app. Click **OK**, then open **System Preferences → Security & Privacy → General** and click **Open Anyway**.
4. In JARVIS, open **Settings → System → JARVIS Link** and click **Find my Mac**. Choose **This Mac (JARVIS Server)**.
5. In the **JARVIS Server** folder, right-click **Pair a device** and choose **Open**. Type the code into JARVIS and click **Sign in**.
6. To talk to him, tick **Microphone** in the menu-bar menu (the word **JARVIS**, top right). When macOS asks, allow **Microphone** and **Speech Recognition**.

The 3D hall asks a lot of a 2014 Mac's graphics. If it feels slow, choose **Settings → Graphics → Low**.

## Install on Windows

Click **Install now** on the banner in JARVIS, or **INSTALL JARVIS 1.98.0** in the tray menu.

Or by hand:

1. Download `JARVIS-Armor-Workspace-1.98.0-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_98_0`. JARVIS Server on the Mac mini doesn't need updating for this.
