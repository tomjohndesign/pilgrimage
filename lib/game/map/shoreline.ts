import type { SideFlags } from "./road"
import { tileAt, type GameMap } from "./types"

/** Corner order: ++, +-, -+, --. Each diagonal joins opposite tile vertices, splitting the tile in half. */
export const SHORE_CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const

export function isWaterTile(map: GameMap, x: number, z: number): boolean {
  const terrain = tileAt(map, x, z)
  return terrain === "water" || terrain === "bridge"
}

/** Small bank lips can share paint; cliffs and waterfall levels cannot. */
export const SHORELINE_MAX_STEP = 0.06

/**
 * Check the shared triangle vertices and adjoining bank edges before swapping
 * shoreline halves. Larger height differences use the cliff geometry rules.
 * Slopes outside the triangle do not affect the join.
 */
function cornerSurfacesMeet(map: GameMap, x: number, z: number, dx: number, dz: number): boolean {
  if (!map.elevation && !map.water?.surface) return true
  let low = Infinity, high = -Infinity
  const c = (dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0)
  const samples = [
    { x, z, corners: [c, c ^ 1, c ^ 2] },
    { x: x + dx, z, corners: [c ^ 1, c ^ 3] },
    { x, z: z + dz, corners: [c ^ 2, c ^ 3] },
    { x: x + dx, z: z + dz, corners: [c ^ 3] },
  ]
  for (const sample of samples) {
    if (sample.x < 0 || sample.z < 0 || sample.x >= map.width || sample.z >= map.depth) return false
    const index = sample.z * map.width + sample.x
    for (const corner of sample.corners) {
      const h = isWaterTile(map, sample.x, sample.z)
        ? map.water?.surface?.[index] ?? map.elevation?.corners[index * 4 + corner] ?? 0
        : map.elevation?.corners[index * 4 + corner] ?? 0
      low = Math.min(low, h); high = Math.max(high, h)
    }
  }
  return high - low <= SHORELINE_MAX_STEP
}

/** A water tile chooses one dry half; banks defer to those choices at shared edges. */
function waterCorner(map: GameMap, x: number, z: number): number {
  if (tileAt(map, x, z) !== "water") return -1
  for (const [corner, [dx, dz]] of SHORE_CORNERS.entries()) {
    const neighbours = [[x + dx, z], [x, z + dz], [x + dx, z + dz]]
    if (neighbours.some(([nx, nz]) => {
      const t = tileAt(map, nx, nz)
      return t === null || !["sand", "grass", "dirt", "clearing", "hills", "forest", "darkwood"].includes(t)
    })) continue
    const material = (nx: number, nz: number) => {
      const t = tileAt(map, nx, nz)
      return t === "forest" || t === "darkwood" || t === "clearing" ? "grass" : t
    }
    if (material(x + dx, z) !== material(x, z + dz)) continue
    if (cornerSurfacesMeet(map, x, z, dx, dz)) return corner
  }
  return -1
}

/** Crisp half-water, half-bank corners; reciprocal edits never disagree at an edge. */
export function shorelineCorners(map: GameMap, x: number, z: number): SideFlags {
  const corners: SideFlags = [0, 0, 0, 0]
  const terrain = tileAt(map, x, z)
  if (terrain === null || !["water", "sand", "grass", "dirt", "clearing", "hills", "forest", "darkwood"].includes(terrain)) return corners
  if (map.buildings.some(b => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d)) return corners
  if (terrain === "water") {
    const corner = waterCorner(map, x, z)
    if (corner >= 0) corners[corner] = 1
    return corners
  }
  for (const [corner, [dx, dz]] of SHORE_CORNERS.entries()) {
    if (!isWaterTile(map, x + dx, z) || !isWaterTile(map, x, z + dz) || !isWaterTile(map, x + dx, z + dz)) continue
    if (!cornerSurfacesMeet(map, x, z, dx, dz)) continue
    const a = waterCorner(map, x + dx, z), b = waterCorner(map, x, z + dz)
    if ((a >= 0 && SHORE_CORNERS[a][0] === -dx) || (b >= 0 && SHORE_CORNERS[b][1] === -dz)) continue
    corners[corner] = 1
    break
  }
  return corners
}

/** Signed distance in taxicab units into the nearest corner triangle. */
export function shorelineInset(x: number, z: number, corners: SideFlags): number {
  let inset = -1
  SHORE_CORNERS.forEach(([dx, dz], i) => {
    if (corners[i]) inset = Math.max(inset, 1 - (dx > 0 ? 1 - x : x) - (dz > 0 ? 1 - z : z))
  })
  return inset
}
