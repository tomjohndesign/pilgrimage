import { makeRng } from "../rng"
import { routeBlind, ROUTE_DIRS } from "./route"
import { TERRAIN, type TerrainId } from "./terrain"
import type { GameMap } from "./types"
import { generateWater, WATER_KIND_LAKE, WATER_KIND_RIVER } from "./water"

/**
 * Seeded map generation. The world is dense forest by default: water (rivers,
 * lakes, ponds) is laid down first, then the map grows as solid woods, open
 * grass glades are carved out of it, small forest-floor clearings are
 * scattered through it, and winding trails link everything together. One road
 * runs from the west edge to the east edge. The same seed always produces the
 * identical map, so a seed number is a complete, shareable description of a
 * world — buildings are the player's job and are never generated.
 *
 * Two kinds of openness, on purpose:
 *  - "grass" glades are true open land — buildable, the places to settle.
 *  - "clearing" tiles are still forest in character (no trees drawn on them,
 *    but not buildable) — the trails and small clearings that let units pass
 *    through woods that would otherwise be a solid wall of trees.
 *
 * Water routes around everything else's guarantees rather than breaking them:
 * lakes get sand beaches, rivers get point bars, and the road and trails
 * cross rivers only on straight bridges of at most MAX_BRIDGE_SPAN tiles —
 * never lakes. Every glade and clearing is joined into one trail network
 * (nearest-neighbour spanning tree), that network is tied into the road, and
 * a final repair pass reconnects (or reforests) any pocket the water cut
 * off, so every passable tile on a generated map is reachable from every
 * other.
 *
 * Forest, trail, road, and water randomness come from separate streams
 * derived from the seed, so tuning one part's knobs never moves the others —
 * tuning stays comparable across renders of the same seed.
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
  /** Fraction of the dry land left as forest after the glades are carved (0–1). */
  forestCoverage?: number
  /** Number of open grass glades carved out of the forest. */
  gladeCount?: number
  /** Number of small forest-floor clearings scattered through the woods. */
  clearingCount?: number
  /** Clearing footprint in tiles. */
  clearingSizeMin?: number
  clearingSizeMax?: number
  /** Max fraction of the map under water (0 disables water entirely). */
  waterCoverage?: number
  /** Overrides for the seeded water layout roll (tests and tuning). */
  riverCount?: number
  lakeCount?: number
  pondCount?: number
}

export const DEFAULT_FOREST_COVERAGE = 0.6
export const DEFAULT_GLADE_COUNT = 12
export const DEFAULT_CLEARING_COUNT = 22
export const DEFAULT_WATER_COVERAGE = 0.1

/** Keep glade centres and road endpoints off the extreme edge tiles. */
const EDGE_MARGIN = 2

/**
 * Per-tile random surcharge on the road's step cost. Zero would give ruler
 * straight roads; much higher and the route degenerates into noise.
 */
const PATH_WANDER = 2.0

/** Trails meander more than the road — they're desire lines, not engineering. */
const TRAIL_WANDER = 3.0

/** A bridge can span at most this many water tiles. */
export const MAX_BRIDGE_SPAN = 5
/**
 * Extra cost per bridged water tile. High enough that routes hunt for narrow
 * crossings, low enough that they won't detour across the map to save one
 * tile of bridge.
 */
const BRIDGE_TILE_COST = 3

