import { makeRng } from "../rng"
import { computeDarkShade, computeForestShade } from "./forest-field"
import { MinHeap, routeBlind, ROUTE_DIRS } from "./route"
import { TERRAIN, type TerrainId } from "./terrain"
import type { BuildingDef, FoundingSite, GameMap, Shortcut, TilePos } from "./types"
import { generateWater, WATER_KIND_LAKE, WATER_KIND_RIVER } from "./water"

/**
 * Seeded map generation. The world is dense forest by default: water (rivers,
 * lakes, ponds) is laid down first, then the map grows as solid woods, open
 * grass glades are carved out of it, small forest-floor clearings are
 * scattered through it, and winding trails link everything together. One road
 * runs from the west edge to the east edge along the path of least
 * resistance: it bends through glades and clearings and, where it has to
 * cross a belt of trees, picks the narrowest crossing it can find. The same
 * seed always produces the identical map, so a seed number is a complete,
 * shareable description of a world.
 *
 * Every world also comes founded: the monks' hovel already stands, with the
 * relic inside, deep in the woods a long way off the road, and a beaten track
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
 * Water routes around everything else's guarantees rather than breaking them:
 * lakes get sand beaches, rivers get point bars, and the road crosses rivers
 * only on straight bridges of at most MAX_BRIDGE_SPAN tiles — never lakes.
 * Bridges belong to the road alone. Trails are desire lines, not engineering:
 * they never bridge, so a trail bound for the far bank runs down to the water
 * and stops there, and some simply peter out in the woods or branch off to
 * nowhere. The relic's track forks from the road on the hovel's own bank, so
 * it too stays dry (a bridge is its last resort, never its habit). Glades and
 * clearings are joined by a nearest-neighbour spanning tree, that network is
 * tied into the road, and a final pass gives every pocket of passable land a
 * trail to reachable ground when only forest lies between them — pockets with
 * water in the way stay cut off, as rivers should.
 *
 * Dark forests are the old growth at the heart of the woods: a few bars grown
 * across the road's direct line, placed where a provisional road runs through
 * deep forest. The road treats dark forest as very expensive (never
 * impossible, so it can never be blocked) and is routed through waypoints on
 * the direct line just outside each bar, so it must go around and come back —
 * a genuine detour. The direct stretch between those waypoints becomes a
 * *track*: the short, dangerous way through that most travellers refuse.
 *
 * Forest, dark forest, trail, road, site, and water randomness come from
 * separate streams derived from the seed, so tuning one part's knobs never
 * moves the others' dice — tuning stays comparable across renders of the same
 * seed. The road's *route* does react to the land, by design: it bends to
 * meet the glades and to skirt the dark forest, but with the same forest it
 * always rolls the same way.
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
  /** How many dark forests to grow in the road's way. */
  darkForestCount?: number
  /** Size of each dark forest as a fraction of the map. */
  darkForestShare?: number
}

export const DEFAULT_FOREST_COVERAGE = 0.6
export const DEFAULT_GLADE_COUNT = 12
export const DEFAULT_CLEARING_COUNT = 22
export const DEFAULT_SPUR_COUNT = 8
export const DEFAULT_WATER_COVERAGE = 0.1
export const DEFAULT_DARK_FOREST_COUNT = 2
export const DEFAULT_DARK_FOREST_SHARE = 0.02

/** Chance a trail between two stops peters out in the woods before arriving. */
const TRAIL_FADE_CHANCE = 0.2
/** How far a spur aims from the trail it leaves, in tiles, before it fades. */
const SPUR_REACH_MIN = 8
const SPUR_REACH_MAX = 24
/** How many cut-off pockets the joining pass will look at before giving up. */
const MAX_POCKET_REPAIRS = 64

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

// --- Founding site -----------------------------------------------------------

export const HOVEL_ID = "hovel"
/** Footprint of the hovel in tiles. */
export const HOVEL_SIZE = 2

