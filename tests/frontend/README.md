# Hall and graphics regression tests

From the repository root, with Node 22 or newer:

```sh
node --experimental-vm-modules --test tests/frontend/*.test.mjs
```

56 tests cover stale image/GLTF loads, retry, graphics resource disposal, escaped labels, all 21 pod bounds at five aspect ratios, saved workspace names, glass entry/return, interruption, duplicate snapshots, reduced motion, all 44 fitted eye surfaces edge-pod zoom framing and ambient-video playback eligibility (visible overview, covered panels, still mode and reduced motion). The real WorkspaceMachine is exercised with a deterministic clock. Additional checks cover validated atomic calibration persistence, uniform size fitting, close-up pixel limits, all graphics budgets, subscription teardown, and mechanical-audio scheduling, duplicate suppression, cancellation, mute and hidden states.

No npm packages or network access are required. The VM flag executes shipped browser modules with image/Three.js stand-ins; it does not emulate a GPU. The geometry tests execute the bundled ArmorHall class at 1920×1080, 1440×900, 1280×720, 800×600 and 600×900.

Browser review used actual local GLB models and centre media in an isolated renderer with mocked IPC. Check every hall after packaging: seven complete pods, aligned labels and clicks, correct eye outlines, visible opening/closing glass, centre display clear of suits, selection by mouse/keyboard, return and rapid theme changes. Windows voice, hands and multiple physical screens need a packaged-app check. See docs/SUIT-ENTRY.md for model limitations and calibration.
