# Suit glass, eye lights and activation

Clicking a suit, pressing Enter on its label, or receiving the existing selection snapshot runs the same sequence. Both glass leaves unlock, slide apart and pivot outwards. Their frames and light reflections remain visible while open. The suit's eye surfaces illuminate during the zoom, followed by a small, smooth full-body turn, a short scan and a floor-light pulse. Returning to the hall closes the glass and resets the light and stance.

The existing three-second SUIT_SELECTED and 2.2-second RETURNING state-machine durations are unchanged. Repeated snapshots do not restart entry. Reduced motion and the app's still setting show the open state and eye lights directly, without the scan, pose motion or zoom. The full-screen selection flash is suppressed when the real 3D entry is available. Selection can arrive before a model finishes loading after a hall switch; the renderer reconciles the fitted-eye overlay and zoom as soon as the selected model and stage are ready, without waiting for another snapshot. Late models catch up to the current entry time. Battery mode lowers the frame rate without disabling entry. Still/reduced motion continues to opt out of camera and suit movement.

## Models and movement

The supplied GLBs are static. Version 1.81.1 keeps their geometry intact and removes the automatically guessed skeletons that could stretch limbs. Small full-body turns and forward movement use the original proportions; Spider-Ham keeps both figures. Properly rigged replacement models can use supported authored clips. Eyes follow the static pivot or an authored head bone. See SHOWCASE-CALIBRATION.md for the exact limitations, model requirements, performance controls and editor instructions.

## Eye calibration

dist/assets/suit-eyes.js stores 44 individually fitted eye surfaces for all 21 models, including both visible pairs on the Spider-Ham asset. Coordinates use the renderer's normalisation: height 1, feet at y=0, centred x/z. They were picked on the actual meshes and baked into curved surface triangles, slightly offset to avoid flicker. Depth testing hides the far eye behind the head; attaching the meshes to the head bone (or static suit pivot) makes them follow its pose, turn and lean. There are no screen-space eye dots.

The outlines are specific to these GLBs. Replacing a model requires new eye calibration, even if its suit ID stays the same. The offline maintenance command is node scripts/bake-eye-surfaces.mjs; it requires the project's existing dist/vendor/three files and external assets/suits. JARVIS_ASSETS may point at the external asset root. This command resamples the existing outlines onto the meshes; it does not find eye sockets automatically. Manually update the outlines first for a different model, then inspect the result from the front and both sides. No raycasting or baking is performed per animation frame.

## Validation

Run node --experimental-vm-modules --test tests/frontend/*.test.mjs from the project root. Tests cover entry/return timing with the real state machine, duplicate snapshots, interruption, reduced motion, all eye data, graphics disposal and end-pod zoom bounds. The native Windows suite in tests/visual uses real IPC, the packaged app and all 21 installed GLBs, including GPU eye-pixel checks and unchanged geometry hashes. It uses a fresh profile. The Windows voice recogniser and hand tracking are not exercised.

For packaged validation: enter one suit in each hall and both end pods; watch both doors while zooming; check both eye lenses; return and immediately enter another suit; change hall repeatedly; try keyboard selection and still/reduced-motion settings. Check all model-specific eyes again if replacing any GLB.
