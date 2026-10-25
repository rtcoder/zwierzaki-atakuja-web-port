# Rules audit: Nokia MIDlet 1.5

This file records behavior read from `/tmp/zwierzaki-recon/nokia-renamed`.
The source is CFR output from the original JAR, so identifier types sometimes
collide. Method signatures and branch constants are more reliable than CFR's
rendering of overloaded field names. `dist/js/rules.js` implements the isolated
rules below; scene orchestration and the physics contact generator remain separate.

## Damage is based on relative normal speed

`aj.java`, the second `a(v,v,q,q,q,q,float[],float[],int,q,float)` overload,
calls its `a()` to compute each contact point's linear plus angular velocity.
It subtracts the two velocities, dots the result with the contact normal, and
passes that value to **both original primitives** before solver preparation.
Damage is therefore based on **normal relative speed, not solver impulse J**.
The original shape handler takes its absolute value, including separating speed
when a contact still exists.

`v.b(int)` assigns these thresholds; `ae.a(float[],float,int)`,
`ab.a(float[],float,int)`, and `ag.a(float[],float,int)` apply damage:

| Material/category | Threshold | Destruction score |
|---|---:|---:|
| 0 | 50 | 10 |
| 1 | 100 | 15 |
| 2 | 150 | 20 |
| 3 | 200 | 25 |
| 4: bear | 50 | 40 big / 30 small |
| 5: animal projectile | 1000 | 0 |

The test is strict `abs(speed) > threshold`, unless the body's one-use force
flag is true or its integer damage has already reached 4. On a qualifying hit:

```js
newDamage = trunc(oldDamage + max(1, abs(speed) / threshold));
```

Java uses 32-bit float arithmetic before its integer cast; the port uses
`Math.fround` at those operations. Damage **does not retain fractions** from hit
to hit: two speed-99 impacts on a bear cause 1 + 1 damage, not 3. The force flag
resets after this calculation. Circle and box handlers ignore a local impact
vector `(0,0)`; the triangle handler also guards against an already marked
destruction. These geometry-specific callback conditions are the caller's job.

At damage >= 4, a primitive marks itself for destruction and creates debris;
attached primitives notify their compound parent. `bf.a()` processes these marks
and either splits the compound or calls `v.w()`. `v.w()` disables that body,
queues its destruction callback and decrements the remaining-target counter if
its target flag is set. The same callback supplies the score exactly once.
Bear drawing clamps damage to the last image, so damage 2 and 3 share the third
damage sprite.

`c.A()` additionally kills a bear when its center moves beyond the original
right world boundary (`x > aU` in the original coordinate system): it sets
damage to 4 and calls the impact handler with speed 51 and vector `(1,0)`.
No equivalent left-boundary bear rule was observed in that method.

## Score, unused ammunition and medals

`c.z()` awards points when a destruction callback is received. Ordinary
nonlethal hits do not award points. `c.i(int)` and the target factory
`c.a(boolean,float,float,float)` build the level's maximum destruction score.
The plain static `aa` platforms use material 0 visually but are not breakable
and do not add to the score pool. The extracted `breakable:false` and
`plainStaticPlatform` metadata distinguishes them. The test suite verifies the
sum against `sourceMaxPoints` for all 50 original level factories.

`c.n()`, state 9, awards the unused-animal table below. The normal queue still
contains the just-fired animal at index 0, so state 9 starts at index 1.
`unusedAmmoBonus(ammo)` deliberately takes **only the unspent part** of a queue.

| Animal ID | Animal | Unused bonus |
|---|---|---:|
| 0 | squirrel | 40 |
| 1 | skunk | 10 |
| 2 | turtle | 20 |
| 3 | hedgehog | 40 |
| 4 | rabbit | 20 |

Original state 8 has an extra user-choice flow. With no bears remaining and a
medal below gold, it first offers to continue destroying blocks. Accepting
dialog 4111 sets `b.f=true` without a payment. While this flag is true, state 6
continues to the next animal when score is still <= 85% of the destruction pool.
Gold, or completing that continuation mode, can enter the unused-animal scoring
animation. Infinite-animal mode skips state 9. Therefore automatically awarding
unused points on every browser win simplifies the original result-dialog flow;
the point values themselves are exact.

`c.void_a(boolean)` and state 9 use strict integer percentage comparisons:

