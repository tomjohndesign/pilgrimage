import { expandReachable, nearestReachableLand } from "./connectivity"
import { generateLegacyMap } from "./legacy-generate-map"
import { DEFAULT_SETTINGS, PLAYABLE_SEED_REGION_SIZE, sampleWoodland, seedingMethodForSeed } from "./woodland"
import { MAIN_ROAD_WIDTH, clearMainRoadVerge } from "./road-width"
import { routeBounds, ROUTE_EDGE_INSET } from "./route-bounds"
import { createCrossroads } from "./crossroads"
import { straightenRoad } from "./straighten-road"
import { addRoadsideTowns } from "./roadside-towns"
import { addFoundingWell, addPathSprings } from "./seeded-water"
import { beachAccess } from "./beaches"
import { taperRiverBanks, gradeBridgeApproaches } from "./river-banks"
import { cliffVergeCost, clearCliffsBesideRoads } from "./road-cliffs"
import { bridgeLayout } from "./bridges"
import { seedFords } from "./fords"
import { generateElevation, finishElevation, levelBuildingGround, elevationStep, type ElevationInfo, type ElevationSettings } from "./elevation"
import { drainWater } from "./hydrology"
import { makeRng } from "../rng"
import { computeDarkShade, computeForestShade } from "./forest-field"
import { MinHeap, routeBlind, eraseRouteLoops, ROUTE_DIRS } from "./route"
import { isWoods, TERRAIN, type TerrainId } from "./terrain"
import type { BuildingDef, FoundingSite, GameMap, Shortcut, TilePos, DarkForest } from "./types"
import { generateWater, WATER_KIND_LAKE, WATER_KIND_RIVER } from "./water"

/** Seed-selected wind-spread or cellular woodland, sampled at fixed tile scale.
 * Jagged ancient forests sit inside normal canopy, with large irregular hearts
 * and one narrow destination approach. Main clearings connect to the road;
 * rivers use bank-to-bank fords or bridges and lakes remain barriers. Founding reserves
 * a church, shelter, dry gate path, and nearby ordinary lumber. Independent
 * random streams keep terrain and route tuning reproducible. */

/** Worlds are big; nothing generates smaller than this on a side. */
export const MIN_MAP_SIZE = 128

export const DEFAULT_MAP_WIDTH = 192
export const DEFAULT_MAP_DEPTH = 192

export interface GenerateMapOptions {
  /** Saved-world compatibility; new worlds use generation 2. */
  generation?: number
  elevation?: Partial<ElevationSettings>
  seed: number
  /** Clamped up to MIN_MAP_SIZE — 128×128 is the smallest world that generates. */
  width?: number
  depth?: number
  /** Fraction of the dry land left as forest after the glades are carved (0–1). */
  forestCoverage?: number
  /** Open-glade density per reference 192×192 region. */
  gladeCount?: number
  /** Number of small forest-floor clearings scattered through the woods. */
  clearingCount?: number
  /** Clearing footprint in tiles. */
  clearingSizeMin?: number
  clearingSizeMax?: number
  /** Number of dead-end spurs branching off the trail network to nowhere. */
  spurCount?: number
  /** How far off the road the relic's hovel is sited, in tiles (see DEFAULT_RELIC_DISTANCE). */
  relicDistance?: number
  /** Max fraction of the map under water (0 disables water entirely). */
  waterCoverage?: number
  /** Overrides for the seeded water layout roll (tests and tuning). */
  riverCount?: number
  lakeCount?: number
  pondCount?: number
  /** Ancient grove density per reference 192×192 region. */
  darkForestCount?: number
  /** Size of each ancient grove as a fraction of a reference 192×192 region. */
  darkForestShare?: number
}

export const DEFAULT_FOREST_COVERAGE = 0.4
export const DEFAULT_GLADE_COUNT = 8
export const DEFAULT_CLEARING_COUNT = 22
export const DEFAULT_SPUR_COUNT = 8
export const DEFAULT_WATER_COVERAGE = 0.1
export const DEFAULT_DARK_FOREST_COUNT = 1
export const DEFAULT_DARK_FOREST_SHARE = 0.09

/** How far a spur aims from the trail it leaves, in tiles, before it fades. */
const SPUR_REACH_MIN = 8
const SPUR_REACH_MAX = 24

/** Keep glade centres and road endpoints off the extreme edge tiles. */
const EDGE_MARGIN = 2

/**
 * Per-tile random surcharge on the road's step cost. Zero would give ruler
 * straight roads; much higher and the route degenerates into noise.
 */
const PATH_WANDER = 2.0

/** Trails meander more than the road — they're desire lines, not engineering. */
const TRAIL_WANDER = 3.0

/**
 * Extra step cost for the road by the ground it would be laid across. Open
 * grass and sand are free; forest floor (clearings and trails) takes a little
 * widening; solid forest has to be felled tree by tree. The forest cost is
 * the exchange rate for detours — the road will go up to this many tiles out
 * of its way to avoid felling one — so it hunts for glades and, where it must
 * cross a belt of trees, for the narrowest crossing, without wandering the
 * whole map to do it.
 */
const ROAD_FOREST_COST = 3
const ROAD_CLEARING_COST = 1

/** A bridge can span at most this many water tiles. */
export const MAX_BRIDGE_SPAN = 5
/**
 * Extra cost per bridged water tile. High enough that routes hunt for narrow
 * crossings, low enough that they won't detour across the map to save one
 * tile of bridge.
 */
const BRIDGE_TILE_COST = 3

// --- Dark forest -------------------------------------------------------------

/**
 * Step cost surcharge for routing the road through dark forest. High enough
 * that a detour of a few dozen tiles always wins, low enough that a map walled
 * off by dark forest still gets a road through it.
 */
export const DARK_ROAD_COST = 25

// --- Founding site -----------------------------------------------------------

export const HOVEL_ID = "hovel"
/** Footprint of the hovel in tiles. */
export const HOVEL_WIDTH = 3
export const HOVEL_DEPTH = 5

/**
 * How far the hovel sits from the nearest road tile, in grid steps. Far — a
 * real journey into the woods, not a stroll off the verge: the gap between
 * road and relic is the ground the whole settlement will grow on, and the
 * further the relic, the more world there is to build before the two meet.
 * On the 192-tile default map this puts the hovel a quarter of the way
 * across from the road. The generator accepts a band of ±25% around this
 * target.
 */
export const DEFAULT_RELIC_DISTANCE = 48
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

/**
 * Exclusion zone around the fork to the shrine, in tiles. No trunk stands
 * within this of the junction, so the way in is read from the road as an
 * opening in the woods rather than found by walking into the treeline. Wide
 * enough that the fork and both approaches along the road sit in the open,
 * tight enough that it reads as a clearing and not a second glade.
 */
export const JUNCTION_CLEARING_RADIUS = 3

/** Chance a tile on the exclusion zone's outer ring keeps its trees, ragging the rim. */
const JUNCTION_CLEARING_RAGGED = 0.45

