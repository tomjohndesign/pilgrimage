/**
 * Registry of every texture the game uses. Pure data — the /textures page
 * renders one gallery card per entry, showing the raw image alongside the item
 * it dresses, drawn with the real in-game components. Add an entry here when a
 * new texture lands and the gallery picks it up.
 */

/** Keys for the in-game preview scenes in components/texture-preview.tsx. */
export type TexturePreviewKind = "map-edge"

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
]
