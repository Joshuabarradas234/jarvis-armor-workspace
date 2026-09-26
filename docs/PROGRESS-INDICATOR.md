# Progress indicator — exact specification

Approved 2026-09-22. The mockups in this folder are the agreed look:
`progress-indicator-preview.png` (all three side by side) and `zoom_<theme>.png`.
Build it to match these images exactly.

## What it does
Each bay shows its own agent/task progress in the hall view, inside or under its plate,
so progress is visible without opening the bay. The data already exists: the control
deck broadcasts `board` (see `boardFor` / `deckUpdate` in `src/main/main.js`), each row
carrying `id`, `status` and `progress` (0–100).

## Colours — identical in all three halls
Sampled directly from the approved mockups, so these are exact.

| status   | colour        | CSS hex   | OpenCV BGR tuple |
|----------|---------------|-----------|------------------|
| running  | bright cyan   | `#5FD4FF` | (255, 212, 95)   |
| done     | green         | `#A6FF84` | (132, 255, 166)  |
| blocked  | red           | `#FF5F5F` | (95, 95, 255)    |
| idle     | nothing drawn | —         | —                |

The mockup script is written in OpenCV, which stores pixels **BGR**, so the tuples in the
script look reversed against the hex. Use the hex column for CSS.

An idle bay draws nothing at all, so a quiet hall stays clean. This is deliberate.

## Per hall

### Armor Hall (`ironman`) — charging arc on the reactor badge
- A ring centred on the plate's reactor badge: centre `(lx + lw*0.097, ly + lh/2)`,
  radius `lh*0.40`, stroke `max(3, lh*0.10)`.
- Draw a full dark track first in `(30,30,38)`, then the progress arc over it starting at
  **-90°** (12 o'clock) sweeping clockwise through `360 * progress` degrees.
- Glow: the arc blurred by `radius*0.8`, added at 0.55 strength in the same colour.

### Batcave (`batcave`) — gold bar beneath the plate
- Bar rect: `x = lx`, `y = ly + lh + lh*0.16`, width `lw`, height `max(4, lh*0.16)`.
- Dark trough `(14,14,16)` inset by 1px all round, then the fill from the left to
  `lw * progress`.
- Glow: fill blurred by `height*2.4`, added at 0.55.

### Web Lab (`spiderman`) — web strand that fills
- Strand line at `y = ly + lh + lh*0.20`, from `x0 = lx + lw*0.04` to `x1 = lx + lw*0.96`,
  stroke `max(3, lh*0.085)`.
- Behind it, 7 evenly spaced vertical lattice ticks in `(70,70,84)`, each
  `lh*0.11` above and below the strand, 1px.
- Dark strand `(52,52,62)` full width, then the fill from `x0` to `x0 + (x1-x0)*progress`.
- Glow: fill blurred by `lh*0.22`, added at 0.55.

## Drawing order — this matters
Draw the **plate first, then the indicator on top**. My first attempt drew the arc before
the plate and the plate hid it completely. In CSS terms the indicator must sit above the
plate image in the same stacking context.

## Geometry the mockups used
- `lw` = hall width × the per-bay percentage in `docs/plate_widths.json`
- `lh` = `lw × plateHeight / plateWidth` (plates keep their aspect ratio)
- `lx, ly` = centred on `suit.plaque.x` / `suit.plaque.y` from `config/themes.json`,
  clamped so a plate never leaves the screen
- Plates live at `assets/labels/<theme>/<bayId>.png`

## Live behaviour (not in the mockups)
- Update from the same `board` broadcast the deck already sends; no polling.
- Animate the fill smoothly rather than jumping.
- A gentle pulse while `running` is welcome; `done` and `blocked` stay steady.
- The indicator is decoration: it must never intercept clicks meant for the plate.

## Reproducing the mockups
`scripts/progress-mockup.py` renders these exact images from the project.
Run from the project root: `python3 scripts/progress-mockup.py`
