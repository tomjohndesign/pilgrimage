import { FOOTPATH_ESTABLISHED_AT, footpathRouteCost } from "./footpaths"
import { elevationStep } from "./map/elevation"
import { tileAt, worldToTileX, worldToTileZ, type GameMap, type TilePos } from "./map/types"

/** Some journeys try new ground; ordinary walkers require an economical, worn route. */
export const SHORTCUT_EXPLORERS = 1 / 8
export const SHORTCUT_LOOKAHEAD = 12
/** One explorer in each small cohort; small populations still get a pioneer.
 * Selection stays fixed for the whole journey and rotates on later journeys. */
export function exploresRoadShortcut(ordinal: number, cycle: number, seed: number, population = 8): boolean {
  const cohort = Math.floor(ordinal / 8), size = Math.min(8, population - cohort * 8)
  return size > 0 && ordinal % 8 === ((seed + cohort * 5 + cycle * 3) % size + size) % size
}
export interface WalkingShortcut { from: TilePos; to: TilePos; start: number; end: number; distance: number; length: number }

const length = (a: TilePos, b: TilePos) => Math.hypot(b.x - a.x, b.z - a.z)

/** World-space segment cost, including body clearance and both sides of diagonal corners. */
export function shortcutCost(map: GameMap, from: TilePos, to: TilePos, exploring = false): number {
  const distance = length(from, to)
  if (distance < 1e-8) return 0
  const dx = (to.x - from.x) / distance, dz = (to.z - from.z) / distance
  const steps = Math.ceil(distance / .2)
  const tile = (p: TilePos) => ({ x: worldToTileX(map, p.x), z: worldToTileZ(map, p.z) })
  const open = (p: TilePos) => {
    const terrain = tileAt(map, p.x, p.z)
    return !!terrain && ["grass", "clearing", "dirt", "sand", "path", "track"].includes(terrain)
      && !map.buildings.some(b => p.x >= b.x && p.x < b.x + b.w && p.z >= b.z && p.z < b.z + b.d)
  }
  const obstacles = (map.footpaths?.obstacles ?? []).filter(p =>
    p.x >= Math.min(from.x, to.x) - p.radius - .15 && p.x <= Math.max(from.x, to.x) + p.radius + .15 &&
    p.z >= Math.min(from.z, to.z) - p.radius - .15 && p.z <= Math.max(from.z, to.z) + p.radius + .15)
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
      const base = Math.min(footpathRouteCost(map, previous, next), footpathRouteCost(map, behind, next), footpathRouteCost(map, next, ahead))
      cost += (1 + (base - 1) * (exploring ? .1 : 1)) * distance / steps
    }
    previous = next
  }
  return cost
}

/** Keep useful paths, but replace a local detour when a safe chord saves enough walking. */
export function smoothWalkingRoute<T extends TilePos>(map: GameMap, route: T[], exploring = false): T[] {
  if (!map.footpaths || route.length < 3) return route
  const result = [route[0]]
  for (let from = 0; from < route.length - 1;) {
    let best = from + 1, walked = 0, cost = 0, saving = .25
    for (let to = from + 1; to < Math.min(route.length, from + SHORTCUT_LOOKAHEAD + 1); to++) {
      walked += length(route[to - 1], route[to])
      cost += shortcutCost(map, route[to - 1], route[to], exploring)
      if (!Number.isFinite(cost)) break // Preserve gates, interiors and bridge approaches.
      const direct = length(route[from], route[to])
      if (direct > walked * .92 || walked - direct <= saving) continue
      if (shortcutCost(map, route[from], route[to], exploring) > cost * .98) continue
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
  if (!paths || !map.road || cut.distance < cut.length || !establishedShortcut(map, cut.from, cut.to)
    || shortcutCost(map, cut.from, cut.to) > cut.length * 1.35) return
  for (let i = Math.ceil(Math.min(cut.start, cut.end)); i <= Math.floor(Math.max(cut.start, cut.end)); i++) {
    const p = map.road[i], index = p.z * map.width + p.x
    if (paths.founding.has(index)) paths.rerouted.add(index)
  }
}
