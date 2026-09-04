import { makeRng } from "../rng"
import type { TerrainId } from "./terrain"
import type { GameMap } from "./types"

/**
 * Seeded map generation. Flat grass, clustered forests, and one road running
 * from the west edge to the east edge. The same seed always produces the
 * identical map, so a seed number is a complete, shareable description of a
 * world — buildings are the player's job and are never generated.
 *
 * Forests come in two kinds: large clusters, sized so that together they cover
 * `forestCoverage` of the map, and small scattered groves. The road is routed
 * with A* after the forests exist, through the two clusters nearest its
 * latitude, carving forest into path wherever it crosses — which is what
 * guarantees it threads through the woods and can never be blocked.
 *
 * Forest and road randomness come from separate streams derived from the seed,
 * so tuning forest knobs never moves the road's endpoints or wander (and vice
 * versa) — tuning stays comparable across renders of the same seed.
 */

export const DEFAULT_MAP_WIDTH = 96
export const DEFAULT_MAP_DEPTH = 96

export interface GenerateMapOptions {
  seed: number
  width?: number
  depth?: number
  /** Fraction of the map covered by large forest clusters (0–~0.5). */
  forestCoverage?: number
  /** How many large clusters that coverage is split across. */
  clusterCount?: number
  /** Number of small scattered groves. */
  groveCount?: number
  /** Grove footprint in tiles. */
  groveSizeMin?: number
  groveSizeMax?: number
}

export const DEFAULT_FOREST_COVERAGE = 0.3
export const DEFAULT_CLUSTER_COUNT = 4
export const DEFAULT_GROVE_COUNT = 6

/** Keep cluster centres and road endpoints off the extreme edge tiles. */
const EDGE_MARGIN = 2

/**
 * Per-tile random surcharge on the road's step cost. Zero would give ruler
 * straight roads; much higher and the route degenerates into noise.
 */
