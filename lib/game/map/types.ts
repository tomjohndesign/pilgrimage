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

export interface GameMap {
  width: number
  depth: number
  /** Row-major, indexed by `z * width + x`. */
  tiles: TerrainId[]
  buildings: BuildingDef[]
  /** Present on generated maps; absent on hand-authored ones. Drives cosmetic RNG too. */
  seed?: number
  /**
   * The road as an ordered walk, west edge to east edge, each step to a
   * 4-neighbour. The tile grid only says *where* road is; this says in what
   * order a traveller crosses it.
   */
  road?: Array<{ x: number; z: number }>
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
