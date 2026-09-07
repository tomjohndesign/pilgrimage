# Sprite surface lighting

Characters, animals and carts bake their surface lighting into the color PNGs.
`addSurfaceLighting` in `lib/game/render/lighting.ts` supplies the same ambient,
sky/ground fill and directional intensity as the map. `lightOffsetForYaw` in
`lib/game/render/iso.ts` places the elevated source southeast (below/right in the
isometric view). The map light follows camera yaw, including rotation tweens.

Bakers keep the camera and light at yaw zero and rotate only the posed rig for
each direction row. This keeps the bright side on the same screen side when a
character turns. Custom person and equine frames and the animal playground use
that same lighting. Procedural map scenery and wildlife use the existing scene
light. Archived image-generated calling sheets remain comparison artwork.

Bake at the existing native resolution, then apply the existing palette and ink.
Keep color/depth registration, anchors, silhouettes and animation timing intact.
The runtime sprite material remains unlit: there are no new texture samples,
normal maps, per-character lights or render passes. Cast shadows stay disabled;
legacy separate shadow sheets are retained for the existing export contract and
are not displayed on the map.

After lighting changes, export fresh asset versions for the base, population,
both monk hair colors, equipped monks, minstrel performance, transport, knights
and chopping block. Update active imports after those exports exist. Published
bakes are immutable. Check all eight directions, the real map at multiple camera
views and zooms, selection and overlap. Run `npm test`, `npm run typecheck`, the
base/population/monk asset checkers, and `node --test scripts/test-sprite-depth.mjs`.

## Foliage prototype

The tree playground (`/assets/textures#trees`) offers **Pixel foliage** and
**Current trees** for comparison. Oak, beech, silver birch, Scots pine, hawthorn and holly have three
seeded branch/leaf variants and eight camera directions (144 frames).
The pine uses a deliberately pointed, tiered silhouette. Their authoring model
is in `lib/game/trees/foliage/model.ts`; the existing controls edit height, spread,
density and leaf size. Edits rebake in the playground. Copy species JSON preserves
those settings. This prototype does not replace the gameplay forest yet.

The default preview loads the published `foliage/v5` color/depth atlas directly.
Each 192-pixel cell spans `192 * CHARACTER_PIXEL_SIZE` world units, with binary
alpha, nearest filtering, related cool, moss and olive foliage ramps with a shared bark palette, and subdued southeast
surface lighting. The source models contain fine branches and instanced leaf
blades; the map uses instanced billboards, with one color batch and one matching
ID batch in the existing passes. Paired RG16 geometry depth handles intersections.
CPU picking uses the same atlas alpha and depth to respect gaps between leaves.
No cast shadows are baked or rendered.

Use `node scripts/export-tree-foliage.mjs v6 --url http://localhost:3219` to publish
a fresh version from the editable defaults, then update `foliage/assets.ts`.
Existing versions cannot be overwritten. The exporter records frame dimensions,
anchor, designs and safe padding. Validate beside the monks and in the dense
forest at all four map views; the default prototype disables overlap outlines
because tracing individual leaves obscures the canopy. Selection remains active.
The **Dark forest** lineup toggle previews the existing darkwood brightness against
darkwood ground. Forest instances use the placement brightness directly, preserving
the smooth transition from lighter rims into darker old growth. Color patches
follow leaf clusters; broader blades reduce fine speckling at the same native scale.
The foliage asset tests check native scale, palette, binary alpha, every frame's
depth coverage and reproducible variants. The existing GPU depth test also checks
translated instanced trees, overlapping surfaces and picking through leaf holes.
