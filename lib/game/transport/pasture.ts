import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap, type TilePos } from "../map/types"
import { buildingAt } from "../settlement"

import { pastureSegmentClear, type StallObstacle } from "./stall"

export interface PastureAnimal {
  obstacles: StallObstacle[]; clearance: number
  x: number; z: number; heading: number; moving: boolean; distance: number; rest: number; visits: number
  home: { x: number; z: number }; route: Array<{ x: number; z: number }>; returning: boolean; ready: boolean
}
const key = (t: TilePos) => `${t.x},${t.z}`
function safe(map: GameMap, t: TilePos) {
  const terrain = tileAt(map, t.x, t.z)
  return (terrain === "grass" || terrain === "clearing" || terrain === "dirt") && !buildingAt(map, t.x, t.z)
}
function buildingObstacles(map: GameMap): StallObstacle[] {
  return map.buildings.map(b => ({ x: tileToWorldX(map, b.x + (b.w - 1) / 2), z: tileToWorldZ(map, b.z + (b.d - 1) / 2), heading: 0, halfWidth: b.w / 2, halfLength: b.d / 2 }))
}
/** A bounded four-neighbour flood fill. Roads, tracks, woods and water are walls;
 * even two grass destinations cannot be joined by a shortcut across a road.
 */
export function pastureRoutes(map: GameMap, home: { x: number; z: number }, from = home, obstacles: readonly StallObstacle[] = [], clearance = 0) {
  const blocked = [...obstacles, ...buildingObstacles(map)]
  const origin = { x: worldToTileX(map, home.x), z: worldToTileZ(map, home.z) }
  const start = { x: worldToTileX(map, from.x), z: worldToTileZ(map, from.z) }
  if (!safe(map, start)) return []
  const position = (t: TilePos) => key(t) === key(origin) ? home : { x: tileToWorldX(map, t.x), z: tileToWorldZ(map, t.z) }
  const queue = [{ tile: start, path: [] as TilePos[] }], seen = new Set([key(start)])
  const routes: TilePos[][] = []
  for (let i = 0; i < queue.length; i++) {
    const { tile, path } = queue[i]
    const terrain = tileAt(map, tile.x, tile.z)
    if (path.length && (terrain === "grass" || terrain === "clearing" || key(tile) === key(origin))) routes.push(path)
    for (const [dx, dz] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = { x: tile.x + dx, z: tile.z + dz }
      if (seen.has(key(next)) || Math.abs(next.x - origin.x) + Math.abs(next.z - origin.z) > 2 || !safe(map, next)) continue
      if (!pastureSegmentClear(path.length ? position(tile) : from, position(next), blocked, clearance)) continue
      seen.add(key(next)); queue.push({ tile: next, path: [...path, next] })
    }
  }
  return routes
}
export function createPasture(home: { x: number; z: number }, obstacles: StallObstacle[] = [], clearance = 0): PastureAnimal {
  return { obstacles, clearance, x: home.x, z: home.z, home: { x: home.x, z: home.z }, heading: 0, moving: false, distance: 0, rest: 0.6, visits: 0, route: [], returning: false, ready: false }
}
export function stepPasture(map: GameMap, animal: PastureAnimal, dt: number, speed: number, recall: boolean) {
  animal.distance = 0; animal.moving = false
  const blocked = [...animal.obstacles, ...buildingObstacles(map)]
  const hx = worldToTileX(map, animal.home.x), hz = worldToTileZ(map, animal.home.z)
  const centre = (tile: TilePos) => tile.x === hx && tile.z === hz ? animal.home : ({ x: tileToWorldX(map, tile.x), z: tileToWorldZ(map, tile.z) })
  if (recall && !animal.returning) {
    animal.returning = true; animal.rest = 0
    const routes = pastureRoutes(map, animal.home, animal, animal.obstacles, animal.clearance)
    // Replan from the actual position; every edge must clear the whole animal.
    const route = routes.find(path => path.at(-1)!.x === hx && path.at(-1)!.z === hz)
    if (!route && (worldToTileX(map, animal.x) !== hx || worldToTileZ(map, animal.z) !== hz)) {
      animal.returning = false; return
    }
    animal.route = [...(route ?? []).map(centre), animal.home]
  }
  if (!animal.route.length && !recall) {
    animal.rest -= dt
    if (animal.rest > 0) return
    const routes = pastureRoutes(map, animal.home, animal, animal.obstacles, animal.clearance)
    if (!routes.length) { animal.rest = 4; return }
    animal.route = routes[(animal.visits++ * 3) % routes.length].map(centre)
  }
  let remaining = speed * dt
  while (animal.route.length && remaining > 0) {
    const target = animal.route[0], dx = target.x - animal.x, dz = target.z - animal.z, distance = Math.hypot(dx, dz)
    if (distance < 1e-6) { animal.x = target.x; animal.z = target.z; animal.route.shift(); continue }
    if (!pastureSegmentClear(animal, target, blocked, animal.clearance)) {
      animal.route = []; animal.returning = false; animal.ready = false; return
    }
    const step = Math.min(distance, remaining)
    animal.heading = Math.atan2(dx, dz); animal.x += dx / distance * step; animal.z += dz / distance * step
    animal.distance += step; remaining -= step
    if (step === distance) { animal.x = target.x; animal.z = target.z; animal.route.shift() }
  }
  animal.moving = animal.distance > 1e-6
  if (!animal.route.length) { animal.rest = 3 + animal.visits % 4; animal.ready = recall }
}
