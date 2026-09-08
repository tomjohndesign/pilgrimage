import type { GameMap } from "./types"
import { shorelineCorners } from "./shoreline"

const CORNERS = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const
const BANKS = new Set(["grass", "sand", "dirt", "hills", "forest", "darkwood", "clearing"])
export interface CliffCorner { corner: number; donor: number; low: number; lower: [number, number, number, number] }

interface QueryScope {
  depth: number
  frame?: { elapsedTime: number }
  frameTime?: number
  epoch: number
  visited: Uint32Array
  cuts: (CliffCorner | undefined)[]
}
const scopes = new WeakMap<GameMap, QueryScope>()

/** Share cell geometry within a synchronous read-only terrain operation.
 * A new scope always invalidates the previous results, so even in-place edits
 * between simulation ticks are observed. Nested navigation reuses its caller.
 * Pose callbacks may share their R3F clock: they run synchronously within one
 * frame, with no terrain edits between them. Unscoped queries remain uncached;
 * a different clock, time, ordinary scope or failed callback invalidates reuse. */
export function withTerrainCornerQueries<T>(map: GameMap | undefined, read: () => T, frame?: { elapsedTime: number }): T {
  if (!map) return read()
  let scope = scopes.get(map)
  if (!scope || scope.visited.length !== map.width * map.depth) {
    scope = { depth: 0, epoch: 0, visited: new Uint32Array(map.width * map.depth), cuts: [] }
    scopes.set(map, scope)
  }
  if (scope.depth++ === 0) {
    if (!frame || scope.frame !== frame || scope.frameTime !== frame.elapsedTime) {
      if (++scope.epoch >= 0xffffffff) { scope.visited.fill(0); scope.epoch = 1 }
    }
    scope.frame = frame; scope.frameTime = frame?.elapsedTime
  }
  try { return read() }
  catch (error) { scope.frame = undefined; throw error }
  finally { scope.depth-- }
}

export function terrainCorner(map: GameMap, x: number, z: number): CliffCorner | undefined {
  const scope = scopes.get(map)
  if (!scope?.depth || x < 0 || z < 0 || x >= map.width || z >= map.depth) return computeTerrainCorner(map, x, z)
  const index = z * map.width + x
  if (scope.visited[index] !== scope.epoch) {
    scope.cuts[index] = computeTerrainCorner(map, x, z)
    scope.visited[index] = scope.epoch
  }
  return scope.cuts[index]
}

/** Shoreline halves carry their donor's height too, moving small bank lips onto the diagonal. */
function computeTerrainCorner(map: GameMap, x: number, z: number): CliffCorner | undefined {
  const cliff = cliffCorner(map, x, z)
  if (cliff) return cliff
  const corner = shorelineCorners(map, x, z).findIndex(Boolean)
  if (corner < 0) return
  const [dx, dz] = CORNERS[corner], c = (dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0)
  const donor = z * map.width + x + dx, across = (z + dz) * map.width + x
  const height = (i: number, vertex: number) => map.tiles[i] === "water"
    ? map.water?.surface?.[i] ?? map.elevation?.corners[i * 4 + vertex] ?? 0
    : map.elevation?.corners[i * 4 + vertex] ?? 0
  const h = height(donor, c ^ 1), hx = height(across, c ^ 3), hz = height(donor, c ^ 3)
  const lower: CliffCorner["lower"] = [0, 0, 0, 0]
  lower[c] = h; lower[c ^ 1] = hx; lower[c ^ 2] = hz; lower[c ^ 3] = hx + hz - h
  return { corner, donor, low: h, lower }
}

/** Two lower adjoining shelves replace half a projecting cliff tile. */
export function cliffCorner(map: GameMap, x: number, z: number): CliffCorner | undefined {
  const heights = map.elevation?.corners
  if (!heights) return
  const index = z * map.width + x
  if (!BANKS.has(map.tiles[index])) return
  const height = (i: number, c: number) => map.tiles[i] === "water"
    ? map.water?.surface?.[i] ?? heights[i * 4 + c] : heights[i * 4 + c]
  for (const [corner, [dx, dz]] of CORNERS.entries()) {
    const nx = x + dx, nz = z + dz
    if (nx < 0 || nx >= map.width || nz < 0 || nz >= map.depth) continue
    const donor = z * map.width + nx, across = nz * map.width + x, diagonal = nz * map.width + nx
    const neighbours = [donor, across, diagonal]
    if (neighbours.some(i => !BANKS.has(map.tiles[i]) && map.tiles[i] !== "water")) continue
    const wet = map.tiles[donor] === "water"
    if (neighbours.some(i => (map.tiles[i] === "water") !== wet)) continue
    const c = (dx > 0 ? 1 : 0) + (dz > 0 ? 2 : 0)
    const fromX = height(donor, c ^ 1)
    const fromZ = height(across, c ^ 2)
    const fromDiagonal = height(diagonal, c ^ 3)
    if (Math.max(fromX, fromZ, fromDiagonal) - Math.min(fromX, fromZ, fromDiagonal) > .001) continue
    const h = (fromX + fromZ) / 2
    const hx = height(across, c ^ 3), hz = height(donor, c ^ 3)
    const drops = [heights[index * 4 + c] - h, heights[index * 4 + (c ^ 1)] - hx, heights[index * 4 + (c ^ 2)] - hz]
    if (Math.max(...drops) < .08 || Math.min(...drops) < -.001) continue
    // Preserve bridge approaches, road junction shoulders and building aprons.
    let protectedSite = false
    for (let oz = -1; oz <= 1; oz++) for (let ox = -1; ox <= 1; ox++) {
      const tx = x + ox, tz = z + oz
      if (tx >= 0 && tz >= 0 && tx < map.width && tz < map.depth && ["path", "track", "bridge"].includes(map.tiles[tz * map.width + tx])) protectedSite = true
    }
    if (protectedSite || map.buildings.some(b => x >= b.x - 1 && x < b.x + b.w + 1 && z >= b.z - 1 && z < b.z + b.d + 1)) return
    const lower: CliffCorner["lower"] = [0, 0, 0, 0]
    lower[c] = h; lower[c ^ 1] = hx; lower[c ^ 2] = hz; lower[c ^ 3] = hx + hz - h
    return { corner, donor, low: h, lower }
  }
}

export function inCliffCorner(cut: CliffCorner, x: number, z: number): boolean {
  const [dx, dz] = CORNERS[cut.corner]
  return (x - .5) * dx + (z - .5) * dz > 0
}

export function cliffCornerHeight(cut: CliffCorner, x: number, z: number): number {
  const h = cut.lower
  return h[0] + x * (h[1] - h[0]) + z * (h[2] - h[0])
}

/** Plane through the three retained upper vertices, matching the clipped prism. */
export function cliffUpperHeight(map: GameMap, x: number, z: number, cut: CliffCorner, u: number, v: number): number {
  const [dx, dz] = CORNERS[cut.corner]
  const c = (dx < 0 ? 1 : 0) + (dz < 0 ? 2 : 0), offset = (z * map.width + x) * 4
  const h = map.elevation!.corners, base = h[offset + c]
  return base + (h[offset + (c ^ 1)] - base) * (dx < 0 ? 1 - u : u)
    + (h[offset + (c ^ 2)] - base) * (dz < 0 ? 1 - v : v)
}
