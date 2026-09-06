# Pilgrimage buildings — Timber & earth / v5

**Procedural geometry is the building asset source.** One model supplies all four isometric views, predictable footprints and repeatable material detail. Open **Assets → Playground → Buildings**, `/assets/characters?asset=buildings`.

## Early settlement construction

Use small early medieval rural forms: earthfast roundwood posts, woven willow screens, muted earthen daub, split boards, exposed rafters and lapped straw thatch. Keep rough grain, uneven paling tops and shallow irregular stone surfaces. Material detail follows construction; avoid decorative half-timber grids, glazed windows, chimneys, dressed-stone surrounds and elaborate late-medieval roofs.

The supplied hut references guide domestic buildings. The larger plastered church references can inform later religious architecture. The starting relic enclosure is a game-specific open sacred space, not a claim about a documented historical building.

Construction context: [West Stow Anglo-Saxon village](https://www.weststow.org/anglo-saxon-village/) and [English Heritage: early medieval architecture](https://www.english-heritage.org.uk/learn/story-of-england/early-medieval/architecture/).

## Starting types

| Type | Footprint | Distinguishing features |
| --- | --- | --- |
| Relic enclosure | 3×3 | No roof; low timber walls and an open gate on every side; rough flags, stone table, planks and scattered belongings |
| Monks’ shelter | 3×2 | Open front, thatched gable, woven windbreaks, straw bedding and blankets |
| Shepherd’s hut | 2×2 | Compact earthen/wattle hut with a plank door and steep thatch |
| Raised store | 1×1 | Timber legs, plank floor and walls, grain sack, small thatched gable |
| Wood shelter | 2×1 | Open lean-to with stacked wood and woven screens |

All dimensions range from **1×1 to 5×5**. A width of 3 fills three tiles, with no extra lawn or border. Choosing a type resets its size and height to the starting proportions. The live game starts with the relic enclosure; other types are available as playground assets.

Christian symbolism belongs on religious structures: simple wooden crosses on the enclosure gateposts and the monks’ shelter gables, plus a small cross on the reliquary lid. Keep them modest and legible in every view. Utility huts and stores remain unadorned. The enclosure preview and game share the relic’s warm, slow 3.2-second light pulse.

## Constants for future assets

- Camera: orthographic, elevation 35.264°, yaw 45° plus 90° per view. View order is SE, NE, NW, SW. Rotate the same model; never mirror or relocate openings.
- Scale: one tile equals one world unit. Use the current game character beside each model. Doors, bedding, gates and contents should remain plausible at that scale; enlarge a footprint without enlarging every detail.
- Materials: timber `#756044`, dark wood `#544630`, split wood `#98805b`, earth `#928064`, wattle `#9a8862`, straw `#aa9567`, straw highlight `#b7a276`, straw shade `#918057`, stone `#969486`. Shared constants live in `lib/game/building-art/materials.ts`.
- Surface: quiet masses with limited material variation. Uneven thatch courses have fringed edges and strokes along the fall of the straw. Stone floors use shallow clipped flags with gaps and unequal top heights.
- Lighting and pixels: reuse the game’s camera-relative light and existing pixel renderer. Fine material details share meshes; do not introduce a separate rendering style for scenery.
- Placement: every roof, post and gate leaf stays inside the declared footprint. The four enclosure gates stand open inward. Contents and their positions remain consistent in every view.

## Reuse and export

Add types through `EARLY_BUILDINGS` in `style.ts` and construction in `early-geometry.ts`, retaining the shared material and projection rules. `BuildingModel` serves both the playground and live shrine. The central stone table and relic use the same `RELIC_TABLE_TOP` height.

Export a version 3 procedural recipe or a four-view map PNG; import the recipe to reproduce dimensions and seed. The seed controls material variation, not an image model. Drafts remain local and do not overwrite the game’s default recipe. Earlier cottage recipes adapt to the new forms and 1–5 tile limits on import.

## Historical illustrated studies

The earlier gable, hipped and porch images remain at `/assets/buildings/studies`. All `hovel-*-v1` through `v4` images, fitted atlases, view PNGs, measured registrations and `generation-prompts-v4.json` are retained as historical work. Their source metadata records the original style and scale, independently of the current v5 procedural kit. They are not the chosen early settlement assets.

The archived reference workflow compares procedural geometry with illustrations on map tiles and exports four-angle atlases. It does not install sprites into the game. New procedural assets need no image service or API key.
