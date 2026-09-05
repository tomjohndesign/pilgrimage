import { makeRng } from "../rng"
import { routeBlind, ROUTE_DIRS } from "./route"
import type { TerrainId } from "./terrain"
import type { GameMap } from "./types"
import { generateWater, WATER_KIND_LAKE, WATER_KIND_RIVER } from "./water"

/**
 * Seeded map generation. Flat grass, water (rivers, lakes, ponds), clustered
 * forests, and one road running from the west edge to the east edge. The same
 * seed always produces the identical map, so a seed number is a complete,
 * shareable description of a world — buildings are the player's job and are
 * never generated.
 *
 * Order matters: water first, then sand beaches around lakes, then forests
 * (which grow around the water), then the road. The road is routed with A*
 * over land, crossing rivers only via straight bridges of at most
 * MAX_BRIDGE_SPAN tiles — wider crossings cost more, so it seeks out narrow
 * points without deflecting wildly — and never crossing lake water. Forest in
 * its way gets carved into path, which is what guarantees it threads through
 * the woods and can never be blocked.
 *
 * Forest, road, and water randomness come from separate streams derived from
 * the seed, so tuning one part's knobs never moves the others (and a map with
 * no water rolls the exact road it always had).
 */

/** Worlds are big; nothing generates smaller than this on a side. */
export const MIN_MAP_SIZE = 128

export const DEFAULT_MAP_WIDTH = 128
export const DEFAULT_MAP_DEPTH = 128

export interface GenerateMapOptions {
  seed: number
  /** Clamped up to MIN_MAP_SIZE — 128×128 is the smallest world that generates. */
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
  /** Max fraction of the map under water (0 disables water entirely). */
  waterCoverage?: number
  /** Overrides for the seeded water layout roll (tests and tuning). */
  riverCount?: number
  lakeCount?: number
  pondCount?: number
}

export const DEFAULT_FOREST_COVERAGE = 0.3
export const DEFAULT_CLUSTER_COUNT = 4
export const DEFAULT_GROVE_COUNT = 6
export const DEFAULT_WATER_COVERAGE = 0.1

/** Keep cluster centres and road endpoints off the extreme edge tiles. */
const EDGE_MARGIN = 2

/**
 * Per-tile random surcharge on the road's step cost. Zero would give ruler
 * straight roads; much higher and the route degenerates into noise.
 */
const PATH_WANDER = 2.0

/** A bridge can span at most this many water tiles. */
export const MAX_BRIDGE_SPAN = 5
/**
 * Extra cost per bridged water tile. High enough that the road hunts for
 * narrow crossings, low enough that it won't detour across the map to save
 * one tile of bridge.
 */
const BRIDGE_TILE_COST = 3

