## JARVIS 1.89.2: one sound per transition, quieter nights

## Fixed

- **Each hall transition is heard once.** On your two screens, the lower one played the transition sound as well, slightly out of step, so it sounded doubled. The lower screen now shows the transition silently.
- **Quieter nights.** Windows now wakes the PC only for things that reach you: calls, WhatsApps, and plan steps you gave to the agents for the night. JARVIS's own background jobs (his nightly self-check and self-review) no longer wake it; they run when the PC is awake, up to three hours late.
- If you closed JARVIS within a few seconds of opening him, his Windows wake-up task could be left behind. He now waits for it to finish being made and removes it.
- Your name is no longer written into the app's code. It lives only in your settings (Settings → JARVIS Core → You), where it already is, so nothing changes for you. A brand-new install asks for it instead.

## Install

1. Download `JARVIS-Armor-Workspace-1.89.2-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_89_2`.
