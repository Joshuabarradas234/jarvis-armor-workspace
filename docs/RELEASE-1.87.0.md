## JARVIS 1.87.0: continue Tower jobs, safer agents

## New

- **Continue where it stopped.** A Tower job that stopped, failed or ran out of budget now has a **Continue where it stopped** button.
  - Steps that were already finished are kept, so you do not pay for them twice. Only the rest is done again, in the same folder.
  - If it ran out of budget, enter a higher task budget next to the button. If the floor's own limit is the reason, the message tells you to raise **per run** on the Brief tab.
- **Budgets hold.** Agents working side by side can no longer overshoot the budget together: each one waits while the others finish if the money might not stretch.
  - An answer that has already been paid for is kept instead of thrown away.
  - A task budget now covers the whole assembly line. The next floor gets what the floors before it left.
- **Clear stuck cards.** On the Attention shelf, failed or stopped jobs and rehearsals now have a **Clear** button. A card comes back if that job changes again.

## Safety

- Claude Code agents can now write only in their own job's folder. They can still read the floor's knowledge files, but they can no longer change them or touch other jobs. This was checked with the real Claude Code on this PC.
- Starting meeting work and making a product clip both spend money. Each now needs its own number and code, and **YES ALL** never covers them.
- After JARVIS has read an email or a web page, searching your documents waits for your approval.
- Approval cards show the whole email, up to 15,000 characters, so you approve exactly what you can read. On WhatsApp, a long request says where to read the rest.

## Fixed

- If your settings or suits file is ever damaged, JARVIS keeps it aside and uses the last good copy. Before, everything went back to the defaults.
- If a backup fails, you are told once a day instead of every half hour. Only the newest 30 backups and the newest 5 self-update exports are kept.
- "Call me 10 minutes from now" now means in 10 minutes. "Wake me at 7 in the morning" follows your trip's time zone when you are away.
- Meeting work no longer stops at 100 meetings. The oldest finished meeting makes room.
- Product Studio stops checking a clip after a day and asks you to look in Higgsfield.

## Install

1. Download `JARVIS-Armor-Workspace-1.87.0-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_87_0`.
