# Merchant carts and draught animals

Use the existing character playground at `/assets/characters`. Merchant cart
opens in **Small map**: a 11 × 7 tile scene using the game's textured terrain,
lighting, outlines, `PixelCanvas`, `TravelerFigure` and default 1.5 character
scale. The old flat composite is replaced by this context view. A repeatable
journey walks in, opens the shop, serves a visiting customer, packs up, recalls
the animal and continues along the road. Another traveler walks past for scale.
Pause, scrub, restart, jump to a stage, change playback speed or rotate the view.
The camera's Wide/Map/Close settings change framing, never character scale.

Person, donkey, horse, coat, horse build and cargo controls apply to the map.
Character/native-size/sheet views remain available for individual asset
inspection. The demo uses the authored stride speeds, action durations and
pasture solver; its clock and customer choreography are isolated from the live
simulation. `lib/game/transport/demo.ts` records the scrubbable journey and
`components/merchant-map-preview.tsx` renders it. No new playground route is used.

The cart has uneven dark boards, solid round wooden wheels, rope lashings and a
patched cover. Produce, bread, pottery and textiles each have a ground display.
Opening raises the cover and lays out wares and a planted sign; packing reverses
those poses. Each offering disappears from the cart when it appears on the ground,
and returns during packing. The hand-pulled display is less than half as long,
with three groups of wares instead of six. The merchant uses a separate basket-unloading sheet made with the
existing human reaching/kneeling rig. Both actions take four seconds. Trading
shows the merchant in front of a roughly 3 × 2 tile display. Simulation placement
keeps the cart and display on the two grass rows directly beside the road.
While selling, the keeper waves to nearby travelers, presents the wares, walks
along the display and returns to a ground mat for a seated rest. The routine
repeats; packing waits until the keeper returns to the starting position.

Animal convoys use a fitted breast collar, girth and bridle. Straight side
shafts and long traces are omitted. The driver-held reins follow each flank
in native square pixels, using the animal sprite’s baked projection and depth
so the near cord stays in front through turns. Hand-cart handles and parked
shop stubs remain on the cart.
The unhitched animal
wanders over connected adjacent grass/clearing tiles (at most two cardinal tile
steps from the hitch), pausing to graze. Dirt is traversable, but grazing occurs
on grass/clearing. Roads, tracks, bridges, water, woods and buildings block the
route search. Recall follows cardinal routes back to the hitch; a packed cart
waits for its animal before departing. Animals use the terrain height at their
own location. No suitable shop clearing means the vendor continues along the
road and tries again.

## Editable source

- `lib/game/transport/rig.ts`: rough cart, wheels, hand-cart handles and deployed display.
- `animal-rig.ts`, `animal-pose.ts`, `geometry.ts`: authored ribcage, pelvis,
  scapula, neck, muzzle, limb cross sections and fitted collars;
  no sphere animal bodies.
- `coats.ts`: independent natural coat palettes with matching mane, tail, lower
  legs, muzzle and primitive markings. Coats do not change the build or gait.
- `pasture.ts`: bounded roaming and recall.
- `keeper.ts`, `merchant-poses.ts`: shared stall routine and merchant gestures.
- `roadside.ts`, `follow.ts`: roadside maneuvers and the trailing cart axle.

The donkey has a forward, slightly stooped head and a measured 0.82-cycle/second
plod. The lean common horse walks at 0.95 cycles/second; the full-chested noble
horse carries its head higher and walks at 0.98. The torso transfers weight and
flexes between shoulder and pelvis; neck, head and tail follow the motion.
All three profiles use the same grounded walk, with body bounce and topline
flex scaled to their proportions. The neck settles forward during walking.
Loose, harnessed and ridden exports record the shared animal rig revision;
the knight bake also records its horse profile to catch stale movement assets.
Hooves use the shared `walkFoot()` stance targets with equine elbow/stifle,
carpus/hock and fetlock chains. Supporting forelegs straighten below the elbow;
swinging hooves fold and open before landing. Planted hoof displacement determines travel
speed, independent of frame rate and scale. Human walking geometry is unchanged.

## Current sheets: v20

`public/textures/transport/v20/manifest.json` records all dimensions, anchors,
clips, timing, profiles, coats and variants. Every frame has binary alpha and at
least four transparent pixels around its silhouette. Larger cells add padding
at the same native pixel density as people. Each color sheet has a matching
`depth-` sheet using the shared per-pose geometry-depth encoding.

- `cart-{cargo}-{hand|donkey|horse}.png`: 24 wheel frames × sixteen directions,
  160px cells. One complete revolution, advanced by actual traveled distance.
  Separate cargo/configuration files keep these atlases under 4096px wide.
