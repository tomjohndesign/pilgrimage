import { buildingSpatialQuery } from "./building-spatial"
import { FOOTPATH_ESTABLISHED_AT, footpathRouteCost, obstaclesNear, type FootpathObstacle } from "./footpaths"
import { elevationStep } from "./map/elevation"
import { settlementRoute } from "./settlement-route"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type BuildingDef, type GameMap, type TilePos } from "./map/types"

/** Some journeys try new ground; ordinary walkers require an economical, worn route. */
export const SHORTCUT_EXPLORERS = 1 / 8
export const SHORTCUT_LOOKAHEAD = 12
/** One explorer in each small cohort; small populations still get a pioneer.
 * Selection stays fixed for the whole journey and rotates on later journeys. */
export function exploresRoadShortcut(ordinal: number, cycle: number, seed: number, population = 8): boolean {
  const cohort = Math.floor(ordinal / 8), size = Math.min(8, population - cohort * 8)
  return size > 0 && ordinal % 8 === ((seed + cohort * 5 + cycle * 3) % size + size) % size
}
export interface WalkingShortcut {
  from: TilePos; to: TilePos; start: number; end: number; distance: number; length: number
  /** Intermediate world points on a forced detour; a plain cut runs straight. */
  via?: TilePos[]
}

const length = (a: TilePos, b: TilePos) => Math.hypot(b.x - a.x, b.z - a.z)

/** Scratch for the obstacles beside one segment. Costing never nests, and the
 * list never escapes the call, so one buffer serves every caller. */
const NEARBY: FootpathObstacle[] = []

/** World-space segment cost, including body clearance and both sides of diagonal corners. */
export function shortcutCost(map: GameMap, from: TilePos, to: TilePos, exploring = false, nearby = buildingSpatialQuery(map.buildings), routeCost = footpathRouteCost): number {
  const distance = length(from, to)
  if (distance < 1e-8) return 0
  const dx = (to.x - from.x) / distance, dz = (to.z - from.z) / distance
  const steps = Math.ceil(distance / .2)
  const tile = (p: TilePos) => ({ x: worldToTileX(map, p.x), z: worldToTileZ(map, p.z) })
  const open = (p: TilePos) => {
    const terrain = tileAt(map, p.x, p.z)
    return !!terrain && ["grass", "clearing", "dirt", "sand", "path", "track"].includes(terrain)
      && !nearby(p).some(b => p.x >= b.x && p.x < b.x + b.w && p.z >= b.z && p.z < b.z + b.d)
  }
  const obstacles = obstaclesNear(map.footpaths,
    Math.min(from.x, to.x), Math.min(from.z, to.z), Math.max(from.x, to.x), Math.max(from.z, to.z), .15, NEARBY)
  let previous = tile(from), cost = 0
  if (!open(previous)) return Infinity
  for (let step = 0; step <= steps; step++) {
    const t = step / steps, p = { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t }
    const next = tile(p)
    if (!open(next) || obstacles.some(o => length(p, o) < o.radius + .15)) return Infinity
    for (const side of [-.16, .16]) if (!open(tile({ x: p.x - dz * side, z: p.z + dx * side }))) return Infinity
    const a = previous.z * map.width + previous.x, b = next.z * map.width + next.x
    if (!Number.isFinite(elevationStep(map.elevation, a, b))) return Infinity
    if (previous.x !== next.x && previous.z !== next.z) {
      for (const corner of [{ x: previous.x, z: next.z }, { x: next.x, z: previous.z }]) {
        const c = corner.z * map.width + corner.x
        if (!open(corner) || !Number.isFinite(elevationStep(map.elevation, a, c)) || !Number.isFinite(elevationStep(map.elevation, c, b))) return Infinity
      }
    }
    if (step > 0) {
      // Inspect the edge this sample is approaching as well as the occupied tile.
      // This lets a worn diagonal attract the next walker before they enter it.
      const behind = tile({ x: p.x - dx * .51, z: p.z - dz * .51 })
      const ahead = tile({ x: p.x + dx * .51, z: p.z + dz * .51 })
      const base = Math.min(routeCost(map, previous, next), routeCost(map, behind, next), routeCost(map, next, ahead))
      cost += (1 + (base - 1) * (exploring ? .1 : 1)) * distance / steps
    }
    previous = next
  }
  return cost
}