export function generateMap(options: GenerateMapOptions): GameMap {
  if (options.generation === 1) return generateLegacyMap(options)
  const {
    seed,
    forestCoverage = DEFAULT_FOREST_COVERAGE,
    gladeCount = DEFAULT_GLADE_COUNT,
    clearingCount = DEFAULT_CLEARING_COUNT,
    clearingSizeMin = 2,
    clearingSizeMax = 6,
    spurCount = DEFAULT_SPUR_COUNT,
    relicDistance = DEFAULT_RELIC_DISTANCE,
    waterCoverage = DEFAULT_WATER_COVERAGE,
    darkForestCount = DEFAULT_DARK_FOREST_COUNT,
    darkForestShare = DEFAULT_DARK_FOREST_SHARE,
  } = options
  const width = Math.max(MIN_MAP_SIZE, options.width ?? DEFAULT_MAP_WIDTH)
  const depth = Math.max(MIN_MAP_SIZE, options.depth ?? DEFAULT_MAP_DEPTH)

  // Independent streams (constants are arbitrary odd numbers) so each part of
  // the map only reacts to its own knobs.
  const rngForest = makeRng(seed ^ 0x1b873593)
  const rngRoad = makeRng(seed ^ 0x85ebca6b)
  const rngTrail = makeRng(seed ^ 0xc2b2ae35)
  const rngSite = makeRng(seed ^ 0x27d4eb2f)
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
    landmarkArea: Math.min(width * depth, DEFAULT_MAP_WIDTH * DEFAULT_MAP_DEPTH),
  })
  const { kind } = water
  const elevation = generateElevation(seed, width, depth, kind, options.elevation, water.flow)
  const waterInfo = drainWater(kind, water.depth, width, depth, elevation)
  taperRiverBanks(elevation, width, depth, kind, waterInfo, water.flow, seed)
  // Roads and tracks keep a cliff-free verge; routing pays to hug a cliff face.
  const cliffVerge = cliffVergeCost(elevation, width, depth, kind)
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

  // Sample the same wind-spread/cellular canopy used by the map lab. Keep
  // feature sizes in tiles; sampling a larger region adds stands and glades.
  const woodlandMethod = seedingMethodForSeed(seed)
  const woodland = sampleWoodland(woodlandMethod, { ...DEFAULT_SETTINGS, seed,
    forest: forestCoverage * 100, clearings: gladeCount,
    darkCount: darkForestCount, darkShare: darkForestShare * 100,
    water: 0, rivers: 0, lakes: 0 }, width, depth, PLAYABLE_SEED_REGION_SIZE)
  for (let i = 0; i < tiles.length; i++) if (!kind[i] && tiles[i] !== "sand") {
    tiles[i] = woodland.darkMask[i] ? "darkwood" : woodland.tiles[i]
  }
  // Keep old growth inside a normal woodland belt beside actual shorelines.
  // The outer map can crop normal groves, while road portals stay outside darkwood.
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x
    if (tiles[i] !== "darkwood") continue
    // A cropped ancient stand still needs a normal-woodland border, but a
    // straight inset would turn its silhouette into a conspicuous square.
    const edgeBelt = 12 + Math.round(2 * Math.sin(x / 3 + seed) + 2 * Math.sin(z / 4 - seed))
    let rim = Math.min(x, z, width - 1 - x, depth - 1 - z) < edgeBelt
    for (let dz = -5; dz <= 5 && !rim; dz++) for (let dx = -5; dx <= 5; dx++) {
      const nx = x + dx, nz = z + dz
      if (nx >= 0 && nz >= 0 && nx < width && nz < depth && kind[nz * width + nx]) { rim = true; break }
    }
    if (rim) tiles[i] = "forest"
  }
  const heartShapes = new Map<number, number[]>()
  const darkHearts: number[] = []
  const assignedDark = new Uint8Array(tiles.length)
  for (const c of woodland.clearings.filter(c => c.kind === "heart")) {
    const heart = c.z * width + c.x
    if (tiles[heart] !== "darkwood" || assignedDark[heart]) continue
    const shape = new Set(c.tiles.filter(i => {
      const x = i % width, z = Math.floor(i / width)
      for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
        const nx = x + dx, nz = z + dz
        if (nx < 0 || nz < 0 || nx >= width || nz >= depth || tiles[nz * width + nx] !== "darkwood") return false
      }
      return true
    }))
    if (!shape.has(heart)) continue
    const clearing = [heart], seen = new Set(clearing)
    for (let head = 0; head < clearing.length; head++) for (const [dx, dz] of ROUTE_DIRS) {
      const i = clearing[head], n = i + dz * width + dx
      if (shape.has(n) && !seen.has(n) && Number.isFinite(elevationStep(elevation, i, n))) { seen.add(n); clearing.push(n) }
    }
    // A lake or cliff may erase this destination, but never leave a tiny round substitute.
    if (clearing.length < 100) continue
    const component = [heart]; assignedDark[heart] = 1
    for (let head = 0; head < component.length; head++) for (const [dx, dz] of ROUTE_DIRS) {
      const i = component[head], x = i % width + dx, z = Math.floor(i / width) + dz, n = z * width + x
      if (x >= 0 && z >= 0 && x < width && z < depth && tiles[n] === "darkwood" && !assignedDark[n]) { assignedDark[n] = 1; component.push(n) }
    }
    heartShapes.set(heart, clearing); darkHearts.push(heart)
  }
  const centers: TilePos[] = []
  for (const c of woodland.clearings.filter(c => c.kind === "main")) {
    // The canopy study has no elevation. Its nominal centre can land on a
    // one-tile cliff face, so anchor the live destination on the largest
    // walkable part of that same clearing instead of stranding it on a ledge.
    const remaining = new Set(c.tiles.filter(i => !kind[i] && tiles[i] === "grass"))
    let largest: number[] = []
    while (remaining.size) {
      const patch = [remaining.values().next().value!]; remaining.delete(patch[0])
      for (let head = 0; head < patch.length; head++) for (const [dx, dz] of ROUTE_DIRS) {
        const i = patch[head], x = i % width + dx, z = Math.floor(i / width) + dz, n = z * width + x
        if (x >= 0 && z >= 0 && x < width && z < depth && remaining.has(n) && Number.isFinite(elevationStep(elevation, i, n))) {
          remaining.delete(n); patch.push(n)
        }
      }
      if (patch.length > largest.length) largest = patch
    }
    if (!largest.length) continue
    const anchor = largest.reduce((best, i) => Math.hypot(i % width - c.x, Math.floor(i / width) - c.z)
      < Math.hypot(best % width - c.x, Math.floor(best / width) - c.z) ? i : best)
    centers.push({ x: anchor % width, z: Math.floor(anchor / width) })
  }

  const mainClearings = centers.slice()

  // --- Small clearings: forest floor, passable but still woods ---------------
  for (let c = 0; c < clearingCount; c++) {
    const size =
      clearingSizeMin + Math.floor(rngForest() * (clearingSizeMax - clearingSizeMin + 1))
    const center = {
      x: 1 + Math.floor(rngForest() * (width - 2)),
      z: 1 + Math.floor(rngForest() * (depth - 2)),
    }
    if (tiles[center.z * width + center.x] !== "forest") continue
    const blob = growBlob(tiles, width, depth, size, center, rngForest, "clearing")
    if (blob) centers.push(blob.center)
  }

  // --- Trails: dry links and optional woodland spurs -------------------------
  // Full main-clearing connections are completed after the road establishes
  // river crossings. Old growth is a wall until its single approach is carved.
  const passKind = kind.slice()
  const walkable = kind.slice()
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === "darkwood") walkable[i] = WATER_KIND_LAKE
  const trailTiles: number[] = []
  const carveRoute = (route: number[]): void => {
    for (const i of route) {
      if (kind[i] !== 0) continue
      if (tiles[i] === "forest") tiles[i] = "clearing"
      trailTiles.push(i)
    }
  }
  /** Cut a trail from `a` toward `b` without bridging, keeping the first `keep` of it. */
  const carveTrail = (a: TilePos, b: TilePos, keep = 1): void => {
    let route = routeOverLand(a, b, width, depth, trailWander, walkable, walkable, 0, elevation)
    if (!route) {
      // The far stop is across water (or old growth): head for it and stop at
      // the edge of whatever is in the way.
      const crossing = routeOverLand(a, b, width, depth, trailWander, kind, passKind, MAX_BRIDGE_SPAN, elevation)
      if (!crossing) return
      const bank = crossing.findIndex((i) => walkable[i] !== 0)
      route = bank === -1 ? crossing : crossing.slice(0, bank)
    }
    if (keep < 1) route = route.slice(0, Math.max(2, Math.round(route.length * keep)))
    if (route.length < 2) return
    carveRoute(route)
  }

  // Trail endpoints must be reachable land; snap centres onto the main
  // landmass (lake pockets and open water don't qualify) and drop the rest.
  const roadLand = mainLandMask(kind, width, depth, elevation)
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

  // --- Spurs: trails that branch off to nowhere -------------------------------
  // Each leaves an existing trail tile, heads a random distance in a random
  // direction, and fades out short of wherever it was going — the ways of
  // woodcutters and hunters, not of anyone with a destination. Spurs may
  // leave earlier spurs, so the network frays at its edges.
  for (let s = 0; s < spurCount && trailTiles.length > 0; s++) {
    const from = trailTiles[Math.floor(rngTrail() * trailTiles.length)]
    const reach = SPUR_REACH_MIN + rngTrail() * (SPUR_REACH_MAX - SPUR_REACH_MIN)
    const angle = rngTrail() * Math.PI * 2
    const keep = 0.5 + rngTrail() * 0.4
    const fx = from % width
    const fz = Math.floor(from / width)
    const aim = {
      x: Math.max(0, Math.min(width - 1, Math.round(fx + Math.cos(angle) * reach))),
      z: Math.max(0, Math.min(depth - 1, Math.round(fz + Math.sin(angle) * reach))),
    }
    const to = snapToLand(aim, roadLand, width, depth)
    if (to) carveTrail({ x: fx, z: fz }, to, keep)
  }

  // --- Road endpoints and terrain costs --------------------------------------
  const entryZ = snapEdgeZ(entryRoll, 0, roadLand, width, depth, elevation)
  const exitZ = snapEdgeZ(exitRoll, width - 1, roadLand, width, depth, elevation)
  const start = { x: 0, z: entryZ }
  const goal = { x: width - 1, z: exitZ }
  // Water-aware, with the same fallbacks for every segment of road.
  const routeRoad = (a: TilePos, b: TilePos, wander: Float64Array): number[] => {
    const around = routeOverLand(a, b, width, depth, wander, walkable, walkable, MAX_BRIDGE_SPAN, elevation)
    if (around) return around
    const bounded = routeOverLand(a, b, width, depth, wander, kind, passKind, MAX_BRIDGE_SPAN, elevation) ??
      routeOverLand(a, b, width, depth, wander, kind, passKind, Infinity, elevation) ??
      routeBlind(a, b, width, depth, wander, elevation, routeBounds(a, b, width, depth))
    // The inset can cut a portal off from the interior even when its inward
    // approach is clear. Relax the border only after every bounded route fails;
    // keep the water and cliff checks so founding always receives a real road.
    const route = bounded.length ? bounded :
      routeOverLand(a, b, width, depth, wander, kind, passKind, Infinity, elevation, false) ??
      routeBlind(a, b, width, depth, wander, elevation)
    // If an ancient stand seals the only legal river pass, it remains ordinary
    // woodland in this world. Never cut a through-road into its dark heart.
    const removed = new Set<number>()
    for (const start of route) if (tiles[start] === "darkwood" && !removed.has(start)) {
      const queue = [start]; removed.add(start)
      for (let head = 0; head < queue.length; head++) for (const [dx, dz] of ROUTE_DIRS) {
        const i = queue[head], x = i % width + dx, z = Math.floor(i / width) + dz, n = z * width + x
        if (x >= 0 && z >= 0 && x < width && z < depth && tiles[n] === "darkwood" && !removed.has(n)) { removed.add(n); queue.push(n) }
      }
    }
    for (const i of removed) { tiles[i] = "forest"; walkable[i] = kind[i] }
    return route
  }
  // The road seeks the path of least resistance: on top of its random wander,
  // every step pays for the ground it crosses (see ROAD_FOREST_COST), so the
  // route bends through glades, borrows clearings and trails to get across
  // the woods, and crosses solid forest where the belt is thinnest. The
  // access tracks use the same terrain cost when approaching an ancient heart.
  const vergeShade = computeForestShade({ width, depth, tiles, buildings: [] }, 2)
  const groundCost = (i: number): number => {
    const t = tiles[i]
    const surface = t === "forest" || t === "darkwood" ? ROAD_FOREST_COST : t === "clearing" ? ROAD_CLEARING_COST : 0
    // Once the border is excluded, prefer open glades over narrow game trails
    // hemmed in by trees, as well as avoiding the trunks themselves.
    return surface + vergeShade[i] * ROAD_CLEARING_COST
  }
  const groundWander = new Float64Array(roadWander)
  for (let i = 0; i < groundWander.length; i++) groundWander[i] += groundCost(i) + cliffVerge[i]


  // Keep the road outside old growth and prefer open land beyond its canopy.
  routeRoad(start, goal, groundWander) // Resolve any blocked river pass before reserving ancient floor.
  const darkForestFloor = tiles.flatMap((terrain, i) => terrain === "darkwood" ? [i] : [])
  const darkShade = computeDarkShade({ width, depth, tiles, buildings: [] })
  const darkPenalty = (i: number) =>
    tiles[i] === "darkwood" ? DARK_ROAD_COST : DARK_ROAD_COST * darkShade[i]
  const roadCost = new Float64Array(width * depth)
  for (let i = 0; i < roadCost.length; i++) {
    // Prefer economical lines through open ground.
    roadCost[i] = roadWander[i] * .175 + groundCost(i) + darkPenalty(i) + cliffVerge[i]
    trailWander[i] += darkPenalty(i) + cliffVerge[i]
    // Trails, unlike the road, never enter old growth at all.
    if (tiles[i] === "darkwood") walkable[i] = WATER_KIND_LAKE
  }

  // --- Road: west edge to east edge ------------------------------------------
  // Route the whole road together, then straighten open stretches.
  const roadRoute = straightenRoad({ width, depth, tiles, buildings: [], elevation },
    routeRoad(start, goal, roadCost), routeBounds(start, goal, width, depth), "elbows")

  // Road simplification must not leave an out-and-back spur on the main road.
  // Founding and shortcuts receive indices only after this walk is simplified.
  const simpleRoad = eraseRouteLoops(roadRoute)
  roadRoute.splice(0, roadRoute.length, ...simpleRoad)
  passKind.set(kind)
  const roadTiles: number[] = []
  const road: TilePos[] = []
  const roadIndex = new Int32Array(width * depth).fill(-1)
  for (const i of roadRoute) {
    if (kind[i] === 0 && tiles[i] !== "bridge") {
      tiles[i] = "path"
    } else {
      // Water underneath (or an existing trail bridge being reused).
      tiles[i] = "bridge"
      passKind[i] = 0
    }
    if (roadIndex[i] < 0) roadIndex[i] = roadTiles.length
    roadTiles.push(i)
    road.push({ x: i % width, z: Math.floor(i / width) })
  }

  const gradeCrossings = () => {
    const layout = bridgeLayout({ width, depth, tiles, buildings: [], water: waterInfo, elevation })
    const aprons = [...layout.connectors, ...layout.ramps,
      ...layout.ramps.map((r) => ({ x: r.x - r.dx, z: r.z - r.dz }))]
    const footings: number[] = []
    for (const p of aprons) for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = p.x + dx, z = p.z + dz
      if (x >= 0 && z >= 0 && x < width && z < depth) footings.push(z * width + x)
    }
    gradeBridgeApproaches(elevation, width, depth, kind, footings)
  }
  gradeCrossings()

  // Ancient hearts have one destination approach; they are never through shortcuts.
  const shortcuts: Shortcut[] = []

  // --- Tie the trail network into the road -----------------------------------
  // One trail from the road's nearest centre keeps the network joined to the
  // road, even when the road misses all the glades. Like every trail it stops
  // at the water if a river runs between them.
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

  // --- Founding site: the hovel, its glade, and the branch to its door -------
  const { hovel, shelter, site } = foundSite(
    tiles,
    width,
    depth,
    road,
    relicDistance,
    trailWander,
    rngSite,
    walkable,
    Uint8Array.from(walkable, (v, i) => tiles[i] === "bridge" ? 0 : v),
    roadLand,
    elevation,
    shortcuts,
  )

  gradeCrossings()

  // Main clearings are destinations: finish their connections across rivers
  // with the same bank-to-bank bridge rules as the road. Optional spurs still fade.
  const connectedClearings = reachableFrom(tiles, roadTiles, width, depth, elevation)
  for (const center of centers) {
    const index = center.z * width + center.x
    if (connectedClearings[index]) continue
    const pass = Uint8Array.from(walkable, (v, i) => tiles[i] === "bridge" ? 0 : v)
    const sources = roadTiles.filter(i => !kind[i]).sort((a, b) =>
      Math.abs(a % width - center.x) + Math.abs(Math.floor(a / width) - center.z)
      - Math.abs(b % width - center.x) - Math.abs(Math.floor(b / width) - center.z))
    connectClearing: for (const keepInset of [true, false]) for (const target of sources.filter((_, i) => i % 12 === 0)) {
      const to = { x: target % width, z: Math.floor(target / width) }
      // Cropped clearings can sit near the boundary. Their local footpaths
      // may use that ground when no inland connection fits.
      const route = routeOverLand(center, to, width, depth, trailWander, walkable, pass, MAX_BRIDGE_SPAN, elevation, keepInset)
      if (!route) continue
      const crossing = straightenRoad({ width, depth, tiles, buildings: [hovel, shelter], elevation }, route, routeBounds(center, to, width, depth), "elbows")
      for (const [step, i] of crossing.entries()) {
        if (kind[i]) { tiles[i] = "bridge"; passKind[i] = 0 }
        else if (crossing.slice(Math.max(0, step - 2), step + 3).some(n => kind[n]) && tiles[i] !== "path") tiles[i] = "track"
        else if (tiles[i] === "forest") tiles[i] = "clearing"
      }
      expandReachable(tiles, crossing, connectedClearings, width, depth, elevation)
      break connectClearing
    }
  }
  gradeCrossings()

  // Reserve ordinary lumber near the founding church, without occupying its
  // foundation, gate, paths, shoreline, or the neighboring shelter. Prefer
  // existing canopy; a sparse start gets branching saplings at the meadow edge.
  const lumberCandidates: number[] = []
  const protectedSite = (x: number, z: number) => [hovel, shelter].some(b =>
    x >= b.x - 2 && x < b.x + b.w + 2 && z >= b.z - 2 && z < b.z + b.d + 2)
  const cx = hovel.x + Math.floor(hovel.w / 2), cz = hovel.z + Math.floor(hovel.d / 2)
  let nearbyTrees = 0
  for (let z = Math.max(1, cz - 12); z <= Math.min(depth - 2, cz + 12); z++) for (let x = Math.max(1, cx - 12); x <= Math.min(width - 2, cx + 12); x++) {
    const i = z * width + x
    if (protectedSite(x, z) || Math.hypot(x - cx, z - cz) > 12) continue
    if (tiles[i] === "forest") nearbyTrees++
    else if (tiles[i] === "grass" && !kind[i] && !centers.some(c => c.x === x && c.z === z)
      && ROUTE_DIRS.every(([dx, dz]) => Number.isFinite(elevationStep(elevation, i, i + dz * width + dx)))) lumberCandidates.push(i)
  }
  while (nearbyTrees < 24 && lumberCandidates.length) {
    lumberCandidates.sort((a, b) => {
      const score = (i: number) => Math.hypot(i % width - cx, Math.floor(i / width) - cz)
        - ROUTE_DIRS.filter(([dx, dz]) => tiles[i + dz * width + dx] === "forest").length * 3
        + trailWander[i]
      return score(a) - score(b) || a - b
    })
    tiles[lumberCandidates.shift()!] = "forest"; nearbyTrees++
  }

  const startingLumber = new Set<number>()
  for (let z = Math.max(1, cz - 12); z <= Math.min(depth - 2, cz + 12); z++) for (let x = Math.max(1, cx - 12); x <= Math.min(width - 2, cx + 12); x++) {
    const i = z * width + x
    if (tiles[i] === "forest" && !protectedSite(x, z) && Math.hypot(x - cx, z - cz) <= 12) startingLumber.add(i)
  }

  // --- Join same-bank pockets to the network ---------------------------------
  // Finish the shallow shelves and their bank descents before connecting land;
  // erosion can open a dry route through a formerly steep part of the bank.
  const crossingMap: GameMap = { width, depth, tiles, buildings: [hovel, shelter], seed, road, shortcuts, site, elevation, water: waterInfo }
  seedFords(crossingMap, bridgeLayout({ ...crossingMap }).spans)

  // Rivers, lakes, and dark forests divide the world, and trails cross none of
  // them, so land the road cannot reach without a crossing stays cut off —
  // that is the point. But a glade or clearing that shares a bank with
  // reachable ground should not sit walled off by plain forest alone: each
  // such pocket gets a trail to the nearest reachable tile. Pockets with water
  // or old growth between them and everything reachable are left as they are.
  const reached = reachableFrom(tiles, roadTiles, width, depth, elevation)
  const settled = new Uint8Array(tiles.length)
  // A newly reached ford shelf can expose an earlier pocket on another bank.
  // Revisit after an expanding pass, while retaining linear scans and incremental floods.
  let expanded = true
  while (expanded) {
    expanded = false
    settled.fill(0)
    for (let orphan = 0; orphan < tiles.length; orphan++) {
      if (!TERRAIN[tiles[orphan]].passable || reached[orphan] || settled[orphan]) continue
      const pocket = passableComponent(tiles, orphan, width, depth, elevation)
      for (const i of pocket) settled[i] = 1
      const link = nearestReachedByLand(pocket, reached, tiles, walkable, width, depth, elevation)
      if (!link) continue
      const route = routeOverLand(
        { x: link.from % width, z: Math.floor(link.from / width) },
        { x: link.to % width, z: Math.floor(link.to / width) },
        width,
        depth,
        trailWander,
        walkable,
        walkable,
        0,
        elevation,
        false, // Open forest floor for stranded pockets; these repairs never stamp a road or track.
      )
      if (!route) continue
      carveRoute(route)
      expanded = expandReachable(tiles, route, reached, width, depth, elevation) > 0 || expanded
    }
  }

  // --- Open the ancient hearts and cut their woodland approaches ------------
  // These are destinations, not traveler shortcuts: reuse the track surface
  // without adding them to `shortcuts` or spawning encounter contents.
  const darkForests: DarkForest[] = []
  const approachWalls = kind.slice()
  for (const i of startingLumber) approachWalls[i] = WATER_KIND_LAKE
  for (const building of [hovel, shelter]) {
    for (let z = Math.max(0, building.z - 1); z <= Math.min(depth - 1, building.z + building.d); z++)
      for (let x = Math.max(0, building.x - 1); x <= Math.min(width - 1, building.x + building.w); x++) approachWalls[z * width + x] = WATER_KIND_LAKE
  }
  const toPos = (i: number): TilePos => ({ x: i % width, z: Math.floor(i / width) })
  for (const heart of darkHearts) {
    if (tiles[heart] !== "darkwood") continue
    const center = toPos(heart)
    const clearing = heartShapes.get(heart)!
    // Route through one boundary gate. The outside leg treats all old growth
    // as a wall; the inside leg cannot leave this component, so a jagged bay
    // can never turn the approach into two separate entrances.
    const own = new Uint8Array(tiles.length), component = [heart]; own[heart] = 1
    for (let head = 0; head < component.length; head++) for (const [dx, dz] of ROUTE_DIRS) {
      const i = component[head], x = i % width + dx, z = Math.floor(i / width) + dz, n = z * width + x
      if (x >= 0 && z >= 0 && x < width && z < depth && tiles[n] === "darkwood" && !own[n]) { own[n] = 1; component.push(n) }
    }
    const outside = approachWalls.slice(), sources: number[] = []
    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i] === "darkwood") outside[i] = WATER_KIND_LAKE
      if (reached[i] && outside[i] === 0) sources.push(i)
    }
    const network = landDistanceField(sources, outside, width, depth, elevation)
    const gates: { inside: number; outside: number; score: number }[] = []
    for (const i of component) for (const [dx, dz] of ROUTE_DIRS) {
      const x = i % width + dx, z = Math.floor(i / width) + dz, n = z * width + x
      if (x < 0 || z < 0 || x >= width || z >= depth || own[n] || outside[n] || network.dist[n] < 0 || !Number.isFinite(elevationStep(elevation, i, n))) continue
      gates.push({ inside: i, outside: n, score: network.dist[n] + Math.abs(x - center.x) + Math.abs(z - center.z) })
    }
    gates.sort((a, b) => a.score - b.score || a.inside - b.inside)
    const inside = new Uint8Array(tiles.length).fill(WATER_KIND_LAKE)
    for (const i of component) if (!approachWalls[i]) inside[i] = 0
    let approach: number[] | null = null
    for (const gate of gates) {
      const inner = routeOverLand(toPos(gate.inside), center, width, depth, groundWander, inside, inside, 0, elevation)
      if (!inner) continue
      const outer = routeOverLand(toPos(network.origin[gate.outside]), toPos(gate.outside), width, depth, groundWander, outside, outside, 0, elevation)
      if (!outer) continue
      approach = [...outer, ...inner]; break
    }
    if (!approach) continue
    for (const i of approach) {
      if (tiles[i] !== "path" && tiles[i] !== "bridge") tiles[i] = "track"
    }
    for (const i of clearing) if (isWoods(tiles[i])) tiles[i] = "clearing"
    expandReachable(tiles, [...approach, ...clearing], reached, width, depth, elevation)
    darkForests.push({ center, clearing: clearing.map(toPos), approach: approach.map(toPos) })
  }

  // Trail repairs must leave the shelter foundation clear.
  for (let z = shelter.z; z < shelter.z + shelter.d; z++)
    for (let x = shelter.x; x < shelter.x + shelter.w; x++) tiles[z * width + x] = "grass"

  const map: GameMap = {
    elevation,
    width,
    depth,
    tiles,
    buildings: [hovel, shelter],
    seed,
    woodlandMethod,
    mainClearings,
    road,
    mainRoadWidth: MAIN_ROAD_WIDTH,
    shortcuts,
    darkForests,
    darkForestFloor,
    site,
    water: waterInfo,
  }
  // Whatever the routing could not avoid, cut back: no cliff face within the clearance of a road edge.
  clearCliffsBesideRoads(elevation, width, depth, kind, tiles, map.buildings, waterInfo.surface)
  finishElevation(elevation, width, depth, kind, waterInfo.surface!)
  // Corner averaging can pull surrounding slopes back through founding floors.
  // Pin every footprint with the same cut-and-fill used for player purchases.
  for (const building of map.buildings) map.elevation = levelBuildingGround(map, building)
  // Bridge grading and founding can raise a formerly low beach; classify sand last.
  const sandy = beachAccess(map.elevation!, width, depth, kind, waterInfo)
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === "sand" && !sandy[i]) tiles[i] = "grass"
  addFoundingWell(map)
  addPathSprings(map)
  addRoadsideTowns(map)
  createCrossroads(map)
  clearMainRoadVerge(map)
  // Wells, springs and towns lay their own tracks; keep those clear of cliffs too.
  for (let round = 0; round < 3 && clearCliffsBesideRoads(map.elevation!, width, depth, kind, map.tiles, map.buildings, waterInfo.surface) > 0; round++) {
    finishElevation(map.elevation!, width, depth, kind, waterInfo.surface!)
    for (const building of map.buildings) map.elevation = levelBuildingGround(map, building)
  }
  return map
}

