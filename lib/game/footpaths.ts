import { benchmarkWork } from "./benchmark-work"
import { buildingSpatialQuery } from "./building-spatial"
import { walkingGroundQuery } from "./walking-ground"
import { isRoadTerrain } from "./map/road"
import { elevationStep } from "./map/elevation"
import { tileAt, worldToTileX, worldToTileZ, type GameMap, type TilePos } from "./map/types"
import { walkingRouteCost } from "./map/terrain"
import { buildTraveledRoadSegments, type RoadSegment, type TraveledRoad } from "./render/road-segments"
import { cartGroundContacts } from "./transport/bridge-guide"
import type { CartPose } from "./transport/follow"
import { FIRST_PASS_WEAR } from "./render/path-appearance"

/** Traffic establishes paths, but no amount of past traffic prevents regrowth. */
export const FOOTPATH_WEAR = .04
export const HEAVY_PATH_WEAR = 2
export const FOOTPATH_HALF_LIFE = 3
export const FOOTPATH_ESTABLISHED_AT = .45
export const FOUNDING_ROAD_WEAR = .6

interface Footpath { from: number; to: number; wear: number }
interface ContactTrack extends TraveledRoad { low: number; high: number }
/** Something a walker must go around: in the game, every standing tree. */
export type FootpathObstacle = TilePos & { radius: number }
/** Obstacles bucketed on a coarse world grid; see {@link indexObstacles}. */
export interface ObstacleIndex { source: readonly FootpathObstacle[]; reach: number; cells: Map<number, FootpathObstacle[]> }
/** One stretch of road's answer to "is there a way across here?"; see lib/game/walking-shortcuts. */
export interface RoadCut { end: number | null; atSeconds: number; ground: number; buildings: number }
export interface Footpaths { rerouted: Set<number>; obstacles?: readonly FootpathObstacle[]; obstacleIndex?: ObstacleIndex; paved?: boolean; founding: Map<number, number>; edges: Map<number | string, Footpath>; contacts: Map<number | string, ContactTrack>; cuts?: Map<number, RoadCut>; ground: number; revision: number; elapsed: number }
export const createFootpaths = (map?: GameMap): Footpaths => ({
  rerouted: new Set(),
  founding: new Map(map?.tiles.flatMap((terrain, index) => isRoadTerrain(terrain) ? [[index, FOUNDING_ROAD_WEAR] as const] : []) ?? []),
  edges: new Map(), contacts: new Map(), ground: 0, revision: 0, elapsed: 0,
})

/**
 * Announce that the ground itself changed — something built, paved, cleared or
 * felled — as opposed to the gradual wear that `revision` tracks.
 *
 * Route answers cached against the ground are dropped the moment this moves, so
 * a path laid across the map takes effect on the walkers' next step rather than
 * whenever a refresh happens to come round.
 */
export function markGroundChanged(paths: Footpaths): void {
  paths.ground++
}

/** Edge of one obstacle bucket, in tiles. A few trees deep at forest density. */
const OBSTACLE_CELL = 4
/** Packs signed cell coordinates into one integer key; maps are far smaller. */
const cellKey = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096)

/**
 * Bucket obstacles by world position, and hand the result to
 * {@link setFootpathObstacles}.
 *
 * The obstacle list is every standing tree — tens of thousands on a large map —
 * and route costing tests short segments against it many times per simulation
 * step. Scanning the whole list per segment made walking the road the most
 * expensive thing in the game once traffic grew; buckets cut it to the handful
 * that could possibly be in the way.
 */
export function indexObstacles(obstacles: readonly FootpathObstacle[]): ObstacleIndex {
  const index: ObstacleIndex = { source: obstacles, reach: 0, cells: new Map() }
  for (const obstacle of obstacles) {
    index.reach = Math.max(index.reach, obstacle.radius)
    const key = cellKey(Math.floor(obstacle.x / OBSTACLE_CELL), Math.floor(obstacle.z / OBSTACLE_CELL))
    const cell = index.cells.get(key)
    if (cell) cell.push(obstacle)
    else index.cells.set(key, [obstacle])
  }
  return index
}

