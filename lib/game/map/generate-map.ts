import { makeRng } from "../rng"
import { computeDarkShade, computeForestShade } from "./forest-field"
import type { TerrainId } from "./terrain"
import type { GameMap, Shortcut } from "./types"

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
 * Dark forests are the old growth at the heart of the woods: a few blobs grown
 * from the deepest points of the forest-shade field, placed near the road's
 * line so they sit in its way. The road treats dark forest as very expensive
 * (never impossible, so it can never be blocked) and detours around it; then,
 * for each dark forest it went around, a secondary *track* is cut straight
 * through and kept only if it is meaningfully shorter than the detour. Tracks
 * are the dangerous short way that most travellers refuse.
 *
 * Forest, dark forest, trail, and road randomness come from separate streams
 * derived from the seed, so tuning one never moves the others' dice — though
 * the road's *route* does react to where dark forest lands, by design.
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
  /** How many dark forests to grow at the heart of the woods. */
  darkForestCount?: number
  /** Size of each dark forest as a fraction of the map. */
  darkForestShare?: number
}

export const DEFAULT_FOREST_COVERAGE = 0.6
export const DEFAULT_GLADE_COUNT = 12
export const DEFAULT_CLEARING_COUNT = 22
export const DEFAULT_DARK_FOREST_COUNT = 2
export const DEFAULT_DARK_FOREST_SHARE = 0.02

/**
 * Step cost surcharge for routing the road through dark forest. High enough
 * that a detour of a few dozen tiles always wins, low enough that a map walled
 * off by dark forest still gets a road through it.
 */
export const DARK_ROAD_COST = 25

/** Only road tiles at least this deep in the shade can seed a dark forest. */
const DARK_HEART_MIN_SHADE = 0.9
/** …unless nothing on the road is that deep, in which case settle for this. */
const DARK_HEART_FALLBACK_SHADE = 0.6
/** Dark forest hearts keep at least this far apart along the road (in x). */
const DARK_HEART_SPACING = 20
/**
 * Dark forests grow as bars standing across the road rather than round blobs:
 * a spine this many tiles north and south of the heart is painted first, then
 * fleshed out. A round blob lets the road slip past along one edge; a bar
 * forces a real detour, which is what makes a track through it worth having.
 */
const DARK_BAR_HALF = 10
/** A heart wants at least this much woods north *and* south to stand a bar in. */
const DARK_BAR_MIN_ROOM = 8
/** …and will settle for this much when the road never runs through deep woods. */
const DARK_BAR_FALLBACK_ROOM = 4
/** Dark forest stays this many tiles clear of the west and east edges. */
const DARK_EDGE_KEEP = 10
/**
 * …and of the north and south edges, so a bar never becomes a wall from the
 * map's edge that the road can only pass on one side, far away.
 */
const DARK_EDGE_KEEP_Z = 8

