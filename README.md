# JARVIS Armor Workspace

A cinematic, multi-screen desktop workspace for Windows, built on Electron. Each "suit" in a hall is a workstation: a folder, a set of links and apps, a window layout and its own browser tabs. You open one by voice, hotkey, hand gesture or mouse.

## What it does
- **Halls and suits:** three themed halls (Armor Hall, Batcave, Web Lab), each with its own assistant voice (Jarvis, Alfred, Karen). Every suit remembers its tabs, folder and a note from your last visit.
- **Multi-screen:** the main screen shows the hall, a second screen becomes a control deck, and an optional third screen shows a living scene. Screens can be added or removed while it runs.
- **Voice control:** offline Windows speech recognition, with commands such as "Jarvis, let's get to work", "open Mark 2", "status report" and "map of Leeds".
- **Hand control:** camera hand tracking to point, pinch, scroll and throw pages between screens.
- **Control deck:** each bay can run an agent command and show its progress, tasks and log, with a copyable status report.
- **The tower:** floors of Claude-powered agents that plan, work and review tasks, using the Claude API or Claude Code, with per-floor budgets and approvals.
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
- `src/voice/`, `scripts/windows/`: speech recognition and PowerShell helpers
- `dist/`: the prebuilt renderer, patched directly (there is no build step for it)
- `docs/REVIEW-1.70.md`: latest review notes and open items

## Licence
MIT. See [LICENSE](LICENSE) and [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt).
