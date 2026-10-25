# Asset provenance, AI runtime and renderer map

The 105 files in `assets-original/` retain the original encoded bytes and hashes.
The approved new artwork is in `assets-ai/images/`: 101 AI-derived images, three
deterministic font atlases, and the faithful original-based tutorMouth0 fallback.
These source candidates and all raw/backups remain separate from the runtime.

`tools/build-ai-assets.py` builds all runtime files at original logical dimensions
multiplied by 4, avoiding the decoded-memory cost of loading the full AI canvases.
It normalizes unprepared transparent sprites against original alpha bounds while
preserving repaired geometry. Font glyphs and effect frames are resized separately.
`dist/assets/manifest.json` and `dist/js/assets.js` record the actual runtime hash,
original hash, candidate path/hash, artwork origin and processing method.

Install `tools/requirements-assets.txt`, then run `python3 tools/build-ai-assets.py`.
This uses existing source candidates; no AI calls or system fonts are needed to
rebuild the runtime bundle. The earlier `enhance-assets.py` is a historical faithful
upscale path and does not build the current AI-derived artwork.

`ASSET_META.width/height` remain logical source dimensions. `pixelWidth`,
`pixelHeight` and `scale` describe physical PNGs. Canvas destinations use logical
units; glyph/effect source rectangles use physical pixels. The original geometry
maps below remain the reference for collision, pivots and placement.

`assets.js` exports `loadAssets`, `ASSET_META`, `ANIMALS`, `TARGETS`, `EFFECTS`,
`LAUNCHER`, `FONTS`, and `drawBitmapText`. Asset keys omit `.png`.

## Source evidence

Mappings below were recovered from the supplied JAR using CFR 0.152. The local
audit sources are `/tmp/zwierzaki-recon/nokia-cfr` and the more readable duplicate
field renamed equivalent `/tmp/zwierzaki-recon/nokia-renamed`. Decompiled field
types occasionally collide even after renaming, so the explanatory names here
describe behavior instead of copying ambiguous field names.

| Mapping | Original evidence |
| --- | --- |
| Animal index order | `c.java`, static string array at line 23 in the first decompilation |
| Three animal frames loaded | `c.t()` and initial setup around lines 1048–1054 |
| Load-hop progresses the frame | `c.n()`, state 3, around lines 3590–3600 |
| Prepared shot uses curled frame | `c.e(boolean)`, around lines 3434–3440 |
| Ability implementations | `c.h()`, around lines 3014–3090 |
| Bear damage and blink drawing | `ae.a(Graphics)`, `ae.a(int)`, `ae.a(float[],float,int)` |
| Bear eye overlay offsets | `c.a(boolean,float,float,float)`, around lines 3161–3173 |
| Launcher composition | `c.a(float,float,int,boolean)` and `c.a(Graphics,int,int,boolean)`, around lines 4397–4467; `bi.a(int[],int[])` |
| Background/camera parallax | `c.b(boolean)`, `c.d(float,float)`, `c.a(Graphics,boolean,boolean)` |
| Bitmap font indexing | `bh.java` constructors and character mapping functions |

## Animals

All character frame PNGs are 54×54. Preserve that transparent square and center
it at the projectile's position using origin `(27,27)`. The occupied art is much
smaller than 54×54; scaling it to the body diameter would shrink it incorrectly.
Rotate the whole square around the body center. Frame numbers below are the
one-based suffixes in filenames.

| Index | Key | Files | Ability |
| --- | --- | --- | --- |
| 0 | squirrel | `char_squirrel1..3` | Drop a pinecone bomb |
| 1 | skunk | `char_skunk1..3` | No FIRE ability in the original switch |
| 2 | turtle | `char_turtle1..3` | Set current-direction speed to 600 |
| 3 | hedgehog | `char_hedgehog1..4` | Ten downward-spreading spines; use frame 4 afterward |
| 4 | rabbit | `char_rabbit1..3` | Redirect toward nearest bear, preserving current speed |

Frame 1 is the waiting pose; frames 2 and 3 progressively curl the animal for
launch. The squirrel's separate `char_squirrel_cone` is 17×16 and drawn with
origin `(8,8)`. The hedgehog's fourth frame depicts the body after shedding spines.

## Bears

Big bear images are 40×40, origin `(20,20)`; small bear images are 26×26, origin
`(13,13)`. Both use damage indices 0, 1, and 2, clamped to the last art frame as
damage continues. The base art contains open eyes. The optional blink image is
composited on the unrotated base before the whole bear rotates:

- Big eyes: 20×8, top-left offset `(11,12)` in the 40×40 image.
- Small eyes: 14×6, top-left offset `(6,7)` in the 26×26 image.

