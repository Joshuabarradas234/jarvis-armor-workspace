# Suit showcase and visual calibration

Open the sliders icon in the hall's top toolbar ("Calibrate halls, suits and holograms"). Choose a suit. Drag the outlined pod to move it, or its corner to resize it. Drag its label, the centre hologram or the centre label. Height fill and Width fill change uniform fitting: body proportions are never stretched. The fit stops at whichever limit the model reaches first, including wide shoulders and accessories.

Inspect eyes opens the glass and zooms into the chosen suit. Drag either eye handle to move that suit's light pair; use horizontal, vertical, depth and size controls for precise adjustment. The pair moves together. These controls do not redraw individual lens outlines; replacing a model with a different face still requires new outlines in suit-eyes.js and the maintenance bake script.

Preview entry runs a temporary entry without launching the workstation. Pose strength controls its limb articulation. Undo, Reset suit and Reset hall affect the preview. Save calibration commits it locally. Close or Escape discards changes made since the last save. The editor moves to the opposite side for right-hand suits. Layout changes are stored separately in hall-calibration.json in the app's existing user-data folder, using the existing atomic-write helper. They do not rewrite the shipped artwork or workstation names. Only trusted main/settings windows can save through IPC; unknown IDs, fields and invalid numeric bounds are rejected.

## Proportions and centre displays

All 21 models target 97% of available chamber height, constrained to 96% of clear width. Mark One and Hulkbuster now have wider physical openings in the Iron Man artwork; the Batcave has taller clear interiors and a wider centre chamber. Hulkbuster stays visibly larger than the neighbouring standard armour. Capes, weapons and mechanical spider arms count towards the fit. Spider-Ham's unusual two-figure composition is part of the supplied model and is preserved.

Centre displays have independent calibrated boxes and labels below the suits. The Batmobile video is cropped within its box to remove excess black margins while retaining vehicle proportions; the Iron Man projection is seated higher on its dais. The editor can adjust these placements for replacement media. Existing centre videos have not been reauthored at higher resolution.

## Graphics and sound

The existing Quality, Frame rate, Reduce graphics on battery and Animations controls now feed a common budget. Suit resolution, texture anisotropy, close-up supersampling and scan/pulse effects follow it. Close-ups use a stable larger backing buffer, capped at 1.2 / 2.2 / 4.2 / 8.3 million pixels for low / medium / high / ultra. Low avoids supersampling. Battery reduction selects low and 15 FPS. Tower, floor and second-screen scenes also follow the quality/frame-rate budget and suspend drawing while hidden. Still/reduced motion suppresses their decorative motion.

Ambient centre videos pause when the hall is hidden, covered, still or inside a workstation. Battery/15-FPS mode uses half-speed video playback; native video decoding is not controlled by the WebGL frame-rate cap. This is not a guarantee of the same measured FPS on every GPU.

Each family has synthesised latch, glass-servo and power-up cues, plus a closing latch. Batman is lower pitched; Spider-Man is lighter. They follow the existing Master and Mechanical volume sliders, stop when muted/hidden, and do not restart on duplicate snapshots. Preview sound uses those same volumes. The existing general launch sound remains available. Hardware speaker balance and packaged-app autoplay still need their normal local check.

## Rigs and source detail: exact limits

The 21 supplied GLBs have no skeletons or clips, and every embedded texture inspected is 1024 × 1024. Their original files are not modified or redistributed in this package.

Twenty models now receive lightweight runtime display skeletons and approximate skin weights. They support restrained Batman arm bracing, Spider-Man knee/hip flexion and an Iron Man arm raise. Capes/back panels and mechanical spider arms remain with the torso to limit distortion. Eyes follow the head bone and arc-reactor lights follow the chest. Spider-Ham is excluded because its single mesh contains two separate figures. Set Pose strength to zero for a particular suit if preferred.

These are approximate display rigs, not artist-authored character rigs. They cannot open a sculpted fist, provide precise finger animation, simulate cloth or produce a convincing deep crouch on every sculpture. Full signature performances still need suitable rigged GLBs with skin weights and clips. The loader now prefers clips named with repulsor / guard / crouch / web / activate / entry as appropriate. Existing skinned models are not automatically re-rigged. Recalibrate eye surfaces and validate every replacement model before use.

The approved Web Lab scene has a new native 2430 × 1440 render (2.25 times the pixels of its previous 1620 × 960 plate). It keeps the original camera and materials, using Eevee at eight samples without ray tracing to complete within the renderer's time limit. Iron Man and Batman have refined chamber geometry/materials at native 1630 × 965. They are not 4K images. Anisotropic filtering and supersampling improve the existing models' presentation; they do not invent new texture detail. Genuine higher-resolution suit detail needs better UV-aligned colour, normal and roughness maps or higher-quality replacement models.

## Verification

56 frontend regression tests pass, including atomic calibration persistence, malformed data, all 21 pod targets at five viewport shapes, bounded fitting, graphics settings, audio scheduling/cancellation, fitted eyes and entry state transitions. Core's 121 tests pass twice with local IMAP/SMTP and mocked services. Every changed script is syntax-checked.

An additional offline geometry check used the real 20 GLBs and Three.js: rest-pose vertex alignment, finite posed vertices, return to rest and foot placement independent of parent transforms all passed. Visual checks used the real local models and centre videos with mock IPC: three hall layouts, wide armour, all three pose families, open glass, eye inspection, editor save/undo/reset/close, and graphics settings. These checks do not certify production-quality skinning from every angle.

The installed application/profile and protected files remain untouched. Version 1.81.0 has now been built and its archive size verified; see RELEASE-1.81.0.md. Packaged Electron boot/UI, real Windows voice/hand input, physical multiple monitors, hardware audio mixing and live accounts remain untested.