- `cart-{cargo}-shop.png` and `cart-{cargo}-shop-mirrored.png`: 12 opening frames × sixteen directions, 256px cells.
  The final frame is trading; packing reads the frames backward. The `-small`
  and `-small-mirrored` variants hold the hand-pulled display.
- `{donkey|horse}-{coat}[-hitched].png`: 39 columns of 128px cells. Idle: 0;
  walk: 1–20; lowering the head: 21–26; grazing: 27–38 at 4 fps. Donkey has
  eight rows. Horse has common rows 0–7 and noble rows 8–15. Separate fitted and
  unhitched sheets let the same animals work with carts or appear independently.
- `puller-walk.png`, `puller-idle.png`: six existing population outfits, 64px
  cells, 48 rows, 20 walk frames / one idle frame. Only the arms change for shafts.
- `merchant-setup.png`: 24 basket-unloading poses, 64px cells, 48 rows. Opening
  and packing select forward/reverse frames from the simulation's action progress.
- `cart-{cargo}-driver.png`: six outfit columns × sixteen directions in 160px
  cells, registered to the cart axle. The shared person rig and ink pass render
  the seated body against depth-only seat/cargo geometry. The cart material
  merges these pixels before alpha and depth testing, including selection.
  Matching `depth-` sheets carry the current per-pose geometry depth; composed
  driver pixels sample their own depth with the same cart anchor and cell extent.
- `merchant-selling.png`: 12 wave, 12 presenting and eight seated frames in
  64px cells, with the same six outfits and eight directions as the setup sheet.

The runtime retains nearest sampling, the existing terrain-depth shader,
object-ID selection and character render pass. Carts and animals share the
merchant's selection. Coats are stable per vendor; hand, donkey and horse pulling
all occur on the road.

Walking uses actual per-render distance by default for every person and animal.
Loaded merchants target 120 steps/minute before individual pace variation, capped
by the draught animal's natural speed. Hand-pulled merchants travel 30% slower
than that target. Keeper wandering also uses actual stride distance. The
small-map preview starts at 1×.
The chassis, cargo, cover and wheel track are 20% narrower (`CART_WIDTH_SCALE`).
Wheel diameter and harness attachment positions are preserved.
Animal-drawn merchants use a dedicated driving pose on a broad front bench
with a backrest. Knees stay below the hips and boots hang over the front; both
hands hold reins that follow the animated bridle through turns. Driver and cart
share one sprite anchor, scale and turning frame; there is no separate seated
body depth plane. Rein sockets use that same displayed cart heading.
Hand carts retain the shared walking/pulling rig. Shrine visitors first pull
off onto a grass clearing near the road junction, leave the hitched convoy
parked, and walk through a shrine gate alone. They return before rejoining
the road. Arrival and departure check the complete convoy against terrain,
buildings and elevation; unavailable parking means continuing along the road.
`transport/route.ts` rounds cart turns independently of the painted paths and
pedestrian lanes. The radius is 1.5 tiles where the verge permits it; tight
spaces and bridge decks constrain the curve. Supported bridge elbows add a
compact concave deck on the inside, moving the railing onto its edge.
The hitch turn uses 1.5× the path shoulder’s radius (0.675 tiles). The inside
edge is the swept outline of the actual cart, shafts and animal in both travel
directions, with a small clearance margin. It follows the trailing wheels as
they straighten, ending where the existing deck supports them. Geometry, rails,
walking heights and clearance use this same outline; short spans still expose
unsupported turns in the preview.
The same partial-tile footprint supplies walking height and convoy clearance;
water underneath remains water. Suspended spans keep their hanging decks. Carts advance by physical route
distance. Axles trail freely on land; bridge crossings use the support assist
described below. Roads and tracks share access again;
there are no foot-only bridge restrictions or waiting states.
`render/cart-wear.ts` samples both wheel centres from the default horse cart's
trailing axle, using the rig's wheel spacing. The canonical road direction gives
one readable pair of feathered dirt ruts with a grassy median inside corners.
It uses the existing terrain texture and leaves the road outline and walking
lanes intact; bridge decks, water, woods and building footprints are excluded.

On ordinary ground, the cart axle trails a fixed-length drawbar with rolling
wheel motion. `bridge-guide.ts` deliberately relaxes that physics near bridges:
the axle follows the deck route a cart-length behind the puller, keeping both
wheel centres supported. The body turns with the axle's own travel, independently
of the puller, so it does not slide sideways through tight bends. The effective
hitch gap shortens through bends; fixed wheel sprites do not swivel. The assist blends
in/out on the adjoining ground and holds the corrected pose when paused.
It is shared by live carts and the turning simulations. Bridge clearance allows
body/shaft overhang over water only while the puller and both wheel centres
have support; woods and buildings still collide. Wheel rotation uses axle
travel. Sixteen cart directions give intermediate turning poses.