/** Keep useful paths, but replace a local detour when a safe chord saves enough walking. */
export function smoothWalkingRoute<T extends TilePos>(map: GameMap, route: T[], exploring = false): T[] {
  if (!map.footpaths || route.length < 3) return route
  const nearby = buildingSpatialQuery(map.buildings)
  // Every lookahead revisits the same short edges. Ground and wear cannot
  // change during this synchronous operation, so sample each fact once.
  const edgeCosts = new Float64Array(route.length).fill(NaN)
  const edgeLengths = new Float64Array(route.length)
  const costs = new Map<number, number>(), size = map.width * map.depth
  const routeCost: typeof footpathRouteCost = (map, from, to) => {
    if (from.x < 0 || from.z < 0 || to.x < 0 || to.z < 0 || from.x >= map.width || to.x >= map.width || from.z >= map.depth || to.z >= map.depth)
      return footpathRouteCost(map, from, to)
    const key = (from.z * map.width + from.x) * size + to.z * map.width + to.x
    let cost = costs.get(key)
    if (cost === undefined) { cost = footpathRouteCost(map, from, to); costs.set(key, cost) }
    return cost
  }
  const result = [route[0]]
  for (let from = 0; from < route.length - 1;) {
    let best = from + 1, walked = 0, cost = 0, saving = .25
    for (let to = from + 1; to < Math.min(route.length, from + SHORTCUT_LOOKAHEAD + 1); to++) {
      if (Number.isNaN(edgeCosts[to])) {
        edgeLengths[to] = length(route[to - 1], route[to])
        edgeCosts[to] = shortcutCost(map, route[to - 1], route[to], exploring, nearby, routeCost)
      }
      walked += edgeLengths[to]
      cost += edgeCosts[to]
      if (!Number.isFinite(cost)) break // Preserve gates, interiors and bridge approaches.
      const direct = length(route[from], route[to])
      if (direct > walked * .92 || walked - direct <= saving) continue
      if (shortcutCost(map, route[from], route[to], exploring, nearby, routeCost) > cost * .98) continue
      best = to; saving = walked - direct
    }
    result.push(route[best]); from = best
  }
  return result
}

/** Ordinary road users only leave for a shortcut already worn across new ground. */
function establishedShortcut(map: GameMap, from: TilePos, to: TilePos): boolean {
  const paths = map.footpaths!
  const steps = Math.ceil(length(from, to) / .2)
  let previous = -1
  for (let step = 0; step <= steps; step++) {
    const t = step / steps
    const x = worldToTileX(map, from.x + (to.x - from.x) * t), z = worldToTileZ(map, from.z + (to.z - from.z) * t)
    const index = z * map.width + x
    if (previous >= 0 && previous !== index && (!paths.founding.has(previous) || !paths.founding.has(index))) {
      const edge = paths.edges.get(`${Math.min(previous, index)}:${Math.max(previous, index)}`)
      if ((edge?.wear ?? 0) >= FOOTPATH_ESTABLISHED_AT) return true
    }
    previous = index
  }
  return false
}

/** A short cut rejoins before any gameplay junction, preserving road progression and lanes. */
export function findRoadShortcut(map: GameMap, progress: number, direction: 1 | -1, pointAt: (p: number) => TilePos, exploring: boolean): WalkingShortcut | null {
  const road = map.road
  if (!map.footpaths || !road || progress < 1 || progress > road.length - 2) return null
  const protectedPoints = [map.site?.junction, ...(map.shortcuts ?? []).flatMap(s => [s.entry, s.exit])].filter((p): p is number => p !== undefined)
  if (protectedPoints.some(p => Math.abs(p - progress) < 1.5)) return null
  const from = pointAt(progress)
  let previous = from, cost = 0, walked = 0, best: WalkingShortcut | null = null, saving = .6
  for (let step = 1; step <= SHORTCUT_LOOKAHEAD * 2; step++) {
    const end = progress + direction * step * .5
    if (end < 1 || end > road.length - 2 || protectedPoints.some(p => direction * (p - progress) >= 0 && direction * (p - end) < 1.5)) break
    const to = pointAt(end)
    walked += length(previous, to)
    cost += shortcutCost(map, previous, to, exploring)
    if (!Number.isFinite(cost)) break
    previous = to
    const direct = length(from, to)
    if (direct > walked * .8 || walked - direct <= saving) continue
    // Following the road is the default. Only adopt a new line once repeated
    // traffic has made it almost as easy as walking the existing road.
    if (!exploring && (!establishedShortcut(map, from, to) || shortcutCost(map, from, to) > direct * 1.35)) continue
    if (shortcutCost(map, from, to, exploring) > cost * .98) continue
    best = { from, to, start: progress, end, length: direct, distance: 0 }
    saving = walked - direct
  }
  return best
}

