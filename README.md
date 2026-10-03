# JARVIS Armor Workspace

A cinematic, multi-screen desktop workspace for Windows, built on Electron. Each "suit" in a hall is a workstation: a folder, a set of links and apps, a window layout and its own browser tabs. You open one by voice, hotkey, hand gesture or mouse.

## What it does
- **Halls and suits:** three themed halls (Armor Hall, Batcave, Web Lab), each with its own assistant voice (Jarvis, Alfred, Karen). Every suit remembers its tabs, folder and a note from your last visit.
- **Multi-screen:** the main screen shows the hall, a second screen becomes a control deck, and an optional third screen shows a living scene. Screens can be added or removed while it runs.
- **Voice control:** offline Windows speech recognition, with commands such as "Jarvis, let's get to work", "open Mark 2", "status report" and "map of Leeds".
- **Hand control:** camera hand tracking to point, pinch, scroll and throw pages between screens.
- **Control deck:** each bay can run an agent command and show its progress, tasks and log, with a copyable status report.
- **The tower:** floors of Claude-powered agents that plan, work and review tasks, using the Claude API or Claude Code, with per-floor budgets and approvals.
- **Meeting mode:** "Jarvis, start a meeting for Mark 5" (or the meeting button) records your microphone and the call audio from any app, transcribes it offline with Windows speech recognition, adds a Claude summary, and emails the notes from your Gmail when you end it.
- **Ideas that get worked on:** link an idea to a suit or to the JARVIS app and press **Get JARVIS on it**. JARVIS drafts a plan for your OK; suit ideas go to that hall's tower agents, app ideas are built by Claude Code in a separate copy of the source and merged only after a second OK. Quiet ideas get drafted plans overnight.
- **JARVIS Core (works while you are away):** wake-up calls and a 06:00 overnight report by phone (Twilio), WhatsApp messages you can reply to, an overnight audit, email sorting and drafted replies in Gmail, and watched numbers. Anything that touches your business, other people, money or his own code waits for your OK: a numbered request with a four-character code on WhatsApp, a button at the PC, or your voice. Text messages can never approve.
- **Self-updates with your approval:** JARVIS can change his own code in a private copy, check it, show you every changed line and install it only after you approve it. Each installed version is checked file by file at every start, and one that does not start goes back by itself. Setup: [docs/JARVIS-CORE.md](docs/JARVIS-CORE.md).
- **Daily tools:** briefing, calendar, to-dos, ideas board, focus timer, globe and maps, and weather.

## Run from source
```bash
npm install
npm start
```

## Build the Windows installer
```bash
npm run dist
```
The installer is written to `release/`.

## Updates
The app's **Check for updates** reads [`latest.json`](latest.json) from this repository. After publishing a release, bump `version` there.

## Project layout
- `src/main/`: Electron main process (windows, IPC, tabs, panels)
- `src/control/`: control deck server, missions and agent runner
- `src/tower/`: tower store, agent orchestration and engines
- `src/ideas/`: the idea assistant (plans, approvals, tower hand-off, Claude Code builds in a git worktree) and the planner (brainstorms, step-by-step project plans)
- `src/meeting/`: meeting recording, offline transcription queue and the Gmail sender
- `src/brain/`: JARVIS Core (phone and WhatsApp, approvals, schedule, email desk, audit, self-updates); `src/main/boot.js` picks which approved version to start
- `tests/core/`: JARVIS Core tests against local stand-ins for Twilio, Gmail and Claude
- `src/voice/`, `scripts/windows/`: speech recognition and PowerShell helpers
- `dist/`: the prebuilt renderer, patched directly (there is no build step for it)
- `docs/REVIEW-1.70.md`: latest review notes and open items

## Licence
MIT. See [LICENSE](LICENSE) and [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).
