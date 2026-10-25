# Physics implementation and fidelity

`dist/js/physics.js` is an ES module with no external dependencies or browser APIs. It uses the recovered game's body equations and impulse-solver parameters. The narrow phase and bookkeeping are reconstructed JavaScript implementations, not a claim of byte-for-byte or trajectory-identical emulation.

## Source correspondence

The reference is the Nokia 6300 version 1.5 JAR, SHA-256 `e4e8d6daaefa0d690822b3188b7c974c8a93142c826953caf9b2010607c08b0c`. The working analysis sources are in `/tmp/zwierzaki-recon/nokia-renamed`, produced by CFR 0.152 with duplicate-member and illegal-identifier renaming. They are analysis inputs, not runtime assets.

| Original class/method | Browser implementation |
| --- | --- |
| `q`, `p`, `o` | Vector, rotation, projection, and scalar helpers |
| `v.a(float,q)`, `v.b(float)`, `v.c(float)`, `v.d(float)` | Velocity-first integration and separate penetration-correction velocities |
| `aa`, `ad`, `af` constructors | Rectangle, circle, and triangle mass/inertia |
| `z` | Shared dynamics and center of mass for compound children |
| `am.a(z)`, `x` | Initial child connectivity and splitting into connected components |
| `aj` | Contact anchors, relative velocity, and cached impulses |
| `ai.a(aj[],int,float)` | Effective contact masses, penetration bias, warm start, circle drag |
| `ai.a(aj[],int)` | Iterative normal, split-correction, and friction impulses |
| `aw`–`be`, `av` | Convex contact generation, reconstructed with closest-feature tests and clipped manifolds |
| `bf`, `bg`, `c.A()` | Contact generation, integration, solving, and geometry refresh |

The uninitialized temporary in CFR's `ai.a(aj[],int)` was checked against the actual class bytecode. At offsets 254–258, the normal-impulse delta is duplicated, stored in local 6, and passed to `Math.abs`; local 5 supplies the split-impulse delta. The convergence comparisons therefore apply to those two deltas.

## Public API

```js
import { PhysicsWorld } from './physics.js';

const world = new PhysicsWorld({ gravity: 200, iterations: 10 });
const ground = world.addGround(0);
const body = world.add({
  id: 'beam', kind: 'box', x: 0, y: -40, angle: 0,
  width: 60, height: 10, mass: 1,
  canTranslate: true, canRotate: true, material: 0
});
world.applyImpulse(body, 10, 0, body.x, body.y - 5);
const contacts = world.step(0.05);
world.remove(body);
```

During the flight phase, `world.step(0.05, { activeBodies: new Set(projectiles) })` advances only the listed roots. Child entries are resolved to their parent roots. Inactive roots receive no gravity and do not integrate their poses. Contacts are considered only when at least one root is active; a struck inactive body can receive solver momentum, ready for full-world settling on the following tick. Omit the second argument for normal full-world stepping. This represents the original separation between animal flight and whole-structure settling.

`world.bodies` contains top-level bodies and grounds. Supported shape kinds are `box`, `circle`, `triangle`, `compound`, and the internally created `ground`.

Each body has public `x`, `y`, `angle`, `vx`, `vy`, and `angularVelocity`. Arbitrary input metadata such as `material`, `isTarget`, `targetSize`, and source identifiers is retained. Primitive polygons also expose `verticesWorld`; their `vertices` are local to their center of mass. Circles expose `radius`.

Triangle input accepts three `{x,y}` points or three `[x,y]` pairs, already local to the original centroid. The module does not move them to a new centroid or interpret their placement as a bounding-box center: the level recorder has already performed that conversion.

Compound input contains primitive `children` with **world-coordinate** positions and angles. The parent center of mass is calculated from those positions exactly once. Children retain their identities, expose `parent`, and have their public world poses and instantaneous point velocities refreshed after every step. `applyImpulse(child, ...)` applies its impulse to the compound at the requested point; the default point is the addressed child's center.

Calling `remove(child)` partitions the surviving initial connection graph. Connected children stay in a rigid section; severed sections separate. Surviving child objects keep their identity and metadata. New section velocities follow the previous compound's instantaneous rigid motion. Removing a section's ground support can release an originally fixed compound. `remove(parent)` removes the complete assembly.

### Collision events

One event is returned per colliding primitive pair, including primitive children of compounds:

```js
{
  a, b,
  impulse,
  relativeSpeed,
  relativeNormalSpeed,
  normal: { x, y },
  point: { x, y }
}
```

- `normal` is unit length and points **from B toward A**.
- `impulse` is the sum of solved, accumulated normal impulses across the pair's contact points. It includes support impulses at rest; it is not the original damage argument.
- `relativeSpeed` is the maximum approaching normal speed, clamped to zero for separating contacts.
- `relativeNormalSpeed` is the maximum **absolute** normal relative velocity at the contact points, including angular motion, sampled **before the force update and solver**. Original `aj` passes this speed to the damage callbacks; game damage should use this field.
- `point` is the mean contact position for the pair. It is informational; the solver retains its separate anchors on each body.

