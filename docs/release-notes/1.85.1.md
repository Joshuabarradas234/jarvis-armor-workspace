## JARVIS 1.85.1: fixes for meetings, skills and safety

## Fixed

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

## Also

- The older backup hand-tracking engine kept two copies; the copy this version of Electron never loads (6 MB) was removed to make room in the app package. The main hand tracker is unchanged.

## Install

1. Download `JARVIS-Armor-Workspace-1.85.1-update.zip` below, right-click it and choose **Extract All…**.
2. Open the extracted folder and double-click **INSTALL-UPDATE.bat**. It closes JARVIS, keeps a copy of the old version, copies the update in and starts JARVIS again.

Your previous version is kept in `resources\backup-before-1_85_1`.
