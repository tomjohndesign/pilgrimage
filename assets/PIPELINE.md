# Texture, sprite, and sound pipeline

**Current character work: [the shared base person](BASE_PERSON.md).** It uses
64px padded cells and a visible 30–35px figure, rendered from one rig for consistent
proportions and attachment points. Review it at `/assets/characters`. The older
imagegen outfits below are drafts, now at `/assets/characters/callings`.

The first road cast has seven imagegen character sheets, 224 walking frames,
and seven original synthesized selection cues. Characters are about **48 pixels
tall inside 64 × 64 cells**, with a 32-color palette and nearest-neighbour
sampling. The vendor keeps the game's separate cart and vending awning.

## Preview and manage

- `/assets/characters/callings` is the older outfit playground: facing, frame stepping, playback,
  native-size preview, road preview, scale, timing, sound audition, and volume.
- `/assets/textures#characters` has every sheet, original imagegen source,
  frame metadata, and selection WAV available to download.
- Tuning and asset paths persist in this browser and apply to `/play`. Export
  and import JSON to move settings between browsers. To ship settings for all
  players, apply the exported values to `lib/game/character-assets.ts`.
- **Manage asset files** accepts versioned local PNG/WAV paths. It checks files
  before applying them. Import files into `public` using the commands below;
  the browser does not write into the repository.

## Generate another character sheet

For new outfits, use the [shared base workflow](BASE_PERSON.md#future-outfits).
The process below documents the earlier independent imagegen drafts; it does
not guarantee anatomical or accessory consistency across frames.

1. Edit the subject/prompt in `assets/recipes/characters.json`, or add a new
   character recipe. Preserve the layout specification and small-pixel style.
2. Print the exact prompt:

   ```sh
   npm run assets:prompt -- character peasant
   ```

3. Ask the coding agent to generate that prompt with its **built-in imagegen
   tool**. The initial sheets were generated this way; no API key is needed.
   Ask for real alpha transparency, four columns, eight rows, and clear gaps
   between rows. The command prints a prompt; it does not make an API request.
4. Pack the generated image, supplying the saved imagegen output path:

   ```sh
   npm run assets:import -- peasant /path/to/generated-atlas.png v2
   ```

   The importer preserves the source, detects separated rows, crops each pose,
   aligns feet, scales figures to 48px, quantizes the palette, and writes:

   - `public/textures/characters/peasant-v2.png` — 256 × 512 runtime atlas
   - `public/textures/characters/peasant-v2.json` — frame rectangles and anchor
   - `public/textures/characters/sources/peasant-v2.png` — original source

   Existing versions are never overwritten. Regenerate sources if the importer
   cannot detect eight separated rows. It cannot invent missing walk poses or
   correct a wrongly facing character: inspect every angle and the loop in the
   playground. Imagegen outputs can need another pass for temporal consistency.
5. Apply `/textures/characters/peasant-v2.png` in the playground. Once reviewed,
   update its default path in `lib/game/character-assets.ts`.

Rows are **S, SW, W, NW, N, NE, E, SE**, relative to the screen. Columns are
left contact, passing, right contact, opposite passing. A stopped character
holds column 1 (zero-based). There are no dedicated sitting/working clips yet.
The renderer chooses facing using actual movement and the camera's current
yaw, including while the camera rotates, and stops cycling when motion stops.

To introduce a new calling, also add its identity to `lib/game/travelers.ts`,
its asset definition in `lib/game/character-assets.ts`, and its sound recipe.

## Generate another terrain or material texture

1. Add a named prompt to `assets/recipes/textures.json`. `mud-path` is an example.
2. Run `npm run assets:prompt -- texture mud-path` and generate that prompt with
   built-in imagegen. Use a square, top-down, seamless surface for terrain.
3. Run `npm run assets:import-texture -- mud-path /path/to/source.png v1`.
   This preserves the source and creates a 128 × 128 versioned PNG with metadata.
4. Inspect a repeated tile for seams. Register approved textures in
   `lib/game/render/textures.ts` and connect them to the relevant terrain
   material (for roads, the tier in `lib/game/map/road.ts`).

Existing procedural grass, dirt and road textures can also be rebuilt without
imagegen using `npm run assets:terrain`. This rewrites those existing generated
files deterministically.

## Generate more sound effects

```sh
npm run assets:sounds
```

`assets/recipes/sounds.json` defines original deterministic synthesis recipes.
Each sound has a seed and timed events: `noise` for cloth and steps, `wood` for
knocks, `tone` for bells/metal, or `pluck` for string-like notes. Adjust frequency,
duration, gain, start time, and overtones; add another named recipe for a new
effect. The generator produces mono 22,050 Hz, 16-bit WAVs, with attack/release
envelopes and a normalized peak below clipping. Running the same recipes again
produces identical bytes. Increment the recipe `version` to retain old files.

These are **synthesized effects, not recorded Foley or voice lines**. You can
also import your own recorded or externally generated WAV under `public/sounds`
and apply its path in the playground. Playback uses a distinct cue per calling
and a stable, slight pitch variation per traveler. Sounds occur only on a new
selection; deselecting or dragging does not play a cue. Mute and volume persist.

## Checks

```sh
npm run assets:check
npm run typecheck
npm test
npm run build
```

The artifact check validates the bundled v1 sheets, all 224 occupied frames,
transparent margins, registration, WAV headers, levels, and distinct sounds.
Unit tests cover camera-facing mapping, frame looping, settings validation, and
traveler pitch. Review the animation visually as well: imagegen is not a rigged
animation system and automatic checks do not establish anatomical continuity.

Generation prompts are committed in `assets/recipes/characters.json` and
`assets/recipes/textures.json`; sound synthesis is fully specified by
`assets/recipes/sounds.json`. Runtime art and audio are served from `public`,
so no generation service or secret is needed to run or deploy the game.
