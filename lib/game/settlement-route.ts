import { buildingStepAllowed } from "./building-navigation"
import { elevationStep } from "./map/elevation"
import { MinHeap, ROUTE_DIRS } from "./map/route"
import { isWoods, TERRAIN, walkingRouteCost } from "./map/terrain"
import { tileAt, type BuildingDef, type GameMap, type TilePos } from "./map/types"

/** Prefer paths around water and footprints; woodcutters may enter the woods to work. */
export function settlementRoute(
  map: GameMap,
  buildings: readonly BuildingDef[],
  start: TilePos,
  goal: TilePos,
  logging = false,
  enterShrine = false,
  seat?: string,
): TilePos[] | null {
  if (!tileAt(map, start.x, start.z) || !tileAt(map, goal.x, goal.z)) return null
  const key = (p: TilePos) => p.z * map.width + p.x
  const origin = key(start)
  const end = key(goal)
  const parents = new Map<number, number>([[origin, -1]])
  const costs = new Map<number, number>([[origin, 0]])
  const closed = new Set<number>()
  const queue = new MinHeap()
  const heuristic = (p: TilePos) => Math.abs(p.x - goal.x) + Math.abs(p.z - goal.z)
  queue.push(origin, heuristic(start))
  while (queue.size) {
    const current = queue.pop()
    if (closed.has(current)) continue
    closed.add(current)
    const p = { x: current % map.width, z: Math.floor(current / map.width) }
    if (current === end) {
      const result: TilePos[] = []
      for (let i = end; i !== -1; i = parents.get(i)!) {
        result.push({ x: i % map.width, z: Math.floor(i / map.width) })
      }
      return result.reverse()
    }
    for (const [dx, dz] of ROUTE_DIRS) {
      const next = { x: p.x + dx, z: p.z + dz }
      const terrain = tileAt(map, next.x, next.z)
      if (!terrain || !(TERRAIN[terrain].passable || (logging && isWoods(terrain)))) continue
      const seatAccess = current === origin || (next.x === goal.x && next.z === goal.z) ? seat : undefined
      if (!buildingStepAllowed(map, buildings, p, next, enterShrine, seatAccess)) continue
      const index = key(next)
      if (map.tiles[current] !== "bridge" && terrain !== "bridge" && !Number.isFinite(elevationStep(map.elevation, current, index))) continue
      const cost = costs.get(current)! + walkingRouteCost(terrain)
      if (cost >= (costs.get(index) ?? Infinity)) continue
      costs.set(index, cost)
      parents.set(index, current)
      queue.push(index, cost + heuristic(next))
    }
  }
  return null
}