/**
 * How far the hovel sits from the nearest road tile, in grid steps. Far — a
 * real journey into the woods, not a stroll off the verge: the gap between
 * road and relic is the ground the whole settlement will grow on, and the
 * further the relic, the more world there is to build before the two meet.
 * On the 128-tile default map this puts the hovel over a third of the way
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

export function generateMap(options: GenerateMapOptions): GameMap {
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
  const rngDark = makeRng(seed ^ 0x165667b1)

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
  // the wandering A* and carved as forest-floor clearing. Trails route around
  // water but never over it — bridges are the road's alone. A trail whose far
  // stop lies across a river is routed as if it could cross, then cut at the
  // bank, so it runs down to the water and stops. Some trails also peter out
  // in the woods short of where they were going.
  //
  // `passKind` is the water mask the road and the relic's track route on:
  // every bridge they build is knocked out of it so a later route walks an
  // existing bridge for free instead of building a duplicate one tile over.
  // Trails route on `walkable` — `kind` itself, so to them a bridge is still
  // water — and once the dark forests have grown, old growth joins water as a
  // wall: a trail runs up to its edge and stops, never through it.
  const passKind = kind.slice()
  const walkable = kind.slice()
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
    let route = routeOverLand(a, b, width, depth, trailWander, walkable, walkable, 0)
    if (!route) {
      // The far stop is across water (or old growth): head for it and stop at
      // the edge of whatever is in the way.
      const crossing = routeOverLand(a, b, width, depth, trailWander, kind, passKind, MAX_BRIDGE_SPAN)
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
    // Both rolls are always drawn so the fade chance never shifts the stream.
    const fadeRoll = rngTrail()
    const lengthRoll = rngTrail()
    const keep = fadeRoll < TRAIL_FADE_CHANCE ? 0.4 + lengthRoll * 0.4 : 1
    carveTrail(trailStops[next], trailStops[bestConnected], keep)
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

  // --- Dark forests: old growth in the road's way ----------------------------
  // A dark forest is only interesting if it's in the road's way, so hearts are
  // picked *on* a provisional road — routed exactly as the real one will be,
  // minus the dark-forest surcharge — at points deep in the forest-shade
  // field with woods room north and south to stand a bar in, spaced apart so
  // they read as separate forests, and kept off the map's margins so the
  // road's endpoints stay clear. Growth only spreads through woods (and across
  // the trails that thread them), so a dark forest never leaks across a glade
  // or into water.
  const entryZ = snapEdgeZ(entryRoll, 0, roadLand, width, depth)
  const exitZ = snapEdgeZ(exitRoll, width - 1, roadLand, width, depth)
  const start = { x: 0, z: entryZ }
  const goal = { x: width - 1, z: exitZ }
  // Water-aware, with the same fallbacks for every segment of road.
  const routeRoad = (a: TilePos, b: TilePos, wander: Float64Array): number[] =>
    routeOverLand(a, b, width, depth, wander, kind, passKind, MAX_BRIDGE_SPAN) ??
    routeOverLand(a, b, width, depth, wander, kind, passKind, Infinity) ??
    routeBlind(a, b, width, depth, wander)
  // The road seeks the path of least resistance: on top of its random wander,
  // every step pays for the ground it crosses (see ROAD_FOREST_COST), so the
  // route bends through glades, borrows clearings and trails to get across
  // the woods, and crosses solid forest where the belt is thinnest. The
  // provisional road pays the same, so dark forests are seeded on the line
  // the real road would actually take.
  const groundCost = (i: number): number => {
    const t = tiles[i]
    if (t === "forest" || t === "darkwood") return ROAD_FOREST_COST
    if (t === "clearing") return ROAD_CLEARING_COST
    return 0
  }
  const groundWander = new Float64Array(roadWander)
  for (let i = 0; i < groundWander.length; i++) groundWander[i] += groundCost(i)
  const provisional = routeRoad(start, goal, groundWander)

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
    // The heart may be a trail tile as well as solid forest: the road seeks
    // the path of least resistance, so where it crosses deep woods it is
    // usually riding a trail, and a trail in the deep shade is still the
    // heart of the woods.
    const deepEnough = (minShade: number, minRoom: number) =>
      provisional.filter(
        (i) =>
          canEnter(i) &&
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
  // detours; the road-tie, the relic's branch, and the repair trails skirt —
  // but nothing is ever impassable. The surcharge is feathered by the
  // dark-shade field so it also covers the clearings and trails threading the
  // old growth: without that, the road would happily ride a one-tile game
  // trail straight through the middle.
  const darkShade = computeDarkShade({ width, depth, tiles, buildings: [] })
  const darkPenalty = (i: number) =>
    tiles[i] === "darkwood" ? DARK_ROAD_COST : DARK_ROAD_COST * darkShade[i]
  const roadCost = new Float64Array(width * depth)
  for (let i = 0; i < roadCost.length; i++) {
    roadCost[i] = roadWander[i] + groundCost(i) + darkPenalty(i)
    trailWander[i] += darkPenalty(i)
    // Trails, unlike the road, never enter old growth at all.
    if (tiles[i] === "darkwood") walkable[i] = WATER_KIND_LAKE
  }

  // --- Where the direct route crosses the dark forest ------------------------
  // The provisional road is the direct route; where it runs through the dark
  // shade is a crossing. Each crossing gets a pair of waypoints on the direct
  // route just outside the shade (on dry land, so every road segment can be
  // routed water-aware). The real road is routed *through* those waypoints,
  // so after skirting the old growth it must come back to the direct line —
  // a genuine detour, not a road that merely drifted past one end.
  const crossings: Array<[number, number]> = []
  for (let p = 0; p < provisional.length; p++) {
    if (darkShade[provisional[p]] < TRACK_DARK_SHADE) continue
    const last = crossings[crossings.length - 1]
    if (last && p - last[1] <= TRACK_MERGE_GAP) last[1] = p
    else crossings.push([p, p])
  }
  const spans: Array<[number, number]> = []
  for (const [pa, pb] of crossings) {
    let a = pa - TRACK_MARGIN
    let b = pb + TRACK_MARGIN
    while (a > 0 && kind[provisional[a]] !== 0) a--
    while (b < provisional.length - 1 && kind[provisional[b]] !== 0) b++
    const prev = spans[spans.length - 1]
    if (a <= 0 || b >= provisional.length - 1 || (prev && a <= prev[1])) continue
    spans.push([a, b])
  }

  // --- Road: west edge to east edge ------------------------------------------
  // Routed over land with lake water impassable and rivers crossable only via
  // straight bridges, so forest in the way gets carved but water is
  // respected. The fallbacks keep the road guarantee even on hostile seeds.
  // The route comes back as an ordered walk, west edge to east edge; keep
  // that order on the map (`road`) so travelers know which way along is.
  const stops = [provisional[0]]
  for (const [a, b] of spans) stops.push(provisional[a], provisional[b])
  stops.push(provisional[provisional.length - 1])
  const roadRoute: number[] = []
  for (let st = 0; st < stops.length - 1; st++) {
    const segment = routeRoad(
      { x: stops[st] % width, z: Math.floor(stops[st] / width) },
      { x: stops[st + 1] % width, z: Math.floor(stops[st + 1] / width) },
      roadCost,
    )
    // Consecutive segments share their junction tile; keep it once.
    for (let k = st === 0 ? 0 : 1; k < segment.length; k++) roadRoute.push(segment[k])
  }

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

  // --- Tracks: the short way through each dark forest ------------------------
  // Kept only if it really is a shortcut and really runs through old growth —
  // a road that barely bent around a sliver earns no track. "Through" means
  // the line runs on or right beside dark trees: the direct route seeks the
  // path of least resistance, so in deep woods it is usually riding a game
  // trail, and a game trail through the heart of the old growth is exactly
  // the dangerous short way this is meant to be. Bridges are the road's
  // alone: a direct line with open water under it is re-routed dry between
  // the same two road tiles (the road's own bridges are fine to ride), and if
  // no dry way through the old growth is short enough, that forest simply
  // gets no track.
  const touchesDark = (i: number): boolean => {
    if (tiles[i] === "darkwood") return true
    const x = i % width
    const z = Math.floor(i / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      if (tiles[nz * width + nx] === "darkwood") return true
    }
    return false
  }
  const shortcuts: Shortcut[] = []
  for (const [a, b] of spans) {
    const entry = roadIndex[provisional[a]]
    const exit = roadIndex[provisional[b]]
    if (entry < 0 || exit <= entry) continue
    const maxLength = (exit - entry + 1) * TRACK_MAX_RATIO
    const route = provisional.slice(a, b + 1)
    if (route.length > maxLength || !route.some(touchesDark)) continue
    let track = route
    if (track.some((i) => tiles[i] === "water")) {
      const dry = routeOverLand(
        { x: track[0] % width, z: Math.floor(track[0] / width) },
        { x: track[track.length - 1] % width, z: Math.floor(track[track.length - 1] / width) },
        width,
        depth,
        groundWander,
        kind,
        passKind,
        0,
      )
      if (!dry || dry.length > maxLength || !dry.some(touchesDark)) continue
      track = dry
    }
    for (const i of track) {
      if (tiles[i] !== "path" && tiles[i] !== "bridge") tiles[i] = "track"
    }
    shortcuts.push({
      entry,
      exit,
      tiles: track.map((i) => ({ x: i % width, z: Math.floor(i / width) })),
    })
  }

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
  const { hovel, site } = foundSite(
    tiles,
    width,
    depth,
    road,
    relicDistance,
    trailWander,
    rngSite,
    kind,
    passKind,
    roadLand,
  )

  // --- Join same-bank pockets to the network ---------------------------------
  // Rivers, lakes, and dark forests divide the world, and trails cross none of
  // them, so land the road cannot reach without a crossing stays cut off —
  // that is the point. But a glade or clearing that shares a bank with
  // reachable ground should not sit walled off by plain forest alone: each
  // such pocket gets a trail to the nearest reachable tile. Pockets with water
  // or old growth between them and everything reachable are left as they are.
  let reached = reachableFrom(tiles, roadTiles, width, depth)
  const settled = new Uint8Array(tiles.length)
  for (let repair = 0; repair < MAX_POCKET_REPAIRS; repair++) {
    const orphan = tiles.findIndex((t, i) => TERRAIN[t].passable && !reached[i] && !settled[i])
    if (orphan === -1) break
    const pocket = passableComponent(tiles, orphan, width, depth)
    for (const i of pocket) settled[i] = 1
    const link = nearestReachedByLand(pocket, reached, tiles, walkable, width, depth)
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
    )
    if (!route) continue
    carveRoute(route)
    reached = reachableFrom(tiles, roadTiles, width, depth)
  }

  return {
    width,
    depth,
    tiles,
    buildings: [hovel],
    seed,
    road,
    shortcuts,
    site,
    water: {
      depth: Array.from(water.depth),
      flow: Object.fromEntries(water.flow),
    },
  }
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
      if (dist[n] !== -1 || kind[n] !== 0) continue
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
 * The site is scored over every possible hovel origin: it must sit within the
 * road-distance band (or as near to it as the map allows), and among those it
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
): { hovel: BuildingDef; site: FoundingSite } {
  const { min: bandMin, max: bandMax } = relicDistanceBand(relicDistance)

  // Distance from the road is measured as it will be walked: dry, around
  // water rather than across it, from any road tile at all — the gap between
  // road and relic is the ground the settlement will grow on.
  const fromRoad = landDistanceField(
    road.map((p) => p.z * width + p.x),
    kind,
    width,
    depth,
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
      if (offRoad[nz * width + nx] === 0) gates.push(nz * width + nx)
    }
  }
  const { dist, origin } = landDistanceField(gates, offRoad, width, depth)

  // --- Score every origin the footprint fits at ------------------------------
  let best: TilePos = { x: EDGE_MARGIN, z: EDGE_MARGIN }
  let bestScore = -Infinity
  const outerMin = EDGE_MARGIN + 1 // leave room for the grass ring
  for (let z = outerMin; z <= depth - HOVEL_SIZE - outerMin; z++) {
    for (let x = outerMin; x <= width - HOVEL_SIZE - outerMin; x++) {
      let onRoad = false
      let grounded = true
      let dryTrack = false
      let nearest = Infinity
      for (let dz = -1; dz <= HOVEL_SIZE; dz++) {
        for (let dx = -1; dx <= HOVEL_SIZE; dx++) {
          const i = (z + dz) * width + (x + dx)
          const inFootprint = dx >= 0 && dx < HOVEL_SIZE && dz >= 0 && dz < HOVEL_SIZE
          // Footprint and ring must be dry, reachable land — no water, no
          // bridges, no lake-locked pockets.
          if (roadLand[i] !== 1) grounded = false
          if (inFootprint) {
            if (tiles[i] === "path") onRoad = true
            nearest = Math.min(nearest, walkFromRoad(i))
          } else if (dist[i] !== -1) {
            // A ring tile the gate walk reaches means the track can arrive dry.
            dryTrack = true
          }
        }
      }
      if (onRoad || !grounded) continue

      // Outside the band, every step of shortfall or excess costs more than any
      // amount of open ground can buy back — in-band sites always win if any exist.
      const bandPenalty =
        nearest < bandMin ? (bandMin - nearest) * 50 : nearest > bandMax ? (nearest - bandMax) * 50 : 0
      // Needing a bridge outweighs any band shortfall a dry site could have.
      const bridgePenalty = dryTrack ? 0 : (width + depth) * 50

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

      const score = room - bandPenalty - bridgePenalty - edgePenalty + rng() * SITE_SCORE_JITTER
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
  for (let k = 0; k < HOVEL_SIZE; k++) {
    ring.push({ x: best.x + k, z: best.z - 1 })
    ring.push({ x: best.x + k, z: best.z + HOVEL_SIZE })
    ring.push({ x: best.x - 1, z: best.z + k })
    ring.push({ x: best.x + HOVEL_SIZE, z: best.z + k })
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
      if (Math.abs(road[r].x - gx) + Math.abs(road[r].z - gz) === 1) {
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
  for (let dz = 0; dz < HOVEL_SIZE; dz++) {
    for (let dx = 0; dx < HOVEL_SIZE; dx++) {
      branchWander[(best.z + dz) * width + (best.x + dx)] += BRANCH_AVOID_COST
    }
  }
  // Dry and clear of the road first (the road is a wall, bar the junction
  // itself); then the road merely avoided; a bridge only when no dry way
  // exists at all; and blind as a last resort.
  offRoad[road[junction].z * width + road[junction].x] = 0
  const branchRoute =
    routeOverLand(road[junction], door, width, depth, branchWander, offRoad, offRoad, 0) ??
    routeOverLand(road[junction], door, width, depth, branchWander, kind, passKind, 0) ??
    routeOverLand(road[junction], door, width, depth, branchWander, kind, passKind, MAX_BRIDGE_SPAN) ??
    routeOverLand(road[junction], door, width, depth, branchWander, kind, passKind, Infinity) ??
    routeBlind(road[junction], door, width, depth, branchWander)
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
 * Grow one dark forest from `heart`: a straight spine north and south as far
 * as the woods allow (up to DARK_BAR_HALF each way), then organic growth off
 * it until `target` forest tiles are old growth. Only forest converts, and the
 * frontier only spreads where `canEnter` allows, so the bar threads around
 * clearings and trails but never leaks across a glade or into water.
 */