/** Called after a walker finishes a cut; planning a route never retires the road. */
export function retireBypassedRoad(map: GameMap, cut: WalkingShortcut): void {
  const paths = map.footpaths
  // Walking around a building is forced, not chosen: the road it steps around
  // is still the road, and comes back the moment the footprint goes.
  if (cut.via) return
  if (!paths || !map.road || cut.distance < cut.length || !establishedShortcut(map, cut.from, cut.to)
    || shortcutCost(map, cut.from, cut.to) > cut.length * 1.35) return
  for (let i = Math.ceil(Math.min(cut.start, cut.end)); i <= Math.floor(Math.max(cut.start, cut.end)); i++) {
    const p = map.road[i], index = p.z * map.width + p.x
    if (paths.founding.has(index)) paths.rerouted.add(index)
  }
}

/**
 * How long the road's answer for one stretch stands, in simulation seconds.
 *
 * Only path wear ages an answer, and wear moves slowly. Anything structural —
 * a building, a felled tree, a path the player lays down — bumps the ground
 * revision instead and invalidates the stretch on the walkers' next step.
 */
export const SHORTCUT_REFRESH_SECONDS = 3

/**
 * Where the road offers a way across, if anywhere, for traffic heading this way
 * from this stretch. Resolved once for the road and reused by everyone on it.
 *
 * Resolving a cut is a lookahead scan that costs every candidate chord against
 * the terrain, the obstacles and the current wear. That is a fact about the
 * ground, not about the walker, and it barely differs between two people
 * standing on the same stretch — but with each of them resolving it privately
 * the work scaled with the population, and a busy road spent most of a frame
 * re-deriving the same answer hundreds of times.
 */
function roadCut(map: GameMap, progress: number, direction: 1 | -1, exploring: boolean,
  pointAt: (p: number, lane: number) => TilePos, nowSeconds: number): number | null {
  const paths = map.footpaths!
  const cuts = paths.cuts ??= new Map()
  const key = (Math.floor(progress) * 2 + (direction === 1 ? 1 : 0)) * 2 + (exploring ? 1 : 0)
  const cached = cuts.get(key)
  if (cached && cached.ground === paths.ground && cached.buildings === map.buildings.length
    && nowSeconds - cached.atSeconds < SHORTCUT_REFRESH_SECONDS && nowSeconds >= cached.atSeconds) return cached.end
  // Resolved on the road's own centre line: what is published is the line, and
  // each walker offers its own lane against it below.
  const cut = findRoadShortcut(map, progress, direction, p => pointAt(p, 0), exploring)
  cuts.set(key, { end: cut?.end ?? null, atSeconds: nowSeconds, ground: paths.ground, buildings: map.buildings.length })
  return cut?.end ?? null
}

/**
 * The walker's half of the decision: given the road's answer, is this cut worth
 * taking from where I am, in my lane?
 *
 * The published stretch was measured from the centre line and from wherever the
 * road was asked, so this confirms the chord this walker would actually walk —
 * one cost evaluation, against the lookahead scan it replaces.
 */
export function takeRoadShortcut(map: GameMap, progress: number, direction: 1 | -1, lane: number,
  pointAt: (p: number, lane: number) => TilePos, exploring: boolean, nowSeconds: number): WalkingShortcut | null {
  if (!map.footpaths || !map.road) return null
  const end = roadCut(map, progress, direction, exploring, pointAt, nowSeconds)
  if (end === null) return null
  // A stretch is resolved once per road tile, so a walker part way through that
  // tile can be handed a rejoin point it has already passed. Nobody doubles back.
  if (direction * (end - progress) <= 0) return null
  const from = pointAt(progress, lane), to = pointAt(end, lane)
  const direct = length(from, to)
  if (!(direct > 0)) return null
  // Walking the road between the same two points has to be enough longer to be
  // worth leaving it for, measured from this walker's position rather than the
  // one the stretch happened to be resolved at.
  let walked = 0, previous = from
  for (let step = 1; step <= SHORTCUT_LOOKAHEAD * 4; step++) {
    const p = progress + direction * step * .5
    const reached = direction > 0 ? p >= end : p <= end
    const next = pointAt(reached ? end : p, lane)
    walked += length(previous, next)
    previous = next
    if (reached) break
  }
  if (direct > walked * .8 || walked - direct <= .6) return null
  if (!Number.isFinite(shortcutCost(map, from, to, exploring))) return null
  return { from, to, start: progress, end, length: direct, distance: 0 }
}