- Medal 1, gold: `score > floor(maxDestructionScore * 85 / 100)`.
- Medal 2, silver: otherwise `score > floor(maxDestructionScore * 70 / 100)`.
- Medal 3, bronze: otherwise.

Unused bonuses can lift the final score above the destruction pool. A repeated
level stores the maximum previous/new score and the minimum previous/new medal
ID. Medal ID 1 means best; it is not a star count.

## Shot progression and winning/losing

`c.n()` uses state 5 for flight and state 6 for settling. A collision event,
completion of a squirrel cone/hedgehog volley, or exiting horizontal bounds
ends flight and starts settling, sometimes after a camera shift. If the
squirrel body hits while its cone is still airborne, the body is stopped and
the cone is allowed to finish.

Flight also times out at `flightTicks > 100` (101 updates, nominally 5.05 s at
0.05 s/update), except while needles or a cone are active, or slow-motion or
steering modes are active. The timeout path moves to another animal when the
queue including the current shot has more than one item; otherwise it finishes
with win iff no targets remain. This timeout path differs from normal settling.

State 6's transition predicate is exactly:

```js
stillMs >= 1000 || elapsedMs > 10000 ||
  elapsedMs > 4000 && (
    (debrisCount === 0 && allBodiesStable) ||
    targetsRemaining === 0 || ammoCountIncludingCurrent === 0
  )
```

The stable-scene timer is calculated in `c.A()` from body displacement flags;
it is not the age of the last collision. Static, dead and projectile-special
bodies are excluded by the original predicate. `rules.js` accepts the observed
stability as an input, leaving its derivation to the physics coordinator.

Once this gate opens: no bears means win, except the optional score-continuation
mode above; otherwise more than one queue item means next shot, and one or zero
means loss. `c.m()` decrements the queue and shifts it only when loading the
next shot, not at initial launch. Earthquake/meteor rescue states add separate
branches and are not represented by this small rules module.

## Boss levels

Every tenth level starts with **3 lives for the player's launcher** (`H=3` in
`c.n()`, state 1). This is not a three-projectile initial volley.

There is one boss shot before the player's first shot, then another after a
finished player shot if the cannon barrel remains alive and another animal is
available. A destroyed barrel stops future boss fire. Bears remain the win
condition; destroying the barrel alone does not win the level.

`c.void_a(int,int)`, destination state 13, computes:

```js
speed = base - floor(range/2) + randomInteger(0, range-1);
position = barrelCenter - muzzleDistance * (cos(angle), sin(angle));
velocity = -speed * (cos(angle), sin(angle));
```

| Level | Base | Random width | Inclusive speed range |
|---|---:|---:|---:|
| 10 | 370 | 80 | 330–409 |
| 20 | 400 | 120 | 340–459 |
| 30 | 420 | 80 | 380–459 |
| 40 | 340 | 120 | 280–399 |
| 50 | 315 | 120 | 255–374 |

The bullet is integrated with gravity 200 and dt 0.05, adding gravity before
moving. The original also gives the cannon compound recoil with scalar
`-2 * floor(base/10)` along its local axis at the muzzle lever arm. Rendering
has several sizes of bullet image, not several simultaneous bullets.

The launcher hit test uses strict squared distance less than
`(40 + floor(10/nativeScale))²`: radius 50 in the canonical 240-high coordinates.
One such hit decrements H by 1; ground impact does not. At H <= 0 the result is
loss after the impact debris animation. Missing the launcher and leaving the
world's horizontal bounds returns control to the player. Original ground impact
is `bulletY > 240 - 24/nativeScale`; convert this through the level's original
world offset when using the port's ground-relative coordinates.

Damage callbacks are disabled during boss fire (`bg.f=false`). The original
updates the scene for the first 500 ms of the shot, allowing recoil to settle,
then only follows the bullet/impact effect until handing control back.

## Material colors

`c.loadLevel` supplies two material-0 colors per ten-level island. `bg.a`
overrides materials 1–3, then applies integer per-body color modulation.
`materialColors(material, theme, primitiveIndex, shade)` preserves these values.
The theme is 1–5, and the ordering index is the original non-target-body counter
(starting at 1) or compound-child index (starting at 0), not a random variation.

