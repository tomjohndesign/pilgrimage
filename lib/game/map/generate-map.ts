import { makeRng } from "../rng"
import type { TerrainId } from "./terrain"
import type { BuildingDef, FoundingSite, GameMap, TilePos } from "./types"

/**
 * Seeded map generation. The world is dense forest by default: the map starts
 * as solid woods, then open grass glades are carved out of it, small
 * forest-floor clearings are scattered through it, and winding trails link
 * everything together. One road runs from the west edge to the east edge. The
 * same seed always produces the identical map, so a seed number is a complete,
 * shareable description of a world.
 *
 * Every world also comes founded: the monks' hovel already stands, with the
 * relic inside, in a glade a real detour off the road, and a beaten track
 * branches from the road to its door. That is the one building the generator
 * places — everything else is the player's job. The game begins with the hovel
 * because without it there is nothing for travelers to turn aside for.
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
  /** How far off the road the relic's hovel is sited, in tiles (see DEFAULT_RELIC_DISTANCE). */
  relicDistance?: number
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

// --- Founding site -----------------------------------------------------------

export const HOVEL_ID = "hovel"
/** Footprint of the hovel in tiles. */
export const HOVEL_SIZE = 2

/**
 * How far the hovel sits from the nearest road tile, in grid steps. Close
 * enough that a detour is plausible, far enough that it *is* a detour — the
 * gap between road and relic is the ground the whole settlement will grow on.
 * The generator accepts a band of ±25% around this target.
 */
export const DEFAULT_RELIC_DISTANCE = 24
const RELIC_DISTANCE_SPREAD = 0.25

/** The distance band the generator aims for around a target distance. */
export function relicDistanceBand(target: number): { min: number; max: number } {
  const min = Math.max(2, Math.round(target * (1 - RELIC_DISTANCE_SPREAD)))
  return { min, max: Math.max(min + 2, Math.round(target * (1 + RELIC_DISTANCE_SPREAD))) }
}

/**
 * The branch may not fork off the outermost stretch of road, so travelers from
 * either direction have road on both sides of the junction.
 */
const JUNCTION_MARGIN = 0.1

/** Side length of the neighbourhood counted as "room to grow" around a site. */
const SITE_ROOM_RADIUS = 2

/**
 * A site this close to the map edge loses score per tile of shortfall — soft,
 * so tiny maps still found, but enough that a hovel never hugs the boundary
 * when there's any interior glade to be had.
 */
const SITE_EDGE_MARGIN = 10
const SITE_EDGE_PENALTY = 4

/** Random jitter on the site score, so equally good spots don't always tie the same way. */
const SITE_SCORE_JITTER = 6

/** Grid-step cost added to tiles the branch must avoid (the road, the hovel). */
const BRANCH_AVOID_COST = 100

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
    relicDistance = DEFAULT_RELIC_DISTANCE,
  } = options

  // Independent streams (constants are arbitrary odd numbers) so each part of
  // the map only reacts to its own knobs.
  const rngForest = makeRng(seed ^ 0x1b873593)
  const rngRoad = makeRng(seed ^ 0x85ebca6b)
  const rngTrail = makeRng(seed ^ 0xc2b2ae35)
  const rngSite = makeRng(seed ^ 0x27d4eb2f)

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
  // The route comes back as an ordered walk, west edge to east edge; keep
  // that order on the map (`road`) so travelers know which way along is.
  const roadTiles: number[] = []
  const road: Array<{ x: number; z: number }> = []
  for (const i of routeSegment(
    { x: 0, z: entryZ },
    { x: width - 1, z: exitZ },
    width,
    depth,
    roadWander,
  )) {
    tiles[i] = "path"
    roadTiles.push(i)
    road.push({ x: i % width, z: Math.floor(i / width) })
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

  // --- Founding site: the hovel, its glade, and the branch to its door -------
  const { hovel, site } = foundSite(tiles, width, depth, road, relicDistance, trailWander, rngSite)

  return { width, depth, tiles, buildings: [hovel], seed, road, site }
}

/**
 * Grid-step distance from every tile to the nearest road tile, ignoring
 * terrain — the branch ignores terrain too, so this is the length of track it
 * would take to reach each spot.
 */
function roadDistanceField(width: number, depth: number, road: TilePos[]): Int32Array {
  const dist = new Int32Array(width * depth).fill(-1)
  const queue: number[] = []
  for (const p of road) {
    const i = p.z * width + p.x
    dist[i] = 0
    queue.push(i)
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    const x = i % width
    const z = Math.floor(i / width)
    for (const [dx, dz] of DIRS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      const n = nz * width + nx
      if (dist[n] !== -1) continue
      dist[n] = dist[i] + 1
      queue.push(n)
    }
  }
  return dist
}

/**
 * Choose where the relic lives and cut the way to it.
 *
 * The site is scored over every possible hovel origin: it must sit within the
 * road-distance band (or as near to it as the map allows), and among those it
 * prefers open grass around it — room for the settlement to grow — with a
 * seeded jitter so the pick varies between worlds that look alike. The
 * footprint and a one-tile ring are then guaranteed to be grass, so the hovel
 * always stands on buildable ground with breathing space, even on a map whose
 * knobs left no glade to be had.
 *
 * The branch forks from the road tile nearest the door (outside the road's
 * outer stretches) and is routed with the trail wander, steered away from the
 * road and the hovel itself so it reads as one clean track in, not a tangle.
 */
