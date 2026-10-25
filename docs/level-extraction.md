# Original level extraction

## What this module contains

`dist/js/levels.js` contains all 50 level layouts recovered from the Nokia 6300
edition of **Zwierzaki Atakują**, plus the separate tutorial variant of stage 1.
Every stage comes from its original numbered factory case. There are no fallback
layouts, procedural replacements, or guessed obstacle arrangements.

The source artifact used for this extraction is `zwierzaki-atakuja-Nokia6300.jar`
(576,441 bytes), SHA-256:

```text
e4e8d6daaefa0d690822b3188b7c974c8a93142c826953caf9b2010607c08b0c
```

The relevant source is class `c`, decompiled with CFR 0.152 and duplicate-member
renaming enabled. Its three factory methods cover:

| Original method | Stages |
| --- | --- |
| `e(int)` | 1–17 |
| `f(int)` | 18–34 |
| `g(int)` | 35–50 |

The export contains 658 rectangular pieces, 506 triangular pieces, 275 circles
(including 225 bear targets), and 80 root compound bodies across the 50 normal
stages. The first-stage tutorial adds one large bear and one small bear.

## How the extraction works

`tools/extract-levels.py` copies the factory cases and the original composite
construction helpers into a standalone Java recorder. The emitted
`tools/extract-levels.java` is also included, so extraction can be repeated without
the decompiler output. Java 17 source-file mode compiles and runs it; a separate
`javac` executable is unnecessary.

The recorder evaluates the source's loops, integer divisions, bit shifts, casts,
single-precision arithmetic, trigonometry, and construction order. Primitive
builders record the parameters and reproduce their initial geometry. Compound
builders retain child membership, compute the source's mass-weighted center, and
apply its rotations and translations. The final serializer subtracts the original
world offset only after those operations.

The recorder's main method initializes only the data needed by a factory and
serializes the resulting geometry. It does not start the original MIDlet.

The decompiled source needed the following explicit repairs:

1. The three switches were split into one method per numbered case. Missing
   local-variable declarations were restored using their source operations.
2. CFR's shared jump from stage 15 to the compound-finalization statement also
   used by stage 17 was replaced by that exact finalization call and a return.
3. Temporary-variable reuse as a point and later as a compound in stage 10 was
   separated into two variables. Stage 43's vector/compound reuse was separated
   similarly.
4. Erased `Vector<E>` generics were removed. Returns through `Object` gained their
   explicit `z` cast.
5. A helper whose boolean parameter's local slot was later reused as a loop
   integer was given separate boolean and integer variables.
6. CFR moved a cliff helper's unconditional width division into the second arm
   of a ternary expression. The original bytecode for
   `c.a(Vector,int,int,int,boolean,int)` divides width and height by 32 at offsets
   14–23, before the type branch at offsets 37–49. The recorder restores that
   order. Without this correction, type-zero cliffs would be 32 times too wide,
   including a cliff that incorrectly blocked stage 44's launcher.

Repairs 1–5 affect decompiler syntax and local storage; repair 6 restores the
arithmetic order verified against the original bytecode. Level constants,
branch conditions, factory calls, and compound membership remain those of the
source.

## Module API

```js
import { LEVELS, LEVEL_COUNT, getLevel } from './js/levels.js';

const stage = getLevel(1);                  // Normal stage: two bears.
const tutorial = getLevel(1, { tutorial: true }); // Original extra tutorial bears.
```

`LEVEL_COUNT` is 50. `LEVELS` holds the normal definitions in ID order.
`getLevel` returns an independent deep clone suitable for simulation; it rejects
noninteger IDs and IDs outside 1–50 with `RangeError`. Tutorial selection changes
only stage 1. Consumers should use `getLevel` before mutating level data.

### Coordinate convention

- X increases rightward; Y increases downward.
- The ground is the horizontal plane `y = 0`, with normal `[0, -1]`.
- The reference center of the target structure is `x = 0`.
- Units are the original logical game units, based on a 320 × 240 landscape view.
- Angles are radians. Positive rotation follows the screen-coordinate convention.

The source chooses `v.a = screenHeight / 240`. For the preserved Nokia edition,
the game rotates its logical view to 320 × 240, so that scale is 1. Its object
builders add `(160, 120)`, then the level helpers add the floor offset `aw = 94`.
The export therefore subtracts `(160, 214)` from final world positions.

**Compound children already have world-coordinate positions and angles.** Their
`childrenCoordinates` property is `"world"`. Do not add a parent's position to a
child a second time. A physics engine can derive local child offsets from the
parent's position and angle when constructing its rigid aggregate.

### Stage fields

| Field | Meaning |
| --- | --- |
| `id` | Original level number, 1–50 |
| `ammo` | Original animal IDs in firing order |
| `launcher` | Ground-relative pivot, initial projectile offset, pedestal height, radius, speed multiplier |
| `ground` | Ground plane at Y = 0 |
| `bodies` | Primitive root bodies, including targets |
| `compounds` | Root rigid aggregates and their children |
| `camera` | Original six-argument camera setup and any alternate focus |
| `boss` | Original barrel reference and initial bombing parameters, or null |
| `sourceFlags` | Original per-stage flags and drawing-pattern selection |
| `sourceMaxPoints` | Points registered while constructing the original stage |
| `sourceLogicalSize` | `[320, 240]` |
| `sourceWorldOffset` | `[160, 214]` |
| `provenance` | Original factory method, case number, and edition |

`camera.sourceBounds`, `camera.focus`, and `camera.secondaryFocus` retain the
source camera coordinate system; they are not physical walls. Their original
construction arguments remain in `camera.sourceArgs`.

### Bodies