`roadside.ts` supplies the same maneuver to the simulation and preview: a rounded
45° pull-off, a short parallel stretch to straighten the cart, and a 45° exit
that rejoins farther along the road. The cart occupies the second grass row,
behind a long road-facing display on the first grass row. The 3 × 2 footprint
runs parallel to the path; mirrored sheets support either verge. Customers walk
along the road to the entrance, step up to the frontage, browse and pay, then
return to the path. A closing shop sends an approaching customer back safely.

Grazing uses bounded grass-only routes and checks every segment against cart,
wares, sign and building bounds, expanded by the animal's body/head clearance.
Clearance is validated against all walking and grazing mesh poses. The animal
returns over the same safe graph before the convoy departs.

## References

[Horse Walk Cycle by Chris MALUKAI](https://www.youtube.com/shorts/tKpWFly0zGM)
provided the body/neck weight-transfer reference. Its leg poses were not copied.
The gait retains four distinct footfalls and no suspension, consistent with
[Rhythmic categories in horse gait kinematics](https://pmc.ncbi.nlm.nih.gov/articles/PMC11828748/).

Horse presets are bay, flaxen chestnut, black, grey with dark skin, and dun with
black points and a dorsal stripe. [AMNH's coat guide](https://www.amnh.org/explore/ology/zoology/all-about-horses/coat-colors)
describes these colors and examples such as black Friesians and grey Arabians.
Donkey presets are grey dun, brown, black with pale points, and sorrel; the
[Donkey & Mule Society of New Zealand standard](https://donkey.org.au/docs/std_con_type_donkeys-2.pdf)
describes natural donkey coats, pale areas and crosses. These are coat presets
for generic period animals, not claims that the meshes reproduce modern breeds.

## Export and validation

Increment `TRANSPORT.version` before publishing another bake. With a development
server running, `npm run assets:transport -- --url http://localhost:3000 --out
.context/transport-review` writes a new review directory. Inspect it before
placing it in the new public version and updating the manifest imports. Never
overwrite a published version. A shared person rig change also requires new
human families as described in `assets/WALKING.md`.

Run `npm test -- --maxWorkers=2`, `npm run typecheck`, `npm run build`, and the
existing base/population/monk asset checkers. Tests cover every exported frame,
realistic palette metadata, all animal limb lengths/contacts, loop closure,
solid wheels, pasture barriers, recall and the simulation's shop lifecycle.
Inspect the assembled sprites beside a person in the playground and in `/play`,
including rotated cameras, selection, terrain height, pauses and shop transitions.

## Turning simulations and reversing

In `/assets/characters?asset=cart`, select **Small map** and use **Scenario** to
choose the merchant journey, left/right T-junction turns, an S-bend, a bridge
bend, or backward walking. Edge cases add a one-tile hairpin, short chicane,
wooded corner, short bridge corner, turn after a bridge ramp, backing around
a bend, and staggered bridge landings. Closely spaced landings use compact
half-tile corner inserts; long swept inserts are reserved for isolated elbows.
Compact bridge hitch turns are capped at 0.2 tiles, so the puller reaches the
landing before turning. The support assist keeps carts on the short and
staggered bridge decks, including their sloped approaches.
Two opposing walkers exercise the outermost walking lanes alongside the cart.
Bridge walkers follow tangent deck entrances and sample the actual ramp height;
ground walking paths retain their existing curves. **First edge contact** seeks to the first failing clearance frame;
**Full route clear** indicates no contacts in the selected run. Constrained
fixtures deliberately expose contacts for refining geometry and steering.
The turn radius slider spans 0.4–3 tiles and only
changes the selected simulation; the live default is `DEFAULT_CART_TURN_RADIUS`.
Horse/donkey/hand cart selection, camera rotation, pause, speed, stage buttons
and the timeline work in every scenario. Gold shows the hitch trail and blue
the axle trail. The clearance readout flags frames where the convoy touches
terrain edges so tight bridge geometry can be refined visibly.

`turning-demo.ts` uses the runtime radius planner, rig-derived speed and trailer
solver. Seeking restores the recorded cart pose exactly. A passing pedestrian
uses the original walking lane, independent of the cart's radius.
`animal-travel.ts` preserves facing for backward travel, including pasture
recall. The existing distance-driven animal and wheel clips run backward for
these steps; geometry and baked stride lengths are unchanged.

Bridge approach ramps have open sides; raised decks retain their guards.
