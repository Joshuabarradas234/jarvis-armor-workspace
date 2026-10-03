# JARVIS Armor Workspace — handover

## What this is
`jarvis-project-source.zip` is the complete project: `build/` with src, dist, config and
assets. It excludes `node_modules` and `release`, which are rebuilt.

## To carry on in a new chat
1. Start the new chat and upload `jarvis-project-source.zip`.
2. Ask Claude to unzip it to `/home/claude/build` and run:
       cd /home/claude/build && npm install
       python3 - <<'PY'
       p='node_modules/app-builder-lib/out/targets/nsis/NsisTarget.js'; s=open(p).read()
       s=s.replace("if ((0, macosVersion_1.isMacOsCatalina)())","if (true)"); open(p,'w').write(s)
       PY
   That patch is required or the Windows installer will not build on Linux.
3. Build with:
       cd /home/claude/build && npx electron-builder --win nsis --x64

## Current version
1.53.0 (v9.3). Latest installer: JARVIS-Setup-v9_3.zip

## Where things live
- `config/themes.json` — halls, bays, positions, overlays, voices, labels
- `assets/wallpaper/` — the three hall images (4K)
- `assets/transitions/` — hologram clips (batmobile7-*.webm, jarvis-ring.mp4, spidey2.webm)
- `assets/labels/<theme>/<bayId>.png` — the plate designs used as labels
- `assets/voice/packs/{jarvis,alfred,karen}/` — voice clips; `packs/map.json` maps clip to moment
- `src/control/` — control deck: missions.js, runner.js, server.js
- `dist/assets/index-DNK6LM5N.js` — main renderer bundle (patched by hand: labels, skip button,
  microphone switch). `hall-fZdHx-gJ.js` — hall view. `index-ChQi7yvo.css` — styles.

## Built in v9.3 (all six agreed features are DONE)
1. Voice announcement on agent finish/fail - `announceBay()` in `src/main/main.js`.
   Fires once per run, only when the previous state was `running`, only for the active hall.
2. Progress indicator in the hall view - spec in `docs/PROGRESS-INDICATOR.md`, CSS at the
   end of `dist/assets/index-ChQi7yvo.css`, wiring (`__applyBoard`) in the main bundle.
   `scripts/progress-mockup.py` regenerates the approved reference images.
3. Status report - `GET /api/report` in `src/control/server.js`, "Copy status report" button.
4. Per-bay environment - `env` field in `src/control/missions.js`, applied to the child
   process in `src/control/runner.js`, edited from the deck.
5/6. AWS cost watch and Terraform drift agents ship separately in `agent-kit.zip`
   (aws_cost_watch.py, tf_drift.py). They are not part of this repo.

## Possible next features (not built)
- Family-business bays (Batcave) and AI/tech bays (Armor Hall) - idea lists only
- Ultron drawn with real transparency instead of lightening (needs a re-render)
- Time-per-bay tracking for contract hours

## Known gaps
- Renaming a bay does not change its plate (names are baked into the label images)
- Bay 4's plate in the Armor Hall is the one I generated (MARK V), not from the owner's set
- Ultron is blended by lightening; a fuller fix is transparency + normal blend
