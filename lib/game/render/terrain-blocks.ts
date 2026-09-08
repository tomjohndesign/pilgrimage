import type { RoadSegment } from "./road-segments"

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
