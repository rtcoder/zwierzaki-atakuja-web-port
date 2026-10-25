# Verification — 2026-10-25

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