/**
 * Grid-step distance over dry land from every tile to the nearest of the
 * `sources`, ignoring forest but walking around water — the length of track
 * it would take to reach each spot without a bridge. Tiles no dry walk
 * reaches (the far bank, a lake-locked pocket) stay -1. `origin` records
 * which source each tile's walk began from.
 */
function landDistanceField(
  sources: number[],
  kind: Uint8Array,
  width: number,
  depth: number,
  elevation: ElevationInfo,
): { dist: Int32Array; origin: Int32Array } {
  const dist = new Int32Array(width * depth).fill(-1)
  const origin = new Int32Array(width * depth).fill(-1)
  const queue: number[] = []
  for (const i of sources) {
    if (kind[i] !== 0 || dist[i] !== -1) continue
    dist[i] = 0
    origin[i] = i
    queue.push(i)
  }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    const x = i % width
    const z = Math.floor(i / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      const n = nz * width + nx
      if (dist[n] !== -1 || kind[n] !== 0 || !Number.isFinite(elevationStep(elevation, i, n))) continue
      dist[n] = dist[i] + 1
      origin[n] = origin[i]
      queue.push(n)
    }
  }
  return { dist, origin }
}

/**
 * Choose where the relic lives and cut the way to it.
 *
 * The site is scored over every possible hovel origin: prefer the central
 * area and then the requested road-distance band, and among those it
 * prefers open grass around it — room for the settlement to grow — with a
 * seeded jitter so the pick varies between worlds that look alike. Water
 * rules it out entirely: the footprint and ring must be dry land on the main
 * reachable landmass, never open water, a bridge, or a pocket walled in by a
 * lake. The footprint and a one-tile ring are then guaranteed to be grass, so
 * the hovel always stands on buildable ground with breathing space, even on a
 * map whose knobs left no glade to be had.
 *
 * The branch forks from the road tile nearest the door by dry land (outside
 * the road's outer stretches) and is routed with the trail wander, steered
 * away from the road and the hovel itself so it reads as one clean track in,
 * not a tangle. Siting and forking both measure distance around water rather
 * than across it, so the hovel lands on the same bank as its junction and the
 * track stays dry; it will bridge only when no dry way exists at all.
 *
 * Wherever the fork lands, it is left standing in a clearing: the woods inside
 * an exclusion zone around the junction are felled to forest floor once the
 * fork is final.
 */
