# Sprite depth and scenery contact

Current characters and transport retain their rig geometry as a paired depth
atlas. All world meshes use their normal depth buffer; buildings do not need
special rendering rules for each character or activity. The archived generated
calling sheets have no source geometry and retain their comparison renderer.

## Bake contract

`spriteDepthBaker` renders the posed rig through the same orthographic camera,
at the same cell resolution as the color export. Local material clipping stays
active. `inkPersonFrame` adds edge pixels; their depth comes from the same solid
neighbour used for their color. Exporters fail on missing or out-of-range depth.

The `view-offset-rg16-v1` format is an opaque data PNG:

- R/G encode an unsigned 16-bit value, high byte first.
- `(value / 65535 - 0.5) * 2 * camera.viewSize` is the distance toward the bake
  camera from the rig origin. It is not the bake camera's near/far depth.
- B is 255 for geometry and ink, 0 for background. A is always 255 to preserve
  data bytes through canvas and PNG encoding.

Every color clip has a matching depth sheet, including walk, idle, all actions,
body profiles, hair variants, equipment, flight, shop states and animal poses.
Custom browser designs use the same baker. Export fresh versions through the
existing editor scripts; keep published versions immutable.

## Runtime

`CharacterSprite` and `TransportSprite` share `applySpriteDepth`. They sample
depth with the color texture's transformed UVs, so frame, direction and variant
cannot drift apart. Depth textures use nearest sampling, no mipmaps and no color
space conversion. They are shared between instances and between color/ID passes.
The cell-normalized offset scales with the sprite's world size and is projected
relative to its current world anchor. Matching render order resolves coincident
depth consistently in both passes.

The terrain/support plane still protects ground contacts from enlarged scenery
texels. Airborne sprites use their geometry depth without that ground clamp.
Keep the existing world/character render passes and bounded pixel resolution.

## Furniture contact

Correct depth does not decide where someone should stand or lie. A usable
horizontal box top can declare `BuildingPart.support`, listing compatible clips,
an optional local X/Z anchor offset, and heading. Its position, dimensions and
top height come from the geometry. `character-support.ts` applies the building's
placement and rotation; navigation and sprite contact consume the same data.
This replaces separate bed-layout calculations and character height overrides.
Unfinished buildings do not offer usable support surfaces.

## Verification

Run `npm test`, `npm run typecheck`, the character asset checkers from
[WALKING.md](WALKING.md), and `node --test scripts/test-sprite-depth.mjs`.
The checks cover paired active assets, ink registration, encoded range, geometry
clipping, surfaces intersecting every pose, enlarged floors, overlap order and
selection outlines. Inspect the real game beside buildings at multiple views
and zoom levels after changing the depth or contact contract.
