import type { TerrainId } from "./terrain"

export interface BuildingDef {
  id: string
  label: string
  /** Origin tile — the minimum corner of the footprint. */
  x: number
  z: number
  /** Footprint in tiles. */
  w: number
  d: number
  /** Body height in world units. */
  height: number
  color: string
  roofColor: string
}

export interface WaterInfo {
  /**
   * Row-major water depth: 0 on land, 1 (shallow shoreline) to 3 (deep) on
   * water. Bridge tiles keep the depth of the water running beneath them.
   */
  depth: number[]
  /**
   * Flow direction `[dx, dz]` per tile index. Only river water flows — a water
   * tile with no entry here is lake or pond. Bridge tiles keep their entry.
   */
  flow: Record<number, readonly [number, number]>
}

export interface GameMap {
  width: number
  depth: number
  /** Row-major, indexed by `z * width + x`. */
  tiles: TerrainId[]
  buildings: BuildingDef[]
  /** Present on generated maps; absent on hand-authored ones. Drives cosmetic RNG too. */
  seed?: number
  /** Present on generated maps; hand-authored water renders at depth 1. */
  water?: WaterInfo
}

export function tileAt(map: GameMap, x: number, z: number): TerrainId | null {
  if (x < 0 || z < 0 || x >= map.width || z >= map.depth) return null
  return map.tiles[z * map.width + x]
}

/** Tile centre in world space. The map is centred on the origin. */
export function tileToWorldX(map: GameMap, x: number): number {
  return x - map.width / 2 + 0.5
}

export function tileToWorldZ(map: GameMap, z: number): number {
  return z - map.depth / 2 + 0.5
}

export function worldToTileX(map: GameMap, wx: number): number {
  return Math.floor(wx + map.width / 2)
}

export function worldToTileZ(map: GameMap, wz: number): number {
  return Math.floor(wz + map.depth / 2)
}
