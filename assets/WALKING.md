# Walking rig and stride rules

These rules apply to all current and future rigged characters: travelers,
resident monks, body variants, outfits, and moving carrying poses. The old
image-generated calling sheets are archived comparison art; they are not a
template for new walking characters.

## One rig, one definition of a step

- A **step** is one footfall. A **stride** is a complete left/right cycle: two
  steps. `body.stride` is the rig's one-sided foot reach, not the complete stride.
- Author proportions and clothing through `personRecipe()` and
  `createBasePersonRig()`. Use `walkFoot()`, `pelvisHeight()` and `legPose()` in
  `lib/game/base-person/pose.ts`. Never manufacture walk frames by translating,
  mirroring, cropping or stretching a finished character image.
- Feet alternate half a cycle apart. Each foot stays on the ground for 60% of
  its cycle, leaving a short interval with both feet down. During stance, its
  backwards motion relative to the body must cancel the body's forward travel.
- During swing, lift the foot clear of the ground and match its backwards
  velocity at toe-off and landing. Keep both bone lengths fixed and bend knees
  forward. The pelvis follows the legs' reachable height; do not hold it low
  enough to force a permanent crouch. Standing knees have eight degrees of soft
  flexion. Seated, kneeling, sleeping and work poses retain their own posture.
- Hips pivot gently against the chest on each stride. Solve legs from those
  rotated hips while keeping foot targets fixed; head bob and elbow flexion
  follow the same distance-driven cycle. Footwear retains the shared sole
  envelope: sandals for peasants, ankle boots for other callings and monks.
- Robes, skirts, belts, hands and attachment sockets must follow the pelvis.
  Update the garment clipping plane with it. A long garment is not a reason to
  skip the underlying leg solver or hide invalid knees.

## Scale travel to the authored legs

Use `personWalkStride()` from `lib/game/base-person/gait.ts`. The conversion is:

```text
stride in world tiles = (2 × rig foot reach / stance fraction)
                      × (sprite cell scale / bake camera view size)
                      × individual character scale
```

Use the padded cell scale and the bake camera extent, not the opaque sprite's
pixel height. Use each variant's actual design, including custom designs. A
larger body takes proportionally longer steps.

The default reference is a base person at 150% size: about 0.353 tiles per
stride and 0.406 tiles/second, targeting 138 steps/minute before personal pace
variation. Derive a character's speed with `walkSpeedScale()` and
`DEFAULT_WALK_SPEED`. Monks and travelers share the world character size setting; monks use the
same calculation with their shorter authored reach. Do not add a separate monk
size multiplier or random population scale. Deliberate cadence differences may multiply that speed;
they must not change the ground-contact calculation.

## Runtime contract

Use `CharacterSprite` for every rigged person, including `visualOverride` paths.
The visual must supply its design, computed `walkStride`, cell scale, anchors,
and the actual per-clip frame counts. A new visual must not silently fall back
to legacy four-frame artwork or a guessed stride.

The actor's parent group publishes these values before its sprite frame runs:

- `distance`: actual horizontal distance moved in this render update. Reset it
  to zero when paused or teleporting; never count map wrapping as walking.
- `moving`, `activity`, `carrying`, and `playbackRate`: preserve the current pose
  while paused. Flying actors must release their foot plant and stop walking.
- `initialized` and `phase`: seed a stable individual phase once. Publish
  `heading` if available; otherwise the renderer reads the group's direction.

Use distance timing (`sync: true`) with `DEFAULT_WALK_STRIDE`. Advance phase by
distance divided by that person's scaled stride. Both walking and carrying use
the same leg phase. Fixed FPS is a comparison tool, not the normal movement mode.

`walkContact()` selects the supporting foot of the **displayed** rig pose.
`plantFoot()` anchors it in world space between atlas frames, including its
height on slopes. In the game, pass the map to `CharacterSprite` so new contacts
sample the walking surface beneath the supporting foot and both depth passes
follow the local terrain grade. Apply the correction to body and outline together. Keep the shared render order
and terrain depth shader on both passes; character ground shadows remain disabled.
Reset the contact at support changes, turns/view changes, stopping or teleports.
Do not smooth away the correction or cap distance-driven poses at an unrelated
animation FPS: either change reintroduces foot sliding.