/** A track is only worth cutting if it's at most this fraction of the detour. */
const TRACK_MAX_RATIO = 0.85
/** The direct route is "in the dark" where the dark shade is at least this. */
const TRACK_DARK_SHADE = 0.5
/** Dark stretches of the direct route closer than this merge into one crossing. */
const TRACK_MERGE_GAP = 8
/** A track's ends sit this many tiles beyond the dark shade on the direct route. */
const TRACK_MARGIN = 4

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
    darkForestCount = DEFAULT_DARK_FOREST_COUNT,
    darkForestShare = DEFAULT_DARK_FOREST_SHARE,
  } = options

  // Independent streams (constants are arbitrary odd numbers) so each part of
  // the map only reacts to its own knobs.
  const rngForest = makeRng(seed ^ 0x1b873593)
  const rngRoad = makeRng(seed ^ 0x85ebca6b)
  const rngTrail = makeRng(seed ^ 0xc2b2ae35)
  const rngDark = makeRng(seed ^ 0x27d4eb2f)

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

  // --- Dark forests: old growth at the heart of the woods --------------------
  // A dark forest is only interesting if it's in the road's way, so hearts are
  // picked *on* a provisional road — routed exactly as the real one will be,
  // minus the dark-forest surcharge — at points deep in the forest-shade
  // field, spaced apart so they read as separate forests, and kept off the
  // map's west and east margins so the road's endpoints stay clear. The real
  // road is routed afterwards and detours around whatever grew. Growth only
  // spreads through woods (and across the trails that thread them), so a dark
  // forest never leaks across a glade.
  const provisional = routeSegment(
    { x: 0, z: entryZ },
    { x: width - 1, z: exitZ },
    width,
    depth,
    roadWander,
  )
  if (darkForestCount > 0 && darkForestShare > 0) {
    const shade = computeForestShade({ width, depth, tiles, buildings: [] })
    const inHeartland = (i: number) => {
      const x = i % width
      const z = Math.floor(i / width)
      return (
        x >= DARK_EDGE_KEEP &&
        x < width - DARK_EDGE_KEEP &&
        z >= DARK_EDGE_KEEP_Z &&
        z < depth - DARK_EDGE_KEEP_Z
      )
    }
    const canEnter = (i: number) =>
      inHeartland(i) &&
      (tiles[i] === "forest" || tiles[i] === "darkwood" || tiles[i] === "clearing")
    // How far a bar could extend from this tile before hitting open land.
    const room = (i: number, dz: number) => {
      let run = 0
      let z = Math.floor(i / width) + dz
      while (z >= 0 && z < depth && run < DARK_BAR_HALF && canEnter(z * width + (i % width))) {
        run++
        z += dz
      }
      return run
    }
    const deepEnough = (minShade: number, minRoom: number) =>
      provisional.filter(
        (i) =>
          canEnter(i) &&
          tiles[i] === "forest" &&
          shade[i] >= minShade &&
          room(i, 1) >= minRoom &&
          room(i, -1) >= minRoom,
      )
    // Roads that mostly run through glades are rare, but settle for thinner
    // woods rather than a map with no dark forest at all.
    let candidates = deepEnough(DARK_HEART_MIN_SHADE, DARK_BAR_MIN_ROOM)
    if (candidates.length === 0) candidates = deepEnough(DARK_HEART_FALLBACK_SHADE, DARK_BAR_MIN_ROOM)
    if (candidates.length === 0) {
      candidates = deepEnough(DARK_HEART_FALLBACK_SHADE, DARK_BAR_FALLBACK_ROOM)
    }

    const hearts: number[] = []
    const target = Math.round(darkForestShare * width * depth)
    for (let d = 0; d < darkForestCount && candidates.length > 0; d++) {
      // Best-of-k among the candidates that keep their distance from earlier
      // hearts: the one with the most room for a bar, then the deepest.
      const spaced = candidates.filter((i) =>
        hearts.every((h) => Math.abs((h % width) - (i % width)) >= DARK_HEART_SPACING),
      )
      if (spaced.length === 0) break
      let best = -1
      let bestScore = -Infinity
      for (let k = 0; k < 12; k++) {
        const i = spaced[Math.floor(rngDark() * spaced.length)]
        const score = Math.min(room(i, 1), room(i, -1)) + shade[i]
        if (score > bestScore) {
          bestScore = score
          best = i
        }
      }
      if (best < 0) continue
      hearts.push(best)
      growDarkForest(tiles, width, depth, best, target, rngDark, canEnter)
    }
  }

  // Everything routed from here on pays to enter dark forest — the road
  // detours, the road-tie trail skirts — but nothing is ever impassable. The
  // surcharge is feathered by the dark-shade field so it also covers the
  // clearings and trails threading the old growth: without that, the road
  // would happily ride a one-tile game trail straight through the middle.
  const darkShade = computeDarkShade({ width, depth, tiles, buildings: [] })
  const darkPenalty = (i: number) =>
    tiles[i] === "darkwood" ? DARK_ROAD_COST : DARK_ROAD_COST * darkShade[i]
  const roadCost = new Float64Array(width * depth)
  for (let i = 0; i < roadCost.length; i++) roadCost[i] = roadWander[i] + darkPenalty(i)

  // --- Where the direct route crosses the dark forest ------------------------
  // The provisional road is the direct route; where it runs through the dark
  // shade is a crossing. Each crossing gets a pair of waypoints on the direct
  // route just outside the shade. The real road is routed *through* those
  // waypoints, so after skirting the old growth it must come back to the
  // direct line — a genuine detour, not a road that merely drifted past one
  // end. The direct stretch between the waypoints becomes the track.
  const crossings: Array<[number, number]> = []
  for (let p = 0; p < provisional.length; p++) {
    if (darkShade[provisional[p]] < TRACK_DARK_SHADE) continue
    const last = crossings[crossings.length - 1]
    if (last && p - last[1] <= TRACK_MERGE_GAP) last[1] = p
    else crossings.push([p, p])
  }
  const spans: Array<[number, number]> = []
  for (const [pa, pb] of crossings) {
    const a = pa - TRACK_MARGIN
    const b = pb + TRACK_MARGIN
    const prev = spans[spans.length - 1]
    if (a <= 0 || b >= provisional.length - 1 || (prev && a <= prev[1])) continue
    spans.push([a, b])
  }

  // --- Road: west edge to east edge ------------------------------------------
  // Ordinary forest is ignored while routing — trees in the way get carved,
  // which is what guarantees the road can never be blocked. The route comes
  // back as an ordered walk, west edge to east edge; keep that order on the
  // map (`road`) so travelers know which way along is.
  const stops = [provisional[0]]
  for (const [a, b] of spans) stops.push(provisional[a], provisional[b])
  stops.push(provisional[provisional.length - 1])
  const roadTiles: number[] = []
  for (let st = 0; st < stops.length - 1; st++) {
    const segment = routeSegment(
      { x: stops[st] % width, z: Math.floor(stops[st] / width) },
      { x: stops[st + 1] % width, z: Math.floor(stops[st + 1] / width) },
      width,
      depth,
      roadCost,
    )
    // Consecutive segments share their junction tile; keep it once.
    for (let k = st === 0 ? 0 : 1; k < segment.length; k++) roadTiles.push(segment[k])
  }
  const road: Array<{ x: number; z: number }> = []
  const roadIndex = new Int32Array(width * depth).fill(-1)
  for (let k = 0; k < roadTiles.length; k++) {
    const i = roadTiles[k]
    tiles[i] = "path"
    road.push({ x: i % width, z: Math.floor(i / width) })
    if (roadIndex[i] < 0) roadIndex[i] = k
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
    const tieCost = new Float64Array(width * depth)
    for (let i = 0; i < tieCost.length; i++) tieCost[i] = trailWander[i] + darkPenalty(i)
    for (const i of routeSegment(
      bestCenter,
      { x: bestRoad % width, z: Math.floor(bestRoad / width) },
      width,
      depth,
      tieCost,
    )) {
      if (tiles[i] === "forest" || tiles[i] === "darkwood") tiles[i] = "clearing"
    }
  }

  // --- Tracks: the short way through each dark forest ------------------------
  // Kept only if it really is a shortcut and really crosses old growth — a
  // road that barely bent around a sliver earns no track.
  const shortcuts: Shortcut[] = []
  for (const [a, b] of spans) {
    const entry = roadIndex[provisional[a]]
    const exit = roadIndex[provisional[b]]
    if (entry < 0 || exit <= entry) continue
    const route = provisional.slice(a, b + 1)
    if (route.length > (exit - entry + 1) * TRACK_MAX_RATIO) continue
    if (!route.some((i) => tiles[i] === "darkwood")) continue
    for (const i of route) {
      if (tiles[i] !== "path") tiles[i] = "track"
    }
    shortcuts.push({
      entry,
      exit,
      tiles: route.map((i) => ({ x: i % width, z: Math.floor(i / width) })),
    })
  }

  return { width, depth, tiles, buildings: [], seed, road, shortcuts }
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
 * Grow one dark forest from `heart`: a straight spine north and south as far
 * as the woods allow (up to DARK_BAR_HALF each way), then organic growth off
 * it until `target` forest tiles are old growth. Only forest converts, and the
 * frontier only spreads where `canEnter` allows, so the bar threads around
 * clearings and trails but never leaks across a glade. Returns the painted
 * tile indices.
 */
