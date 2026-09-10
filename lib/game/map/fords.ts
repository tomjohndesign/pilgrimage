import type { BridgeSpan } from "./bridges"
import { makeRng } from "../rng"
import { ROUTE_DIRS } from "./route"
import { isWaterTerrain, TERRAIN } from "./terrain"
import { tileAt, worldToTileX, worldToTileZ, type GameMap } from "./types"

/** An ankle-deep gravel bed; water level and downstream flow stay unchanged. */
export const FORD_DEPTH = 0.08
export const FORD_SPEED = 0.6
const EXISTING_BRIDGE_CHANCE = 0.15

function neighbours(map: GameMap, index: number): number[] {
  const x = index % map.width, z = Math.floor(index / map.width)
  return ROUTE_DIRS.flatMap(([dx, dz]) => {
    const nx = x + dx, nz = z + dz
    return nx >= 0 && nz >= 0 && nx < map.width && nz < map.depth ? [nz * map.width + nx] : []
  })
}

function quietRiver(map: GameMap, index: number): boolean {
  const water = map.water!
  return !!water.flow[index] && water.motion?.[index] !== "waterfall" &&
    neighbours(map, index).every(n => !water.depth[n] ||
      (water.motion?.[n] !== "waterfall" && Math.abs(water.surface![n] - water.surface![index]) <= FORD_DEPTH))
}

function makeShallow(map: GameMap, index: number): void {
  map.tiles[index] = "ford"
  map.water!.depth[index] = 1
  map.elevation!.height[index] = map.water!.surface![index] - FORD_DEPTH
}

/** Sparse gravel shelves grow from low riverbanks even when no road crosses.
 * Small, separated patches leave most shoreline and the deep channel intact. */
export function seedRiverShallows(map: GameMap): void {
  const water = map.water, elevation = map.elevation
  if (!water?.surface || !elevation) return
  const rng = makeRng((map.seed ?? 0) ^ 0x61ca42d9)
  const patches: number[] = []
  const bank = (i: number) => neighbours(map, i).find(n => !isWaterTerrain(map.tiles[n]) &&
    TERRAIN[map.tiles[n]].passable && Math.abs(elevation.height[n] - (water.surface![i] - FORD_DEPTH)) < elevation.settings.cliffThreshold * 0.8)
  for (let i = 0; i < map.tiles.length; i++) {
    if (map.tiles[i] !== "water" || water.depth[i] !== 1 || !quietRiver(map, i) || bank(i) === undefined || rng() >= 0.055) continue
    const x = i % map.width, z = Math.floor(i / map.width)
    if (patches.some(p => Math.hypot(p % map.width - x, Math.floor(p / map.width) - z) < 7)) continue
    const patch = [i], seen = new Set(patch), limit = 3 + Math.floor(rng() * 4)
    for (let q = 0; q < patch.length && patch.length < limit; q++) {
      for (const n of neighbours(map, patch[q])) {
        if (patch.length >= limit || seen.has(n)) continue
        seen.add(n)
        if (map.tiles[n] !== "water" || water.depth[n] !== 1 || bank(n) === undefined || !quietRiver(map, n) ||
          Math.abs(water.surface[n] - water.surface[i]) > FORD_DEPTH) continue
        patch.push(n)
      }
    }
    if (patch.length < 2) continue
    patches.push(i)
    for (const n of patch) makeShallow(map, n)
  }
}

export function fordSpeedAt(map: GameMap, x: number, z: number): number {
  return tileAt(map, worldToTileX(map, x), worldToTileZ(map, z)) === "ford" ? FORD_SPEED : 1
}

/** Most quiet road crossings are natural shallows. Falls retain their bridges.
 * Run before corner generation so bank descents share the terrain's own slopes.
 * A dedicated stream leaves unrelated generation rolls alone. */
export function seedFords(map: GameMap, spans: readonly BridgeSpan[]): void {
  const water = map.water, elevation = map.elevation
  if (!water?.surface || !elevation) return
  const rng = makeRng((map.seed ?? 0) ^ 0x3e92b751)
  const grade = Math.min(0.18, elevation.settings.cliffThreshold * 0.4)
  const banks: Array<{ index: number; height: number }> = []
  for (const span of spans) {
    if (rng() < EXISTING_BRIDGE_CHANCE || !span.from || !span.to) continue
    const indices = span.tiles.map(p => p.z * map.width + p.x)
    if (indices.some(i => !quietRiver(map, i))) continue
    const levels = indices.map(i => water.surface![i])
    if (Math.max(...levels) - Math.min(...levels) > FORD_DEPTH) continue
    // Preserve foundations and neighbouring bridge footings when cutting banks.
    if ([span.from, span.to].some(p => map.buildings.some(b =>
      p.x >= b.x - 6 && p.x < b.x + b.w + 6 && p.z >= b.z - 6 && p.z < b.z + b.d + 6))) continue
    if (spans.some(other => other !== span && other.tiles.some(p => span.tiles.some(q =>
      Math.abs(p.x - q.x) + Math.abs(p.z - q.z) < 5)))) continue
    // A road uses a broad natural shelf, not a one-tile strip of riverbed.
    // Grow on both sides of its crossing, with an uneven fringe farther out.
    const patch = new Set(indices)
    for (const p of span.tiles) for (const side of [-1, 1]) {
      const reach = rng() < 0.45 ? 2 : 1
      for (let offset = 1; offset <= reach; offset++) {
        const x = p.x - span.dz * side * offset, z = p.z + span.dx * side * offset
        if (x < 0 || z < 0 || x >= map.width || z >= map.depth) break
        const i = z * map.width + x
        if (map.tiles[i] !== "water" || !quietRiver(map, i) ||
          Math.abs(water.surface[i] - levels[0]) > FORD_DEPTH) break
        patch.add(i)
      }
    }
    if (patch.size <= indices.length) continue
    const approaches = [...patch].flatMap(i => neighbours(map, i)
      .filter(n => !isWaterTerrain(map.tiles[n]))
      .map(n => [{ x: n % map.width, z: Math.floor(n / map.width) }, i] as const))
    const wouldCut = (x: number, z: number) => approaches.some(([p, i]) =>
      water.surface![i] + 0.035 + grade * (Math.abs(x - p.x) + Math.abs(z - p.z)) < elevation.height[z * map.width + x] - 1e-6)
    // Deep valleys need longer descents: the nearby-tile exclusions above
    // alone cannot protect a distant foundation or another bridge's landing.
    if (map.buildings.some(b => {
      for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++)
        if (wouldCut(x, z)) return true
      return false
    })) continue
    if (spans.some(other => other !== span && [other.from, other.to].some(p => p && wouldCut(p.x, p.z)))) continue
    for (const i of patch) makeShallow(map, i)
    for (const [p, i] of approaches)
      banks.push({ index: p.z * map.width + p.x, height: water.surface[i] + 0.035 })
  }
  // Cut gentle descents from both banks. Stop once the existing ground is low
  // enough; never fill a valley or change the river's hydrology.
  for (let q = 0; q < banks.length; q++) {
    const { index, height } = banks[q]
    if (water.depth[index] || elevation.height[index] <= height) continue
    elevation.height[index] = height
    const x = index % map.width, z = Math.floor(index / map.width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz
      if (nx >= 0 && nz >= 0 && nx < map.width && nz < map.depth)
        banks.push({ index: nz * map.width + nx, height: height + grade })
    }
  }
  seedRiverShallows(map)
}
