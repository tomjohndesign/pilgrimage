import { isRoadTerrain } from "./map/road"
import { elevationStep } from "./map/elevation"
import { tileAt, worldToTileX, worldToTileZ, type GameMap, type TilePos } from "./map/types"
import { walkingRouteCost } from "./map/terrain"
import { traveledRoadSegments, type TraveledRoad } from "./render/road-segments"
import { cartGroundContacts } from "./transport/bridge-guide"
import type { CartPose } from "./transport/follow"

/** Traffic establishes paths, but no amount of past traffic prevents regrowth. */
export const FOOTPATH_WEAR = .04
export const HEAVY_PATH_WEAR = 2
export const FOOTPATH_HALF_LIFE = 3
export const FOOTPATH_ESTABLISHED_AT = .45
export const FOUNDING_ROAD_WEAR = .6

interface Footpath { from: number; to: number; wear: number }
interface ContactTrack extends TraveledRoad { low: number; high: number }
export interface Footpaths { rerouted: Set<number>; obstacles?: readonly (TilePos & { radius: number })[]; paved?: boolean; founding: Map<number, number>; edges: Map<string, Footpath>; contacts: Map<string, ContactTrack>; revision: number; elapsed: number }
export const createFootpaths = (map?: GameMap): Footpaths => ({
  rerouted: new Set(),
  founding: new Map(map?.tiles.flatMap((terrain, index) => isRoadTerrain(terrain) ? [[index, FOUNDING_ROAD_WEAR] as const] : []) ?? []),
  edges: new Map(), contacts: new Map(), revision: 0, elapsed: 0,
})

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
const edgeKey = (a: number, b: number) => `${Math.min(a, b)}:${Math.max(a, b)}`
const index = (map: GameMap, p: TilePos) => p.z * map.width + p.x

function openGround(map: GameMap, p: TilePos): boolean {
  const terrain = tileAt(map, p.x, p.z)
  return !!terrain && ["grass", "clearing", "dirt", "sand", "path", "track"].includes(terrain)
    && !map.buildings.some(b => p.x >= b.x && p.x < b.x + b.w && p.z >= b.z && p.z < b.z + b.d)
}

function crossingAllowed(map: GameMap, a: TilePos, b: TilePos): boolean {
  if (!openGround(map, a) || !openGround(map, b)) return false
  if (a.x !== b.x && a.z !== b.z && (!openGround(map, { x: a.x, z: b.z }) || !openGround(map, { x: b.x, z: a.z }))) return false
  return Number.isFinite(elevationStep(map.elevation, index(map, a), index(map, b)))
}

/** Compact actual movement into half-tile spans, retaining lateral lane offsets.
 * Opposite-direction pedestrians use their own physical lanes; reversing on
 * exactly the same ground reinforces that ground. Sampling is distance driven. */
function recordContact(paths: Footpaths, map: GameMap, from: TilePos, to: TilePos, weight = 1): void {
  const dx = to.x - from.x, dz = to.z - from.z, distance = Math.hypot(dx, dz)
  if (!Number.isFinite(distance) || distance <= 1e-8 || distance > 2 || !Number.isFinite(weight) || weight <= 0) return
  const a = { x: worldToTileX(map, from.x), z: worldToTileZ(map, from.z) }
  const b = { x: worldToTileX(map, to.x), z: worldToTileZ(map, to.z) }
  if (!crossingAllowed(map, a, b)) return
  const direction = ((Math.round(Math.atan2(dz, dx) / (Math.PI / 8)) % 8) + 8) % 8
  const ux = Math.cos(direction * Math.PI / 8), uz = Math.sin(direction * Math.PI / 8)
  const ax = from.x + map.width / 2, az = from.z + map.depth / 2
  const bx = to.x + map.width / 2, bz = to.z + map.depth / 2
  const alongA = ax * ux + az * uz, alongB = bx * ux + bz * uz
  const low = Math.min(alongA, alongB), high = Math.max(alongA, alongB)
  const lane = Math.round((-(ax + bx) * uz + (az + bz) * ux) / 2 * 4)
  for (let span = Math.floor(low * 2); span * .5 < high - 1e-8; span++) {
    const start = Math.max(low, span * .5), end = Math.min(high, (span + 1) * .5)
    const key = `${direction}:${span}:${lane}`
    const track = paths.contacts.get(key) ?? { ax: 0, az: 0, bx: 0, bz: 0, wear: 0, low: start, high: end, contact: true }
    const oldLow = track.low, oldHigh = track.high, oldWear = track.wear
    track.low = Math.min(track.low, start); track.high = Math.max(track.high, end)
    track.ax = ux * track.low - uz * lane / 4; track.az = uz * track.low + ux * lane / 4
    track.bx = ux * track.high - uz * lane / 4; track.bz = uz * track.high + ux * lane / 4
    track.wear = Math.min(1, track.wear + FOOTPATH_WEAR * weight * (end - start) / .5)
    paths.contacts.set(key, track)
    if (track.low !== oldLow || track.high !== oldHigh || track.wear !== oldWear) paths.revision++
  }
}