/** Publish a new obstacle list along with its index, so the two cannot drift. */
export function setFootpathObstacles(paths: Footpaths, obstacles: readonly FootpathObstacle[]): void {
  paths.obstacles = obstacles
  paths.obstacleIndex = indexObstacles(obstacles)
  markGroundChanged(paths)
}

/**
 * Obstacles that could reach into the world-space box, collected into `into`.
 *
 * Over-inclusive by design — callers still do their own precise distance test.
 * Falls back to the plain list whenever there is no index for it, so code and
 * tests that assign `obstacles` directly stay correct, just slower.
 */
export function obstaclesNear(paths: Footpaths | undefined, minX: number, minZ: number, maxX: number, maxZ: number, slack: number, into: FootpathObstacle[]): FootpathObstacle[] {
  into.length = 0
  const obstacles = paths?.obstacles
  if (!obstacles?.length) return into
  const index = paths!.obstacleIndex
  if (index?.source !== obstacles) {
    for (const obstacle of obstacles) {
      const pad = obstacle.radius + slack
      if (obstacle.x >= minX - pad && obstacle.x <= maxX + pad && obstacle.z >= minZ - pad && obstacle.z <= maxZ + pad) into.push(obstacle)
    }
    return into
  }
  const pad = index.reach + slack
  const fromX = Math.floor((minX - pad) / OBSTACLE_CELL), toX = Math.floor((maxX + pad) / OBSTACLE_CELL)
  const fromZ = Math.floor((minZ - pad) / OBSTACLE_CELL), toZ = Math.floor((maxZ + pad) / OBSTACLE_CELL)
  for (let cx = fromX; cx <= toX; cx++) for (let cz = fromZ; cz <= toZ; cz++) {
    const cell = index.cells.get(cellKey(cx, cz))
    if (cell) for (const obstacle of cell) into.push(obstacle)
  }
  return into
}

/** Compaction shared by original road tiles and their rendered shoulders. */
function foundingCompaction(map: GameMap, index: number): number {
  const paths = map.footpaths
  if (!paths) return FOUNDING_ROAD_WEAR
  if (paths.founding.has(index)) return paths.founding.get(index)!
  const x = index % map.width, z = Math.floor(index / map.width)
  let wear = 0
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (x + dx >= 0 && x + dx < map.width && z + dz >= 0 && z + dz < map.depth)
      wear = Math.max(wear, paths.founding.get((z + dz) * map.width + x + dx) ?? 0)
  }
  return wear
}

/** Original roads fade only after traffic establishes an alternative. */
export function foundingRoadStrength(map: GameMap, index: number): number {
  if (!map.footpaths || map.footpaths.paved) return 1
  return Math.min(1, foundingCompaction(map, index) / FOUNDING_ROAD_WEAR)
}

/** Existing ruts widen from local use, independently of the population slider. */
export function foundingRoadTraffic(map: GameMap, index: number, fallback: number): number {
  if (!map.footpaths) return fallback
  const wear = foundingCompaction(map, index)
  return 6 * Math.min(1, wear / FOUNDING_ROAD_WEAR) + 70 * Math.max(0, wear - FOUNDING_ROAD_WEAR)
}
/** Two 26-bit tile indices fit exactly in a JavaScript number. Avoid allocating
 * strings for every footfall and A* edge; oversized custom maps retain a key. */
export const footpathEdgeKey = (a: number, b: number): number | string => {
  const low = Math.min(a, b), high = Math.max(a, b)
  return low >= 0 && high < 0x4000000 ? low * 0x4000000 + high : `${low}:${high}`
}
const index = (map: GameMap, p: TilePos) => p.z * map.width + p.x

function crossingAllowed(map: GameMap, a: TilePos, b: TilePos, open: (p: TilePos) => boolean): boolean {
  if (!open(a)) return false
  if (a.x === b.x && a.z === b.z) return Number.isFinite(elevationStep(map.elevation, index(map, a), index(map, b)))
  if (!open(b)) return false
  if (a.x !== b.x && a.z !== b.z && (!open({ x: a.x, z: b.z }) || !open({ x: b.x, z: a.z }))) return false
  return Number.isFinite(elevationStep(map.elevation, index(map, a), index(map, b)))
}