/**
 * A footprint may be laid straight across the road: the settlement grows over
 * it and the traffic has to find its own way past. The obstruction is a fact
 * about the ground, so it is resolved once for the road and shared by everyone
 * walking it, until the buildings change.
 */
const roadObstructions = new WeakMap<GameMap, { buildings: readonly BuildingDef[]; count: number; blocked: Uint8Array }>()
export function blockedRoad(map: GameMap): Uint8Array {
  const road = map.road ?? []
  const cached = roadObstructions.get(map)
  if (cached && cached.buildings === map.buildings && cached.count === map.buildings.length) return cached.blocked
  const blocked = new Uint8Array(road.length)
  for (let i = 0; i < road.length; i++) {
    const p = road[i]
    blocked[i] = map.buildings.some(b => p.x >= b.x && p.x < b.x + b.w && p.z >= b.z && p.z < b.z + b.d) ? 1 : 0
  }
  roadObstructions.set(map, { buildings: map.buildings, count: map.buildings.length, blocked })
  return blocked
}

/** The run of road a single obstruction covers, and where to rejoin beyond it. */
function roadObstruction(blocked: Uint8Array, from: number, direction: 1 | -1): { first: number; last: number; rejoin: number } | null {
  if (!blocked[from]) return null
  let first = from, last = from
  while (first - 1 >= 0 && blocked[first - 1]) first--
  while (last + 1 < blocked.length && blocked[last + 1]) last++
  const beyond = direction === 1 ? last + 1 : first - 1
  if (beyond < 0 || beyond >= blocked.length) return null
  // Rejoin a tile further out where there is road to spare, so the walk back
  // on meets the lane at an angle instead of scraping the corner.
  const margin = beyond + direction
  return { first, last, rejoin: margin >= 0 && margin < blocked.length && !blocked[margin] ? margin : beyond }
}

/** How far ahead a walker notices a footprint standing in their way. */
export const DIVERSION_LOOKAHEAD = 3

/**
 * Plan a way around a building laid across the road, rejoining it beyond. The
 * detour is a real walked route — the ground it crosses wears like any other,
 * so repeated traffic makes the new way for itself.
 */
export function findRoadDiversion(
  map: GameMap,
  blocked: Uint8Array,
  from: TilePos,
  progress: number,
  direction: 1 | -1,
  pointAt: (p: number) => TilePos,
): WalkingShortcut | null {
  const road = map.road
  if (!road || road.length < 3) return null
  let obstruction: ReturnType<typeof roadObstruction> = null
  for (let step = 0; step <= DIVERSION_LOOKAHEAD; step++) {
    const index = Math.round(progress + direction * step)
    if (index < 0 || index >= road.length) return null
    obstruction = roadObstruction(blocked, index, direction)
    if (obstruction) break
  }
  if (!obstruction) return null
  const { rejoin } = obstruction
  // Already past it, or the walker stands on the blocked ground themselves.
  if (direction * (rejoin - progress) <= 0) return null
  const start = { x: worldToTileX(map, from.x), z: worldToTileZ(map, from.z) }
  const goal = road[rejoin]
  // A footprint may be laid over someone already standing on the road. Let
  // them step out of that site before it counts as a wall.
  const buildings = map.buildings.filter(b =>
    !(start.x >= b.x && start.x < b.x + b.w && start.z >= b.z && start.z < b.z + b.d))
  const route = settlementRoute(map, buildings, start, goal)
  if (!route) return null
  const to = pointAt(rejoin)
  const points = smoothWalkingRoute(map, [
    { x: from.x, z: from.z },
    ...route.slice(1, -1).map(p => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z) })),
    { x: to.x, z: to.z },
  ])
  const walked = points.slice(1).reduce((sum, p, i) => sum + length(points[i], p), 0)
  if (!(walked > 0)) return null
  return { from: points[0], to: points[points.length - 1], via: points.slice(1, -1),
    start: progress, end: rejoin, length: walked, distance: 0 }
}
