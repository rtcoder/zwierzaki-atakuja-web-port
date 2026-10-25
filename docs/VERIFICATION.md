# Verification — 2026-10-25

## AI runtime integration

- Final `npm test`: 71/71 passed. `npm run check` and `git diff --check` passed.
  Runtime PNGs total 15,541,314 bytes; decoded RGBA totals 88,956,032 bytes.
- All six bear blink derivatives match their base SHA and renderer offsets;
  open/closed pairs were visually inspected. Grass now has identical RGBA
  at both horizontal edges, and the corrected stage 31 was inspected in a
  fresh browser load. No console errors or warnings appeared.
- All 105 approved candidates still match the pre-integration inventory SHA.
- Approved artwork is packaged as 105 runtime PNGs at exact original dimensions
  ×4. Collision dimensions, pivots, glyph advances and animation cells remain
  unchanged. Original SHA-256 values and candidate provenance are checked.
- Desktop browser inspected stages 2, 11, 21, 31 and 41 across all five themes.
  Turtle boost, squirrel cone and hedgehog spine abilities were activated via
  the actual UI. Pause/resume, restart and stage selection were exercised.
- At 390×844, three real 27° / 95% button-triggered shots completed stage 1
  with 140 points and three stars. Restart and both camera modes worked.
  The document remained 390px wide with no horizontal overflow or broken DOM
  images. Browser console reported no errors or warnings in this sequence.
- Screenshots: `screenshots/assets-ai-mobile.png`, `assets-ai-mobile-win.png`
  and `assets-ai-desktop.png`. This is responsive browser coverage, not a test
  on physical Android/iOS hardware.
- Build/QA provenance: `assets-ai/runtime-report.json` and
  `assets-ai/runtime-qa/`. Source archives and approved candidates are preserved.

## Previous phase: faithful 4× asset refresh

- All 105 originals copied byte-for-byte to `assets-original/`, verified against
  their original SHA-256 hashes. All 105 runtime images now decode as PNG at
  exactly 4× original width and height; logical dimensions remain unchanged.
- Runtime images total 11,504,943 bytes; originals total 396,425 bytes.
- Re-running `tools/enhance-assets.py` produced byte-identical metadata and
  runtime module; `npm run check` then verified every generated image hash.
- Renderer regressions cover 54×54 sprite destinations, physical explosion
  frame crops, font source crops/advances, tree size and grass tiling.
- Local browser verification completed stage 1 through three actual button
  presses, reaching 140 points and three stars. Reload resumed at stage 2.
- Desktop and 390×844 viewport screenshots confirm sprite/scenery proportions
  and HUD layout. A fresh mobile load selects the follow camera. No warnings
  or errors were reported by the browser console during the tested sequence.
- Before/after and browser evidence: `screenshots/assets-4x-comparison.jpg`,
  `assets-4x-desktop.jpg`, `assets-4x-mobile.jpg`, `assets-4x-mobile-win.jpg`.

The sections below record the initial port verification before the 4× refresh.

## Automated

- `node --test tests/*.test.mjs`: seven test files passed, zero failures.
- `node tools/check-project.mjs`: all 105 encoded images still match the JAR
  entry SHA-256 values (396,425 image bytes total); all 50 destruction-score
  pools match source values; JavaScript syntax and HTML asset references pass.
- Campaign smoke instantiates all 50 original stages, runs actual launches,
  uses abilities when available, and checks 120 fixed updates per stage.
  Positions, velocities, angles, masses and vertices stay finite.
- A regression plays stage 1 with three actual 27° / 95% shots. It reaches
  `won`, no remaining bears, 140 points and a gold medal / three stars.
- Recovered geometry regressions cover the original first stage, tutorial
  additions, compound membership, stage 10 vector subtraction and stage 44's
  unconditional width division in the original bytecode.

## Browser observations

Tested the managed Sites preview in Chrome through actual UI input.

- Original images load; no application errors appeared in console inspection.
- Start, fire, damage, score updates and result overlay work in a desktop view.
- Three button-triggered shots completed stage 1 with 140 points and three
  stars. Reloading subsequently offered continuation at stage 2; the map kept
  stage 1's 140-point record.
- At a 390 × 844 CSS-pixel iframe viewport, the page fits horizontally:
  body `clientWidth=scrollWidth=390`. Height was 798 CSS pixels.
- Mobile starts with the follow camera so the original sprites remain readable.
- Native range-key input changed elevation from 27° to 31.5°.
- Stage 2's turtle launches and its ability button can be activated.
- Pause presents a visible resume overlay and disables launch/aim controls.
- The level selector exposes all 50 stages, records and cannon-stage labels.
- Stage 50 starts its cannon turn with three launcher lives. Its ten-animal
  queue initially overflowed the small HUD; a horizontally scrollable queue
  corrected the topbar to `clientWidth=scrollWidth=364` inside the 390px view.

Screenshots are retained in `docs/screenshots/`. The temporary iframe test
fixture was removed from deployable assets after verification.

## Scope of evidence

The first stage was completed through both the headless Game API and browser UI.
The other stages were checked for initial data, launch/ability behavior and
finite simulation; this is not proof that every stage can be completed.

Responsive browser testing is not a physical-device Android/iOS test. The
original J2ME program was not run side by side, so these checks do not establish
frame-by-frame parity. See `physics.md`, `RULES.md` and `level-extraction.md` for
specific reconstructed portions and source-based repairs.
