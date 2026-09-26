#!/usr/bin/env python3
"""Render the approved progress-indicator mockups from the project's own assets.

Run from the project root:   python3 scripts/progress-mockup.py
Writes docs/progress-<theme>.png and docs/progress-indicator-preview.png

This is the reference implementation of docs/PROGRESS-INDICATOR.md. Build the real
feature to match what this produces.
"""
import cv2, numpy as np, json, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = json.load(open(f'{ROOT}/config/themes.json'))
PW = json.load(open(f'{ROOT}/docs/plate_widths.json'))

# A spread of states so every look is visible at once. Real use reads these from the
# control deck's `board` broadcast: each row has id, status and progress (0-100).
STATE = {0: ('running', 0.62), 1: ('done', 1.0), 2: ('blocked', 0.35), 3: ('running', 0.20),
         4: ('idle', 0.0), 5: ('running', 0.85), 6: ('idle', 0.0), 7: ('done', 1.0)}
COL = {'running': (255, 212, 95), 'done': (132, 255, 166), 'blocked': (95, 95, 255), 'idle': None}  # BGR


def hall(theme, W2=2560):
    bg = cv2.imread(f'{ROOT}/assets/wallpaper/{theme}.jpg')
    H2 = int(bg.shape[0] * W2 / bg.shape[1])
    out = cv2.resize(bg, (W2, H2), interpolation=cv2.INTER_AREA).astype(np.float32)
    th = [x for x in T if x['id'] == theme][0]

    for k, s in enumerate(th['suits']):
        if s['id'] not in PW.get(theme, {}):
            continue
        st, pr = STATE.get(k, ('idle', 0.0))
        col = COL[st]

        pl = cv2.imread(f"{ROOT}/assets/labels/{theme}/{s['id']}.png", cv2.IMREAD_UNCHANGED).astype(np.float32)
        lw = int(W2 * PW[theme][s['id']] / 100)
        lh = int(pl.shape[0] * lw / pl.shape[1])
        pl = cv2.resize(pl, (lw, lh), interpolation=cv2.INTER_AREA)
        lx = max(4, min(W2 - lw - 4, int(s['plaque']['x'] / 100 * W2 - lw / 2)))
        ly = int(s['plaque']['y'] / 100 * H2 - lh / 2)

        # PLATE FIRST, then the indicator on top - drawing it underneath hides it entirely.
        a = pl[:, :, 3:] / 255 if pl.shape[2] == 4 else np.ones((lh, lw, 1), np.float32)
        out[ly:ly + lh, lx:lx + lw] = out[ly:ly + lh, lx:lx + lw] * (1 - a) + pl[:, :, :3] * a

        if st == 'idle':
            continue
        glow = np.zeros(out.shape[:2], np.float32)

        if theme == 'ironman':          # charging arc around the reactor badge
            cx, cy = lx + int(lw * 0.097), ly + lh // 2
            r, t = int(lh * 0.40), max(3, int(lh * 0.10))
            cv2.ellipse(out, (cx, cy), (r, r), 0, 0, 360, (30, 30, 38), t, cv2.LINE_AA)
            cv2.ellipse(out, (cx, cy), (r, r), -90, 0, int(360 * pr), col, t, cv2.LINE_AA)
            cv2.ellipse(glow, (cx, cy), (r, r), -90, 0, int(360 * pr), 1, t)
            blur = r * 0.8

        elif theme == 'batcave':        # gold bar beneath the plate
            bx, by = lx, ly + lh + int(lh * 0.16)
            bw2, bh2 = lw, max(4, int(lh * 0.16))
            cv2.rectangle(out, (bx - 1, by - 1), (bx + bw2 + 1, by + bh2 + 1), (14, 14, 16), -1)
            cv2.rectangle(out, (bx, by), (bx + int(bw2 * pr), by + bh2), col, -1)
            cv2.rectangle(glow, (bx, by), (bx + int(bw2 * pr), by + bh2), 1, -1)
            blur = bh2 * 2.4

        else:                           # web strand that fills
            by = ly + lh + int(lh * 0.20)
            x0, x1 = lx + int(lw * 0.04), lx + int(lw * 0.96)
            t = max(3, int(lh * 0.085))
            for i in range(7):          # lattice ticks behind the strand
                xx = x0 + int((x1 - x0) * i / 6)
                cv2.line(out, (xx, by - int(lh * 0.11)), (xx, by + int(lh * 0.11)), (70, 70, 84), 1, cv2.LINE_AA)
            cv2.line(out, (x0, by), (x1, by), (52, 52, 62), t, cv2.LINE_AA)
            cv2.line(out, (x0, by), (x0 + int((x1 - x0) * pr), by), col, t, cv2.LINE_AA)
            cv2.line(glow, (x0, by), (x0 + int((x1 - x0) * pr), by), 1, t)
            blur = lh * 0.22

        out = np.clip(out + cv2.GaussianBlur(glow, (0, 0), blur)[..., None] * np.array(col, np.float32) * 0.55, 0, 255)

    return np.clip(out, 0, 255).astype(np.uint8)


ZOOM = {'ironman': (0.03, 0.29, 0.52, 0.47),
        'batcave': (0.02, 0.36, 0.55, 0.50),
        'spiderman': (0.02, 0.28, 0.55, 0.48)}
TITLE = {'ironman': 'ARMOR HALL  -  charging arc on the reactor',
         'batcave': 'BATCAVE  -  gold bar under the plate',
         'spiderman': 'WEB LAB  -  web strand filling'}

rows, W = [], 1150
for theme in ['ironman', 'batcave', 'spiderman']:
    im = hall(theme)
    cv2.imwrite(f'{ROOT}/docs/progress-{theme}.png', im)
    H, Wd = im.shape[:2]
    x, y, w, h = ZOOM[theme]
    z = im[int(H * y):int(H * (y + h)), int(Wd * x):int(Wd * (x + w))]
    z = cv2.resize(z, (W, int(W * z.shape[0] / z.shape[1])), interpolation=cv2.INTER_LANCZOS4)
    cv2.imwrite(f'{ROOT}/docs/zoom_{theme}.png', z)
    bar = np.full((44, W, 3), 18, np.uint8)
    cv2.putText(bar, TITLE[theme], (16, 30), cv2.FONT_HERSHEY_DUPLEX, 0.62, (225, 225, 235), 1, cv2.LINE_AA)
    rows += [bar, z, np.full((10, W, 3), 8, np.uint8)]

cv2.imwrite(f'{ROOT}/docs/progress-indicator-preview.png', np.vstack(rows))
print('wrote docs/progress-*.png and docs/progress-indicator-preview.png')
