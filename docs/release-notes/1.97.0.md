## JARVIS 1.97.0: JARVIS Server for the Mac mini

## New

- **JARVIS Server: JARVIS's brain on its own, for a Mac that stays on.** That includes an older one like your 2014 Mac mini on macOS 12.
  - It runs the phone and WhatsApp, email, approvals, schedules, overnight jobs and reports, and keeps your to-dos and calendar.
  - It has no windows. It runs in the background, starts by itself whenever the Mac starts, keeps the Mac awake, and starts again by itself if it ever stops.
- **JARVIS Link: your ZenBook signs in to the Mac.**
  - Once you **Move JARVIS's brain to the Mac**, the ZenBook's own brain switches off. It uses less memory, nothing is missed when the ZenBook sleeps, and only the Mac ever phones you.
  - The hall, voice, Ask JARVIS, the think room, the Tower, ideas, hand control and recording your calls all stay on the ZenBook, as before. The JARVIS Core panel, your to-dos and your calendar now come from the Mac.
  - The tray shows **BRAIN ON BRUNO'S MAC MINI · LINKED**.
- **Safe by design.**
  - The Mac only answers your own devices over Tailscale, after you pair them once with a code shown on the Mac. Nothing is open to the internet.
  - The Mac keeps your keys sealed, and holds only a fingerprint of each paired device's key.
  - The phone rules are unchanged: codes, lockouts, texts can never approve, and code updates can never be approved by voice alone.

## Set up

**On the Mac mini** (you already have Node.js 22 and Tailscale):

1. In Safari, choose **File → New Private Window** and go to `github.com/Joshuabarradas234/jarvis-armor-workspace/releases`. Under **v1.97.0**, click **Assets**, then **JARVIS-Server-1.97.0-mac.zip**.
2. Open **Downloads**. If you see the zip rather than a **JARVIS Server** folder, double-click it to unzip it. Then open the **JARVIS Server** folder.
3. **Right-click Install JARVIS Server** and choose **Open**, then **Open** again. macOS asks the first time because the file isn't from the App Store.
4. A window installs it and shows a **pairing code**. The code also appears in a box on the Mac's screen and as a note on its Desktop.

**On the ZenBook:**

5. Install this update: click **Install now** in the hall, or **INSTALL JARVIS 1.97.0** in the tray.
6. Open **Settings → System → JARVIS Link**. Click **Find my Mac**, choose **Bruno's Mac mini**, type the code and click **Sign in**. JARVIS restarts.
7. Back in **Settings → System → JARVIS Link**, click **Move JARVIS's brain to the Mac…**, then **Move it now**.
8. Open **JARVIS Core** and add your keys again: Claude, Twilio, the Gmail app password and AssemblyAI. They're stored on the Mac. If WhatsApp has lapsed, send the join code to the sandbox number again.

To pair another computer later, right-click **Pair a device** in the JARVIS Server folder on the Mac and choose **Open**.

## Not yet

- Voice commands that talk to JARVIS Core, such as approving by voice, don't work from the ZenBook yet. Use the JARVIS Core panel or your phone.
- Follow-up emails after a call recorded on the ZenBook can't be sent yet. The notes and to-dos still arrive.

## Install on Windows

Click **Install now** on the banner in JARVIS, or **INSTALL JARVIS 1.97.0** in the tray menu.

Or by hand:

1. Download `JARVIS-Armor-Workspace-1.97.0-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_97_0`.
