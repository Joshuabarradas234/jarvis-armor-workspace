## JARVIS 1.85.3: voice listening fixed, plus the 1.85.1 and 1.85.2 fixes

## Fixed in 1.85.3

- **Voice listening.** The newer Windows speech engine crashed every time it started, with "does not contain a method named 'Add'". It happened 227 times in the log, and JARVIS's own attempt to fix it failed. Windows PowerShell could not add JARVIS's phrase list to it, so JARVIS fell back to the older engine. The list is now added in a way Windows PowerShell understands, and the newer engine starts and listens again. This was checked on this PC with JARVIS's voice self-check and a short listening run.

## Also in this update (from 1.85.2)

- **Suit shortcuts.** JARVIS no longer asks Windows for Win+1 to Win+7, which the Windows taskbar always keeps, so every start-up stops logging "Unavailable". Ctrl+Alt+1 to Ctrl+Alt+7 still open the suits.
- **Live wallpaper.** On this version of Windows there is no place behind the desktop icons for a live wallpaper. JARVIS used to try again and again (almost 300 times in a week). Now it tries once per start, notes it once, and leaves your normal wallpaper alone. To try again, switch the wallpaper setting off and on.

These do the same job as JARVIS's own suggestions #7 and #8. His versions were built on an older release and would have removed the Skills tab, so decline those two in JARVIS Core → Needs you.

## Also in this update (from 1.85.1)

- **Meeting follow-up emails.**
  - If the email was never accepted by Gmail (for example, a wrong password or no connection), it goes back to a draft. You can fix the problem and send it again.
  - If it was interrupted after it went out, Routines asks you to check Sent mail: press **It is in Sent mail** or **It is not in Sent mail**. It is still never resent by itself.
- **Meeting tasks that failed to start.**
  - The reserved allowance is given back, and the task can be **retried**, corrected or **dismissed**.
  - A task waits, instead of failing, when its Tower floor has used its daily budget.
  - Agent work that stopped or failed can be retried as a new run.
  - Finished work keeps only what it actually cost.
- **Automatic skills.**
  - Skills now match what you asked for, not the fixed wording JARVIS adds to page and meeting tasks. A football-results page no longer picks up a sourdough recipe.
  - Skills whose later results you accepted rank higher. A skill whose later results were returned at least twice, more often than accepted, pauses itself; **Use it again** reinstates it.
- **Do skills help?** Each floor's Skills tab shows results with and without skills: how many you accepted or returned, average cost and average time.
- **Cut-off answers.**
  - An AI answer that hits the length limit is now detected. A cut-off review can never approve work.
  - Cut-off work is labelled as incomplete for the reviewer.
  - A long web search is allowed to finish.
- **Budgets.**
  - Revising a brief no longer shrinks the run's budget to 5 cents.
  - A failed AI call no longer counts its reservation as spent.
  - A resumed meeting task keeps its meeting limits: no web search, no Claude Code, no handoffs.
- **Backup restore.** A restored backup is no longer overwritten by the old to-do list, calendar, ideas or suits.
- **Ctrl+R.** Ctrl+R no longer reloads the whole JARVIS screen, which could stop a meeting recording. Ctrl+R and F5 now reload just the web page you are on. Ctrl+W and Ctrl+Shift+I no longer act on the JARVIS screens, and Ctrl+plus/minus no longer zoom them.

## Install

1. Download `JARVIS-Armor-Workspace-1.85.3-update.zip`, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_85_3`.