function growDarkForest(
  tiles: TerrainId[],
  width: number,
  depth: number,
  heart: number,
  target: number,
  rng: () => number,
  canEnter: (i: number) => boolean,
): number[] {
  const painted: number[] = []
  const blob: number[] = []
  const inBlob = new Set<number>()
  const add = (i: number) => {
    inBlob.add(i)
    blob.push(i)
    if (tiles[i] === "forest") {
      tiles[i] = "darkwood"
      painted.push(i)
    }
  }

  add(heart)
  const hx = heart % width
  const hz = Math.floor(heart / width)
  for (const dz of [1, -1]) {
    for (let k = 1; k <= DARK_BAR_HALF; k++) {
      const z = hz + dz * k
      if (z < 0 || z >= depth || !canEnter(z * width + hx)) break
      add(z * width + hx)
    }
  }

  let attempts = target * 40
  while (painted.length < target && attempts-- > 0) {
    const from = blob[Math.floor(rng() * blob.length)]
    const [dx, dz] = DIRS[Math.floor(rng() * 4)]
    const nx = (from % width) + dx
    const nz = Math.floor(from / width) + dz
    if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
    const n = nz * width + nx
    if (inBlob.has(n) || !canEnter(n)) continue
    add(n)
  }
  return painted
}

/**
 * A* over the full grid, 4-connected, cost 1 + `extra[tile]` per step. Terrain
 * is only felt through `extra` (wander, dark-forest surcharge) — nothing is
 * impassable, so whatever needs carving gets carved by the caller.
 * Linear-scan open list; fine at prototype map sizes.
 */
export function routeSegment(
  start: { x: number; z: number },
  goal: { x: number; z: number },
  width: number,
  depth: number,
  extra: Float64Array,
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
      const cost = g[current] + 1 + extra[n]
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