const CONTACT_DIRECTIONS = Array.from({ length: 8 }, (_, direction) => ({
  x: Math.cos(direction * Math.PI / 8), z: Math.sin(direction * Math.PI / 8),
}))

/** Compact actual movement into half-tile spans, retaining lateral lane offsets.
 * Opposite-direction pedestrians use their own physical lanes; reversing on
 * exactly the same ground reinforces that ground. Sampling is distance driven. */
function recordContact(paths: Footpaths, map: GameMap, from: TilePos, to: TilePos, a: TilePos, b: TilePos, weight: number, open: (p: TilePos) => boolean): void {
  const dx = to.x - from.x, dz = to.z - from.z
  if (!crossingAllowed(map, a, b, open)) return
  const direction = ((Math.round(Math.atan2(dz, dx) / (Math.PI / 8)) % 8) + 8) % 8
  const { x: ux, z: uz } = CONTACT_DIRECTIONS[direction]
  const ax = from.x + map.width / 2, az = from.z + map.depth / 2
  const bx = to.x + map.width / 2, bz = to.z + map.depth / 2
  const alongA = ax * ux + az * uz, alongB = bx * ux + bz * uz
  const low = Math.min(alongA, alongB), high = Math.max(alongA, alongB)
  const lane = Math.round((-(ax + bx) * uz + (az + bz) * ux) / 2 * 4)
  for (let span = Math.floor(low * 2); span * .5 < high - 1e-8; span++) {
    const start = Math.max(low, span * .5), end = Math.min(high, (span + 1) * .5)
    // Every supported map fits these signed fields. Numeric keys avoid a new
    // string for every footfall; retain a collision-free fallback for larger
    // hand-authored worlds.
    const key = span >= -4096 && span < 4096 && lane >= -4096 && lane < 4096
      ? (direction * 8192 + span + 4096) * 8192 + lane + 4096 : `${direction}:${span}:${lane}`
    let track = paths.contacts.get(key)
    if (!track) {
      track = { ax: 0, az: 0, bx: 0, bz: 0, wear: 0, low: start, high: end, contact: true }
      paths.contacts.set(key, track)
    }
    const oldLow = track.low, oldHigh = track.high, oldWear = track.wear
    if (oldWear === 1 && oldLow <= start && oldHigh >= end) continue
    track.low = Math.min(track.low, start); track.high = Math.max(track.high, end)
    track.ax = ux * track.low - uz * lane / 4; track.az = uz * track.low + ux * lane / 4
    track.bx = ux * track.high - uz * lane / 4; track.bz = uz * track.high + ux * lane / 4
    track.wear = Math.min(1, track.wear + FOOTPATH_WEAR * weight * (end - start) / .5)
    if (track.low !== oldLow || track.high !== oldHigh || track.wear !== oldWear) paths.revision++
  }
}

/** Use the rendered axle's two wheel contacts, including its inside sweep in bends. */
export function recordCartPath(paths: Footpaths, map: GameMap, before: CartPose, after: CartPose, scale: number): void {
  const a = cartGroundContacts(before, scale), b = cartGroundContacts(after, scale)
  for (let wheel = 0; wheel < 2; wheel++) recordWalkingPath(paths, map, a[wheel], b[wheel], HEAVY_PATH_WEAR)
}

