import { CHARACTER_PIXEL_SIZE } from "../../render/pixel-scale"

export const FOLIAGE_SPECIES = ["oak", "beech", "birch", "scotsPine", "hawthorn", "holly"] as const
export type FoliageSpecies = typeof FOLIAGE_SPECIES[number]
export interface FoliageDesign {
  height: number
  spread: number
  density: number
  leafSize: number
}
export type FoliageDesigns = Record<FoliageSpecies, FoliageDesign>
export const DEFAULT_FOLIAGE: FoliageDesigns = {
  oak: { height: 2.65, spread: 1, density: 1, leafSize: 1 },
  beech: { height: 2.95, spread: 1.05, density: 1.1, leafSize: 1.05 },
  hawthorn: { height: 1.8, spread: 0.72, density: 0.9, leafSize: 1 },
  holly: { height: 2.35, spread: 0.65, density: 1.2, leafSize: 1 },
  birch: { height: 2.95, spread: 0.72, density: 1.15, leafSize: 1.05 },
  scotsPine: { height: 3.15, spread: 0.95, density: 1, leafSize: 1 },
}
/** Related cool, moss and olive ramps: color patches follow whole leaf clusters. */
export const FOLIAGE_RAMPS = [
  ["#22332c", "#2c3f34", "#3b503d", "#4b6246", "#607652", "#788c66"],
  ["#283325", "#35432b", "#465535", "#5b6a40", "#717e4e", "#889263"],
  ["#323725", "#42492d", "#575e37", "#6c7542", "#838950", "#989c66"],
] as const
export const FOLIAGE_PALETTE = FOLIAGE_RAMPS.flat()
export const BARK_PALETTE = ["#423c30", "#5a503d", "#74654c", "#918067", "#aaa38a", "#c0b99e", "#77756a"]
export const FOLIAGE_FRAME = {
  cellSize: 192,
  extent: 192 * CHARACTER_PIXEL_SIZE,
  anchor: [96, 171] as const,
  directions: 8,
  variants: 3,
  // Ordinary species, ancient counterparts, then three bare snag variants.
  rows: FOLIAGE_SPECIES.length * 3 * 2 + 3,
} as const
export interface FoliageAtlas {
  frame: typeof FOLIAGE_FRAME
  color: string
  depth: string
  designs: FoliageDesigns
  safePadding: number
}
export function isFoliageSpecies(id: string): id is FoliageSpecies {
  return (FOLIAGE_SPECIES as readonly string[]).includes(id)
}
