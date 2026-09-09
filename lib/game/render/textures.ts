/**
 * Registry of every texture the game uses. Pure data — the /textures page
 * renders one gallery card per entry, showing the raw image alongside the item
 * it dresses, drawn with the real in-game components. Add an entry here when a
 * new texture lands and the gallery picks it up.
 */

import { ROAD_TIERS } from "../map/road"

/** Keys for the in-game preview scenes in components/texture-preview.tsx. */
export type TexturePreviewKind = "map-edge" | "road" | "grass" | "ground" | "water" | "sand" | "forest"

export interface TextureEntry {
  id: string
  label: string
  /** Path under public/. */
  url: string
  /** What in the game wears this texture. */
  appliedTo: string
  /** Where the image comes from, for whoever wants to change it. */
  source: string
  preview: TexturePreviewKind
  /** For "road" previews: which development tier to render the road at. */
  roadTier?: number
}

const ROAD_TIER_NOTES: Record<string, string> = {
  trail:
    "Road surface at tier 0 — the bare track pilgrims tread at the start. Light ochre with sparse flecks; traffic shapes its grassy verges.",
  gravel: "Road surface at tier 1 — crushed stone packed into the trail.",
  cobble: "Road surface at tier 2 — rounded setts with earth joints.",
  flagstone: "Road surface at tier 3 — cut slabs laid in offset courses.",
}

export const TEXTURES: TextureEntry[] = [
  {
    id: "dirt-side",
    label: "Dirt Cliff",
    url: "/textures/dirt-side.png",
    appliedTo: "Sides of the map slab — the block of earth the world sits on.",
    source: "Generated — node scripts/generate-dirt-texture.mjs",
    preview: "map-edge",
  },
  {
    id: "grass",
    label: "Sward",
    url: "/textures/grass.png",
    appliedTo:
      "Tops of clear-land tiles, under the forest floor, and under every road tile — showing through wherever the surface is thin, worn away, or reclaimed.",
    source: "Generated — node scripts/generate-grass-texture.mjs",
    preview: "grass",
  },
  ...[ ["meadow", "Meadow clumps"], ["groundcover", "Creeping leaves"], ["flowers", "Flowering meadow"] ].map(
    ([id, label]): TextureEntry => ({
      id: `grass-${id}`, label, url: `/textures/grass-${id}.png`,
      appliedTo: "Plant palette swatch. In game, individual sprites form continuous colonies shaped by neighbouring terrain.",
      source: "Generated — node scripts/generate-grass-texture.mjs (from the environment sprite bake)",
      preview: "grass",
    }),
  ),
  {
    id: "dark-forest-floor", label: "Dark forest floor", url: "/textures/dark-forest-floor-v2.png",
    appliedTo: "Muted brown and olive leaf litter and dead twigs in ancient groves, their clearings and tracks. Darkness is authored into the sprite palette.",
    source: "Built-in imagegen — assets/recipes/textures.json#dark-forest-floor", preview: "forest",
  },
  {
    id: "forest-floor", label: "Forest floor", url: "/textures/forest-floor-v1.png",
    appliedTo: "Fallen leaves, humus, twigs and moss beneath standing woodland, with sparse litter at the edge.",
    source: "Built-in imagegen — assets/recipes/textures.json#forest-floor", preview: "forest",
  },
  {
    id: "ground",
    label: "Earth & hills",
    url: "/textures/ground.png",
    appliedTo: "Sparse mineral flecks on earth and hills, with diagonal half-tiles where adjacent ground types meet.",
    source: "Generated — node scripts/generate-ground-textures.mjs",
    preview: "ground",
  },
  {
    id: "sand",
    label: "Sandy banks",
    url: "/textures/sand.png",
    appliedTo: "Warm grains and short wind combs, with crisp diagonal tiles split between grass and sand at corners.",
    source: "Generated — node scripts/generate-ground-textures.mjs",
    preview: "sand",
  },
  {
    id: "water",
    label: "Water ripples",
    url: "/textures/water.png",
    appliedTo: "Short pixel ripples over depth-coloured water, drifting and fading gently.",
    source: "Generated — node scripts/generate-ground-textures.mjs",
    preview: "water",
  },
  ...ROAD_TIERS.map(
    (tier): TextureEntry => ({
      id: `road-${tier.id}`,
      label: tier.label,
      url: tier.textureUrl,
      appliedTo: ROAD_TIER_NOTES[tier.id],
      source: "Generated — node scripts/generate-road-textures.mjs",
      preview: "road",
      roadTier: tier.tier,
    }),
  ),
]