export function generateMap(options: GenerateMapOptions): GameMap {
  const {
    seed,
    forestCoverage = DEFAULT_FOREST_COVERAGE,
    clusterCount = DEFAULT_CLUSTER_COUNT,
    groveCount = DEFAULT_GROVE_COUNT,
    groveSizeMin = 2,
    groveSizeMax = 5,
    waterCoverage = DEFAULT_WATER_COVERAGE,
  } = options
  const width = Math.max(MIN_MAP_SIZE, options.width ?? DEFAULT_MAP_WIDTH)
  const depth = Math.max(MIN_MAP_SIZE, options.depth ?? DEFAULT_MAP_DEPTH)

  // Independent streams (constants are arbitrary odd numbers) so each part of
  // the map only reacts to its own knobs.
  const rngForest = makeRng(seed ^ 0x1b873593)
  const rngRoad = makeRng(seed ^ 0x85ebca6b)
  const rngWater = makeRng(seed ^ 0x94d049bb)

  const tiles: TerrainId[] = new Array<TerrainId>(width * depth).fill("grass")

  const wander = new Float64Array(width * depth)
  for (let i = 0; i < wander.length; i++) wander[i] = rngRoad() * PATH_WANDER
  const entryRoll = EDGE_MARGIN + Math.floor(rngRoad() * (depth - EDGE_MARGIN * 2))
  const exitRoll = EDGE_MARGIN + Math.floor(rngRoad() * (depth - EDGE_MARGIN * 2))

  // --- Water -----------------------------------------------------------------
  const water = generateWater({
    rng: rngWater,
    width,
    depth,
    coverage: waterCoverage,
    riverCount: options.riverCount,
    lakeCount: options.lakeCount,
    pondCount: options.pondCount,
  })
  const { kind } = water
  for (let i = 0; i < kind.length; i++) {
    if (kind[i] !== 0) tiles[i] = "water"
  }

  // --- Beaches ---------------------------------------------------------------
  // Two rings of sand around lake and pond water, plus point bars on the
  // inside of river bends. The renderer fades sand toward grass the farther a
  // tile sits from the waterline, so the band reads as a gradient, and the
  // second ring is what gives that gradient room to show.
  const shoreline: number[] = []
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const i = z * width + x
      if (kind[i] !== 0) continue
      ring: for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
          if (kind[nz * width + nx] === WATER_KIND_LAKE) {
            tiles[i] = "sand"
            shoreline.push(i)
            break ring
          }
        }
      }
    }
  }
  for (const i of shoreline) {
    const x = i % width
    const z = Math.floor(i / width)
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
        const n = nz * width + nx
        if (kind[n] === 0 && tiles[n] === "grass") tiles[n] = "sand"
      }
    }
  }
  // Point bars — skip any whose river was trimmed by the min-size cleanup.
  for (const i of water.bars) {
    if (kind[i] !== 0 || tiles[i] !== "grass") continue
    const x = i % width
    const z = Math.floor(i / width)
    bar: for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
        if (kind[nz * width + nx] !== 0) {
          tiles[i] = "sand"
          break bar
        }
      }
    }
  }

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
  // in west-to-east order. Endpoints and waypoints snap to land, since water
  // now exists before the road does.
  const roadLand = mainLandMask(kind, width, depth)
  const entryZ = snapEdgeZ(entryRoll, 0, roadLand, width, depth)
  const exitZ = snapEdgeZ(exitRoll, width - 1, roadLand, width, depth)
  const midZ = (entryZ + exitZ) / 2
  const waypoints = centers
    .map((c, i) => ({ ...c, rank: Math.abs(c.z - midZ), i }))
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .slice(0, Math.min(2, centers.length))
    .sort((a, b) => a.x - b.x)
    .map((c) => snapToLand(c, roadLand, width, depth))
    .filter((c): c is { x: number; z: number } => c !== null)

  const stops = [{ x: 0, z: entryZ }, ...waypoints, { x: width - 1, z: exitZ }]
  for (let s = 0; s < stops.length - 1; s++) {
    const route =
      routeOverLand(stops[s], stops[s + 1], width, depth, wander, kind, MAX_BRIDGE_SPAN) ??
      routeOverLand(stops[s], stops[s + 1], width, depth, wander, kind, Infinity) ??
      routeBlind(stops[s], stops[s + 1], width, depth, wander)
    for (const i of route) {
      tiles[i] = kind[i] === 0 ? "path" : "bridge"
    }
  }

  return {
    width,
    depth,
    tiles,
    buildings: [],
    seed,
    water: {
      depth: Array.from(water.depth),
      flow: Object.fromEntries(water.flow),
    },
  }
}

/**
 * Grow one organic forest blob from a random centre by repeatedly expanding a
 * random edge of what's grown so far, until roughly `target` tiles have been
 * newly converted to forest — overlap with existing forest doesn't count, so
 * budgets stay honest. Only grass converts: water and sand stay put, though the
 * blob may spread across them, so a forest can hug both banks of a river.
 * Returns the centre and the conversion count, or null when target is zero.
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
  if (tiles[blob[0]] === "grass") {
    tiles[blob[0]] = "forest"
    added++
  }

  // Growth can stall against edges or an earlier blob, so cap the attempts
  // rather than insisting on the exact target size.
  let attempts = target * 40
  while (added < target && attempts-- > 0) {
    const from = blob[Math.floor(rng() * blob.length)]
    const [dx, dz] = ROUTE_DIRS[Math.floor(rng() * 4)]
    const nx = (from % width) + dx
    const nz = Math.floor(from / width) + dz
    if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
    const n = nz * width + nx
    if (inBlob.has(n)) continue
    inBlob.add(n)
    blob.push(n)
    if (tiles[n] === "grass") {
      tiles[n] = "forest"
      added++
    }
  }
  return { center: { x: cx, z: cz }, added }
}

/**
 * Marks land tiles the road can actually reach: flood the grid treating river
 * water as passable (rivers can be bridged) and lake water as a wall, then
 * keep the land of the largest region. Snapping road endpoints and waypoints
 * onto this mask stops a land pocket walled off by a lake — say a cove on the
 * map edge — from ever becoming an unreachable routing goal.
 */
function mainLandMask(kind: Uint8Array, width: number, depth: number): Uint8Array {
  const label = new Int32Array(kind.length).fill(-1)
  let bestLabel = -1
  let bestSize = 0
  let nextLabel = 0
  for (let i = 0; i < kind.length; i++) {
    if (kind[i] === WATER_KIND_LAKE || label[i] !== -1) continue
    const l = nextLabel++
    label[i] = l
    const queue = [i]
    for (let q = 0; q < queue.length; q++) {
      const x = queue[q] % width
      const z = Math.floor(queue[q] / width)
      for (const [dx, dz] of ROUTE_DIRS) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
        const n = nz * width + nx
        if (kind[n] !== WATER_KIND_LAKE && label[n] === -1) {
          label[n] = l
          queue.push(n)
        }
      }
    }
    if (queue.length > bestSize) {
      bestSize = queue.length
      bestLabel = l
    }
  }
  const mask = new Uint8Array(kind.length)
  for (let i = 0; i < kind.length; i++) {
    if (label[i] === bestLabel && kind[i] === 0) mask[i] = 1
  }
  return mask
}