Events are emitted while a contact remains present, not only on the first frame. The game owns damage, health, scoring, particle lifetime, and destruction decisions.

### Non-solving projectiles

`sensor: true` keeps normal ballistic motion but excludes that body's contacts from impulse solving and penetration correction. Events still report contact geometry and pre-solve speed. This represents the original TYPE6 cone/spine particles: the original collision routines call damage and retire the particle without adding its contact to the solver. The game must consume the particle at its first hit and apply the appropriate forced-damage rule.

## Coordinate and integration conventions

World Y increases downward, and level ground is Y = 0. This is a translation of the original world, whose normal Nokia level origin offset is `(160,214)` for the chosen logical 320×240 view. Rendering scale is deliberately separate from the simulation.

Gravity is `(0,200)`. The normal simulation increment is `0.05`; callers can use the source's slow increment `0.015`. A step performs:

1. Generate contacts from the current geometry and sample impact speeds.
2. Add gravity to enabled linear velocities.
3. Calculate effective masses and penetration bias; apply cached impulses.
4. Solve normal velocity, split penetration correction, and friction, for at most ten iterations by default.
5. Integrate position and angle using the corrected velocities.
6. Refresh polygon vertices and compound child poses.

The original body equations are:

```text
velocity += gravity * dt
position += (velocity + penetrationCorrectionVelocity) * dt
angle += (angularVelocity + angularCorrectionVelocity) * dt
```

The source global damping is 1.0 in level initialization. Translation and rotation flags are independent: a pinned body can rotate, and a translating body can have frozen rotation. A fully fixed body still participates in contacts as static geometry.

The source Java render loop also sleeps approximately 30 ms in addition to work. Its `0.05` simulation increment is not proof that the original wall-clock frame rate was exactly 20 Hz. The browser caller owns its update accumulator and rendering schedule.

## Preserved numerical choices

| Quantity | Value/formula |
| --- | --- |
| Friction coefficient | 0.9 |
| Penetration slop | 0.2 world units |
| Split correction target | `-min(0, separation + 0.2) / dt` |
| Solver convergence | Both normal and split-impulse deltas below 0.003 |
| Normal impulse | Accumulated and clamped to nonnegative values |
| Tangent impulse | Clamped to `±0.9 * accumulatedNormalImpulse` |
| Circle-only tangential correction | Factor 0.2, sampled before warm starting, as in `ai` |
| Rectangle automatic mass | `width * height / 900` |
| Rectangle inertia | `mass * (width² + height²) / 3` |
| Circle inertia | `mass * radius² / 2` |
| Triangle automatic mass | `area / 900` |
| Triangle inertia | `8 * mass * area / 12` |
| Compound inertia | Sum of `childInertia + childMass * (distanceToCOM + childBoundingRadius)` |

Several formulas differ from textbook rigid-body equations. They are retained intentionally from the game; replacing rectangle `/3` with `/12`, for example, changes angular response. The compound formula also deliberately uses extent rather than extent squared.

## Concrete limits of fidelity

- The original pair-specific contact routines are not transcribed instruction for instruction. Circle contacts use closest features; rectangle/triangle manifolds use separating axes and edge clipping. Broad rejection uses AABBs. Contact selection/order can therefore differ from the Java game.
- Position, linear velocity, angle, and angular velocity are rounded to float32 when a step commits. Intermediate JavaScript calculations use double precision. This is not JVM float rounding after every operation.
- Collision detection is discrete. This module does not add continuous collision detection or silently subdivide the requested timestep. Tiny, very fast projectiles can cross a thin object between samples; callers should preserve the source projectile/update choices or explicitly document a mitigation.
- The original special half-step integration branch is not independently reproduced. The public step currently uses the ordinary velocity-first branch. The slow timestep is supported explicitly.
- Connectivity is reconstructed from initial overlap/shared-edge contacts. Compound release is tested against ground support. The original connectivity manager's special pair rules and cached stationary-contact shortcuts can differ.
- Events aggregate a pair's manifold into one report, taking maximum impact speed. The original damage callbacks run during individual contact generation. Matching all destruction timing requires reference-game traces beyond the numerical tests here.
- The source's damage-specific shape deformation, debris animation, sleep/settling timers, and custom projectile actions belong to the game layer. They are not implicit side effects of this physics module.

## Verification

Run:

```sh
node --test --test-isolation=none tests/physics.test.mjs
npm test
```

The 22 semantic tests pin velocity-first free fall at both source timesteps, the nonstandard rectangle inertia, independent frozen axes, finite resting circles/polygons, circle and polygon contact pairs, sliding friction, circle warm-start ordering, TYPE6-style sensor hits, resting stacks, absolute impact-speed telemetry, rigid child motion, connected compound splitting, release after support removal, and flight-phase freezing with momentum transfer to the struck structure.

A separate integration smoke check instantiated all 50 recovered level specifications and simulated 60 steps per level: 1,489 shapes including grounds, 44,641 emitted contact events, and no nonfinite root or child states. This was rerun after correcting the recorder's vector-subtraction behavior. That check establishes that the extracted shape data is usable by this engine; it is not proof of original gameplay parity or that all stages are solvable.
