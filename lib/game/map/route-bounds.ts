import type { TilePos } from "./types"

/** Leave space for verges, junctions and scenery before the cut edge of the world. */
export const ROUTE_EDGE_INSET = 8

/** Endpoints near an edge get a short inward approach, never a route along the border. */
export function routeBounds(start: TilePos, goal: TilePos, width: number, depth: number): (x: number, z: number) => boolean {
  const inset = Math.min(ROUTE_EDGE_INSET, Math.floor((Math.min(width, depth) - 1) / 2))
  const clamp = (p: TilePos) => ({ x: Math.max(inset, Math.min(width - 1 - inset, p.x)), z: Math.max(inset, Math.min(depth - 1 - inset, p.z)) })
  const approaches = [start, goal].map(p => {
    const inner = clamp(p)
    return { minX: Math.min(p.x, inner.x), maxX: Math.max(p.x, inner.x), minZ: Math.min(p.z, inner.z), maxZ: Math.max(p.z, inner.z) }
  })
  return (x, z) => x >= 0 && z >= 0 && x < width && z < depth && (
    (x >= inset && z >= inset && x < width - inset && z < depth - inset)
    || approaches.some(a => x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ))
}