function foundSite(
  tiles: TerrainId[],
  width: number,
  depth: number,
  road: TilePos[],
  relicDistance: number,
  trailWander: Float64Array,
  rng: () => number,
): { hovel: BuildingDef; site: FoundingSite } {
  const dist = roadDistanceField(width, depth, road)
  const { min: bandMin, max: bandMax } = relicDistanceBand(relicDistance)

  // --- Score every origin the footprint fits at ------------------------------
  let best: TilePos = { x: EDGE_MARGIN, z: EDGE_MARGIN }
  let bestScore = -Infinity
  const outerMin = EDGE_MARGIN + 1 // leave room for the grass ring
  for (let z = outerMin; z <= depth - HOVEL_SIZE - outerMin; z++) {
    for (let x = outerMin; x <= width - HOVEL_SIZE - outerMin; x++) {
      let onRoad = false
      let nearest = Infinity
      for (let dz = 0; dz < HOVEL_SIZE; dz++) {
        for (let dx = 0; dx < HOVEL_SIZE; dx++) {
          const i = (z + dz) * width + (x + dx)
          if (tiles[i] === "path") onRoad = true
          nearest = Math.min(nearest, dist[i])
        }
      }
      if (onRoad) continue

      // Outside the band, every step of shortfall or excess costs more than any
      // amount of open ground can buy back — in-band sites always win if any exist.
      const bandPenalty =
        nearest < bandMin ? (bandMin - nearest) * 50 : nearest > bandMax ? (nearest - bandMax) * 50 : 0

      let room = 0
      for (let dz = -SITE_ROOM_RADIUS; dz < HOVEL_SIZE + SITE_ROOM_RADIUS; dz++) {
        for (let dx = -SITE_ROOM_RADIUS; dx < HOVEL_SIZE + SITE_ROOM_RADIUS; dx++) {
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
          if (tiles[nz * width + nx] !== "grass") continue
          // The footprint itself counts extra: standing on grass beats being near it.
          const inFootprint = dx >= 0 && dx < HOVEL_SIZE && dz >= 0 && dz < HOVEL_SIZE
          room += inFootprint ? 4 : 1
        }
      }

      const edgeDist = Math.min(x, z, width - HOVEL_SIZE - x, depth - HOVEL_SIZE - z)
      const edgePenalty = Math.max(0, SITE_EDGE_MARGIN - edgeDist) * SITE_EDGE_PENALTY

      const score = room - bandPenalty - edgePenalty + rng() * SITE_SCORE_JITTER
      if (score > bestScore) {
        bestScore = score
        best = { x, z }
      }
    }
  }

  // --- Guarantee footing: footprint plus ring become grass ---------------------
  for (let dz = -1; dz <= HOVEL_SIZE; dz++) {
    for (let dx = -1; dx <= HOVEL_SIZE; dx++) {
      const i = (best.z + dz) * width + (best.x + dx)
      if (tiles[i] === "forest" || tiles[i] === "clearing") tiles[i] = "grass"
    }
  }

  // --- Door and junction: the closest pair between the ring and the road ------
  const ring: TilePos[] = []
  for (let k = 0; k < HOVEL_SIZE; k++) {
    ring.push({ x: best.x + k, z: best.z - 1 })
    ring.push({ x: best.x + k, z: best.z + HOVEL_SIZE })
    ring.push({ x: best.x - 1, z: best.z + k })
    ring.push({ x: best.x + HOVEL_SIZE, z: best.z + k })
  }
  const lo = Math.floor(road.length * JUNCTION_MARGIN)
  const hi = Math.max(lo, Math.ceil(road.length * (1 - JUNCTION_MARGIN)) - 1)
  let door = ring[0]
  let junction = lo
  let bestDist = Infinity
  for (const d of ring) {
    for (let r = lo; r <= hi; r++) {
      const manhattan = Math.abs(road[r].x - d.x) + Math.abs(road[r].z - d.z)
      if (manhattan < bestDist) {
        bestDist = manhattan
        door = d
        junction = r
      }
    }
  }

  // --- The branch: one track from junction to door -----------------------------
  const branchWander = new Float64Array(trailWander)
  for (let i = 0; i < branchWander.length; i++) {
    if (tiles[i] === "path") branchWander[i] += BRANCH_AVOID_COST
  }
  for (let dz = 0; dz < HOVEL_SIZE; dz++) {
    for (let dx = 0; dx < HOVEL_SIZE; dx++) {
      branchWander[(best.z + dz) * width + (best.x + dx)] += BRANCH_AVOID_COST
    }
  }
  const branch: TilePos[] = []
  for (const i of routeSegment(road[junction], door, width, depth, branchWander)) {
    if (tiles[i] !== "path") tiles[i] = "track"
    branch.push({ x: i % width, z: Math.floor(i / width) })
  }

  const hovel: BuildingDef = {
    id: HOVEL_ID,
    label: "Hovel of the Relic",
    x: best.x,
    z: best.z,
    w: HOVEL_SIZE,
    d: HOVEL_SIZE,
    height: 0.55,
    color: "#8c7658",
    roofColor: "#5b4631",
  }

  return { hovel, site: { junction, branch, door, hovelId: HOVEL_ID } }
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