| Theme | Material 0 colors |
|---|---|
| 1 | #f6e08f / #e4c96b |
| 2 | #cc0099 / #8e006b |
| 3 | #7fd4e7 / #64bbce |
| 4 | #33ff00 / #24b200 |
| 5 | #cccccc / #aaaaaa |

Materials 1, 2 and 3 use #666666/#888888, #009999/#006b6b and
#00b366/#007d47. Native boxes/triangles are procedurally drawn shapes; no
replacement artwork is involved.

## Verification and remaining fidelity limits

`node --test tests/rules.test.mjs` checks threshold equality, fractional hit
truncation, signed speed symmetry, each score value, medal boundaries, transition
timing boundaries, boss speed extrema, the strict launcher radius and material
palette arithmetic. The physics engine must expose contact speed before solving,
and scoring must run once per destroyed primitive. Actual manifold multiplicity,
compound splitting, debris durations, modal purchase/continuation flow and camera
transitions are integration concerns outside these pure functions.

## Special projectiles and squirrel explosions

`ad(int radius,int extraDamage)` creates a lightweight TYPE6 particle, unlike
the four-argument physical circle constructor. Both the cone (`radius=8`) and
each of the ten hedgehog needles (`radius=2`) pass `extraDamage=0`.

The TYPE6 branches in `ax`, `az` and `bc` set the victim's forced-damage flag,
add that integer extraDamage, and invoke the normal contact damage callback.
They mark the particle consumed and return without adding its contact to the
impulse solver. Thus a hit inflicts at least one damage even below the material
speed threshold, but does not transfer rigid-body momentum. `ba` consumes the
particle on ground contact. `am.a(ad[],v,v[],boolean)` excludes the main animal
and does not collide particles against one another. This exclusion matters:
needles are spawned inside their animal, and the cone initially overlaps it.

The browser descriptors use `sensor:true,canRotate:false`. The physics module
still moves these particles under gravity and emits contacts while bypassing
the impulse solver. Its internal placeholder mass has no physical effect on
these contacts; the earlier assumed density-based needle mass was removed.
The coordinator must consume a particle on its first valid contact, force
damage on the contacted primitive once, and skip sensor/animal and sensor/sensor
contacts. A cone additionally invokes the area effect below.

`bg.a(v,ad[],boolean,boolean,boolean)` explodes the cone after it is consumed.
The same explosion can occur when the squirrel hits a construction with its
cone still attached; the center is then `(animal.x, animal.y+17)`. A ground hit
by the squirrel alone follows a separate early-exit path.

For each live eligible physical root at displacement `(dx,dy)` from the blast:

```js
d2 = dx*dx + dy*dy;
if (d2 <= max(200*200, sourceBoundingRadius*sourceBoundingRadius)) {
  deltaVX = 5500 * dx / max(100,d2);
  deltaVY = 5500 * dy / max(100,d2);
}
```

The source bounding radius is 1.2 times the geometric radius, accounting for
native scale. Nontranslating roots receive no velocity delta. Apply this once
per compound root, not once per child.

Separately, `bf.a(ad,v,float,float)` damages each primitive whose center is
strictly within 100 units. Standard strength passes synthetic contact speed
`threshold + 51` to the normal damage handler. Consequently a fresh material-0
block or bear receives 2 damage, and materials 1–3 receive 1. The enhanced
animal variant uses `1.25*threshold + 63.5`. Damage does not fade with distance
inside that 100-unit radius. A directly struck primitive can receive both its
forced direct hit and this blast damage, but each is a distinct operation.

`coneBlastEffect(origin,body,options)` returns `{dvx,dvy,damageSpeed}` without
mutating the world. Call for roots to apply velocity, then for primitives to
apply damage. The cone explosion sprite is an animation of the physical effect;
an animation alone would omit essential source behavior.

## Intentional browser presentation changes

The browser flow awards the exact unused-animal values automatically when the
last bear is gone. It omits the original continue-destroying-blocks prompt and
purchase dialogues. Medal calculation must run **after** that bonus is added,
as the original state-9 animation recalculates the medal after adding bonuses.

The browser renders the medal tier as three/two/one stars, with
`stars = 4 - originalMedalId`; a loss has zero stars. This is a presentation
mapping, not the original medal-ID ordering. Scene transition animations and
the duration of destroyed-object debris are reconstructed browser effects.
