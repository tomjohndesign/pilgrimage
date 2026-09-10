import type { RoadSegment } from "./road-segments"
import type { GameMap } from "../map/types"

/** Construction stages and ownership do not change the ground's footprint. */
export function terrainMapSnapshot(map: GameMap, previous?: GameMap): GameMap {
  if (!previous) return map
  const keys = new Set([...Object.keys(map), ...Object.keys(previous)])
  for (const key of keys) if (key !== "buildings" && map[key as keyof GameMap] !== previous[key as keyof GameMap]) return map
  if (map.buildings.length !== previous.buildings.length) return map
  const fields = ["id", "x", "z", "w", "d", "buildType", "rotation"] as const
  return map.buildings.every((b, i) => fields.every(field => b[field] === previous.buildings[i][field])) ? previous : map
}

/** Terrain has extra road/depth passes; larger blocks amortize their draw calls. */
export const TERRAIN_BLOCK = 48

export interface TerrainBlockBounds { id: number; x: number; z: number; endX: number; endZ: number }

export function terrainBlocks(width: number, depth: number): TerrainBlockBounds[] {
  const blocks: TerrainBlockBounds[] = []
  for (let z = 0; z < depth; z += TERRAIN_BLOCK) for (let x = 0; x < width; x += TERRAIN_BLOCK) {
    blocks.push({ id: z * width + x, x, z, endX: Math.min(width, x + TERRAIN_BLOCK), endZ: Math.min(depth, z + TERRAIN_BLOCK) })
  }
  return blocks
}

/** Retain a block's buffers when a traffic snapshot only changed other blocks. */
export function sameRoadSnapshot(a: { roads: ReadonlyMap<number, readonly RoadSegment[]>; wear: readonly number[] }, b: typeof a): boolean {
  if (a.roads.size !== b.roads.size || a.wear.length !== b.wear.length || a.wear.some((v, i) => v !== b.wear[i])) return false
  for (const [tile, roads] of a.roads) {
    const next = b.roads.get(tile)
    if (!next || roads.length !== next.length) return false
    for (let i = 0; i < roads.length; i++) {
      if (roads[i].length !== next[i].length || roads[i].some((v, j) => v !== next[i][j])) return false
    }
  }
  return true
}

/** Geometry revisions ignore ownership and construction progress. Only blocks
 * touching a changed footprint or height need new terrain instance buffers. */
export interface TerrainBlockState {
  map: GameMap
  footprints: string[]
  revisions: object[]
}

export function terrainBlockState(map: TerrainBlockState["map"], blocks: readonly TerrainBlockBounds[], previous?: TerrainBlockState): TerrainBlockState {
  const old = previous?.map
  const reset = !old || old.tiles !== map.tiles || old.width !== map.width || old.depth !== map.depth
    || old.water !== map.water || old.seed !== map.seed || old.road !== map.road || old.mainRoadWidth !== map.mainRoadWidth || old.site !== map.site
    || old.shortcuts !== map.shortcuts || old.elevation?.settings !== map.elevation?.settings
  const footprints = blocks.map(b => JSON.stringify(map.buildings.filter(building =>
    building.x < b.endX + 2 && building.x + building.w > b.x - 2
    && building.z < b.endZ + 2 && building.z + building.d > b.z - 2)
    .map(({ id, x, z, w, d, buildType, rotation }) => [id, x, z, w, d, buildType, rotation])))
  const revisions = blocks.map((b, index) => {
    if (reset || footprints[index] !== previous!.footprints[index]) return {}
    if (old.elevation !== map.elevation) {
      // Include neighbouring corners and diagonal cuts at block boundaries.
      for (let z = Math.max(0, b.z - 2); z < Math.min(map.depth, b.endZ + 2); z++) {
        for (let x = Math.max(0, b.x - 2); x < Math.min(map.width, b.endX + 2); x++) {
          const i = z * map.width + x
          for (const field of ["height", "slope", "cliffs"] as const) {
            if (old.elevation?.[field][i] !== map.elevation?.[field][i]) return {}
          }
          for (let c = 0; c < 4; c++) if (old.elevation?.corners[i * 4 + c] !== map.elevation?.corners[i * 4 + c]) return {}
        }
      }
    }
    return previous!.revisions[index]
  })
  return { map, footprints, revisions }
}
