import { elevationStep, type ElevationInfo } from "./elevation"
import { ROUTE_DIRS } from "./route"
import { TERRAIN, type TerrainId } from "./terrain"

/** Extend an existing flood after opening paths. Only new ground is visited;
 * callers must rebuild the flood after blocking tiles or changing elevation. */
export function expandReachable(
  tiles: TerrainId[], changed: readonly number[], seen: Uint8Array,
  width: number, depth: number, elevation: ElevationInfo,
): void {
  const queue: number[] = []
  const canStep = (a: number, b: number) => tiles[a] === "bridge" || tiles[b] === "bridge"
    || Number.isFinite(elevationStep(elevation, a, b))
  for (const i of changed) {
    if (!TERRAIN[tiles[i]].passable) continue
    if (seen[i]) { queue.push(i); continue }
    const x = i % width, z = Math.floor(i / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || !seen[n] || !canStep(n, i)) continue
      seen[i] = 1; queue.push(i); break
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % width, z = Math.floor(i / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || seen[n] || !TERRAIN[tiles[n]].passable || !canStep(i, n)) continue
      seen[n] = 1; queue.push(n)
    }
  }
}

/** Stop the dry-land search at the nearest reachable frontier. Complete that
 * distance layer to preserve the original lowest-tile-index tie break. */
export function nearestReachableLand(
  pocket: readonly number[], reached: Uint8Array, tiles: TerrainId[], walls: Uint8Array,
  width: number, depth: number, elevation: ElevationInfo,
): { from: number; to: number } | null {
  const dist = new Int32Array(tiles.length).fill(-1), origin = new Int32Array(tiles.length)
  const queue: number[] = []
  for (const i of pocket) {
    if (walls[i] || dist[i] !== -1) continue
    dist[i] = 0; origin[i] = i; queue.push(i)
  }
  let best = -1, distance = Infinity
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], d = dist[i]
    if (d > distance) break
    if (reached[i] && TERRAIN[tiles[i]].passable) {
      if (best === -1 || i < best) best = i
      distance = d
      continue
    }
    if (d === distance) continue
    const x = i % width, z = Math.floor(i / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || walls[n] || dist[n] !== -1
        || !Number.isFinite(elevationStep(elevation, i, n))) continue
      dist[n] = d + 1; origin[n] = origin[i]; queue.push(n)
    }
  }
  return best === -1 ? null : { from: origin[best], to: best }
}
