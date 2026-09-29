# Asset slots

The procedural geometry and HUD graphics are generated in code. Replacement models can be supplied separately.

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

- vehicles/batmobile.glb: the user-supplied model used by the rotating centre Batcave hologram. The original model is preserved without geometric edits; it ships outside app.asar in the update ZIP. No author or licence metadata was supplied with this file. The source backup follows the requested format and excludes binary media; keep the update ZIP for this model.

## Document reader

`libraries/pdfjs/` contains the PDF.js 6.3.289 legacy build (Apache-2.0) for local text extraction. It ships outside app.asar; keep all four files together. PDF pages are read locally in a bounded worker. Only matching excerpts are sent to the configured answer model. Scanned PDFs need an OCR text copy.