/** Nearest z on the given edge column whose tile is reachable land. */
function snapEdgeZ(
  zGuess: number,
  x: number,
  landMask: Uint8Array,
  width: number,
  depth: number,
): number {
  for (let r = 0; r < depth; r++) {
    for (const z of [zGuess - r, zGuess + r]) {
      if (z < 0 || z >= depth) continue
      if (landMask[z * width + x] === 1) return z
    }
  }
  return zGuess
}

/** Nearest reachable land tile within a few rings of the point, or null. */
function snapToLand(
  point: { x: number; z: number },
  landMask: Uint8Array,
  width: number,
  depth: number,
): { x: number; z: number } | null {
  for (let r = 0; r <= 8; r++) {
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
        const x = point.x + dx
        const z = point.z + dz
        if (x < 0 || z < 0 || x >= width || z >= depth) continue
        if (landMask[z * width + x] === 1) return { x, z }
      }
    }
  }
  return null
}

/**
 * A* over land, 4-connected, cost 1 + wander per step. River water is crossable
 * only via a straight bridge: a run of at most `maxSpan` river tiles in one
 * direction ending on land, costed per bridged tile so narrow crossings win.
 * Lake water is impassable, full stop. Returns null when no route exists (the
 * caller relaxes the span and, as a last resort, falls back to blind routing).
 */
function routeOverLand(
  start: { x: number; z: number },
  goal: { x: number; z: number },
  width: number,
  depth: number,
  wander: Float64Array,
  kind: Uint8Array,
  maxSpan: number,
): number[] | null {
  const size = width * depth
  const g = new Float64Array(size).fill(Infinity)
  const cameFrom = new Int32Array(size).fill(-1)
  const closed = new Uint8Array(size)

  const startIndex = start.z * width + start.x
  const goalIndex = goal.z * width + goal.x
  if (kind[startIndex] !== 0 || kind[goalIndex] !== 0) return null
  // Manhattan distance; admissible because every step costs at least 1.
  const h = (i: number) => Math.abs((i % width) - goal.x) + Math.abs(Math.floor(i / width) - goal.z)

  const relax = (n: number, cost: number, from: number, open: number[]) => {
    if (cost < g[n]) {
      g[n] = cost
      cameFrom[n] = from
      open.push(n)
    }
  }

  g[startIndex] = 0
  const open: number[] = [startIndex]
  let reachedGoal = false

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
    if (current === goalIndex) {
      reachedGoal = true
      break
    }

    const cx = current % width
    const cz = Math.floor(current / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = cx + dx
      const nz = cz + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      const n = nz * width + nx

      if (kind[n] === 0) {
        if (!closed[n]) relax(n, g[current] + 1 + wander[n], current, open)
        continue
      }
      if (kind[n] === WATER_KIND_LAKE) continue

      // River: scan straight ahead for the far bank.
      let span = 1
      let px = nx + dx
      let pz = nz + dz
      let landing = -1
      while (span <= maxSpan) {
        if (px < 0 || pz < 0 || px >= width || pz >= depth) break
        const t = pz * width + px
        if (kind[t] === 0) {
          landing = t
          break
        }
        if (kind[t] !== WATER_KIND_RIVER) break
        span++
        px += dx
        pz += dz
      }
      if (landing !== -1 && !closed[landing]) {
        relax(landing, g[current] + span * BRIDGE_TILE_COST + 1 + wander[landing], current, open)
      }
    }
  }

  if (!reachedGoal && goalIndex !== startIndex) return null

  const spine: number[] = []
  for (let i = goalIndex; i !== -1; i = cameFrom[i]) spine.push(i)
  spine.reverse()

  // Bridge hops skipped over their water tiles; fill each straight gap back in.
  const route: number[] = []
  for (let s = 0; s < spine.length; s++) {
    if (s > 0) {
      const a = spine[s - 1]
      const b = spine[s]
      const ax = a % width
      const az = Math.floor(a / width)
      const bx = b % width
      const bz = Math.floor(b / width)
      const steps = Math.abs(ax - bx) + Math.abs(az - bz)
      if (steps > 1) {
        const sx = Math.sign(bx - ax)
        const sz = Math.sign(bz - az)
        for (let m = 1; m < steps; m++) route.push((az + sz * m) * width + (ax + sx * m))
      }
    }
    route.push(spine[s])
  }
  return route
}