function foundSite(
  tiles: TerrainId[],
  width: number,
  depth: number,
  road: TilePos[],
  relicDistance: number,
  trailWander: Float64Array,
  rng: () => number,
  kind: Uint8Array,
  passKind: Uint8Array,
  roadLand: Uint8Array,
  elevation: ElevationInfo,
  shortcuts: readonly Shortcut[],
): { hovel: BuildingDef; shelter: BuildingDef; site: FoundingSite } {
  const { min: bandMin, max: bandMax } = relicDistanceBand(relicDistance)
  // Founding must not build over the newly routed forest alternatives.
  const reservedTracks = new Set(shortcuts.flatMap(s => s.tiles.map(p => p.z * width + p.x)))

  // Distance from the road is measured as it will be walked: dry, around
  // water rather than across it, from any road tile at all — the gap between
  // road and relic is the ground the settlement will grow on.
  const fromRoad = landDistanceField(
    road.map((p) => p.z * width + p.x),
    kind,
    width,
    depth,
    elevation,
  )
  const walkFromRoad = (i: number): number =>
    fromRoad.dist[i] === -1 ? width + depth : fromRoad.dist[i]

  // The track itself is walked dry and off the road (the road and its bridges
  // are walls to this walk), starting from the "gates" — land tiles beside
  // the dry tiles of the stretch of road the branch may fork from, so a track
  // never forks off the end of a bridge. A site no such walk reaches (the far
  // bank of a river the road crosses only near its ends) would need a bridge,
  // so it is penalised out of contention.
  const lo = Math.floor(road.length * JUNCTION_MARGIN)
  const hi = Math.max(lo, Math.ceil(road.length * (1 - JUNCTION_MARGIN)) - 1)
  const offRoad = kind.slice()
  for (const p of road) offRoad[p.z * width + p.x] = WATER_KIND_LAKE
  const gates: number[] = []
  for (let r = lo; r <= hi; r++) {
    if (kind[road[r].z * width + road[r].x] !== 0) continue
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = road[r].x + dx
      const nz = road[r].z + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      if (offRoad[nz * width + nx] === 0 && Number.isFinite(elevationStep(elevation, road[r].z * width + road[r].x, nz * width + nx))) gates.push(nz * width + nx)
    }
  }
  const { dist, origin } = landDistanceField(gates, offRoad, width, depth, elevation)

  // --- Score every origin the footprint fits at ------------------------------
  let best: TilePos = { x: EDGE_MARGIN, z: EDGE_MARGIN }
  let bestScore = -Infinity
  const outerMin = EDGE_MARGIN + 1 // leave room for the grass ring
  for (let z = outerMin; z <= depth - HOVEL_DEPTH - outerMin; z++) {
    for (let x = outerMin; x <= width - HOVEL_WIDTH - outerMin; x++) {
      let low = Infinity, high = -Infinity
      let onRoad = false
      let overlapsShortcut = false
      let grounded = true
      let dryTrack = false
      let nearest = Infinity
      for (let dz = -1; dz <= HOVEL_DEPTH; dz++) {
        for (let dx = -1; dx <= HOVEL_WIDTH; dx++) {
          const i = (z + dz) * width + (x + dx)
          const inFootprint = dx >= 0 && dx < HOVEL_WIDTH && dz >= 0 && dz < HOVEL_DEPTH
          // Footprint and ring must be dry, reachable land — no water, no
          // bridges, no lake-locked pockets.
          if (roadLand[i] !== 1 || tiles[i] === "darkwood") grounded = false
          if (inFootprint && reservedTracks.has(i)) overlapsShortcut = true
          low = Math.min(low, elevation.height[i]); high = Math.max(high, elevation.height[i])
          if (inFootprint) {
            if (tiles[i] === "path") onRoad = true
            nearest = Math.min(nearest, walkFromRoad(i))
          } else if (dist[i] !== -1) {
            // A ring tile the gate walk reaches means the track can arrive dry.
            dryTrack = true
          }
        }
      }
      // Reserve a three-tile shelter north of the gate path, on the same level.
      for (let dz = -3; dz <= -2; dz++) for (let dx = 0; dx < 3; dx++) {
        const i = (z + dz) * width + x + dx
        if (z + dz < 0 || roadLand[i] !== 1 || tiles[i] === "path") grounded = false
        if (reservedTracks.has(i)) overlapsShortcut = true
        low = Math.min(low, elevation.height[i]); high = Math.max(high, elevation.height[i])
      }
      if (onRoad || !grounded || high - low > 0.18) continue
      // Keep the original candidate dice so reserving a shortcut only moves
      // a founding site when the winning footprint actually overlaps it.
      const siteJitter = rng() * SITE_SCORE_JITTER
      if (overlapsShortcut) continue

      // Prefer the road-distance band within the central settlement area.
      // A distant edge glade must not win just because its road gap is exact.
      const bandPenalty =
        nearest < bandMin ? (bandMin - nearest) * 50 : nearest > bandMax ? (nearest - bandMax) * 50 : 0
      // Needing a bridge outweighs any band shortfall a dry site could have.
      const bridgePenalty = dryTrack ? 0 : (width + depth) * 50

      let room = 0
      for (let dz = -SITE_ROOM_RADIUS; dz < HOVEL_DEPTH + SITE_ROOM_RADIUS; dz++) {
        for (let dx = -SITE_ROOM_RADIUS; dx < HOVEL_WIDTH + SITE_ROOM_RADIUS; dx++) {
          const nx = x + dx
          const nz = z + dz
          if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
          if (tiles[nz * width + nx] !== "grass") continue
          // The footprint itself counts extra: standing on grass beats being near it.
          const inFootprint = dx >= 0 && dx < HOVEL_WIDTH && dz >= 0 && dz < HOVEL_DEPTH
          room += inFootprint ? 4 : 1
        }
      }

      const edgeDist = Math.min(x, z, width - HOVEL_WIDTH - x, depth - HOVEL_DEPTH - z)
      const edgePenalty = Math.max(0, SITE_EDGE_MARGIN - edgeDist) * SITE_EDGE_PENALTY
      const dx = Math.abs(x + HOVEL_WIDTH / 2 - width / 2), dz = Math.abs(z + HOVEL_DEPTH / 2 - depth / 2)
      const centerPenalty = Math.max(0, dx - width * .2, dz - depth * .2) * 500 + Math.hypot(dx, dz) * 2

      const score = room - bandPenalty - bridgePenalty - edgePenalty - centerPenalty + siteJitter
      if (score > bestScore) {
        bestScore = score
        best = { x, z }
      }
    }
  }

  const shelter: BuildingDef = {
    id: "founding-shelter", buildType: "monk-shelter", label: "Monk shelter",
    x: best.x, z: best.z - 3, w: 3, d: 2, height: 0.8,
    color: "#b99a72", roofColor: "#855642",
  }
  const foundation = elevation.height[best.z * width + best.x]
  for (let z = shelter.z; z < shelter.z + shelter.d; z++) for (let x = shelter.x; x < shelter.x + shelter.w; x++) {
    const i = z * width + x
    elevation.height[i] = foundation
    tiles[i] = "grass"
    offRoad[i] = WATER_KIND_LAKE
  }
  // Level the shrine and grass margin; only the approach branch becomes a path.
  for (let dz = -1; dz <= HOVEL_DEPTH; dz++) {
    for (let dx = -1; dx <= HOVEL_WIDTH; dx++) {
      const i = (best.z + dz) * width + (best.x + dx)
      elevation.height[i] = foundation
      if (
        tiles[i] === "forest" ||
        tiles[i] === "darkwood" ||
        tiles[i] === "clearing" ||
        tiles[i] === "sand"
      ) {
        tiles[i] = "grass"
      }
    }
  }

  // --- Door and junction: the closest pair between the ring and the road ------
  // Closest by the same dry, off-road walk, so the fork is on the hovel's own
  // bank and the track can reach the door without touching road or water.
  // Straight-line distance is only the fallback for a hovel no such walk reaches.
  const ring: TilePos[] = []
  // An architectural entrance sits at the centre of a wall. Pick the side
  // with the shortest dry approach, keeping the track aligned with its door.
  for (const k of [Math.floor(HOVEL_WIDTH / 2)]) {
    ring.push({ x: best.x + k, z: best.z - 1 })
    ring.push({ x: best.x + k, z: best.z + HOVEL_DEPTH })
  }
  let door = ring[0]
  let junction = lo
  let bestDist = Infinity
  let gate = -1
  for (const d of ring) {
    const i = d.z * width + d.x
    if (dist[i] === -1 || dist[i] + 1 >= bestDist) continue
    bestDist = dist[i] + 1
    door = d
    gate = origin[i]
  }
  if (gate !== -1) {
    // The junction is the in-range road tile the gate stands beside.
    const gx = gate % width
    const gz = Math.floor(gate / width)
    for (let r = lo; r <= hi; r++) {
      if (kind[road[r].z * width + road[r].x] !== 0) continue
      if (Math.abs(road[r].x - gx) + Math.abs(road[r].z - gz) === 1 && Number.isFinite(elevationStep(elevation, road[r].z * width + road[r].x, gate))) {
        junction = r
        break
      }
    }
  } else {
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
  }

  // --- The branch: one track from junction to door -----------------------------
  // Every road tile counts as road here, bridges included: a track that rode
  // the road's bridge for free would fork twice and touch the road again on
  // the far bank.
  const onRoad = new Uint8Array(width * depth)
  for (const p of road) onRoad[p.z * width + p.x] = 1
  const branchWander = new Float64Array(trailWander)
  for (let i = 0; i < branchWander.length; i++) {
    if (onRoad[i]) branchWander[i] += BRANCH_AVOID_COST
  }
  for (let dz = 0; dz < HOVEL_DEPTH; dz++) {
    for (let dx = 0; dx < HOVEL_WIDTH; dx++) {
      branchWander[(best.z + dz) * width + (best.x + dx)] += BRANCH_AVOID_COST
    }
  }
  for (let z = shelter.z; z < shelter.z + shelter.d; z++) for (let x = shelter.x; x < shelter.x + shelter.w; x++)
    branchWander[z * width + x] += BRANCH_AVOID_COST
  // Dry and clear of the road first (the road is a wall, bar the junction
  // itself); then the road merely avoided; a bridge only when no dry way
  // exists at all; and blind as a last resort.
  offRoad[road[junction].z * width + road[junction].x] = 0
  const rawBranch =
    routeOverLand(road[junction], door, width, depth, branchWander, offRoad, offRoad, 0, elevation) ??
    routeOverLand(road[junction], door, width, depth, branchWander, kind, passKind, 0, elevation) ??
    routeOverLand(road[junction], door, width, depth, branchWander, kind, passKind, MAX_BRIDGE_SPAN, elevation) ??
    routeOverLand(road[junction], door, width, depth, branchWander, kind, passKind, Infinity, elevation) ??
    routeBlind(road[junction], door, width, depth, branchWander, elevation, routeBounds(road[junction], door, width, depth))
  const branchRoute = straightenRoad({ width, depth, tiles, buildings: [shelter,
    { ...shelter, x: best.x, z: best.z, w: HOVEL_WIDTH, d: HOVEL_DEPTH }], elevation }, rawBranch,
    (x, z) => !onRoad[z * width + x] || (x === road[junction].x && z === road[junction].z), "elbows")
  const branch: TilePos[] = []
  for (const i of branchRoute) {
    if (tiles[i] === "water") {
      tiles[i] = "bridge"
      passKind[i] = 0
    } else if (tiles[i] !== "path" && tiles[i] !== "bridge") {
      tiles[i] = "track"
    }
    branch.push({ x: i % width, z: Math.floor(i / width) })
  }

  // The junction is picked by straight-line distance, so the routed branch can
  // set off along a bend of the road itself. Slide the fork to the last road
  // tile the route touches before leaving, so the track forks exactly once.
  let leading = 0
  while (leading + 1 < branchRoute.length && onRoad[branchRoute[leading + 1]]) leading++
  if (leading > 0) {
    branch.splice(0, leading)
    const at = branch[0]
    const r = road.findIndex((p) => p.x === at.x && p.z === at.z)
    if (r >= 0) junction = r
  }

  clearJunction(tiles, width, depth, road[junction], rng)

  // Connect the shelter to the chosen shrine entrance, around the wall when
  // the approach is on the far side of the longer shrine.
  const shelterPath = [{ x: shelter.x, z: shelter.z + shelter.d }]
  if (door.z >= best.z) shelterPath.push({ x: best.x - 1, z: best.z - 1 }, { x: best.x - 1, z: door.z })
  shelterPath.push(door)
  for (let i = 1; i < shelterPath.length; i++) {
    const p = { ...shelterPath[i - 1] }, end = shelterPath[i]
    for (;;) {
      const index = p.z * width + p.x
      if (tiles[index] !== "path" && tiles[index] !== "bridge") tiles[index] = "track"
      if (p.x === end.x && p.z === end.z) break
      p.x += Math.sign(end.x - p.x)
      p.z += Math.sign(end.z - p.z)
    }
  }

  const hovel: BuildingDef = {
    id: HOVEL_ID,
    label: "Shrine",
    x: best.x,
    z: best.z,
    w: HOVEL_WIDTH,
    d: HOVEL_DEPTH,
    height: 1.18,
    color: "#e7d8b9",
    roofColor: "#c4a05f",
  }

  return { hovel, shelter, site: { junction, branch, door, hovelId: HOVEL_ID } }
}