export function generateMap(options: GenerateMapOptions): GameMap {
  const {
    seed,
    forestCoverage = DEFAULT_FOREST_COVERAGE,
    gladeCount = DEFAULT_GLADE_COUNT,
    clearingCount = DEFAULT_CLEARING_COUNT,
    clearingSizeMin = 2,
    clearingSizeMax = 6,
    waterCoverage = DEFAULT_WATER_COVERAGE,
  } = options
  const width = Math.max(MIN_MAP_SIZE, options.width ?? DEFAULT_MAP_WIDTH)
  const depth = Math.max(MIN_MAP_SIZE, options.depth ?? DEFAULT_MAP_DEPTH)

  // Independent streams (constants are arbitrary odd numbers) so each part of
  // the map only reacts to its own knobs.
  const rngForest = makeRng(seed ^ 0x1b873593)
  const rngRoad = makeRng(seed ^ 0x85ebca6b)
  const rngTrail = makeRng(seed ^ 0xc2b2ae35)
  const rngWater = makeRng(seed ^ 0x94d049bb)

  const tiles: TerrainId[] = new Array<TerrainId>(width * depth).fill("forest")

  const roadWander = new Float64Array(width * depth)
  for (let i = 0; i < roadWander.length; i++) roadWander[i] = rngRoad() * PATH_WANDER
  const entryRoll = EDGE_MARGIN + Math.floor(rngRoad() * (depth - EDGE_MARGIN * 2))
  const exitRoll = EDGE_MARGIN + Math.floor(rngRoad() * (depth - EDGE_MARGIN * 2))

  const trailWander = new Float64Array(width * depth)
  for (let i = 0; i < trailWander.length; i++) trailWander[i] = rngTrail() * TRAIL_WANDER

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
  let landCount = 0
  for (let i = 0; i < kind.length; i++) {
    if (kind[i] !== 0) tiles[i] = "water"
    else landCount++
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
        if (kind[n] === 0 && tiles[n] === "forest") tiles[n] = "sand"
      }
    }
  }
  // Point bars — skip any whose river was trimmed by the min-size cleanup.
  for (const i of water.bars) {
    if (kind[i] !== 0 || tiles[i] !== "forest") continue
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

  // Openness is budgeted against dry land, not the whole grid, so a watery
  // seed stays as forest-dominant as a dry one.
  const gladeBudget = Math.floor((1 - forestCoverage) * landCount)
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

  // Blob growth stalls against map edges, water, and earlier glades, so the
  // planned glades can come up short. Top up with extra pockets until the
  // openness budget is met — the cap keeps degenerate knob values terminating.
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
  // Nearest-neighbour spanning tree over the centres, each edge routed with
  // the wandering A* and carved as forest-floor clearing. Trails are
  // water-aware: they route around lakes and cross rivers on short straight
  // bridges; an edge that can't be routed (a centre walled in by lake water)
  // is skipped and left to the repair pass below.
  //
  // Every carved bridge is knocked out of `passKind`, the water mask routing
  // sees, so later routes walk across existing bridges for free instead of
  // building a duplicate crossing one tile over.
  const passKind = kind.slice()
  const carveRoute = (route: number[]): void => {
    for (const i of route) {
      if (tiles[i] === "water") {
        tiles[i] = "bridge"
        passKind[i] = 0
      } else if (tiles[i] === "forest") {
        tiles[i] = "clearing"
      }
    }
  }
  const carveTrail = (a: { x: number; z: number }, b: { x: number; z: number }): void => {
    const route = routeOverLand(a, b, width, depth, trailWander, kind, passKind, MAX_BRIDGE_SPAN)
    if (route) carveRoute(route)
  }

  // Trail endpoints must be reachable land; snap centres onto the main
  // landmass (lake pockets and open water don't qualify) and drop the rest.
  const roadLand = mainLandMask(kind, width, depth)
  const trailStops = centers
    .map((c) => snapToLand(c, roadLand, width, depth))
    .filter((c): c is { x: number; z: number } => c !== null)

  const connected: number[] = trailStops.length > 0 ? [0] : []
  const pending = trailStops.map((_, i) => i).slice(1)
  while (pending.length > 0) {
    let bestPending = 0
    let bestConnected = connected[0]
    let bestDist = Infinity
    for (let p = 0; p < pending.length; p++) {
      for (const c of connected) {
        const dist =
          Math.abs(trailStops[pending[p]].x - trailStops[c].x) +
          Math.abs(trailStops[pending[p]].z - trailStops[c].z)
        if (dist < bestDist) {
          bestDist = dist
          bestPending = p
          bestConnected = c
        }
      }
    }
    const next = pending[bestPending]
    pending.splice(bestPending, 1)
    carveTrail(trailStops[next], trailStops[bestConnected])
    connected.push(next)
  }

  // --- Road: west edge to east edge ------------------------------------------
  // Routed over land with lake water impassable and rivers crossable only via
  // straight bridges, so forest in the way gets carved but water is
  // respected. The fallbacks keep the road guarantee even on hostile seeds.
  // The route comes back as an ordered walk, west edge to east edge; keep
  // that order on the map (`road`) so travelers know which way along is.
  const entryZ = snapEdgeZ(entryRoll, 0, roadLand, width, depth)
  const exitZ = snapEdgeZ(exitRoll, width - 1, roadLand, width, depth)
  const start = { x: 0, z: entryZ }
  const goal = { x: width - 1, z: exitZ }
  const roadRoute =
    routeOverLand(start, goal, width, depth, roadWander, kind, passKind, MAX_BRIDGE_SPAN) ??
    routeOverLand(start, goal, width, depth, roadWander, kind, passKind, Infinity) ??
    routeBlind(start, goal, width, depth, roadWander)

  const roadTiles: number[] = []
  const road: Array<{ x: number; z: number }> = []
  for (const i of roadRoute) {
    if (kind[i] === 0 && tiles[i] !== "bridge") {
      tiles[i] = "path"
    } else {
      // Water underneath (or an existing trail bridge being reused).
      tiles[i] = "bridge"
      passKind[i] = 0
    }
    roadTiles.push(i)
    road.push({ x: i % width, z: Math.floor(i / width) })
  }

  // --- Tie the trail network into the road -----------------------------------
  // One trail from the road's nearest centre keeps the network joined to the
  // road, even when the road misses all the glades.
  if (trailStops.length > 0) {
    let bestCenter = trailStops[0]
    let bestRoad = roadTiles[0]
    let bestDist = Infinity
    for (const center of trailStops) {
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

  // --- Keep the passable graph whole -----------------------------------------
  // Rivers and lakes can sever glades, trails, and beaches. Flood the
  // passable tiles from the road; each pocket left over gets its own trail to
  // the road when one can be routed, and reverts to forest when it can't (a
  // pocket walled in by lake water). The final sweep makes the invariant
  // unconditional: every passable tile is reachable from every other.
  for (let repair = 0; repair < 16; repair++) {
    const orphan = findOrphanTile(tiles, roadTiles, width, depth)
    if (orphan === -1) break
    const from = { x: orphan % width, z: Math.floor(orphan / width) }
    let bestRoad = -1
    let bestDist = Infinity
    for (const i of roadTiles) {
      if (kind[i] !== 0) continue
      const dist = Math.abs((i % width) - from.x) + Math.abs(Math.floor(i / width) - from.z)
      if (dist < bestDist) {
        bestDist = dist
        bestRoad = i
      }
    }
    const route =
      bestRoad === -1
        ? null
        : routeOverLand(
            from,
            { x: bestRoad % width, z: Math.floor(bestRoad / width) },
            width,
            depth,
            trailWander,
            kind,
            passKind,
            MAX_BRIDGE_SPAN,
          )
    if (route) carveRoute(route)
    else reforestComponent(tiles, orphan, width, depth)
  }
  // Whatever is still cut off after the repair budget goes back to the woods.
  for (let orphan = findOrphanTile(tiles, roadTiles, width, depth); orphan !== -1; ) {
    reforestComponent(tiles, orphan, width, depth)
    orphan = findOrphanTile(tiles, roadTiles, width, depth)
  }

  return {
    width,
    depth,
    tiles,
    buildings: [],
    seed,
    road,
    water: {
      depth: Array.from(water.depth),
      flow: Object.fromEntries(water.flow),
    },
  }
}

/**
 * Grow one organic blob of `paint` terrain from `center` by repeatedly
 * expanding a random edge of what's grown so far, until roughly `target` tiles
 * have been newly converted — tiles that are already `paint` (or otherwise not
 * forest) don't count, so budgets stay honest, glades never erase each other,
 * and water and beaches stay put (a blob may spread across a river and carve
 * both banks). Returns the centre and the conversion count, or null when
 * target is zero.
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
    const [dx, dz] = ROUTE_DIRS[Math.floor(rng() * 4)]
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
 * One passable tile that cannot reach the road by walking passable tiles, or
 * -1 when the passable graph is whole.
 */
function findOrphanTile(
  tiles: TerrainId[],
  roadTiles: number[],
  width: number,
  depth: number,
): number {
  const seen = new Uint8Array(tiles.length)
  const queue: number[] = []
  for (const i of roadTiles) {
    if (!seen[i] && TERRAIN[tiles[i]].passable) {
      seen[i] = 1
      queue.push(i)
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const x = queue[q] % width
    const z = Math.floor(queue[q] / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      const n = nz * width + nx
      if (!seen[n] && TERRAIN[tiles[n]].passable) {
        seen[n] = 1
        queue.push(n)
      }
    }
  }
  for (let i = 0; i < tiles.length; i++) {
    if (TERRAIN[tiles[i]].passable && !seen[i]) return i
  }
  return -1
}

/** Turn one cut-off passable component back into forest, starting at `start`. */
function reforestComponent(
  tiles: TerrainId[],
  start: number,
  width: number,
  depth: number,
): void {
  const component = [start]
  const seen = new Set(component)
  for (let q = 0; q < component.length; q++) {
    const x = component[q] % width
    const z = Math.floor(component[q] / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      const n = nz * width + nx
      if (!seen.has(n) && TERRAIN[tiles[n]].passable) {
        seen.add(n)
        component.push(n)
      }
    }
  }
  for (const i of component) tiles[i] = "forest"
}

/**
 * Marks land tiles routing can actually reach: flood the grid treating river
 * water as passable (rivers can be bridged) and lake water as a wall, then
 * keep the land of the largest region. Snapping road endpoints and trail
 * stops onto this mask stops a land pocket walled off by a lake — say a cove
 * on the map edge — from ever becoming an unreachable routing goal.
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
 * direction ending on dry land, costed per bridged tile so narrow crossings
 * win. Lake water is impassable, full stop.
 *
 * `pass` is `kind` with already-built bridges knocked out to 0, so routes walk
 * existing bridges like land; a *new* crossing still has to land on true land
 * (`kind` 0), never side-on into another bridge — that keeps every bridge a
 * clean straight segment. Returns null when no route exists (the road relaxes
 * the span and, as a last resort, falls back to blind routing; trails just
 * skip the edge).
 */
function routeOverLand(
  start: { x: number; z: number },
  goal: { x: number; z: number },
  width: number,
  depth: number,
  wander: Float64Array,
  kind: Uint8Array,
  pass: Uint8Array,
  maxSpan: number,
): number[] | null {
  const size = width * depth
  const g = new Float64Array(size).fill(Infinity)
  const cameFrom = new Int32Array(size).fill(-1)
  const closed = new Uint8Array(size)

  const startIndex = start.z * width + start.x
  const goalIndex = goal.z * width + goal.x
  if (pass[startIndex] !== 0 || pass[goalIndex] !== 0) return null
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

      if (pass[n] === 0) {
        if (!closed[n]) relax(n, g[current] + 1 + wander[n], current, open)
        continue
      }
      if (pass[n] === WATER_KIND_LAKE) continue
      // A new crossing must launch from dry land too — never sideways off the
      // middle of an existing bridge, which would weld the two into an L.
      if (kind[current] !== 0) continue

      // River: scan straight ahead for the far bank.
      let span = 1
      let px = nx + dx
      let pz = nz + dz
      let landing = -1
      while (span <= maxSpan) {
        if (px < 0 || pz < 0 || px >= width || pz >= depth) break
        const t = pz * width + px
        if (pass[t] === 0) {
          // A new bridge must land on dry land, not side-on into another one.
          if (kind[t] === 0) landing = t
          break
        }
        if (pass[t] !== WATER_KIND_RIVER) break
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
