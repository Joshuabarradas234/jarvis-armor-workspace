# Suit showcase and visual calibration

Open the sliders icon in the hall's top toolbar ("Calibrate halls, suits and holograms"). Choose a suit. Drag the outlined pod to move it, or its corner to resize it. Drag its label, the centre hologram or the centre label. Height fill and Width fill change uniform fitting: body proportions are never stretched. The fit stops at whichever limit the model reaches first, including wide shoulders and accessories.

Inspect eyes opens the glass and zooms into the chosen suit. Drag either eye handle to move that suit's light pair; use horizontal, vertical, depth and size controls for precise adjustment. The pair moves together. These controls do not redraw individual lens outlines; replacing a model with a different face still requires new outlines in suit-eyes.js and the maintenance bake script.

Preview entry runs a temporary entry without launching the workstation. Movement strength controls the full-body turn and forward movement, or the strength of a suitable authored animation clip when the replacement model supplies one. Undo, Reset suit and Reset hall affect the preview. Save calibration commits it locally. Close or Escape discards changes made since the last save. The editor moves to the opposite side for right-hand suits. Layout changes are stored separately in hall-calibration.json in the app's existing user-data folder, using the existing atomic-write helper. They do not rewrite the shipped artwork or workstation names. Only trusted main/settings windows can save through IPC; unknown IDs, fields and invalid numeric bounds are rejected.

## Proportions and centre displays

All 21 models target 97% of available chamber height, constrained to 96% of clear width. Mark One and Hulkbuster now have wider physical openings in the Iron Man artwork; the Batcave has taller clear interiors and a wider centre chamber. Hulkbuster stays visibly larger than the neighbouring standard armour. Capes, weapons and mechanical spider arms count towards the fit. Spider-Ham's unusual two-figure composition is part of the supplied model and is preserved.

Centre displays have independent calibrated boxes, with their bases on the centre dais. Version 1.81.1 increases their visible size; they fade when hovering a pod they overlap and pause during suit entry. The Batmobile video is cropped within its box to remove excess black margins while retaining vehicle proportions; the Iron Man projection is seated higher on its dais. The editor can adjust these placements for replacement media. Existing centre videos have not been reauthored at higher resolution.

## Graphics and sound

The existing Quality, Frame rate, Reduce graphics on battery and Animations controls now feed a common budget. Suit resolution, texture anisotropy, close-up supersampling and scan/pulse effects follow it. Close-ups use a larger backing buffer, capped at 4.2 / 5 / 6.5 / 8.3 million pixels for low / medium / high / ultra; steady views retain the smaller 1.2 / 2.2 / 4.2 / 8.3 million pixel limits. Battery reduction selects low and 15 FPS, while keeping entry movement, glass travel and eye lights available. It no longer silently enables still mode. Tower, floor and second-screen scenes also follow the quality/frame-rate budget and suspend drawing while hidden. Still/reduced motion suppresses their decorative motion.

Ambient centre videos pause when the hall is hidden, covered, still or inside a workstation. Battery/15-FPS mode uses half-speed video playback; native video decoding is not controlled by the WebGL frame-rate cap. This is not a guarantee of the same measured FPS on every GPU.

Each family has a soft latch, a smooth airy glass slide and a light icy power-up chime, plus a closing latch. Batman is lower pitched; Spider-Man is lighter. The modulated servo rattle and overlapping old launch tone are removed. These effects follow the existing Master and Mechanical sliders, await the audio context on first or voice-triggered entry, stop when muted/hidden, and do not restart on duplicate snapshots. Preview sound uses those same volumes. General audio buses start at their saved volume, preventing a brief burst when initially muted. Hardware speaker balance has not been subjectively checked.

Iron Man entry includes white-blue eye bloom, a stronger reactor charge and a brief expanding cyan ring. Batman and Spider-Man have a bat-symbol projection and web-pattern activation sweep. These cues remain bounded to the selected case; still/reduced motion suppresses their animated pulses and projections.

## Rigs and source detail: exact limits

The 21 supplied GLBs have no skeletons or clips, and every embedded texture inspected is 1024 × 1024. Their original files are not modified or redistributed in this package.

Version 1.81.1 removes the automatically guessed display skeletons because they could stretch arms, fingers and accessories. Static models keep their original vertices and move as a single object, with small family-specific turns and forward movement. This is a restrained presentation movement, not a jointed crouch or arm raise. Set Movement strength to zero to disable it for a suit.

Full signature performances need properly rigged GLBs with authored skin weights and clips. The loader supports matching clips named with repulsor / guard / crouch / web / activate / entry as appropriate, and never invents a skeleton. Recalibrate eye surfaces and validate every replacement model before use.

The approved Web Lab scene has a new native 2430 × 1440 render (2.25 times the pixels of its previous 1620 × 960 plate). It keeps the original camera and materials, using Eevee at eight samples without ray tracing to complete within the renderer's time limit. Iron Man and Batman have refined chamber geometry/materials at native 1630 × 965. They are not 4K images. Anisotropic filtering and supersampling improve the existing models' presentation; they do not invent new texture detail. Genuine higher-resolution suit detail needs better UV-aligned colour, normal and roughness maps or higher-quality replacement models.

## Verification

See RELEASE-1.81.1.md for the completed test counts and package size. The frontend suite covers timing, late loading, battery behaviour, mute and audio-context resumption, eye surfaces, authored-clip selection, fitting and calibration. The Windows native suite loads the built app.asar through the actual main process and protected preload in a fresh test profile. It checks all 21 installed models, unchanged vertex hashes, visible lit eye pixels, glass movement, close-up zoom, entry/return, transition video playback, reduced motion and master mute.

The installed app, its profile and the protected source files are unchanged. Physical speaker balance, live Windows voice/hand input, physical multiple monitors, live accounts and an in-place install/rollback are not exercised by the automated checks. The native runner uses the existing Control Deck on 127.0.0.1; no public or debugging port is added.
