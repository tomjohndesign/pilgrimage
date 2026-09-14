# Building recognition and settlement paint

The camera sees roofs before it sees doors. Each building therefore keeps a
recognizable roof material and value, plus a large object or structural feature
that describes its purpose. Player paint is a separate accent on eaves, frames,
posts, shields, bindings, or canopy edges; changing it preserves those identities.

## References and application

- [Age of Empires III: Definitive Edition art interview](https://www.ageofempires.com/news/the-art-of-aoe3de/):
  its artists discuss readable silhouettes and the exaggeration of tabletop
  miniatures. Here, broad roof edges and larger purpose cues carry more weight
  than extra small clutter.
- [Blizzard's StarCraft development retrospective](https://news.blizzard.com/en-gb/article/20719767/rock-and-roll-days-of-starcraft-a-development-retrospective):
  distinct shape languages and thicker, wider features made small sprites
  readable. Here, round ale and shield signs, square axe boards, long gantries,
  and open trellises make different outlines at the same pixel scale.
- [Foundation's developer art deep dive](https://www.gamedeveloper.com/art/deep-dive-the-art-of-i-foundation-i-):
  building personality comes from silhouette, shape, color, and value, with roofs
  especially prominent from above. Here, warm thatch, dry reed, and weathered timber
  shingles distinguish uses before their smaller furniture becomes visible.
- [Blizzard's mapmaking art guidance](https://news.blizzard.com/en-gb/article/20097658/mapmaking-best-practices-in-art-and-performance):
  a restrained environment palette helps preserve unit readability. Building
  materials remain earthy; the player's chosen color occupies limited surfaces.

These are design applications of those sources, not claims that those games use
this particular palette or set of props.

The pilgrim shelter, shrine hall, timber yard and relic enclosure have been removed from new
selections and preview maps. Their recipes remain only for older-save rendering.

## Implemented type cues

| Type | Material / large identifying feature | Paint surface |
| --- | --- | --- |
| House | Golden thatch, charcoal log sides, pale earthen front panels | Eaves, doorway, corner posts |
| Tavern | Weathered brown thatch, hanging ale sign over the entrance | Eaves and doorway |
| Inn | Grey-brown split-oak shingles, angular entrance hood and attached bed sign | Fascia, shutters, sign frame |
| Woodcutter's hut | Long closely laid roundwood poles, large axe board | Fascia and sign frame |
| Wood shelter | Warm timber shingles, paired log-end sign | Eaves and sign frame |
| Monks' residence | Pale reed roof, limewashed rubble walls | Eaves and door trim |
| Shrine / chapel | Pale reed, masonry and existing bell tower | Nave eaves / chapel lintel |
| Guard post | Long roundwood poles, shield and upright spears | Fascia and shield field |
| Market | Unbleached linen over the rear two stall tiles; front row open | Hanging canopy valance |
| Sheep pen | Weathered reed hut, tall wooden crook | Eaves and crook binding |
| Raised store | Raised platform, high loading frame, grain mark | Loading header |
| Cloister garden | Herb beds and climbing trellis | Upper trellis rail |
| Carved cross | Existing cross silhouette | Painted binding and tail |
| Well | Existing stone curb and windlass | Timber curb bands |
| Watering hole | Natural open water and reeds; no signage | None |

Large identifying props remain present when a workplace is unstaffed or its
stores empty. They use the existing world geometry, selection, rotation, detail,
and cutaway paths. Owned and independent structures share materials; only owned
structures receive the chosen paint. Water markers are shared geometry in asset
previews and overlays beside the existing baked water sprites.

## Period and rendering constraints

[English Heritage's early medieval architecture overview](https://www.english-heritage.org.uk/learn/story-of-england/early-medieval/architecture/)
provides the timber secular / stone religious construction context.
[The Ashmolean's account of Anglo-Saxon houses](https://anglosaxondiscovery.ashmus.ox.ac.uk/Life/settlement/houses_info.html)
describes timber, wattle-and-daub and straw roofs.
[Avalon Archaeology's Saxon longhall](https://swheritage.org.uk/avalon-archaeology/our-story/saxon-longhall/)
uses radially split oak shingles in a reconstruction based on a late ninth-century,
high-status building. That supports shingles as a reconstruction choice, not proof
that every rural workplace had them in 825. The reconstruction also explicitly
draws on later evidence for some fittings; it is not a single-date template.

The current village kit uses a northern European material baseline, rather than
claiming one construction tradition for every European region. Straw and reed
stay tan to weathered brown; roof boards stay brown to grey-brown with irregular
splits, visible grain and overlapping ends. The palette must not make them look
like blue slate, ceramic tiles or metal sheets. The inn uses the same hand-split
boards on both roof slopes. Market shade cloth is muted, unbleached linen with
hand-sewn panels and patches; the player accent stays on its edge.

Purpose signs remain stylized pictograms, not reconstructions of a documented
local signage system. Player color is a gameplay convention applied to timber
and cloth. This material pass does not establish the historical accuracy of
existing architecture: prominent domestic chimneys and some framing details
still need a separate construction review. The Ashmolean describes houses
without chimneys. These limitations must not be presented as verified 825 AD
architecture.

Keep ground-level cues inside the placement footprint and clear of entrances.
Roofs project another 0.1 tile beyond exposed edges; shared roof seams retain
their joins, and upstairs inns keep their existing larger overhang. The market
cloth projects 0.1 tile beyond its rear two-tile canopy frame. Preserve navigation
and cutaway behavior. Use the normal
renderer and character-relative pixel scale rather than increasing resolution to
recover tiny details. `identity.test.ts` checks every catalog entry for ownership
surfaces and checks recognition cues across storage and detail states; existing
geometry tests check roof continuity and ground footprint and roof-overhang bounds.

## Greenery, wear and contrast

Houses contrast golden straw with dark weathered timber and pale clay-and-straw
front panels. Inns use charcoal framing, while taverns retain richer dark brown
wood. Blue appears on small folded or draped cloths, not blue roofing. Existing
chimneys now distinguish tapered house shafts, broad tavern shafts and square
residence shafts, with dark soot at their mouths. This varies the established
fireplace kit; it does not resolve the historical chimney limitation above.

Wall moss, climbing ivy and clustered herbs use the existing geometry and cutaway
rules. Entrance casks, chests and grass occupy the edges of the already reserved
approach tile, leaving the walking lane clear. Faceted gravel, embedded stone
chips and damp soil patches stay within dirt footprints. Ground detail is low
enough to avoid changing movement or furniture supports. No new collision plots,
render passes or pixel scaling are introduced.

Color references sampled on 13 September 2026:

- [Pete Hillman's perennial ryegrass, photographed in South Staffordshire](https://petehillmansnaturephotography.wordpress.com/perennial-rye-grass-lolium-perenne/).
  A central crop around the grass stem, filtered for green-dominant pixels, gave
  shadow/mid/light samples of `#143c1e`, `#1c4725`, and `#245028`.
- [West Glamorgan Flora's Hart's-tongue thyme-moss](https://www.westglamorganflora.org.uk/bryophytes/plagiomnium-undulatum/).
  Green-dominant pixels gave `#435520`, `#64793b`, and `#82994f`.

Samples are averages around the 20th, 45th and 70th luminance percentiles of
filtered photo pixels; they are photographic references, not calibrated species
colors. The game lifts the dark grass values for readability under its lighting,
while moss retains some warmer highlights. The shared terrain/building-apron
shader cools green atlas pixels without tinting flowers or changing their scale.
The world and minimap renown boundaries and the renown saturation overlay are
removed from rendering; gameplay renown is left to the separate refactor.

House bedding uses two separate pegged timber bunk frames. Each frame carries
aligned lower and upper mattresses, slatted decks, end rails and foot rungs;
layout variation never rotates an individual mattress away from its frame.
The four bunks still provide eight resident places, with one sleeper per bunk.
Dirt floor edges now regrow grass on exposed, untrafficked sides. Touching floors
retain continuous soil, and the existing path-wear model keeps used approaches
clear. Pixel-sized soil mottling is shared by terrain and standalone previews.
The tavern retains only its hanging entrance sign; the added round roof sign is removed.

The standalone inn has a normal-width, character-height door beneath a straight-sided
peaked entrance hood. The main covering and eave are cut away underneath it.
Tavern, inn and vendor signs share one size, hanging perpendicular to the door
on projecting timber brackets. The vendor bracket attaches to the retained
front post; the other front post and both cart-bay hitching posts are removed.
The gallery displays the existing cart and donkey assets in the normal parking
position. Tavern containers occupy the opposite side of the door from benches.
Wood shelter is removed from selectable models and the gallery. Upstairs inns
retain ladder access.

Business brackets are shortened to .61 tiles and their boards raised toward the
mount, leaving a .03-tile hanging gap. Dark timber frames and muted pictograms
keep the signs quiet; only a thin painted underline carries settlement color.
All generic small approach signs are removed. Guard post is retired from new
construction and omitted from selectable art and the building gallery.

House bunk placement reserves the log wall thickness plus clearance for the full
frames, posts and ladder rungs. Rear bunks are clamped inside the same margin.
Inn side rows include their frame width when measuring clearance from plaster;
sleeping contacts and navigation use the updated furniture positions.