/**
 * Fell the exclusion zone around the fork to the shrine, so the junction
 * always stands in a clearing.
 *
 * Woods within JUNCTION_CLEARING_RADIUS of the junction become forest floor:
 * passable and open, with no trees drawn on it, but not buildable — an opening
 * in the trees where the track leaves the road, not a glade to settle in. Old
 * growth is felled with the rest; a fork that has to be found by feel in the
 * dark is worse than a nick in a dark forest's edge. The outer ring keeps some
 * of its trees on a seeded roll, so the zone never draws a disc on the ground.
 */
function clearJunction(
  tiles: TerrainId[],
  width: number,
  depth: number,
  junction: TilePos,
  rng: () => number,
): void {
  const r = JUNCTION_CLEARING_RADIUS
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = junction.x + dx
      const z = junction.z + dz
      if (x < 0 || z < 0 || x >= width || z >= depth) continue
      const distance = Math.hypot(dx, dz)
      if (distance > r) continue
      if (distance > r - 1 && rng() < JUNCTION_CLEARING_RAGGED) continue
      const i = z * width + x
      if (tiles[i] === "forest") tiles[i] = "clearing"
    }
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

/** Mask of every passable tile reachable from the road over passable tiles. */
function reachableFrom(
  tiles: TerrainId[],
  roadTiles: number[],
  width: number,
  depth: number,
  elevation: ElevationInfo,
): Uint8Array {
  const seen = new Uint8Array(tiles.length)
  for (const i of roadTiles) if (TERRAIN[tiles[i]].passable) seen[i] = 1
  expandReachable(tiles, roadTiles, seen, width, depth, elevation)
  return seen
}

