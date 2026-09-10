import type { TerrainId } from "./terrain"

export interface BuildingDef {
  id: string
  /** Absent on player structures and the founding enclave. */
  owner?: "independent"
  townId?: string
  /** Building catalogue entry; absent on the founding hovel. */
  buildType?: string
  /** Clockwise quarter turns; w/d already describe the rotated footprint. */
  rotation?: import("../building-rotation").BuildingRotation
  /** Stable procedural layout; absent in older saves to preserve their entrances. */
  layoutSeed?: number
  /** Omitted uses the seeded, type-appropriate fireplace choice. */
  fireplace?: boolean
  /** Adopted chimney position along the local side wall, fixed when built. */
  hearthZ?: number
  /** Independent upper storey supported by this tavern. */
  supportId?: string
  /** Floor height above the levelled ground; zero for standalone buildings. */
  floorHeight?: number
  /** The tavern's flue passes through the upper floor without a second hearth. */
  tavernFlue?: { x: number; z: number }
  /** Gold paid by each visitor entering the relic enclosure. */
  admissionFee?: number
  /** Live worker progress; absent on completed founding structures. */
  construction?: import("../construction").Construction
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
  /** Surface relative to the base layer; always negative on water. */
  surface?: number[]
  /** Downstream neighbour index, or -1 at a still pool/outlet. */
  downstream?: number[]
  drop?: number[]
  motion?: Array<"still" | "flow" | "waterfall">
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

export interface TilePos {
  x: number
  z: number
}

/**
 * Where the relic is, and how to get there. The hovel sits a real detour off
 * the road in its own glade; the branch is the only way in. Travelers who turn
 * at the junction walk the branch to the door, venerate, and walk back out.
 */
export interface FoundingSite {
  /** Index into `road` of the tile where the branch forks off the main road. */
  junction: number
  /**
   * Ordered walk from the junction tile to the hovel's door tile, each step to
   * a 4-neighbour. The first entry is the junction itself (on the road).
   */
  branch: TilePos[]
  /** The tile the branch ends on, adjacent to the hovel's footprint. */
  door: TilePos
  /** Which entry in `buildings` is the hovel. */
  hovelId: string
}

/** A secluded old-growth destination; encounter contents are deliberately absent. */
export interface DarkForest {
  center: TilePos
  clearing: TilePos[]
  /** Ordered dry walk from the existing network into the central clearing. */
  approach: TilePos[]
}

export interface GameMap {
  /** New tracks serving wells and town buildings; these do not create marked crossroads. */
  buildingAccessTiles?: TilePos[]
  /** Reserved signpost sites where generated roads and destination tracks meet. */
  crossroads?: import("./crossroads").Crossroad[]
  /** Independent roadside communities, indexed by distance along the main road. */
  towns?: RoadsideTown[]
  /** Live walking traffic, shared by navigation and terrain; scoped to the running game. */
  footpaths?: import("../footpaths").Footpaths
  elevation?: import("./elevation").ElevationInfo
  width: number
  depth: number
  /** Row-major, indexed by `z * width + x`. */
  tiles: TerrainId[]
  buildings: BuildingDef[]
  /** Present on generated maps; absent on hand-authored ones. Drives cosmetic RNG too. */
  seed?: number
  /** Present on generated maps; hand-authored water renders at depth 1. */
  water?: WaterInfo
  /**
   * The road as an ordered walk, west edge to east edge, each step to a
   * 4-neighbour. The tile grid only says *where* road is; this says in what
   * order a traveller crosses it. Steps over rivers are shallow fords or existing bridges.
   */
  road?: TilePos[]
  /**
   * Secondary tracks: each a shorter, more dangerous walk through a dark
   * forest between two points on the road. Present on generated maps that
   * grew a dark forest the road had to go around.
   */
  shortcuts?: Shortcut[]
  /** Ancient groves, including those away from the main road. */
  darkForests?: DarkForest[]
  /** Original old-growth tile indices, before roads and their shoulders clear trees. */
  darkForestFloor?: number[]
  /** Present on generated maps: the relic's hovel and the branch that reaches it. */
  site?: FoundingSite
}

export interface RoadsideTown {
  id: string
  name: string
  junction: number
  tavernId: string
  buildingIds: string[]
}

export interface Shortcut {
  /** Indices into `road` where the track leaves it and rejoins it; entry < exit. */
  entry: number
  exit: number
  /** Ordered walk from `road[entry]` to `road[exit]` inclusive, each step to a 4-neighbour. */
  tiles: TilePos[]
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
