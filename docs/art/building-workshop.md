# Building workshop

Open **Assets → Playground → Buildings** at `/assets/characters?asset=buildings`. The character and building editors share the existing HUD frame, controls, mobile drawer and direction dock. Drafts survive switching; hidden previews pause. `/assets/buildings` redirects here.

## Current direction: Timber & earth, v5

Early medieval rural structures use roundwood posts, woven screens, muted earthen infill, split planks and layered thatch. Avoid decorative late-medieval timber grids, glazed windows and dressed-stone trim; the live pilgrim shelter has a rough stone hearth and chimney. The supplied hut photographs guide the small domestic structures; the supplied church model guides the live shrine’s raised central roof, plastered lower walls and timber upper section.

The construction baseline is informed by [West Stow’s reconstructed Anglo-Saxon village](https://www.weststow.org/anglo-saxon-village/) and [English Heritage’s early medieval architecture overview](https://www.english-heritage.org.uk/learn/story-of-england/early-medieval/architecture/). These support the timber-building direction; the game’s relic enclosure and building dimensions are authored gameplay designs, not archaeological reconstructions of a specific site.

| Preset | Starting footprint | Construction |
| --- | --- | --- |
| Relic enclosure | 3×3 | Roofless; low rough timber walls, four open gates, rough flagstones, stone table, loose planks and scattered belongings |
| Monks’ shelter | 3×2 | Open front, thatched gable, woven windbreaks, straw beds and rolled blankets |
| Shepherd’s hut | 2×2 | Low earthen and wattle walls, plank door, steep thatched roof, bedding |
| Raised store | 1×1 | Open timber posts, raised plank floor and entry ramp, grain sack, small thatched gable |
| Wood shelter | 2×1 | Open lean-to, woven windbreaks, stacked firewood |

Every width and depth is an integer from **1 to 5 tiles**. Dimensions describe the building itself, including its eaves; there is no surrounding tile allowance. Choosing a preset restores its authored proportions. The roof control is omitted for the open enclosure. All four isometric views come from the same model, and the preview uses actual game terrain and current base-character sprites at the game’s default scale.

`early-geometry.ts` owns the new construction; `materials.ts` supplies its reusable muted palette. `buildingParts` dispatches between current structures and archived cottage models. `BuildingModel` batches fine details by layer and material before rendering through the existing `PixelCanvas`; selection still uses the existing object-ID renderer. Seeded paving, palings and straw stay deterministic across camera angles.

The live starting shrine uses a **3×5 footprint**, one entrance facing the founding track, four benches beside a central aisle, and a stone altar towards the rear. Its rough stone lower courses rise to the window sills, with uneven plaster above and arched openings in the raised timber section. Two lower thatched slopes meet the raised central roof, with a front cross and a larger rear cross on a small steeple. Candle stands flank the rear altar. Selecting any building removes the roof and near walls while retaining the walls opposite the camera. The relic, visitor headings and monks’ procession pickup share the same altar position; all shrine traffic crosses the single entrance. Only the approach to this door is paved. Visitors reserve separate kneelers, enter by the aisle, sit facing the altar, and retrace their route when leaving. The workshop’s roofless enclosure remains a separate study.

Live settlement buildings share geometry with construction previews and menu thumbnails. The woodcutter’s hut has a plain plank lean-to, floor straw beds, lumber, axes, chisels, a long saw, a hand-cranked sharpening stone, offcuts and sawdust. The pilgrim shelter has bedding, hanging clothes, a table, a chest and a corner hearth. `BuildingSmoke` is a reusable pixel-scale sprite emitter placed at the chimney mouth; the fire remains visible in cutaway. Storehouses have open sides and an entry ramp; their food and timber still reflect live inventories.

## Recipes and inspection

The editor supports map/all-four views, zoom, grid, cutaway, recipe import/export and a four-view map PNG. Exports use `kind: procedural-building`, version **3**, style **pilgrimage-buildings-v5**. Current drafts live in `pilgrimage-procedural-buildings-v2`; previous workshop storage is preserved. Importing earlier gable/hipped/porch recipes adapts them to a hut or open shelter, clamps dimensions to 1–5 tiles and restores suitable heights, with an on-screen notice. Workshop drafts do not replace the live shrine’s default recipe.

Regression checks cover every supported width/depth for every type, four unobstructed enclosure gateways, the shared table height, deterministic materials and identical geometry across all four views. Visual checks should include a character, the 1×1 store, all four angles and the live relic’s selection.

The UI extends the existing [Creative cloud UI Paper frame](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0), “Building workshop — procedural” (`214-0`).

## Archived image studies

`/assets/buildings/studies` retains the earlier cottage comparisons and image workflow. The v1–v4 PNGs, fitted views, measured registrations and generation prompts under `public/assets/buildings/` are historical references, not the current building kit. Source records retain their original dimensions and style contracts. The current geometry kit does not require image generation or an API key.

The reference page’s local generation endpoint is development-only, same-origin localhost, with a server-side API key and a mandatory four-view map guide. Mocked tests cover request validation and access restrictions. Image generation was not used for the current procedural kit.
