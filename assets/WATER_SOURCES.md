# Water-source sprites

The timber-lined well and natural watering hole live at
`/assets/textures#water-sources`. Both use the shared scenery color/depth baker
and renderer: eight directions, 128px cells, one native character pixel per
texel. The original geometry is in `lib/game/water-sources/model.ts`.

The well depicts an early medieval British timber-lined shaft with a low oak
curb, a stave bucket, wooden hoops and rope for hand drawing. Timber/wattle
linings and a probable oak bucket base are recorded in the 550–800 AD wells at
[Tattershall Thorpe](https://heritage-explorer.lincolnshire.gov.uk/Monument/MLI98590).
A barrel-lined well at [Ipswich](https://heritage.suffolk.gov.uk/Monument/MSF36057)
is dated to the late eighth/early ninth century. These finds support the
materials and lining; the visible curb and bucket arrangement are an
interpretive reconstruction, not a reproduction of preserved upper works.

The watering hole is an unbuilt pool with mud, stone and vegetation. It makes
no claim to reconstruct a particular archaeological site or establish potable
water. Its near bank is kept open for the dipping/crouching pose.

`WATER_SOURCE_DEFINITIONS` records conservative footprints and local standing
and water-contact points. `waterSourceAccessPoints` transforms them with the
same eighth-turn rotation used by the sprite renderer. The reusable
`WaterSources` component renders placements. Both sources are available in the
scenery build menu and become usable when construction finishes.

Pedestrians and settlers with thirst below 20 seek a completed, reachable source
within eight tiles. A source serves one visitor at a time, reserving its front
strip until the drinker has stepped out. Visitors drink for eight seconds,
restoring thirst without charging gold or restoring food or stamina, then
return to their road position or workplace. Failed searches retry after five
seconds; removed sources abort service and construction changes replan routes.
Mounted travelers and traveling vendors retain their existing provisioning.

`drinking` and `drinkingLow` use the shared person rig and a wooden cup. Each
24-frame loop lasts four seconds; both poses have fixed leg lengths and planted
feet. Low drinking folds long clothing over the knees. The shared character
editor exposes both clips, joint keys and portable saved pose edits. Their
color/depth sprites ship for all current person families.

To bake a fresh version, update the version in the atlas paths and exporter,
start the existing app, and run:

```sh
node scripts/export-water-sources.mjs --url http://localhost:3000
npm test -- lib/game/environment/sprites.test.ts lib/game/water-sources/assets.test.ts
```

Published versions are immutable. Check the gallery's rotation and overlap
controls with the reference monks after baking.
