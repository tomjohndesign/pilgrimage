# Base person: parametric storybook foundation

The user’s ten illustrated book references guide the base proportions: roughly five-head proportions, a shaped nose and jaw, a pinched waist, flared tunic and selective ink edges. These are authored profiles on the shared skeleton. We retain the small pixel-art presentation and avoid detailed textures.

Version 10 retains the tuned body proportions and adds base clothing: head 120%, shoulder height 100%, neck height 65%, legs 90%, foot width 95%, foot height 70%, shirt length 100%, flare 100%, sleeve fullness 100%, step reach 80%, and ink 60%; body width and foot length remain 100%. The male default is bald and barefoot, with a hip-length shirt, loose long sleeves and brown trousers. Female profiles wear a sleeveless ankle-length dress over a contrasting long-sleeved shirt, with a cloth head covering over long hair. Shirt, trouser and covering colors are editable. It uses **64 × 64 padded cells**, with **30–35px figures including ink**. The camera extent and world cell scale grow with the padding, so the padding itself does not enlarge the character. All 72 frames must retain at least four transparent pixels on every side; the default design has nine. The ground anchor is fixed across poses.

The visual study used the guest close-ups in [OpenRCT2 issue #7125](https://github.com/OpenRCT2/OpenRCT2/issues/7125).
The [original guest animation definition](https://github.com/OpenRCT2/objects/blob/master/objects/rct2/peep_animations/rct2.peep_animations.guest.json)
is also a useful reference for how the game groups guest poses. Our geometry,
palette and exported sprites are original; the reference screenshot is not a
game asset. The earlier imagegen reference was rejected and is not the template.

## Review

Open `/assets/characters`. Controls sit in a scrolling left panel beside the enlarged preview. Native size and Sprite sheet modes share the preview area. Check all eight directions, play
or step the eight-frame walk, and compare the previous frame using the ghost.
Idle has its own still pose. The coloured-side view is diagnostic: blue always
means the person's anatomical left, orange the right. Attachment guides show
head, back, both hips and both hands.

The earlier outfits remain under `/assets/characters/callings`. In `/play`,
**Road → Models** switches between Base person (the default) and Character
drafts. The choice is saved in the URL as `characters=base` or
`characters=callings`. Male and female base clothing is part of the shared rig; calling-specific equipment comes next.

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

The playground has Head size, Body width, Torso height, Shoulder height, Neck height, Leg length, Foot length, Foot width, Foot height, Tunic length, Tunic flare, Sleeve fullness, Step reach, and Edge ink controls. Storybook, Stout and Lanky presets share authored contour landmarks and the same skeleton; this is not a random primitive generator. The waist, hem, jaw, nose and foot outline remain designed features throughout the range.

Dragging renders the eight visible directions on the next animation frame. The full sheets render after release (or a short pause in keyboard input), keeping the preview responsive. Preview poses and exported frames share the same camera, ink and registration code. One small WebGL renderer is reused and the last four parameter sets are cached. No image-generation API is called. **Apply to road** uses the edited proportions as the foundation for the mixed crowd described below; the browser saves the parameters, not megabytes of image data. On reload it prepares that population once. The simulation and previous atlases remain available while loading, with progress in the editor. **Restore project default** removes the local override. Existing saved designs and parameter files receive defaults for newly introduced controls. Parameters can be downloaded or loaded as JSON; this makes a design repeatable on another machine. Atlas and attachment downloads correspond to the preview.

## Road population

The default map uses six body profiles: regular, tall and broad men and women. Each traveler receives a stable profile and a 90–110% individual size from the map seed and traveler ID. Neighboring ID pairs contain one man and one woman. Changing traffic, camera angle or calling does not reroll appearances or consume simulation randomness.

Profiles vary torso height, leg and arm lengths, build, sleeve fullness, hands, feet and arm pose within the editor's bounds. Men's shirts and women's dresses take their calling's color. Trousers, undershirts and coverings retain the foundation palette. Male profiles vary hair and facial hair; women keep long hair, head coverings and no beard. The editor's body-type selector controls its preview; applying a foundation preserves the road's mixed population.

The shipped population is pre-baked, so ordinary map startup requires no character generation. Each calling shares one walk atlas and one idle atlas across all six profiles. Shadows are shared across callings, and travelers share the sprite shader. An edited foundation prepares a replacement set once, yielding between characters and discarding superseded requests. Individual size changes only the billboard scale. Distance-matched walking accounts for each profile's stride and size.

`population.ts` defines profile variations; `population-assets.ts` registers the versioned default manifest. Review and download the calling sheets at `/assets/textures#characters`.

The **Arms** section groups shoulder height, arm spacing, upper-arm length, forearm length, resting arm angle, elbow bend, arm swing, hand size and sleeve fullness. Angles display degrees; the other values are multipliers. Arm swing is independent of leg step reach. Existing saved designs receive the new arm defaults while retaining their chosen shoulder height. The shirt closes around the neck, and cloth shoulder seams connect the sleeve roots across the supported spacing/height range, preventing the back-view holes of the earlier open torso.

Torso height stretches the body above the waist and carries the collar, head and arm roots with it; the hips and hem remain fixed. Shoulder height raises or lowers the arm attachment points relative to the fixed torso. It does not stretch the chest or move the collar, neck, head, belt, or hem. Neck height moves the head above the collar. Tunic length moves the hem while keeping the belt, upper torso and legs fixed.

`design.ts` defines bounded parameters and presets; `personRecipe()` derives coordinated proportions. `rig.ts` owns the lathed tunic/jaw profiles and rounded bare-foot contour. Equipment still attaches to the named skeleton sockets. Add new authored clothing profiles and accessories through that mechanism instead of stretching a finished sprite.

`ink.ts` operates on one frame at a time. It adds a one-pixel contour and selective internal boundaries from a semantic body-part mask, then quantizes into a small palette derived from the clothing, skin and hair colors (including a separate ramp for each clothing layer). Transparent margins are checked after inking, so neither outer edges nor adjacent atlas frames can be clipped or bleed together. Edge ink zero disables this treatment.

## Clothing, hair and cast shadows

Clothing, skin and hair each have a color picker. Male outfits also expose trouser color; female outfits expose undershirt and head-covering colors. Sleeve fullness changes the long sleeves on both profiles. Body type selects Male (broader shoulders, tapered waist) or Female (broader hips, a shallow bust contour in the tunic). Female selection defaults to Long hair and disables facial hair; this is also enforced when loading parameters. Hair styles are Bald, Cropped, Bob and Long; a short beard and nose-size control add further variation. Stout and Lanky presets demonstrate different palettes and hair. Missing appearance fields in older saved files receive safe defaults without discarding existing proportions.

Thigh and shin materials clip at the tunic hem, including their semantic mask and side-diagnostic materials. Female feet use the same clipping plane when raised, so covered skin cannot poke through the dress during a stride. The lower dress sways slightly through the walk cycle. The far arm uses subdued shading and lower ink priority based on camera direction; those roles swap as the character turns without swapping anatomical sides.

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
npm run assets:base -- v11 --url http://localhost:3100
npm run assets:check-base -- v11
```

The exporter needs Playwright's Chromium. On a fresh machine, install it once
using `npx playwright install chromium` after installing project dependencies.
Exports are versioned and refuse to overwrite an existing version. The exporter
reads the exact template rendered by the playground, producing under
`public/textures/characters/base/`:

- `base-person-v10-walk.png`: 512 × 512, 64 walk frames.
- `base-person-v10-idle.png`: 64 × 512, eight idle views.
- `base-person-v10-sides-walk.png` and `base-person-v10-sides-idle.png`: anatomical
  side diagnostics, not runtime artwork.
- `base-person-v10-shadow-walk.png` and `base-person-v10-shadow-idle.png`: matching translucent cast-shadow atlases.
- `base-person-v10.json`: camera, origin, row order, per-frame projected attachment
  points/depths, and a hash of the recipe used to bake it.

The browser also downloads the current walk, idle and attachment data directly.
Pixel rasterisation can vary slightly between GPUs; geometry, timing, palette
and registration all come from the same fixed source.

To publish a new population after changing the foundation recipe or profiles:

```sh
npm run assets:population -- v2 --url http://localhost:3100
npm run assets:check-population -- v2
```

The development editor supplies the shared baker. This exports the project default recipe, not a browser's saved override, and refuses to overwrite existing versions. Files live in `public/textures/characters/population/v2/`: seven 512 × 3072 walk sheets, seven 64 × 3072 idle sheets, two shared shadow sheets and a manifest containing the exact designs. Each sheet has six eight-direction bands in profile order. After review, update the manifest import in `population-assets.ts`. The checker validates all 3,024 body frames, binary alpha, four-pixel margins and matching shadow dimensions.

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