The source briefly shows the closed-eye patch for 200 ms, then restores the
underlying pixels for 2–4 seconds. The original eye PNGs are opaque RGB patches.
The AI runtime rebuilds all six patches from the matching normalized bear base,
then closes the eyes locally, retaining those source offsets and dimensions.
`blinkRect`, `baseKey`, `baseSha256` and derivative provenance record this
relationship; the renderer still uses the original placement. Do not chroma-key
these backgrounds.

## Launcher assembly

The original compositing buffer is 86×87 with pivot `(43,43)`. At canonical scale
1, build the rotatable assembly in the following order relative to the pivot:

1. `launcher_5` at `(-27,-27)`.
2. `launcher_1` at `(-27+20+min(-20,pull),-27)`.
3. If loaded, the 54×54 animal at `(-27+20+pull,-35)`.
4. `launcher_4` at `(-27,-27)`.

Then rotate this assembly by the aim angle. Draw `launcher_2` unrotated at
`(-4,-2)`. Support sections `launcherBaseElement` are 31×15 at
`(-15,40+15*n)`. Draw `launcherBaseTop` (39×8) centered at `(0,40)`.
`launcher_3` is retained in the extracted files but is not referenced by the
audited launcher compositor.

The pull is negative: default -20, maximum -40. Spawn point is the pivot plus
`R(angle) * (20+pull,-8)`. This origin agrees with the position of the loaded
animal in the composite. The intermediate buffer exists to allow rotation;
Canvas transforms can render the same source layers directly.

## Effects and fonts

| Image | Frames | Frame size | Origin |
| --- | --- | --- | --- |
| `explosion` | 6 horizontal | 30×30 | 15,15 |
| `fire` | 6 horizontal | 26×43 | 13,43 |
| `sparkles` | 5 horizontal | 34×34 | 17,17 |
| `mark` | 3 horizontal | 14×14 | 7,7 |

The generated `FONTS` table contains exact per-character source rectangles and
advances. `FONT` is a 13-pixel-high uppercase display face, `fontNum` a 10-pixel
digit face, and `fS` a 14-pixel-high mixed-case face including Polish letters.
For `FONT` and `fontNum`, opaque black pixels on the first row delimit glyphs;
those delimiter columns are excluded. For `fS`, the original 112 widths are
copied from `bh.java`; they total 632 pixels and leave the final transparent
column of the 633-pixel PNG unused. The original space advance is 5 pixels.

## World and backgrounds

Physics uses screen-like axes: positive x right, positive y down. Body draw
coordinates are world coordinates multiplied by `screenHeight/240`, then the
camera translation is added. A canonical 320×240 Canvas preserves the source
asset sizes. Scale the completed game view uniformly for a larger display.

Nokia backgrounds `bg_1..5` are 400×300. Theme is
`min(5, floor((level-1)/10)+1)`. The original places the background at
`(screenWidth-400, screenHeight-300)` plus a clamped parallax offset. Trees use
`tree_<theme>a/b`, and `grass` tiles horizontally at the ground. The original
applies theme-dependent hue/saturation/value adjustments to grass at runtime;
the extracted `grass.png` remains unchanged.

Within shared filenames, a direct byte comparison against the supplied Sony
Ericsson K800i JAR found differences only in `scoresBG.png` and `menu_bg.png`.
All shared character, target, launcher, font, and effect PNGs are identical. The
Sony edition stores backgrounds as four 320-wide pieces instead of the Nokia
400×300 versions; the chosen Nokia files remain the single source of this port.

## Launch and ability constants

`e.a(int)` encodes aim in 4.5° steps (`0.07853982` radians). The step bounds are
-15 through +13. Pull is twice an integer power index in [-20,0]. Base launch
speed is `-pull*11` (default 220, maximum 440); levels 28 and 29 call `e.void_a()`
to use multiplier 12 instead (maximum 480). Velocity is
`(speed*cos(angle), speed*sin(angle))`. Gravity is +200 in world y.

- Squirrel: cone spawn `(x,y+17)` at canonical scale, cone velocity `(vx,vy+100)`;
  squirrel velocity becomes `(vx,-abs(vy))`. Cone radius is integer `17>>1`, or 8.
- Turtle: normalize current velocity, then multiply by 600.
- Rabbit: normalize vector toward the nearest bear and multiply by current
  speed. Set spin to `sign(direction.x)*10π` radians/second.
- Hedgehog: ten radius-2 projectiles, angle starts `3.2986724` and increments
  `0.31415927`, with added velocity `(140*cos(angle),-140*sin(angle))` plus the
  animal's original velocity. Switch to frame 4; animal vy becomes `-abs(vy)`.
- Skunk: FIRE has no effect. This is explicit in the original ability switch.

These constants document the source; physics integration and gameplay state
remain the coordinator's responsibility.