/** Use the rendered axle's two wheel contacts, including its inside sweep in bends. */
export function recordCartPath(paths: Footpaths, map: GameMap, before: CartPose, after: CartPose, scale: number): void {
  const a = cartGroundContacts(before, scale), b = cartGroundContacts(after, scale)
  for (let wheel = 0; wheel < 2; wheel++) recordWalkingPath(paths, map, a[wheel], b[wheel], HEAVY_PATH_WEAR)
}

/** Record crossed ground, never a planned route. Undirected tile edges keep storage bounded. */
export function recordWalkingPath(paths: Footpaths, map: GameMap, from: TilePos, to: TilePos, weight = 1): void {
  const distance = Math.hypot(to.x - from.x, to.z - from.z)
  // Respawning at the map edge and other teleports must not draw a shortcut.
  if (!Number.isFinite(distance) || distance <= 1e-8 || distance > 2 || !Number.isFinite(weight) || weight <= 0) return
  recordContact(paths, map, from, to, weight)
  const ground = worldToTileZ(map, (from.z + to.z) / 2) * map.width + worldToTileX(map, (from.x + to.x) / 2)
  const oldRoad = paths.founding.get(ground)
  if (oldRoad !== undefined) {
    const wear = Math.min(1, oldRoad + FOOTPATH_WEAR * weight * distance)
    if (wear !== oldRoad) { paths.founding.set(ground, wear); paths.revision++ }
  }
  const steps = Math.ceil(distance / .25)
  let a = { x: worldToTileX(map, from.x), z: worldToTileZ(map, from.z) }
  for (let step = 1; step <= steps; step++) {
    const t = step / steps
    const b = { x: worldToTileX(map, from.x + (to.x - from.x) * t), z: worldToTileZ(map, from.z + (to.z - from.z) * t) }
    if ((a.x !== b.x || a.z !== b.z) && crossingAllowed(map, a, b)) {
      const ai = index(map, a), bi = index(map, b), key = edgeKey(ai, bi)
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
  if (!Number.isFinite(days) || days <= 0) return
  paths.elapsed += days
  if (paths.elapsed < 1 / 600) return
  const decay = Math.pow(.5, paths.elapsed / FOOTPATH_HALF_LIFE)
  paths.elapsed = 0
  // A completed, established shortcut explicitly marks the road it bypasses.
  // Other foot traffic nearby (such as a route to camp) cannot retire the road.
  if (!paths.paved) for (const [index, wear] of paths.founding) {
    const next = paths.rerouted.has(index) ? wear * decay : Math.max(FOUNDING_ROAD_WEAR, wear * decay)
    if (next !== wear) { paths.founding.set(index, next < .001 ? 0 : next); paths.revision++ }
  }
  for (const [key, edge] of paths.edges) {
    const wear = edge.wear * decay
    if (wear === edge.wear) continue
    edge.wear = wear
    if (wear <= .001) paths.edges.delete(key)
    paths.revision++
  }
  for (const [key, track] of paths.contacts) {
    const wear = track.wear * decay
    if (wear === track.wear) continue
    track.wear = wear
    if (wear <= .001) paths.contacts.delete(key)
    paths.revision++
  }
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
    const edge = paths.edges.get(edgeKey(here, (z + dz) * map.width + x + dx))
    if ((edge?.wear ?? 0) >= FOOTPATH_ESTABLISHED_AT) return true
  }
  return false
}

/** Worn corridors gradually approach the cost of an existing road; obstacles still govern access. */
export function footpathRouteCost(map: GameMap, from: TilePos, to: TilePos): number {
  const a = { x: Math.round(from.x), z: Math.round(from.z) }, b = { x: Math.round(to.x), z: Math.round(to.z) }
  const terrain = tileAt(map, b.x, b.z)!
  const base = isRoadTerrain(terrain) && map.footpaths?.founding.has(index(map, b))
    ? 3 - 2 * foundingRoadStrength(map, index(map, b)) : walkingRouteCost(terrain)
  const wear = map.footpaths?.edges.get(edgeKey(index(map, a), index(map, b)))?.wear ?? 0
  const strength = Math.min(1, Math.max(0, (wear - FOOTPATH_WEAR) / (FOOTPATH_ESTABLISHED_AT - FOOTPATH_WEAR)))
  return base - (base - 1) * strength * strength * (3 - 2 * strength)
}

export function footpathRoadSegments(map: GameMap, paths: Footpaths) {
  const roads: TraveledRoad[] = []
  for (const track of paths.contacts.values()) {
    const a = { x: Math.floor(track.ax), z: Math.floor(track.az) }
    const b = { x: Math.floor(track.bx), z: Math.floor(track.bz) }
    if (!crossingAllowed(map, a, b)) continue
    roads.push(track)
  }
  return traveledRoadSegments(map, roads)
}
