import type { SideFlags } from "./road"
import { tileAt, type GameMap } from "./types"

/** Corner order: ++, +-, -+, --. Each triangle reaches halfway along its two edges. */
export const SHORE_CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const

export function isWaterTile(map: GameMap, x: number, z: number): boolean {
  const terrain = tileAt(map, x, z)
  return terrain === "water" || terrain === "bridge"
}

/**
 * Clip convex water corners and fill concave banks. Adjacent triangles meet
 * at edge midpoints, turning a staircase bank into a continuous diagonal.
 * Diagonally touching bodies stay separate, and tile centres keep their
 * original terrain for navigation and square building footprints.
 */
export function shorelineCorners(map: GameMap, x: number, z: number): SideFlags {
  const corners: SideFlags = [0, 0, 0, 0]
  const terrain = tileAt(map, x, z)
  const wet = terrain === "water"
  const bank = terrain === "sand" || terrain === "grass" || terrain === "dirt" || terrain === "clearing"
  if (!wet && !bank) return corners
  if (map.buildings.some((b) => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d)) return corners
  // Extend the edge sample, so the map boundary does not create false banks.
  const water = (sx: number, sz: number) => isWaterTile(map,
    Math.max(0, Math.min(map.width - 1, sx)), Math.max(0, Math.min(map.depth - 1, sz)))
  SHORE_CORNERS.forEach(([dx, dz], corner) => {
    const a = water(x + dx, z)
    const b = water(x, z + dz)
    if (wet && !a && !b) corners[corner] = 1
    if (bank && a && b && water(x + dx, z + dz)) corners[corner] = 1
  })
  return corners
}

/** Signed distance in taxicab units into the nearest corner triangle. */
export function shorelineInset(x: number, z: number, corners: SideFlags): number {
  let inset = -1
  SHORE_CORNERS.forEach(([dx, dz], i) => {
    if (corners[i]) inset = Math.max(inset, 0.5 - (dx > 0 ? 1 - x : x) - (dz > 0 ? 1 - z : z))
  })
  return inset
}
