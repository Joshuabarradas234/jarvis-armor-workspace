# Full-body cold mist reveal

The full-body mist was packaged and installed as 1.82.1 on 28 September 2026 after the owner chose to proceed. Version 1.82.2 refines its texture and adds a pressure-release sound; see RELEASE-1.82.2.md for the current package.

## What changes

- Opening a case releases a dense, pale cold cloud from the seals, covering the suit before revealing it.
- The cloud starts after the glass unlatches, fills the case around 0.6–1 second, and clears by 2.25 seconds, within the existing three-second entry.
- Battery and low-quality modes retain full-body coverage with four layers. Medium uses six; high and ultra use eight.
- Vapour draws in front of projecting armour, capes and accessories. Suit proportions, eye positions, sounds and poses are unchanged.
- Reduced motion, disabled animations and the still-hall setting continue to suppress it. Returning to the hall cancels it; models that load late join the existing timing rather than restarting the burst.

## Checks

- All 93 runtime JavaScript syntax checks passed.
- Frontend tests: 91 passed, 0 failed.
- Core tests: offline dependency installation succeeded; 121 passed, 0 failed. External Claude and Twilio services were mocked.
- Browser preview used the actual hall renderer, all 21 local suit models and mock workspace data. All 21 passed rendered pixel checks for full-body coverage in low/high modes, clearing, reduced motion and return cancellation. The burst affected 56,090–62,623 pixels in the low-quality 256 × 512 test renders, including upper, middle and lower regions; clearing left no mist pixels.
- Peak, clearing and clear frames were inspected in the browser. The supplied recording was also opened locally: the existing case-opening effect does not provide a prominent full-body cloud.
- Updated the tests' former ankle-height/1.24-second expectations deliberately to match the requested full-body reveal. The test harness waits for the hall to finish returning before selecting another suit and allows a 1% pixel-count tolerance for shader rounding.
- Native packaged-app visual testing and installation of this change are not complete. The Windows drop-in archive is checked separately during packaging.

## JARVIS's own updates

The supplied screenshot reports the tab-list crash fix as installed, awaiting restart. It reports the wallpaper fix as deferred for rebuilding on the current version; the green Done badge is not evidence that the wallpaper fix is active.

Windows refused reads of the self-update folder even after the read-access request. Consequently the exact self-update code, boot state and successful activation could not be verified. At the source-review stage the installed application and self-update manifests were unchanged. The owner subsequently authorised installation of the new base build, accepting that older self-updates would be set aside. The protected source files and build settings are unchanged. The package version is deliberately raised to 1.82.1.

The 1.82.1 ZIP is a proper resources update; the earlier changed-files ZIP was only a source patch. Installing a new base build can set aside older self-updates. The exact approved self-update code remains unreadable, so it has not been incorporated. The owner chose to proceed with 1.82.1 installation; the old fixes must not be described as verified or active. Do not copy source files into a self-update folder or alter its manifest manually.

## Files changed

- `dist/assets/case-mist.js`: the stronger full-body cloud and reveal.
- `tests/frontend/case-mist.test.mjs`: coverage, timing, budgets and cancellation checks.
- `tests/visual/mist-suite.mjs`: rendered coverage and updated timing checks.
- `docs/REVIEW-1.70.md`: review record.
- `docs/COLD-MIST-REVEAL.md`: these notes.