function growDarkForest(
  tiles: TerrainId[],
  width: number,
  depth: number,
  heart: number,
  target: number,
  rng: () => number,
  canEnter: (i: number) => boolean,
): void {
  let painted = 0
  const blob: number[] = []
  const inBlob = new Set<number>()
  const add = (i: number) => {
    inBlob.add(i)
    blob.push(i)
    if (tiles[i] === "forest") {
      tiles[i] = "darkwood"
      painted++
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
  while (painted < target && attempts-- > 0) {
    const from = blob[Math.floor(rng() * blob.length)]
    const [dx, dz] = ROUTE_DIRS[Math.floor(rng() * 4)]
    const nx = (from % width) + dx
    const nz = Math.floor(from / width) + dz
    if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
    const n = nz * width + nx
    if (inBlob.has(n) || !canEnter(n)) continue
    add(n)
  }
}

/** Mask of every passable tile reachable from the road over passable tiles. */
function reachableFrom(
  tiles: TerrainId[],
  roadTiles: number[],
  width: number,
  depth: number,
): Uint8Array {
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
  return seen
}

/** The 4-connected passable component containing `start`, as tile indices. */
function passableComponent(
  tiles: TerrainId[],
  start: number,
  width: number,
  depth: number,
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
): { from: number; to: number } | null {
  const { dist, origin } = landDistanceField(pocket, walls, width, depth)
  let best = -1
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] === -1 || !reached[i] || !TERRAIN[tiles[i]].passable) continue
    if (best === -1 || dist[i] < dist[best]) best = i
  }
  return best === -1 ? null : { from: origin[best], to: best }
}

/**
 * Marks land tiles routing can actually reach: flood the grid treating river
 * water as passable (rivers can be bridged) and lake water as a wall, then
 * keep the land of the largest region. Snapping road endpoints, trail stops,
 * and the founding site onto this mask stops a land pocket walled off by a
 * lake — say a cove on the map edge — from ever becoming an unreachable
 * routing goal.
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
 * existing bridges like land; a *new* crossing still has to launch from and
 * land on true land (`kind` 0), never side-on into or out of another bridge,
 * and may not run alongside one either — two straight bridges laid a tile
 * apart weld into one wide slab, so a route that wants to cross there uses
 * the bridge that already exists. That keeps every bridge a clean straight
 * segment. Returns null when no route exists (the road relaxes the span and,
 * as a last resort, falls back to blind routing; trails just skip the edge).
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
  const besideBridge = (x: number, z: number, dx: number, dz: number): boolean => {
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
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      const n = nz * width + nx

      if (pass[n] === 0) {
        if (!closed[n]) relax(n, g[current] + 1 + wander[n], current)
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
        if (px < 0 || pz < 0 || px >= width || pz >= depth) break
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
