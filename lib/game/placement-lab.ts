import { DEFAULT_BALANCE, type GameBalance } from "./balance"
import { buildingPreviewBalance } from "./building-preview"
import { finishElevation, generateElevation } from "./map/elevation"
import { HOVEL_DEPTH, HOVEL_ID, HOVEL_WIDTH } from "./map/generate-map"
import type { BuildingDef, GameMap, TilePos } from "./map/types"
import type { TerrainId } from "./map/terrain"

/** Terrain controls for the placement playground; heights are in tile units. */
export interface PlacementLabSettings {
  seed: number
  /** Maximum hill height, the elevation generator's `maxHeight`. */
  relief: number
  /** Hill wavelength in tiles, the elevation generator's `scale`. */
  wavelength: number
}

export const PLACEMENT_LAB_SIZE = 36
export const DEFAULT_PLACEMENT_LAB: PlacementLabSettings = { seed: 7919, relief: 2.4, wavelength: 12 }
export const PLACEMENT_LAB_LIMITS = {
  relief: { min: 0, max: 2.4, step: 0.1 },
  wavelength: { min: 8, max: 40, step: 1 },
} as const

export function normalizePlacementLab(input: Partial<PlacementLabSettings>): PlacementLabSettings {
  const clamp = (value: number | undefined, fallback: number, range: { min: number; max: number }) =>
    value !== undefined && Number.isFinite(value) ? Math.max(range.min, Math.min(range.max, value)) : fallback
  return {
    seed: input.seed !== undefined && Number.isFinite(input.seed) ? Math.floor(input.seed) >>> 0 : DEFAULT_PLACEMENT_LAB.seed,
    relief: clamp(input.relief, DEFAULT_PLACEMENT_LAB.relief, PLACEMENT_LAB_LIMITS.relief),
    wavelength: clamp(input.wavelength, DEFAULT_PLACEMENT_LAB.wavelength, PLACEMENT_LAB_LIMITS.wavelength),
  }
}

/** Free construction anywhere on the study map, with the tuned levelling limit under test. */
export function placementLabBalance(levellingLimit: number, base: GameBalance = DEFAULT_BALANCE): GameBalance {
  const balance = buildingPreviewBalance(base)
  return { ...balance, rules: { ...balance.rules, levellingLimit } }
}

/**
 * A founded hillside study: open grass over generated hills, the founding
 * hovel on a levelled pad, its branch running south to a road along the
 * bottom edge. Every purchase rule of the real game applies, so the playground
 * exercises exactly the grading the settlement would do.
 */
export function placementLabMap(input: PlacementLabSettings = DEFAULT_PLACEMENT_LAB): GameMap {
  const { seed, relief, wavelength } = normalizePlacementLab(input)
  const width = PLACEMENT_LAB_SIZE, depth = PLACEMENT_LAB_SIZE
  const tiles: TerrainId[] = Array(width * depth).fill("grass")
  const hovel: BuildingDef = {
    id: HOVEL_ID, label: "Founding hovel",
    x: Math.floor(width / 2) - Math.floor(HOVEL_WIDTH / 2), z: 6, w: HOVEL_WIDTH, d: HOVEL_DEPTH,
    height: 0.6, color: "#b99a72", roofColor: "#855642",
  }
  const roadZ = depth - 3
  const door: TilePos = { x: hovel.x + Math.floor(hovel.w / 2), z: hovel.z + hovel.d }
  const road = Array.from({ length: width }, (_, x) => ({ x, z: roadZ }))
  for (const tile of road) tiles[tile.z * width + tile.x] = "path"
  const branch: TilePos[] = []
  for (let z = roadZ; z >= door.z; z--) branch.push({ x: door.x, z })
  for (const tile of branch.slice(1)) tiles[tile.z * width + tile.x] = "track"
  const water = new Uint8Array(width * depth)
  // Rolling ground without the world's lowland bias or escarpments: cliffs
  // are never buildable, so only slopes teach anything here.
  const elevation = generateElevation(seed, width, depth, water, { maxHeight: relief, scale: wavelength, power: 1, cliffHeight: 0 })
  // Found the hovel on a level pad with a grass margin, as world generation does.
  const foundation = elevation.height[hovel.z * width + hovel.x]
  for (let z = hovel.z - 1; z <= hovel.z + hovel.d; z++) for (let x = hovel.x - 1; x <= hovel.x + hovel.w; x++) {
    elevation.height[z * width + x] = foundation
  }
  finishElevation(elevation, width, depth, water, [])
  return {
    width, depth, tiles, seed, buildings: [hovel], road, elevation,
    site: { hovelId: HOVEL_ID, junction: door.x, door, branch },
  }
}
