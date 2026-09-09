import { footpathRouteCost } from "./footpaths"
import { walkingRouteQueries } from "./walking-route-queries"
import { buildingSpatialQuery } from "./building-spatial"
import { buildingStepAllowed } from "./building-navigation"
import { elevationStep } from "./map/elevation"
import { MinHeap, ROUTE_DIRS } from "./map/route"
import { isWoods, TERRAIN } from "./map/terrain"
import { tileAt, type BuildingDef, type GameMap, type TilePos } from "./map/types"

// Searches are synchronous. Generation stamps reuse the grid without clearing
// it, or allocating map/set entries for every tile in a failed search.
const workspaces = new WeakMap<GameMap, {
  generation: number; seen: Uint32Array; closed: Uint32Array
  parents: Int32Array; costs: Float64Array
}>()
const shortestRoutes = new WeakMap<GameMap, Map<number, Int32Array>>()

/** A nearby destination may sit in a disconnected pocket. After A* has
 * explored 256 tiles, inspect up to 4096 predecessors of the goal. Exhausting
 * them proves it unreachable; reaching the forward search (or the bound)
 * leaves A* to choose the original deterministic, wear-weighted route. */
function isolatedGoal(map: GameMap, buildings: readonly BuildingDef[], origin: number, end: number,
  allowed: (from: TilePos, to: TilePos, seat?: string) => boolean,
  seen: Uint32Array, generation: number, logging: boolean, enterShrine: boolean, seat?: string): boolean {
  const pending = [end], visited = new Set(pending)
  for (let head = 0; head < pending.length; head++) {
    const current = pending[head]
    if (seen[current] === generation) return false
    const p = { x: current % map.width, z: Math.floor(current / map.width) }
    const terrain = map.tiles[current]
    if (!(TERRAIN[terrain].passable || (logging && isWoods(terrain)))) continue
    for (const [dx, dz] of ROUTE_DIRS) {
      const next = { x: p.x + dx, z: p.z + dz }, ground = tileAt(map, next.x, next.z)
      if (!ground) continue
      const index = next.z * map.width + next.x
      if (visited.has(index)) continue
      if (index !== origin && !(TERRAIN[ground].passable || (logging && isWoods(ground)))) continue
      if (!allowed(next, p, index === origin || current === end ? seat : undefined)) continue
      if (ground !== "bridge" && terrain !== "bridge" && !Number.isFinite(elevationStep(map.elevation, index, current))) continue
      if (seen[index] === generation) return false
      visited.add(index); pending.push(index)
      if (pending.length >= 4096) return false
    }
  }
  return true
}

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
  const routeCost = walkingRouteQueries(map)?.edgeCost ?? footpathRouteCost
  const nearby = buildingSpatialQuery(buildings)
  const allowed = (from: TilePos, to: TilePos, seat?: string) => {
    const a = nearby(from), b = nearby(to)
    return buildingStepAllowed(map, a, from, to, enterShrine, seat)
      && (a === b || buildingStepAllowed(map, b, from, to, enterShrine, seat))
  }
  const key = (p: TilePos) => p.z * map.width + p.x
  const origin = key(start)
  const end = key(goal)
  const size = map.width * map.depth
  const routeKey = origin * size + end
  let shortest = shortestRoutes.get(map)
  const cached = shortest?.get(routeKey)
  if (cached && cached[0] === origin && cached[cached.length - 1] === end && cached.length === Math.abs(start.x - goal.x) + Math.abs(start.z - goal.z) + 1) {
    // A Manhattan-length path with unit-cost edges reaches the absolute lower
    // bound of this four-connected graph. Revalidate its live clearance and
    // wear in O(path length); no competing route can improve its cost, even
    // after traffic wears new shortcuts elsewhere in the settlement.
    let valid = true, from = start
    for (let i = 1; i < cached.length; i++) {
      const index = cached[i], next = { x: index % map.width, z: Math.floor(index / map.width) }
      const terrain = tileAt(map, next.x, next.z)
      if (Math.abs(next.x - from.x) + Math.abs(next.z - from.z) !== 1 || !terrain || !(TERRAIN[terrain].passable || (logging && isWoods(terrain))) ||
        !allowed(from, next, i === 1 || i === cached.length - 1 ? seat : undefined) ||
        (map.tiles[cached[i - 1]] !== "bridge" && terrain !== "bridge" && !Number.isFinite(elevationStep(map.elevation, cached[i - 1], index))) ||
        routeCost(map, from, next) !== 1) { valid = false; break }
      from = next
    }
    if (valid) {
      shortest!.delete(routeKey); shortest!.set(routeKey, cached)
      return Array.from(cached, index => ({ x: index % map.width, z: Math.floor(index / map.width) }))
    }
    shortest!.delete(routeKey)
  }
  let workspace = workspaces.get(map)
  if (!workspace || workspace.seen.length !== size) {
    workspace = { generation: 0, seen: new Uint32Array(size), closed: new Uint32Array(size), parents: new Int32Array(size), costs: new Float64Array(size) }
    workspaces.set(map, workspace)
  }
  if (++workspace.generation >= 0xffffffff) {
    workspace.seen.fill(0); workspace.closed.fill(0); workspace.generation = 1
  }
  const { generation, seen, parents, costs, closed } = workspace
  seen[origin] = generation; parents[origin] = -1; costs[origin] = 0
  const queue = new MinHeap()
  const heuristic = (p: TilePos) => Math.abs(p.x - goal.x) + Math.abs(p.z - goal.z)
  queue.push(origin, heuristic(start))
  let expanded = 0
  while (queue.size) {
    const current = queue.pop()
    if (closed[current] === generation) continue
    closed[current] = generation
    const p = { x: current % map.width, z: Math.floor(current / map.width) }
    if (current === end) {
      const result: TilePos[] = []
      for (let i = end; i !== -1; i = parents[i]) {
        result.push({ x: i % map.width, z: Math.floor(i / map.width) })
      }
      result.reverse()
      if (costs[end] === heuristic(start)) {
        if (!shortest) { shortest = new Map(); shortestRoutes.set(map, shortest) }
        if (shortest.size >= 4096) shortest.delete(shortest.keys().next().value!)
        shortest.set(routeKey, Int32Array.from(result, key))
      }
      return result
    }
    if (++expanded === 256 && isolatedGoal(map, buildings, origin, end, allowed, seen, generation, logging, enterShrine, seat)) return null
    for (const [dx, dz] of ROUTE_DIRS) {
      const next = { x: p.x + dx, z: p.z + dz }
      const terrain = tileAt(map, next.x, next.z)
      if (!terrain || !(TERRAIN[terrain].passable || (logging && isWoods(terrain)))) continue
      const seatAccess = current === origin || (next.x === goal.x && next.z === goal.z) ? seat : undefined
      if (!allowed(p, next, seatAccess)) continue
      const index = key(next)
      if (map.tiles[current] !== "bridge" && terrain !== "bridge" && !Number.isFinite(elevationStep(map.elevation, current, index))) continue
      const cost = costs[current] + routeCost(map, p, next)
      if (seen[index] === generation && cost >= costs[index]) continue
      seen[index] = generation; costs[index] = cost
      parents[index] = current
      queue.push(index, cost + heuristic(next))
    }
  }
  return null
}

/** The clear road tile nearest the shrine's junction; walkers turn off there. */
export function shrineRoadHead(map: GameMap, buildings: readonly BuildingDef[] = map.buildings): TilePos | null {
  if (!map.site) return null
  const road = map.road
  const covered = (p: TilePos) => buildings.some(b => p.x >= b.x && p.x < b.x + b.w && p.z >= b.z && p.z < b.z + b.d)
  const original = map.site.branch[0]
  if (!road) return original && !covered(original) ? original : null
  for (let step = 0; step < road.length; step++) {
    for (const index of step ? [map.site!.junction - step, map.site!.junction + step] : [map.site!.junction]) {
      const tile = road[index]
      if (tile && !covered(tile)) return tile
    }
  }
  return null
}

/** The reachable approach from a visitor's departure tile, or the nearest clear road tile. */
export function shrineApproach(map: GameMap, from?: TilePos): TilePos[] {
  const start = from ?? shrineRoadHead(map)
  if (!map.site || !start) return []
  return settlementRoute(map, map.buildings, start, map.site.door) ?? []
}
