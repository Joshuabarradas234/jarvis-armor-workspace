## JARVIS 1.100.0: your calls kept on the Mac

## New

- **Calls you record on the ZenBook are written up and kept on the Mac mini.** JARVIS still offers to record when a Zoom or Teams call starts. When the call ends:
  - the ZenBook sends the recording and its rough transcript to the Mac, then deletes its own copy;
  - the Mac writes the accurate transcript (with your AssemblyAI key), the notes (with your Claude key), puts the action items in your to-dos and prepares the follow-up email for your approval. Nothing is sent without you.
  - Everything is on the Mac in **JARVIS Server → Documents → JARVIS Meetings**, by hall and suit.
- **Nothing is lost if the Mac is off.** The meeting waits safely on the ZenBook and goes to the Mac as soon as it answers.
- **Past meetings include the Mac's.** In the hall, opening one shows its notes.
- **Quiet halls while you record.** While a call is being recorded, the hall's background sound goes silent, so you can hear people and the recording stays clean. That covers the arc-reactor hum, the cave drips and wind, the city at night, and the Batcave's water and bats on the second screen. It all comes back when the call ends.

## Before your first recorded call

On the ZenBook, open **JARVIS Core** and add your **Claude** and **AssemblyAI** keys. They go to the Mac and are kept there, sealed. Without them, the Mac still keeps the recording and the rough transcript, but can't write the notes.

## Update JARVIS Server on the Mac mini (needed for this update)

1. In Safari, choose **File → New Private Window**, go to `github.com/Joshuabarradas234/jarvis-armor-workspace/releases`, and under **v1.100.0 → Assets** click **JARVIS-Server-1.100.0-mac.zip**.
2. Open the new **JARVIS Server** folder in Downloads. Right-click **Install JARVIS Server** and choose **Open**. Your data and pairing stay as they are.

## Install on Windows

Click **Install now** on the banner in JARVIS, or **INSTALL JARVIS 1.100.0** in the tray menu.

Or by hand:

1. Download `JARVIS-Armor-Workspace-1.100.0-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_100_0`.

## The Mac app (optional)

For the quiet halls on the Mac mini too, download **JARVIS-Armor-Workspace-1.100.0-mac-intel.dmg** from the same page. Quit JARVIS, drag the new one onto **Applications** and choose **Replace**.