Every current rigged sprite also supplies a depth atlas for each color clip.
Follow [DEPTH.md](DEPTH.md) for the bake format, runtime sampling, furniture
contacts and checks. Color and depth must use the same frame, direction, body
variant, anchor and pixel grid. Do not substitute the upright legacy depth model
for a rigged character, action, animal or cart.

## Export all affected characters

Walking and carrying each use 20 poses over one full stride. Walk metadata
publishes `walkStrides` so runtime distance timing stays tied to the rig. The
right-hand staff plants and lifts with the left foot: the arm extends forward
at planting and bends as the body passes the grounded tip. Rig pose phases are
measured in strides. Construction uses a standing, planted wooden-mallet action with 24 poses.
Other activities have their own frame counts and playback
rates; read metadata rather than assuming every clip has eight or twenty columns.
Keep the editor, baker, renderer, texture gallery and asset checkers consistent.

The character editor exposes the rendered skeleton for every preset, calling,
body profile and action. Optional `poseEdits` in downloaded design parameters
store per-joint frame offsets and blend radii. Offsets interpolate locally and
across the loop seam; the same rig applies them to previews and full bakes.
Arm and leg IK preserve bone lengths. Walking stance feet remain locked; swing
feet can be edited. Staff contact edits share the frame-zero ground anchor
through the contact interval. Editor drafts save separately per character in
browser storage; downloading parameters or copying JSON makes those edits portable.
Imports retain v20 walking poses and rescale its 24-frame wood-splitting keys
to the longer splitting sequence without changing their relative cycle timing.

After changing leg poses or bake geometry, increment the template `version` in
`assets/recipes/base-person.json`. This is an asset revision, not the game
release or package version. Tests require every active family to match it.

Bake the base, every population profile/calling,
and the Monk preset. Inspect the latest main branch before allocating versions.
Published bakes are immutable; use new paths and update all active imports only
after the exports exist. The current exports are base v31, population v23,
monks v30 (brown hair) / v31 (grey hair), rockets v8, transport v19, knights v7
and minstrel v2.
For a subsequent change choose unused versions:

```sh
npm run assets:base -- vNEXT --url http://localhost:3219
npm run assets:population -- vNEXT --url http://localhost:3219
node scripts/export-monk.mjs vNEXT --url http://localhost:3219
node scripts/export-monk.mjs vGREY --grey --url http://localhost:3219
```

Chopping sheets contain the worker, axe and logs only. The persistent world stump
is exported separately from the same rig with `scripts/export-chopping-block.mjs`;
keep its registration and scale aligned with the character's work contacts.
Shared template changes also require fresh rocket and transport exports so every
active family records the current template version.

Replace `vNEXT` and `vGREY` with unused numeric versions for each family. Custom browser
designs must be baked through the same current rig, not mapped onto stale sheets.

## Required verification

- Test fixed thigh/shin lengths, forward knee bend, upright idle, loop closure,
  alternating support and flat planted soles across all population designs and
  every preset, including monks and carrying poses.
- Test scale-to-speed/cadence consistency and the rendered foot contact between
  discrete poses. Verify no accumulated offset over repeated cycles, correct
  resets, and anchored height on slopes.
- Run `npm test` and `npm run typecheck`, the base and population asset checkers,
  and `node scripts/check-base-person.mjs v30 --monk` for the current monk bake.
  Also check `node scripts/check-base-person.mjs v31 --monk` for grey-haired monks.
  Check per-clip dimensions, matching shadows,
  palette, binary body alpha, safe margins and attachment registration.
- Inspect side and diagonal views in the editor and on real road tiles. Check
  small and large characters, starts/stops, corners, pause/resume and carrying.
  Check monks both on the ground and returning from flight. At low animation
  FPS, a supporting foot must still stay fixed while its displayed pose holds.

Passing the stride arithmetic alone is insufficient: inspect the actual
rendered feet against the ground and the knees beneath each garment.