/** The 4-connected passable component containing `start`, as tile indices. */
function passableComponent(
  tiles: TerrainId[],
  start: number,
  width: number,
  depth: number,
  elevation: ElevationInfo,
): number[] {
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
      if (tiles[component[q]] !== "bridge" && tiles[n] !== "bridge" && !Number.isFinite(elevationStep(elevation, component[q], n))) continue
      if (!seen.has(n) && TERRAIN[tiles[n]].passable) {
        seen.add(n)
        component.push(n)
      }
    }
  }
  return component
}

/**
 * The shortest dry walk from a cut-off pocket to reachable ground: which
 * pocket tile to leave from and which reached passable tile to arrive at.
 * Plain forest is walkable (a trail can be cut through it); whatever `walls`
 * marks non-zero — water, bridges, old growth — is not. Null when only walls
 * lie between the pocket and everything reachable.
 */
function nearestReachedByLand(
  pocket: number[],
  reached: Uint8Array,
  tiles: TerrainId[],
  walls: Uint8Array,
  width: number,
  depth: number,
  elevation: ElevationInfo,
): { from: number; to: number } | null {
  return nearestReachableLand(pocket, reached, tiles, walls, width, depth, elevation)
}

/**
 * Marks land tiles routing can actually reach: flood the grid treating river
 * water as passable (rivers can be bridged) and lake water as a wall, then
 * keep the land of the largest region. Snapping road endpoints, trail stops,
 * and the founding site onto this mask stops a land pocket walled off by a
 * lake — say a cove on the map edge — from ever becoming an unreachable
 * routing goal.
 */