/** Record crossed ground, never a planned route. Undirected tile edges keep storage bounded. */
export function recordWalkingPath(paths: Footpaths, map: GameMap, from: TilePos, to: TilePos, weight = 1, nearby = buildingSpatialQuery(map.buildings)): void {
  if (process.env.NEXT_PUBLIC_GAME_BENCHMARK === "1" && !benchmarkWork.pathWear) return
  const distance = Math.hypot(to.x - from.x, to.z - from.z)
  // Respawning at the map edge and other teleports must not draw a shortcut.
  if (!Number.isFinite(distance) || distance <= 1e-8 || distance > 2 || !Number.isFinite(weight) || weight <= 0) return
  let a = { x: worldToTileX(map, from.x), z: worldToTileZ(map, from.z) }
  const last = { x: worldToTileX(map, to.x), z: worldToTileZ(map, to.z) }
  const open = walkingGroundQuery(map, nearby)
  recordContact(paths, map, from, to, a, last, weight, open)
  const ground = worldToTileZ(map, (from.z + to.z) / 2) * map.width + worldToTileX(map, (from.x + to.x) / 2)
  const oldRoad = paths.founding.get(ground)
  if (oldRoad !== undefined) {
    const wear = Math.min(1, oldRoad + FOOTPATH_WEAR * weight * distance)
    if (wear !== oldRoad) { paths.founding.set(ground, wear); paths.revision++ }
  }
  const steps = Math.ceil(distance / .25)
  for (let step = 1; step <= steps; step++) {
    const t = step / steps
    const b = step === steps ? last : { x: worldToTileX(map, from.x + (to.x - from.x) * t), z: worldToTileZ(map, from.z + (to.z - from.z) * t) }
    if ((a.x !== b.x || a.z !== b.z) && crossingAllowed(map, a, b, open)) {
      const ai = index(map, a), bi = index(map, b), key = footpathEdgeKey(ai, bi)
      const edge = paths.edges.get(key) ?? { from: Math.min(ai, bi), to: Math.max(ai, bi), wear: 0 }
      const wear = Math.min(1, edge.wear + FOOTPATH_WEAR * weight)
      if (wear !== edge.wear) {
        edge.wear = wear
        paths.edges.set(key, edge)
        paths.revision++
      }
    }
    a = b
  }
}

/** Regrow in game time; batch at one sim second to avoid scanning the network every frame. */
export function regrowFootpaths(paths: Footpaths, days: number): void {
  if (process.env.NEXT_PUBLIC_GAME_BENCHMARK === "1" && !benchmarkWork.pathWear) return
  if (!Number.isFinite(days) || days <= 0) return
  paths.elapsed += days
  if (paths.elapsed < 1 / 600) return
  const decay = Math.pow(.5, paths.elapsed / FOOTPATH_HALF_LIFE)
  paths.elapsed = 0
  // A completed, established shortcut explicitly marks the road it bypasses.
  // Other foot traffic nearby (such as a route to camp) cannot retire the road.
  // Map.forEach avoids an entry-pair allocation for every worn span. On the
  // largest map fast playback visits this network many times each real second.
  if (!paths.paved) paths.founding.forEach((wear, index) => {
    const next = paths.rerouted.has(index) ? wear * decay : Math.max(FOUNDING_ROAD_WEAR, wear * decay)
    if (next !== wear) { paths.founding.set(index, next < .001 ? 0 : next); paths.revision++ }
  })
  paths.edges.forEach((edge, key) => {
    const wear = edge.wear * decay
    if (wear === edge.wear) return
    edge.wear = wear
    if (wear <= .001) paths.edges.delete(key)
    paths.revision++
  })
  paths.contacts.forEach((track, key) => {
    const wear = track.wear * decay
    if (wear === track.wear) return
    track.wear = wear
    if (wear <= .001) paths.contacts.delete(key)
    paths.revision++
  })
}

/**
 * Ground traffic has already made its own: an original road tile, or a tile
 * with an established worn crossing. Building over it is allowed wherever the
 * ground is otherwise sound — the walkers simply wear a new way round.
 */
export function establishedFootpath(map: GameMap, x: number, z: number): boolean {
  const paths = map.footpaths
  if (!paths || x < 0 || z < 0 || x >= map.width || z >= map.depth) return false
  const here = z * map.width + x
  if (paths.founding.has(here)) return true
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if ((!dx && !dz) || x + dx < 0 || z + dz < 0 || x + dx >= map.width || z + dz >= map.depth) continue
    const edge = paths.edges.get(footpathEdgeKey(here, (z + dz) * map.width + x + dx))
    if ((edge?.wear ?? 0) >= FOOTPATH_ESTABLISHED_AT) return true
  }
  return false
}