const PATH_WANDER = 2.0

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export function generateMap(options: GenerateMapOptions): GameMap {
  const {
    seed,
    width = DEFAULT_MAP_WIDTH,
    depth = DEFAULT_MAP_DEPTH,
    forestCoverage = DEFAULT_FOREST_COVERAGE,
    clusterCount = DEFAULT_CLUSTER_COUNT,
    groveCount = DEFAULT_GROVE_COUNT,
    groveSizeMin = 2,
    groveSizeMax = 5,
  } = options

  // Independent streams (constants are arbitrary odd numbers) so each part of
  // the map only reacts to its own knobs.
  const rngForest = makeRng(seed ^ 0x1b873593)
  const rngRoad = makeRng(seed ^ 0x85ebca6b)

  const tiles: TerrainId[] = new Array<TerrainId>(width * depth).fill("grass")

  const wander = new Float64Array(width * depth)
  for (let i = 0; i < wander.length; i++) wander[i] = rngRoad() * PATH_WANDER
  const entryZ = EDGE_MARGIN + Math.floor(rngRoad() * (depth - EDGE_MARGIN * 2))
  const exitZ = EDGE_MARGIN + Math.floor(rngRoad() * (depth - EDGE_MARGIN * 2))

  // --- Large forest clusters: grown until they hit the coverage target -------
  const clusterBudget = Math.floor(forestCoverage * width * depth)
  const centers: Array<{ x: number; z: number }> = []
  let forestCount = 0
  for (let c = 0; c < clusterCount; c++) {
    // Split what's left of the budget across the remaining clusters, with some
    // variation so the forests differ in size. Budgeting the *remainder* keeps
    // total coverage honest even when clusters grow into each other.
    const share = Math.round(
      ((clusterBudget - forestCount) / (clusterCount - c)) * (0.6 + rngForest() * 0.8),
    )
    const blob = growBlob(tiles, width, depth, share, EDGE_MARGIN, rngForest)
    if (blob) {
      centers.push(blob.center)
      forestCount += blob.added
    }
  }

  // --- Small groves ----------------------------------------------------------
  for (let g = 0; g < groveCount; g++) {
    const size = groveSizeMin + Math.floor(rngForest() * (groveSizeMax - groveSizeMin + 1))
    growBlob(tiles, width, depth, size, 1, rngForest)
  }

  // --- Road: west edge to east edge, threaded through the woods --------------
  // Waypoints guarantee the road passes through clusters instead of always
  // skirting them: the two centres nearest the road's overall latitude, visited
  // in west-to-east order.
  const midZ = (entryZ + exitZ) / 2
  const waypoints = centers
    .map((c, i) => ({ ...c, rank: Math.abs(c.z - midZ), i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, Math.min(2, centers.length))
    .sort((a, b) => a.x - b.x)

  const stops = [{ x: 0, z: entryZ }, ...waypoints, { x: width - 1, z: exitZ }]
  const road: Array<{ x: number; z: number }> = []
  for (let s = 0; s < stops.length - 1; s++) {
    const segment = routeSegment(stops[s], stops[s + 1], width, depth, wander)
    // Each segment starts where the previous one ended; skip the shared tile.
    for (const i of s === 0 ? segment : segment.slice(1)) {
      tiles[i] = "path"
      road.push({ x: i % width, z: Math.floor(i / width) })
    }
  }

  return { width, depth, tiles, buildings: [], seed, road }
}

/**
 * Grow one organic forest blob from a random centre by repeatedly expanding a
 * random edge of what's grown so far, until roughly `target` tiles have been
 * newly converted to forest — overlap with existing forest doesn't count, so
 * budgets stay honest. Returns the centre and the conversion count, or null
 * when target is zero.
 */
function growBlob(
  tiles: TerrainId[],
  width: number,
  depth: number,
  target: number,
  margin: number,
  rng: () => number,
): { center: { x: number; z: number }; added: number } | null {
  if (target <= 0) return null
  const cx = margin + Math.floor(rng() * (width - margin * 2))
  const cz = margin + Math.floor(rng() * (depth - margin * 2))

  const blob = [cz * width + cx]
  const inBlob = new Set(blob)
  let added = 0
  if (tiles[blob[0]] !== "forest") {
    tiles[blob[0]] = "forest"
    added++
  }

  // Growth can stall against edges or an earlier blob, so cap the attempts
  // rather than insisting on the exact target size.
  let attempts = target * 40
  while (added < target && attempts-- > 0) {
    const from = blob[Math.floor(rng() * blob.length)]
    const [dx, dz] = DIRS[Math.floor(rng() * 4)]
    const nx = (from % width) + dx
    const nz = Math.floor(from / width) + dz
    if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
    const n = nz * width + nx
    if (inBlob.has(n)) continue
    inBlob.add(n)
    blob.push(n)
    if (tiles[n] !== "forest") {
      tiles[n] = "forest"
      added++
    }
  }
  return { center: { x: cx, z: cz }, added }
}

/**
 * A* over the full grid, 4-connected, cost 1 + wander per step. Terrain is
 * deliberately ignored — forest in the way gets carved, which is the "never
 * blocked" guarantee. Linear-scan open list; fine at prototype map sizes.
 */
function routeSegment(
  start: { x: number; z: number },
  goal: { x: number; z: number },
  width: number,
  depth: number,
  wander: Float64Array,
): number[] {
  const size = width * depth
  const g = new Float64Array(size).fill(Infinity)
  const cameFrom = new Int32Array(size).fill(-1)
  const closed = new Uint8Array(size)

  const startIndex = start.z * width + start.x
  const goalIndex = goal.z * width + goal.x
  // Manhattan distance; admissible because every step costs at least 1.
  const h = (i: number) => Math.abs((i % width) - goal.x) + Math.abs(Math.floor(i / width) - goal.z)

  g[startIndex] = 0
  const open: number[] = [startIndex]

  while (open.length > 0) {
    let best = 0
    for (let k = 1; k < open.length; k++) {
      if (g[open[k]] + h(open[k]) < g[open[best]] + h(open[best])) best = k
    }
    const current = open[best]
    open[best] = open[open.length - 1]
    open.pop()
    if (closed[current]) continue
    closed[current] = 1
    if (current === goalIndex) break

    const cx = current % width
    const cz = Math.floor(current / width)
    for (const [dx, dz] of DIRS) {
      const nx = cx + dx
      const nz = cz + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      const n = nz * width + nx
      if (closed[n]) continue
      const cost = g[current] + 1 + wander[n]
      if (cost < g[n]) {
        g[n] = cost
        cameFrom[n] = current
        open.push(n)
      }
    }
  }

  const route: number[] = []
  for (let i = goalIndex; i !== -1; i = cameFrom[i]) route.push(i)
  return route.reverse()
}
