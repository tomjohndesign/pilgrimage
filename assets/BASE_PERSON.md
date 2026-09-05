# Base person: parametric storybook foundation

The user’s ten illustrated book references guide the base proportions: roughly five-head proportions, a shaped nose and jaw, a pinched waist, flared tunic and selective ink edges. These are authored profiles on the shared skeleton. We retain the small pixel-art presentation and avoid detailed textures.

Version 8 keeps the September 5 slider screenshot as the default: head 120%, shoulder height 115%, neck height 65%, legs 90%, foot width 95%, foot height 70%, tunic length 140%, flare 125%, step reach 80%, and ink 60%; body width and foot length remain 100%. The default is bald and barefoot. It uses **64 × 64 padded cells**, with **30–35px figures including ink**. The camera extent and world cell scale grow with the padding, so the padding itself does not enlarge the character. All 72 frames must retain at least four transparent pixels on every side; the default design has nine. The ground anchor is fixed across poses.

The visual study used the guest close-ups in [OpenRCT2 issue #7125](https://github.com/OpenRCT2/OpenRCT2/issues/7125).
The [original guest animation definition](https://github.com/OpenRCT2/objects/blob/master/objects/rct2/peep_animations/rct2.peep_animations.guest.json)
is also a useful reference for how the game groups guest poses. Our geometry,
palette and exported sprites are original; the reference screenshot is not a
game asset. The earlier imagegen reference was rejected and is not the template.

## Review

Open `/assets/characters`. The first strip is shown at native resolution, with
a separate enlarged pixel inspection view. Check all eight directions, play
or step the eight-frame walk, and compare the previous frame using the ghost.
Idle has its own still pose. The coloured-side view is diagnostic: blue always
means the person's anatomical left, orange the right. Attachment guides show
head, back, both hips and both hands.

The earlier outfits remain under `/assets/characters/callings`. In `/play`,
**Road → Models** switches between Base person (the default) and Character
drafts. The choice is saved in the URL as `characters=base` or
`characters=callings`. Character outfits are the next step; none have been
generated from the new body yet.

Components accept `characterModel="base"` or `characterModel="callings"`:

```tsx
<GameCanvas {...gameProps} characterModel="base" />
<TravelerFigure type={traveler.type} characterModel="base" />
```

The prop is also available on `Travelers` and `CharacterPreview`. It changes
the visible person, retaining simulation state, identities, selection sounds
and the vendor cart. The older outfit playground has a **Use base person**
checkbox in its road preview for comparison.

## Parametric editing

The playground has Head size, Body width, Torso height, Shoulder height, Neck height, Leg length, Foot length, Foot width, Foot height, Tunic length, Tunic flare, Step reach, and Edge ink controls. Storybook, Stout and Lanky presets share authored contour landmarks and the same skeleton; this is not a random primitive generator. The waist, hem, jaw, nose and foot outline remain designed features throughout the range.

Dragging renders the eight visible directions on the next animation frame. The full sheets render after release (or a short pause in keyboard input), keeping the preview responsive. Preview poses and exported frames share the same camera, ink and registration code. One small WebGL renderer is reused and the last four parameter sets are cached. No image-generation API is called. **Apply to road** sends the completed atlas to all base people; the browser saves the parameters, not megabytes of image data. On reload it renders that saved design once. The simulation and previous atlas remain available while loading. **Restore project default** removes the local override. Existing saved designs and parameter files default newly introduced controls to 100%. Parameters can be downloaded or loaded as JSON; this makes a design repeatable on another machine. Atlas and attachment downloads correspond to the preview.

Torso height stretches the body above the waist and carries the collar, head and arm roots with it; the hips and hem remain fixed. Shoulder height raises or lowers the arm attachment points relative to the fixed torso. It does not stretch the chest or move the collar, neck, head, belt, or hem. Neck height moves the head above the collar. Tunic length moves the hem while keeping the belt, upper torso and legs fixed.

`design.ts` defines bounded parameters and presets; `personRecipe()` derives coordinated proportions. `rig.ts` owns the lathed tunic/jaw profiles and rounded bare-foot contour. Equipment still attaches to the named skeleton sockets. Add new authored clothing profiles and accessories through that mechanism instead of stretching a finished sprite.

`ink.ts` operates on one frame at a time. It adds a one-pixel contour and selective internal boundaries from a semantic body-part mask, then quantizes into a small palette derived from the clothing, skin and hair colors (13 colors by default). Transparent margins are checked after inking, so neither outer edges nor adjacent atlas frames can be clipped or bleed together. Edge ink zero disables this treatment.

## Clothing, hair and cast shadows

Clothing, skin and hair each have a color picker. Body type selects Male (broader shoulders, tapered waist) or Female (broader hips, a shallow bust contour in the tunic). Female selection defaults to Long hair and disables facial hair; this is also enforced when loading parameters. Hair styles are Bald, Cropped, Bob and Long; a short beard and nose-size control add further variation. Stout and Lanky presets demonstrate different palettes and hair. Missing appearance fields in older saved files receive safe defaults without discarding existing proportions.

Thigh and shin materials clip at the tunic hem, including their semantic mask and side-diagnostic materials. Covered skin cannot poke through the skirt during a stride. The far arm uses subdued shading and lower ink priority based on camera direction; those roles swap as the character turns without swapping anatomical sides.

`shadow.ts` projects each rendered silhouette from the fixed foot anchor into a separate translucent shadow frame, defaulting to 16% opacity. This is a lightweight sprite effect with the same screen-relative lighting as the artwork. The road draws it with ground depth, no depth writes, no selection/outline ID, and shared textures. Shadow opacity is adjustable, including zero. Exported `shadow-walk` and `shadow-idle` PNGs preserve soft alpha; body sheets retain binary alpha.

## Ground contact

The reported toe clipping was reproduced with terrain visible and disappeared when terrain was hidden: it was ground depth occluding a flat billboard, rather than the PNG being cut off. `render/sprite-depth.ts` gives the upper body upright depth and the lower pixels ground-relative depth with a small sole clearance. The color and ID passes use the same correction and retain depth tests against other scene objects. Native PNG outlines work even with scene outlines off.

## Source of truth

- `assets/recipes/base-person.json`: dimensions, palette, camera, gait and scale.
- `lib/game/base-person/rig.ts`: one reusable person and named attachment nodes.
- `lib/game/base-person/pose.ts`: continuous shared walk, with two-bone leg IK.
- `lib/game/base-person/bake.ts`: one fixed orthographic camera and a compact custom
  palette, rendered without antialiasing at final resolution.

The fixed origin is **(32, 48.5)** in each cell. Each foot moves relative to that
ground origin as it steps; frame bottoms are not independently aligned. The
head and body proportions remain fixed, and every limb keeps its length.
One frame is never cropped, enlarged or regenerated separately from another.

Rows: S, SW, W, NW, N, NE, E, SE. Walk columns sample one complete cycle at
phases 0/8 through 7/8. The end wraps to the beginning. Idle has one column.
The body faces +Z and anatomical left is +X. Never mirror an accessorised frame
to obtain the opposite facing.

## Export

Start the app, then run:

```sh
npm run dev -- --port 3100
# In a second terminal:
npm run assets:base -- v9 --url http://localhost:3100
npm run assets:check-base -- v9
```

The exporter needs Playwright's Chromium. On a fresh machine, install it once
using `npx playwright install chromium` after installing project dependencies.
Exports are versioned and refuse to overwrite an existing version. The exporter
reads the exact template rendered by the playground, producing under
`public/textures/characters/base/`:

- `base-person-v8-walk.png`: 512 × 512, 64 walk frames.
- `base-person-v8-idle.png`: 64 × 512, eight idle views.
- `base-person-v8-sides-walk.png` and `base-person-v8-sides-idle.png`: anatomical
  side diagnostics, not runtime artwork.
- `base-person-v8-shadow-walk.png` and `base-person-v8-shadow-idle.png`: matching translucent cast-shadow atlases.
- `base-person-v8.json`: camera, origin, row order, per-frame projected attachment
  points/depths, and a hash of the recipe used to bake it.

The browser also downloads the current walk, idle and attachment data directly.
Pixel rasterisation can vary slightly between GPUs; geometry, timing, palette
and registration all come from the same fixed source.

## Future outfits

Reuse the body and animation. Change colours/materials and attach equipment to
the named nodes before baking, so the renderer handles front/back occlusion.
For example, a left-hip bag attaches to `leftHip` and follows that side in every
view. Do not ask imagegen to reinterpret the full person separately in every
pose. Imagegen can help design an accessory for review; the attachment and
animation must still follow this template.

The renderer uses the base sheet's metadata for its padded 64px cells, eight walk
frames and anchor, and switches to the separate one-column idle sheet when
stationary. The earlier drafts keep their 64px/four-frame layout. Do not feed
this base through the old sprite importer, which crops and scales poses.

`npm run assets:check-base` checks all 72 frames, the pixel budget, palette,
transparent margins and registration. Unit tests check fixed limb lengths,
planted feet, loop closure and attachment handedness over every view and frame.

On the road, **Base size** and **Draft size** independently scale the current sprites from 50% to 400%. Both values are saved in the Play URL (`baseSize`, `draftSize`). The `characterScale` prop applies the active multiplier to the visible sprite and its outline with a fixed foot anchor; it preserves the source pixels. Match travel also scales the cycle distance with the body size.

Version 3’s longer 0.62-unit foot sweep remains the starting gait. Parameters constrain step reach to the available leg length, retaining planted feet and fixed bones. Earlier exports remain available.

## Walking controls

Play defaults to **Base size 150%**, **Pace 0.5**, and **Anim FPS 8**. The **Walking** panel now separates:

- **Timing — Match travel** (default): cycle phase follows actual distance moved. **Stride** is world tiles per complete left/right cycle at the reference size (150% for the base, 100% for drafts); changing character size scales this distance proportionally. Longer strides produce fewer cycles per tile. It calibrates the baked gait against world travel, without stretching individual images. FPS caps displayed frame changes.
- **Timing — Fixed FPS**: the earlier independent cadence, for direct comparison. Stride has no effect in this mode.
- **Variation**: smooth deterministic changes in each person's pace, default ±15% maximum, with different rhythms per identity. Zero gives steady pace.
- **Path ease**: short curves around road corners, eased heading changes, and eased departures/arrivals at camps and shops. Curves stay inside neighboring path tiles; changing heights retain the original bridge ramp interpolation. Zero restores the linear path.
- **Accel**: response time in seconds for starts and changes in pace. Zero is immediate.

Settings save in the URL as `timing=distance|fps`, `stride`, `variation`, `easing`, `acceleration`, `speed`, and `fps`. Changes do not recreate the simulation. Movement tuning applies inside the simulation, so selected stats and rendered positions agree. Map-edge wraps reset the animation distance sample instead of counting a teleport as a stride. Idle uses its dedicated sheet and stops advancing the cycle.

The initial 0.44-tile cycle matches the new 0.62-unit foot sweep over the 60% planted portion of the gait, converted by the 1.48-world-unit cell scale / 3.4667 camera extent. Tune it by watching the planted foot against the road.

The renderer shares one compiled outline shader across travelers using an ID uniform and updates atlas state only when needed. Motion tests check distance/cadence independence, speed easing, bounded pace variation and continuous corner geometry. Rig tests check limb lengths, planted feet, handedness, attachment registration and loop closure.