/** Worn corridors gradually approach the cost of an existing road; obstacles still govern access. */
export function footpathRouteCost(map: GameMap, from: TilePos, to: TilePos): number {
  const ax = Math.round(from.x), az = Math.round(from.z), bx = Math.round(to.x), bz = Math.round(to.z)
  const a = az * map.width + ax, b = bz * map.width + bx
  const terrain = tileAt(map, bx, bz)!
  const base = isRoadTerrain(terrain) && map.footpaths?.founding.has(b)
    ? 3 - 2 * foundingRoadStrength(map, b) : walkingRouteCost(terrain)
  if (base === 1) return 1
  const wear = map.footpaths?.edges.get(footpathEdgeKey(a, b))?.wear ?? 0
  const strength = Math.min(1, Math.max(0, (wear - FOOTPATH_WEAR) / (FOOTPATH_ESTABLISHED_AT - FOOTPATH_WEAR)))
  return base - (base - 1) * strength * strength * (3 - 2 * strength)
}

export function footpathRoadSegments(map: GameMap, paths: Footpaths) {
  const work = buildFootpathRoadSegments(map, paths)
  let step = work.next()
  while (!step.done) step = work.next()
  return step.value
}

/** A visual snapshot may span several frames. Copy each contact when sampled;
 * simulation can keep wearing/regrowing its live record while we finish. */
export function* buildFootpathRoadSegments(map: GameMap, paths: Footpaths): Generator<void, Map<number, RoadSegment[]>> {
  const nearby = buildingSpatialQuery(map.buildings)
  const eligible: Array<[number | string, ContactTrack]> = []
  let remaining = paths.contacts.size, processed = 0
  for (const [key, track] of paths.contacts) {
    if (remaining-- <= 0) break
    if (++processed % 128 === 0) yield
    if (track.wear <= FIRST_PASS_WEAR + 1e-6) continue
    const a = { x: Math.floor(track.ax), z: Math.floor(track.az) }
    const b = { x: Math.floor(track.bx), z: Math.floor(track.bz) }
    if (!crossingAllowed(map, a, b, walkingGroundQuery(map, nearby))) continue
    eligible.push([key, { ...track }])
  }
  return yield* buildTraveledRoadSegments(map, yield* compactContacts(eligible))
}

/** Join adjacent visual spans on the same lane. Simulation retains every contact
 * and its exact compaction. Established dirt uses 1/64 wear increments: the
 * resulting width change is under .002 tiles, well below one authored pixel.
 * Emerging grass wear retains its exact value and first-passage threshold. */
export function compactFootpathContacts(contacts: Iterable<[number | string, ContactTrack]>): TraveledRoad[] {
  const work = compactContacts(contacts)
  let step = work.next()
  while (!step.done) step = work.next()
  return step.value
}

function* compactContacts(contacts: Iterable<[number | string, ContactTrack]>): Generator<void, TraveledRoad[]> {
  const groups = new Map<number, ContactTrack[]>(), result: TraveledRoad[] = []
  let processed = 0
  for (const [key, track] of contacts) {
    if (++processed % 128 === 0) yield
    if (typeof key !== "number" || track.wear < .4) { result.push(track); continue }
    const direction = Math.floor(key / (8192 * 8192)), lane = key % 8192 - 4096
    const level = Math.round(track.wear * 64), group = (direction * 8192 + lane + 4096) * 65 + level
    const list = groups.get(group) ?? []
    list.push(track); groups.set(group, list)
  }
  for (const [key, tracks] of groups) {
    yield
    tracks.sort((a, b) => a.low - b.low)
    const wear = key % 65 / 64
    const direction = Math.floor(Math.floor(key / 65) / 8192)
    let previous: ContactTrack | undefined
    for (const track of tracks) {
      // Keep diagonal bounds local; a long diagonal's rectangular tile bin
      // would otherwise cover large areas of ground beside the actual path.
      if (previous && track.low <= previous.high + 1e-7
        && (direction === 0 || direction === 4 || track.high - previous.low <= 4)) {
        if (track.high > previous.high) { previous.high = track.high; previous.bx = track.bx; previous.bz = track.bz }
      } else {
        previous = { ...track, wear }; result.push(previous)
      }
    }
  }
  return result
}