function mainLandMask(kind: Uint8Array, width: number, depth: number,
  elevation: ElevationInfo,
): Uint8Array {
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
        if (kind[queue[q]] === 0 && kind[n] === 0 && !Number.isFinite(elevationStep(elevation, queue[q], n))) continue
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
  zGuess: number, x: number, landMask: Uint8Array, width: number, depth: number, elevation: ElevationInfo,
): number {
  const dx = x === 0 ? 1 : -1
  // Pick a portal with a dry, walkable inward run before routing the interior.
  for (let r = 0; r < depth; r++) for (const z of [zGuess - r, zGuess + r]) {
    if (z < ROUTE_EDGE_INSET || z >= depth - ROUTE_EDGE_INSET) continue
    let clear = true
    for (let step = 0; step <= ROUTE_EDGE_INSET + 2; step++) {
      const i = z * width + x + dx * step
      if (!landMask[i] || (step > 0 && !Number.isFinite(elevationStep(elevation, i - dx, i)))) { clear = false; break }
    }
    if (clear) return z
  }
  return Math.max(ROUTE_EDGE_INSET, Math.min(depth - 1 - ROUTE_EDGE_INSET, zGuess))
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
 * existing bridges like land; a *new* crossing still has to launch from and
 * land on true land (`kind` 0), never side-on into or out of another bridge,
 * and may not run alongside one either — two straight bridges laid a tile
 * apart weld into one wide slab, so a route that wants to cross there uses
 * the bridge that already exists. That keeps every bridge a clean straight
 * segment. Returns null when no route exists (the road relaxes the span and,
 * as a last resort, falls back to blind routing; trails just skip the edge).
 */
/** Reserve crossings between searches so two hops of one route cannot weld together. */
function routeOverLand(
  start: TilePos, goal: TilePos, width: number, depth: number, wander: Float64Array,
  kind: Uint8Array, pass: Uint8Array, maxSpan: number, elevation: ElevationInfo, keepInset = true,
): number[] | null {
  let reserved = pass
  for (let attempt = 0; attempt < 8; attempt++) {
    const route = searchRouteOverLand(start, goal, width, depth, wander, kind, reserved, maxSpan, elevation, keepInset)
    if (!route || maxSpan === 0) return route
    const bridges = new Set<number>()
    let conflict = false
    for (let k = 0; k < route.length; k++) {
      if (!kind[route[k]]) continue
      const run: number[] = []
      while (k < route.length && kind[route[k]]) run.push(route[k++])
      if (run.some(i => ROUTE_DIRS.some(([dx, dz]) => bridges.has(i + dz * width + dx)))) {
        conflict = true
        break
      }
      for (const i of run) bridges.add(i)
    }
    if (!conflict) return route
    reserved = new Uint8Array(reserved)
    for (const i of bridges) reserved[i] = 0
  }
  return null
}

function searchRouteOverLand(
  start: { x: number; z: number },
  goal: { x: number; z: number },
  width: number,
  depth: number,
  wander: Float64Array,
  kind: Uint8Array,
  pass: Uint8Array,
  maxSpan: number,
  elevation: ElevationInfo,
  keepInset: boolean,
): number[] | null {
  const allowed = keepInset ? routeBounds(start, goal, width, depth)
    : (x: number, z: number) => x >= 0 && z >= 0 && x < width && z < depth
  const size = width * depth
  const g = new Float64Array(size).fill(Infinity)
  const cameFrom = new Int32Array(size).fill(-1)
  const closed = new Uint8Array(size)

  const startIndex = start.z * width + start.x
  const goalIndex = goal.z * width + goal.x
  if (pass[startIndex] !== 0 || pass[goalIndex] !== 0) return null
  // Manhattan distance; admissible because every step costs at least 1.
  const h = (i: number) => Math.abs((i % width) - goal.x) + Math.abs(Math.floor(i / width) - goal.z)

  // Heap keyed on f = g + h; stale entries are skipped via the closed set.
  const open = new MinHeap()
  const relax = (n: number, cost: number, from: number) => {
    if (cost < g[n]) {
      g[n] = cost
      cameFrom[n] = from
      open.push(n, cost + h(n))
    }
  }
  // True when the water tile at (x, z) has an existing bridge on either side
  // of the crossing direction (dx, dz) — laying another here would weld them.
  const bridgeBesideStep = (x: number, z: number, dx: number, dz: number): boolean => {
    for (const [sx, sz] of [
      [x + dz, z + dx],
      [x - dz, z - dx],
    ]) {
      if (sx < 0 || sz < 0 || sx >= width || sz >= depth) continue
      const side = sz * width + sx
      if (kind[side] !== 0 && pass[side] === 0) return true
    }
    return false
  }

  g[startIndex] = 0
  open.push(startIndex, h(startIndex))
  let reachedGoal = false

  while (open.size > 0) {
    const current = open.pop()
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
      if (!allowed(nx, nz)) continue
      const n = nz * width + nx

      if (pass[n] === 0) {
        // Existing spans may only be entered, crossed, and left along their axis.
        if (kind[n] && bridgeBesideStep(nx, nz, dx, dz)) continue
        if (kind[current] && bridgeBesideStep(cx, cz, dx, dz)) continue
        if (!closed[n]) relax(n, g[current] + 1 + wander[n] + (kind[current] || kind[n] ? 0 : elevationStep(elevation, current, n)), current)
        continue
      }
      if (pass[n] === WATER_KIND_LAKE) continue
      // A new crossing must launch from dry land too — never sideways off the
      // middle of an existing bridge, which would weld the two into an L.
      if (kind[current] !== 0) continue

      // River: scan straight ahead for the far bank. A crossing that would
      // run alongside an existing bridge is refused too — two bridges side by
      // side read as one wide one, and every bridge must stay a clean span.
      const besideBridge = (t: number): boolean => {
        for (const [qx, qz] of [
          [(t % width) + dz, Math.floor(t / width) + dx],
          [(t % width) - dz, Math.floor(t / width) - dx],
        ]) {
          if (qx < 0 || qz < 0 || qx >= width || qz >= depth) continue
          const q = qz * width + qx
          if (kind[q] !== 0 && pass[q] === 0) return true
        }
        return false
      }
      let span = 1
      let px = nx + dx
      let pz = nz + dz
      let landing = -1
      let alongside = besideBridge(n)
      while (span <= maxSpan) {
        if (!allowed(px, pz)) break
        const t = pz * width + px
        if (pass[t] === 0) {
          // A new bridge must land on dry land, not side-on into another one.
          if (kind[t] === 0) landing = t
          break
        }
        if (pass[t] !== WATER_KIND_RIVER) break
        if (besideBridge(t)) alongside = true
        span++
        px += dx
        pz += dz
      }
      if (landing !== -1 && !alongside && !closed[landing]) {
        relax(landing, g[current] + span * BRIDGE_TILE_COST + 1 + wander[landing], current)
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
