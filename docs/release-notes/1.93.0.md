## JARVIS 1.93.0: weekly review, call recording and one-click updates

## New

- **A weekly review every Sunday evening.** The first time you open the hall on a Sunday from 5pm, JARVIS plays your week on the same full-screen film as the morning briefing:
  - the tasks you ticked off;
  - the meetings you had and how long they took;
  - what the Tower finished;
  - how far your projects moved;
  - what the AI cost;
  - what next week holds.

  Say "Jarvis, weekly review" or "How was my week?" any time.
- **"Record this call?"** When Teams, Zoom, WhatsApp or another call app starts using your microphone, a small card appears in the top corner. Press **Record** and the call is recorded, filed under your usual suit, without JARVIS speaking over your call. The card goes away by itself after 30 seconds. **Never for…** stops it asking for that app. Untick **Offer to record calls** in the tray menu to turn it off.
- **Calls end by themselves, WhatsApp too.** When the app you're recording lets go of your microphone for 20 seconds, the call is over: JARVIS stops recording and writes the notes. This works for WhatsApp as well, not just Teams and Zoom.
- **Recording keeps going if you close JARVIS to the tray mid-call.** You'll see a notification. End the meeting from the tray menu (**End the meeting**) or say "Jarvis, end the meeting", which now works from the tray too.
- **Accurate meeting transcripts with who said what.** Add an AssemblyAI key in Settings → JARVIS Core → Meeting transcripts. When a meeting ends, its recording goes to AssemblyAI's European servers for an accurate British English transcript with the speakers labelled (about US$0.23 an hour; new accounts get US$50 free). It isn't used to train their models, and JARVIS deletes it from their servers as soon as the transcript is back. The notes and follow-up are then written from it. Without a key, nothing changes.
- **One-click updates.** When a new JARVIS is out, a banner in the hall (and the tray menu) offers it. Click **Install now**: JARVIS downloads it from the official GitHub releases, checks its fingerprint, closes, installs and opens again. Nothing installs without your click, and never by voice or message. This works from the next version onwards, because each release now publishes the fingerprint JARVIS checks.

## Install

1. Download `JARVIS-Armor-Workspace-1.93.0-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_93_0`.
