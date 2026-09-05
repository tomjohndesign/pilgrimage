/**
 * Registry of every texture the game uses. Pure data — the /textures page
 * renders one gallery card per entry, showing the raw image alongside the item
 * it dresses, drawn with the real in-game components. Add an entry here when a
 * new texture lands and the gallery picks it up.
 */

import { ROAD_TIERS } from "../map/road"

/** Keys for the in-game preview scenes in components/texture-preview.tsx. */
export type TexturePreviewKind = "map-edge" | "road" | "grass"

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
  trail: "Road surface at tier 0 — the bare track pilgrims tread at the start.",
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
      "Tops of clear-land tiles, and the patches where grass has reclaimed the road.",
    source: "Generated — node scripts/generate-grass-texture.mjs",
    preview: "grass",
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
