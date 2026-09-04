import { makeRng } from "../rng"
import type { TerrainId } from "./terrain"
import type { GameMap } from "./types"

/**
 * Seeded map generation. The world is dense forest by default: the map starts
 * as solid woods, then open grass glades are carved out of it, small
 * forest-floor clearings are scattered through it, and winding trails link
 * everything together. One road runs from the west edge to the east edge. The
 * same seed always produces the identical map, so a seed number is a complete,
 * shareable description of a world — buildings are the player's job and are
 * never generated.
 *
 * Two kinds of openness, on purpose:
 *  - "grass" glades are true open land — buildable, the places to settle.
 *  - "clearing" tiles are still forest in character (no trees drawn on them,
 *    but not buildable) — the trails and small clearings that let units pass
 *    through woods that would otherwise be a solid wall of trees.
 *
 * Every glade and clearing is joined into one trail network (nearest-neighbour
 * spanning tree), and that network is tied into the road, so every passable
 * tile on a generated map is reachable from every other.
 *
 * Forest, trail, and road randomness come from separate streams derived from
 * the seed, so tuning forest knobs never moves the road's endpoints or wander
 * (and vice versa) — tuning stays comparable across renders of the same seed.
 */

export const DEFAULT_MAP_WIDTH = 96
export const DEFAULT_MAP_DEPTH = 96

export interface GenerateMapOptions {
  seed: number
  width?: number
  depth?: number
  /** Fraction of the map left as forest after the glades are carved (0–1). */
  forestCoverage?: number
  /** Number of open grass glades carved out of the forest. */
  gladeCount?: number
  /** Number of small forest-floor clearings scattered through the woods. */
  clearingCount?: number
  /** Clearing footprint in tiles. */
  clearingSizeMin?: number
  clearingSizeMax?: number
}

export const DEFAULT_FOREST_COVERAGE = 0.6
export const DEFAULT_GLADE_COUNT = 12
export const DEFAULT_CLEARING_COUNT = 22

/** Keep glade centres and road endpoints off the extreme edge tiles. */
const EDGE_MARGIN = 2

/**
 * Per-tile random surcharge on the road's step cost. Zero would give ruler
 * straight roads; much higher and the route degenerates into noise.
 */
const PATH_WANDER = 2.0

