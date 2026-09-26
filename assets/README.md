# Asset slots

All built-in 3D geometry and HUD graphics are original and generated in code.

- `armor/`: self-contained GLB replacement models. Prefer importing from Settings.
- `helmet/`: future authored mechanical models; the current helmet is `src/scenes/helmet.js`.
- `environment/`: replacement environment assets; the current room is live geometry.
- `hud/`: future technical textures; the current core/schematic are SVG components.
- `audio/`: optional original `hover.wav`, `wake.wav`, `lock.wav`, `launch.wav`, `standby.wav`, `ready.wav`.
- `voice/`: optional original `startup.wav`, `ready.wav`, `standby.wav`.
- `jae/`: your Jae asset; choose it through Settings to copy it into your user profile.
- `textures/`: optimized textures for authored models.
- `transitions/`: future transparent WebM or animation assets; current transitions are live 3D transforms.
- `icons/`: included original application/tray icons.
- `wallpaper/`: standalone offline HTML used by the Lively export.

Do not delete the icon files before packaging. Empty replacement slots are intentional: every supplied feature has a code-generated fallback.
