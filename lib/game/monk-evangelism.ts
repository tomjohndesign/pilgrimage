import { walkWorker, workerRoute } from "./construction"
import { ROUTE_DIRS } from "./map/route"
import { tileAt, type GameMap, type TilePos } from "./map/types"
import type { MonkRoutine } from "./monk-routine"
import { MONK_TIRED_AT, type MonkNeeds } from "./monk-work"
import { buildingAt, settlementEvangelism } from "./settlement"

export const MONK_EVANGELISM = 0.05
export interface PreachingTask { tile: TilePos; heading: number; map: GameMap }
export type EvangelizingMonk = MonkRoutine & MonkNeeds & { preachingTask?: PreachingTask }

/** The scene publishes live arrivals; an order alone never attracts travelers. */
export const preachingRegistry: { current: { road: GameMap["road"]; monks: EvangelizingMonk[] } | null } = { current: null }

/** Crosses and roadside preaching each offer an independent second chance. */
export function roadsideEvangelism(map: GameMap): number {
  const live = preachingRegistry.current
  const preaching = live?.road === map.road && live?.monks.some(m => m.activity === "preaching" && m.preachingTask?.map === map)
  const cross = settlementEvangelism(map)
  return preaching ? 1 - (1 - cross) * (1 - MONK_EVANGELISM) : cross
}

/** Clear shoulders near the junction, never on the road or the relic branch. */
export function preachingSpots(map: GameMap): TilePos[] {
  if (!map.site || !map.road || map.site.branch.length < 2) return []
  const junction = map.road[map.site.junction]
  if (!junction) return []
  const paths = new Set([...map.road, ...map.site.branch].map(p => `${p.x},${p.z}`))
  const spots = new Map<string, TilePos>()
  for (const road of map.road.slice(Math.max(0, map.site.junction - 2), map.site.junction + 3)) {
    for (const [dx, dz] of ROUTE_DIRS) {
      const tile = { x: road.x + dx, z: road.z + dz }, key = `${tile.x},${tile.z}`
      const terrain = tileAt(map, tile.x, tile.z)
      if (!terrain || !["grass", "dirt", "sand", "clearing", "hills"].includes(terrain) || paths.has(key) || buildingAt(map, tile.x, tile.z)) continue
      spots.set(key, tile)
    }
  }
  return [...spots.values()].sort((a, b) => Math.hypot(a.x - junction.x, a.z - junction.z) - Math.hypot(b.x - junction.x, b.z - junction.z))
}

export function stopEvangelizing(s: EvangelizingMonk): void {
  s.preachingTask = undefined
  s.route = []
  s.pause = 0
  s.destination = "home"
  s.activity = "walking"
}

/** Explicit preaching interrupts ordinary work, then releases the monk when recalled or tired. */
export function stepMonkEvangelism(s: EvangelizingMonk, map: GameMap, requested: boolean, speed: number, dt: number,
  occupied: readonly TilePos[] = []): boolean {
  if (dt <= 0) return !!s.preachingTask
  if (!requested || s.stamina <= MONK_TIRED_AT) {
    if (s.preachingTask) stopEvangelizing(s)
    return false
  }
  if (!s.preachingTask || s.preachingTask.map !== map) {
    let assigned = false
    for (const tile of preachingSpots(map)) {
      if (occupied.some(p => p.x === tile.x && p.z === tile.z)) continue
      const route = workerRoute(map, s, tile)
      if (!route) continue
      const road = map.road!.reduce((best, p) => Math.hypot(p.x - tile.x, p.z - tile.z) < Math.hypot(best.x - tile.x, best.z - tile.z) ? p : best)
      s.buildingTask = undefined
      s.route = route
      s.pause = 0
      s.preachingTask = { tile, heading: Math.atan2(road.x - tile.x, road.z - tile.z), map }
      s.activity = "toEvangelize"
      assigned = true
      break
    }
    if (!assigned) { stopEvangelizing(s); return false }
  }
  s.stamina = Math.max(0, s.stamina - dt * 0.25)
  s.activity = walkWorker(s, s.route, speed, dt) ? "preaching" : "toEvangelize"
  return true
}