/** Trails meander more than the road — they're desire lines, not engineering. */
const TRAIL_WANDER = 3.0

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
    gladeCount = DEFAULT_GLADE_COUNT,
    clearingCount = DEFAULT_CLEARING_COUNT,
    clearingSizeMin = 2,
    clearingSizeMax = 6,
  } = options

  // Independent streams (constants are arbitrary odd numbers) so each part of
  // the map only reacts to its own knobs.
  const rngForest = makeRng(seed ^ 0x1b873593)
  const rngRoad = makeRng(seed ^ 0x85ebca6b)
  const rngTrail = makeRng(seed ^ 0xc2b2ae35)

  const tiles: TerrainId[] = new Array<TerrainId>(width * depth).fill("forest")

  const roadWander = new Float64Array(width * depth)
  for (let i = 0; i < roadWander.length; i++) roadWander[i] = rngRoad() * PATH_WANDER
  const entryZ = EDGE_MARGIN + Math.floor(rngRoad() * (depth - EDGE_MARGIN * 2))
  const exitZ = EDGE_MARGIN + Math.floor(rngRoad() * (depth - EDGE_MARGIN * 2))

  const trailWander = new Float64Array(width * depth)
  for (let i = 0; i < trailWander.length; i++) trailWander[i] = rngTrail() * TRAIL_WANDER

  // --- Glades: grass carved out of the forest until the openness target ------
  // Centres are picked best-of-k for distance from earlier glades, so the
  // openness reads as separate glades in the woods instead of one merged plain.
  const centers: Array<{ x: number; z: number }> = []
  const pickGladeCenter = (): { x: number; z: number } => {
    let best = { x: 0, z: 0 }
    let bestScore = -1
    for (let k = 0; k < 8; k++) {
      const x = EDGE_MARGIN + Math.floor(rngForest() * (width - EDGE_MARGIN * 2))
      const z = EDGE_MARGIN + Math.floor(rngForest() * (depth - EDGE_MARGIN * 2))
      let score = Infinity
      for (const c of centers) score = Math.min(score, Math.abs(x - c.x) + Math.abs(z - c.z))
      if (score > bestScore) {
        bestScore = score
        best = { x, z }
      }
    }
    return best
  }

  const gladeBudget = Math.floor((1 - forestCoverage) * width * depth)
  let carved = 0
  for (let g = 0; g < gladeCount; g++) {
    // Split what's left of the budget across the remaining glades, with some
    // variation so they differ in size — except the last glade, which takes the
    // exact remainder so total openness stays honest even when the random
    // factors all ran small.
    const variation = g === gladeCount - 1 ? 1 : 0.6 + rngForest() * 0.8
    const share = Math.round(((gladeBudget - carved) / (gladeCount - g)) * variation)
    const blob = growBlob(tiles, width, depth, share, pickGladeCenter(), rngForest, "grass")
    if (blob) {
      centers.push(blob.center)
      carved += blob.added
    }
  }

  // Blob growth stalls against map edges and earlier glades, so the planned
  // glades can come up short. Top up with extra pockets until the openness
  // budget is met — the cap keeps degenerate knob values terminating.
  let topUps = 12
  while (carved < gladeBudget && topUps-- > 0) {
    const blob = growBlob(
      tiles,
      width,
      depth,
      gladeBudget - carved,
      pickGladeCenter(),
      rngForest,
      "grass",
    )
    if (blob) {
      centers.push(blob.center)
      carved += blob.added
    }
  }

  // --- Small clearings: forest floor, passable but still woods ---------------
  for (let c = 0; c < clearingCount; c++) {
    const size =
      clearingSizeMin + Math.floor(rngForest() * (clearingSizeMax - clearingSizeMin + 1))
    const center = {
      x: 1 + Math.floor(rngForest() * (width - 2)),
      z: 1 + Math.floor(rngForest() * (depth - 2)),
    }
    const blob = growBlob(tiles, width, depth, size, center, rngForest, "clearing")
    if (blob) centers.push(blob.center)
  }

  // --- Trails: join every glade and clearing into one network ----------------
  // Nearest-neighbour spanning tree over the centres, each edge routed with the
  // wandering A* and carved as forest-floor clearing. This is what guarantees
  // the woods are threaded with passage instead of being a solid wall.
  const carveTrail = (a: { x: number; z: number }, b: { x: number; z: number }) => {
    for (const i of routeSegment(a, b, width, depth, trailWander)) {
      if (tiles[i] === "forest") tiles[i] = "clearing"
    }
  }

  const connected: number[] = centers.length > 0 ? [0] : []
  const pending = centers.map((_, i) => i).slice(1)
  while (pending.length > 0) {
    let bestPending = 0
    let bestConnected = connected[0]
    let bestDist = Infinity
    for (let p = 0; p < pending.length; p++) {
      for (const c of connected) {
        const dist =
          Math.abs(centers[pending[p]].x - centers[c].x) +
          Math.abs(centers[pending[p]].z - centers[c].z)
        if (dist < bestDist) {
          bestDist = dist
          bestPending = p
          bestConnected = c
        }
      }
    }
    const next = pending[bestPending]
    pending.splice(bestPending, 1)
    carveTrail(centers[next], centers[bestConnected])
    connected.push(next)
  }

  // --- Road: west edge to east edge ------------------------------------------
  // Terrain is ignored while routing — forest in the way gets carved, which is
  // what guarantees the road can never be blocked.
  const roadTiles: number[] = []
  for (const i of routeSegment(
    { x: 0, z: entryZ },
    { x: width - 1, z: exitZ },
    width,
    depth,
    roadWander,
  )) {
    tiles[i] = "path"
    roadTiles.push(i)
  }

  // --- Tie the trail network into the road -----------------------------------
  // One trail from the road's nearest centre keeps every passable tile on the
  // map reachable from every other, even when the road misses all the glades.
  if (centers.length > 0) {
    let bestCenter = centers[0]
    let bestRoad = roadTiles[0]
    let bestDist = Infinity
    for (const center of centers) {
      for (const i of roadTiles) {
        const dist = Math.abs((i % width) - center.x) + Math.abs(Math.floor(i / width) - center.z)
        if (dist < bestDist) {
          bestDist = dist
          bestCenter = center
          bestRoad = i
        }
      }
    }
    carveTrail(bestCenter, { x: bestRoad % width, z: Math.floor(bestRoad / width) })
  }

  return { width, depth, tiles, buildings: [], seed }
}

/**
 * Grow one organic blob of `paint` terrain from `center` by repeatedly
 * expanding a random edge of what's grown so far, until roughly `target` tiles
 * have been newly converted — tiles that are already `paint` (or otherwise not
 * forest) don't count, so budgets stay honest and glades never erase each
 * other. Returns the centre and the conversion count, or null when target is
 * zero.
 */
function growBlob(
  tiles: TerrainId[],
  width: number,
  depth: number,
  target: number,
  center: { x: number; z: number },
  rng: () => number,
  paint: TerrainId,
): { center: { x: number; z: number }; added: number } | null {
  if (target <= 0) return null
  const { x: cx, z: cz } = center

  const blob = [cz * width + cx]
  const inBlob = new Set(blob)
  let added = 0
  if (tiles[blob[0]] === "forest") {
    tiles[blob[0]] = paint
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
    if (tiles[n] === "forest") {
      tiles[n] = paint
      added++
    }
  }
  return { center: { x: cx, z: cz }, added }
}

/**
 * A* over the full grid, 4-connected, cost 1 + wander per step. Terrain is
 * deliberately ignored — whatever needs carving gets carved by the caller.
 * Linear-scan open list; fine at prototype map sizes.
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