All bodies include `id`, `kind`, `x`, `y`, `angle`, `mass`, `requestedMass`,
`canTranslate`, `canRotate`, `material`, `isTarget`, and `sourceArgs`.

| Kind | Additional fields |
| --- | --- |
| `box` | `width`, `height` |
| `circle` | `radius`; targets also have `targetSize: "big"` or `"small"` |
| `triangle` | Three centroid-relative `vertices` and unchanged `sourceVertices` |
| `compound` | `children`, `childrenCoordinates: "world"` |

`requestedMass` preserves the factory argument. Where an original rectangular or
triangular builder receives zero, it calculates mass from area with the original
factor `0.0011111111f`; the resulting value is in `mass`.

The source independently enables translation and rotation. A piece with both
disabled is static. For compounds, the parent controls aggregate motion. Child
flags are retained as provenance and should not override the parent's rigid-body
mode while attached.

The source's regular triangle helper places the **bounding-box center**, rather
than the centroid, at the requested coordinates. Its integer bounding-box center
uses `min + (max - min) / 2`, with Java integer division. Exported `x,y` are the
resulting center of mass; `vertices` are relative to that center. A separate radial
triangle helper used in stage 9 places the centroid directly; its records carry
`trianglePlacement: "centroid"`.

Materials retain their numerical source IDs: 0–3 for construction pieces, 4 for
bear targets. The export does not infer material names from appearance.
`sourceCircleStyle`, `decoration`, `alternateStyle`, and `sourceBoxStyle` preserve
rendering parameters when present. `pattern8` denotes the pattern selected by
`aa.x()`; it does not imply an extra gameplay ability.

### Ammunition

| ID | Original asset prefix | Animal |
| --- | --- | --- |
| 0 | `char_squirrel` | Squirrel |
| 1 | `char_skunk` | Skunk |
| 2 | `char_turtle` | Turtle |
| 3 | `char_hedgehog` | Hedgehog |
| 4 | `char_rabbit` | Rabbit |

The five-count helper accepts `(skunks, rabbits, turtles, squirrels, hedgehogs)`
but enqueues them in reverse parameter order. Several later levels call `h(id)`
explicitly to select a different order. The exported `ammo` array preserves both
forms exactly.

### Launcher and special stages

The normal launcher has four pedestal sections. Its original source pivot is
`(-640, 114)` for the default 1066-unit world width; normalization gives
`(-800, -100)`. The resting projectile is eight units above the pivot. Individual
levels can change the world width or pedestal sections, and these change the
exported launcher coordinates. They must not be replaced with one global spawn
position.

The original launcher speed multiplier is 11. Levels 28 and 29 call the original
method that changes it to 12; this is exported as `launcher.speedMultiplier`.

Levels 10, 20, 30, 40, and 50 have an opposing cannon. `boss.barrelBodyId` identifies
the actual barrel piece, including when it is a child of a compound.
`boss.muzzleDistance` is the original offset along that barrel. The initial shot
parameters are:

| Stage | Base shot speed | Random speed range | Muzzle distance |
| --- | ---: | ---: | ---: |
| 10 | 370 | 80 | 50 |
| 20 | 400 | 120 | 60 |
| 30 | 420 | 80 | 100 |
| 40 | 340 | 120 | 20 |
| 50 | 315 | 120 | 30 |

The source draws a speed from `base - range/2 + random(range)`. Its bombing phase
uses projectile radii 5 and 2. Initial volley count 3 is retained in the metadata.
This metadata describes the original setup; implementing the full timing,
targeting, impact, and later volley transitions remains the game runtime's job.

The flags `c`, `d`, `e`, and `f` in `sourceFlags` retain their original names to
avoid invented meanings. `c` selects the compound-aware source collision mode;
the other flags participate in camera positioning and framing branches. They are
not additional fabricated obstacles or forces.

## Reproduce and verify

From the project root:

```sh
python tools/extract-levels.py
node tests/levels.test.mjs
```

If the decompiler output is available, pass its renamed `c.java` explicitly:

```sh
python tools/extract-levels.py --source /absolute/path/to/nokia-renamed/c.java
```

Without that file, the script runs the bundled standalone Java recorder. Java 17
or later and Python 3 are required for extraction; the exported browser module
has neither runtime dependency.

The tests were written against hand-transcribed source facts before producing
the module. They check all 50 IDs, valid finite body geometry, target presence,
ammunition, unique body IDs, exact first-stage beams and bears, first-stage roof
placement, tutorial separation, compound preservation, all five boss barrel
references, independent clones, and invalid-stage rejection.
They also pin the cannon's subtractive point offsets in stage 10 and the
bytecode-verified cliff dimensions in stage 44.

The runtime campaign smoke test is available separately:

```sh
node tools/smoke-campaign.mjs
```

It plays stage 1 through real `aim`, `fire`, and `update` calls: three launches
at aim step −6 (27° upward) and power index −19 (95%) remove both bears and
finish the stage. The verified result is 140 points and a gold medal. It then
launches an animal in every stage, advances 120 fixed simulation ticks, and
checks all body positions, velocities, rotations, masses, and gameplay timers
for finite values. The seeded run exercises all five opening boss turns and
42 animal abilities. This is a simulation smoke check for all 50 layouts;
completion was verified only for stage 1. A separate regression confirms that
stage 44's animal clears its launcher before encountering the distant cliffs.

## Accuracy boundary

These files recover initial layout data and construction metadata. They do not
claim that a new browser physics engine reproduces every original simulation
frame. The original midair abilities, collision solver, destruction, scoring,
boss timing, and camera transitions must be checked in the runtime separately.
The decompiler's structural repairs and the recorder's primitive/compound
construction code are included so those decisions can be reviewed.
