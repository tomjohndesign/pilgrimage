import { footpathRouteCost } from "./footpaths"
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
      return result.reverse()
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
      const cost = costs[current] + footpathRouteCost(map, p, next)
      if (seen[index] === generation && cost >= costs[index]) continue
      seen[index] = generation; costs[index] = cost
      parents[index] = current
      queue.push(index, cost + heuristic(next))
    }
  }
  return null
}

/**
 * The walk from the road to the shrine door. The track is ordinary ground —
 * a footprint may stand on it — so the approach is routed around whatever is
 * built there, falling back to the original branch when nothing is.
 */
export function shrineApproach(map: GameMap): TilePos[] {
  const site = map.site
  if (!site) return []
  return settlementRoute(map, map.buildings, site.branch[0], site.door) ?? site.branch
}
