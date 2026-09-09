import { buildingSpatialQuery } from "./building-spatial"
import { buildingStepAllowed } from "./building-navigation"
import { surfaceHeight } from "./map/bridges"
import { elevationStep } from "./map/elevation"
import { TERRAIN } from "./map/terrain"
import { tileAt, worldToTileX, worldToTileZ, type GameMap, type TilePos } from "./map/types"
import type { WanderSpot } from "./monk-wander"
import { shortcutCost } from "./walking-shortcuts"

const REFRESH_SECONDS = 30
const CAPACITY = 16384
interface Memory {
  width: number; depth: number; routes: Map<number, { at: number; points: WanderSpot[] }>
  hits: number; planned: number; invalidated: number
}
const memories = new WeakMap<GameMap, Memory>()
const clocks = new WeakMap<GameMap, number>()
const planningAge = new WeakMap<GameMap, { at: number }>()
const unitCost = () => 1
interface Corridors {
  width: number; depth: number; cells: number; hits: number; plans: number
  goals: Map<number, { at: number; next: Map<number, number> }>
}
const corridors = new WeakMap<GameMap, Corridors>()
const CORRIDOR_CELLS = 131072
const CORRIDOR_GOALS = 256
const GOAL_CELLS = 4096

/** Ordinary departures can share recently learned corridors. This scope only
 * supplies game time; every reused route still checks current obstacles. Wear
 * preferences refresh in game time, independent of rendering FPS/population. */
export function withWorkerRouteMemory<T>(map: GameMap, seconds: number, run: () => T): T {
  const previous = clocks.get(map)
  clocks.set(map, seconds)
  try { return run() }
  finally { if (previous === undefined) clocks.delete(map); else clocks.set(map, previous) }
}

export function workerRouteMemoryStats(map: GameMap) {
  const memory = memories.get(map), learned = corridors.get(map)
  return { routes: memory?.routes.size ?? 0, reused: memory?.hits ?? 0,
    planned: memory?.planned ?? 0, invalidated: memory?.invalidated ?? 0,
    corridorCells: learned?.cells ?? 0, corridorGoals: learned?.goals.size ?? 0,
    corridorReused: learned?.hits ?? 0, corridorPlanned: learned?.plans ?? 0 }
}

/** Learn destination trees from routes already found by A*, without expanding
 * an entire map per destination. New branches only attach unknown cells to an
 * existing tree, so sharing suffixes cannot introduce a routing cycle. */
export function rememberedWorkerCorridor(map: GameMap, start: TilePos, goal: TilePos,
  plan: () => TilePos[] | null): TilePos[] | null {
  const seconds = clocks.get(map), size = map.width * map.depth
  if (seconds === undefined || !Number.isFinite(seconds) || size > 512 * 512 ||
    !tileAt(map, start.x, start.z) || !tileAt(map, goal.x, goal.z) ||
    !Number.isInteger(start.x) || !Number.isInteger(start.z) || !Number.isInteger(goal.x) || !Number.isInteger(goal.z)) return plan()
  let memory = corridors.get(map)
  if (!memory || memory.width !== map.width || memory.depth !== map.depth) {
    memory = { width: map.width, depth: map.depth, cells: 0, hits: 0, plans: 0, goals: new Map() }
    corridors.set(map, memory)
  }
  const origin = start.z * map.width + start.x, end = goal.z * map.width + goal.x
  let field = memory.goals.get(end)
  const forget = (key: number) => {
    const old = memory!.goals.get(key)
    if (old) { memory!.cells -= old.next.size; memory!.goals.delete(key) }
  }
  if (field && (seconds < field.at || seconds - field.at >= REFRESH_SECONDS)) { forget(end); field = undefined }
  if (field?.next.has(origin)) {
    const points: TilePos[] = []
    let cell = origin
    while (cell !== -1 && points.length <= field.next.size) {
      points.push({ x: cell % map.width, z: Math.floor(cell / map.width) })
      cell = field.next.get(cell) ?? -1
    }
    if (points[points.length - 1]?.x === goal.x && points[points.length - 1]?.z === goal.z && clearGridRoute(map, points)) {
      const age = planningAge.get(map)
      if (age) age.at = Math.min(age.at, field.at)
      memory.hits++; memory.goals.delete(end); memory.goals.set(end, field)
      return points
    }
    // A new wall invalidates this learned destination immediately, not after
    // its preference refresh interval. A* handles the revised topology.
    forget(end); field = undefined
  }
  memory.plans++
  const route = plan()
  if (!route?.length || route.length > GOAL_CELLS) return route
  if (!field) { field = { at: seconds, next: new Map([[end, -1]]) }; memory.goals.set(end, field); memory.cells++ }
  for (let i = route.length - 2; i >= 0 && field.next.size < GOAL_CELLS; i--) {
    const here = route[i].z * map.width + route[i].x, next = route[i + 1].z * map.width + route[i + 1].x
    if (!field.next.has(here)) { field.next.set(here, next); memory.cells++ }
  }
  while (memory.cells > CORRIDOR_CELLS || memory.goals.size > CORRIDOR_GOALS) forget(memory.goals.keys().next().value!)
  return route
}

function clearGridRoute(map: GameMap, points: TilePos[]): boolean {
  const nearby = buildingSpatialQuery(map.buildings)
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1], to = points[i], terrain = tileAt(map, to.x, to.z), a = nearby(from), b = nearby(to)
    if (Math.abs(to.x - from.x) + Math.abs(to.z - from.z) !== 1 || !terrain || !TERRAIN[terrain].passable ||
      !buildingStepAllowed(map, a, from, to, true) || (a !== b && !buildingStepAllowed(map, b, from, to, true))) return false
    const before = from.z * map.width + from.x, after = to.z * map.width + to.x
    if (map.tiles[before] !== "bridge" && terrain !== "bridge" && !Number.isFinite(elevationStep(map.elevation, before, after))) return false
  }
  return true
}

/** Never share mutable waypoint arrays: walkWorker consumes each resident's
 * own route. Editor/direct callers retain immediate fresh planning. */
export function rememberedWorkerRoute(map: GameMap, start: TilePos, goal: TilePos,
  exploring: boolean, plan: () => WanderSpot[] | null): WanderSpot[] | null {
  const seconds = clocks.get(map)
  if (seconds === undefined || !Number.isFinite(seconds)) return plan()
  let memory = memories.get(map)
  if (!memory || memory.width !== map.width || memory.depth !== map.depth) {
    memory = { width: map.width, depth: map.depth, routes: new Map(), hits: 0, planned: 0, invalidated: 0 }
    memories.set(map, memory)
  }
  const size = map.width * map.depth
  const inside = (p: TilePos) => Number.isInteger(p.x) && Number.isInteger(p.z) && p.x >= 0 && p.z >= 0 && p.x < map.width && p.z < map.depth
  if (!inside(start) || !inside(goal) || size > 0x4000000) return plan()
  const key = ((start.z * map.width + start.x) * size + goal.z * map.width + goal.x) * 2 + Number(exploring)
  const cached = memory.routes.get(key)
  if (cached && seconds >= cached.at && seconds - cached.at < REFRESH_SECONDS) {
    if (clearRoute(map, cached.points)) {
      memory.hits++
      memory.routes.delete(key); memory.routes.set(key, cached)
      return cached.points.map(p => ({ x: p.x, z: p.z, y: surfaceHeight(map, worldToTileX(map, p.x), worldToTileZ(map, p.z)) }))
    }
    memory.invalidated++
  }
  memory.routes.delete(key)
  memory.planned++
  const previousAge = planningAge.get(map), age = { at: seconds }
  planningAge.set(map, age)
  let points: WanderSpot[] | null
  try { points = plan() }
  finally { if (previousAge) planningAge.set(map, previousAge); else planningAge.delete(map) }
  if (points?.length) {
    if (memory.routes.size >= CAPACITY) memory.routes.delete(memory.routes.keys().next().value!)
    memory.routes.set(key, { at: age.at, points: points.map(p => ({ ...p })) })
  }
  return points
}

function clearRoute(map: GameMap, points: WanderSpot[]): boolean {
  const nearby = buildingSpatialQuery(map.buildings)
  let from = { x: worldToTileX(map, points[0].x), z: worldToTileZ(map, points[0].z) }
  for (let i = 1; i < points.length; i++) {
    const point = points[i], to = { x: worldToTileX(map, point.x), z: worldToTileZ(map, point.z) }
    if (Math.abs(to.x - from.x) + Math.abs(to.z - from.z) === 1) {
      // Retained grid steps may enter a real doorway. Shortcut clearance is
      // deliberately stricter and must not replace the doorway rules here.
      const terrain = tileAt(map, to.x, to.z), a = nearby(from), b = nearby(to)
      if (!terrain || !TERRAIN[terrain].passable || !buildingStepAllowed(map, a, from, to, true) ||
        (a !== b && !buildingStepAllowed(map, b, from, to, true))) return false
      const before = from.z * map.width + from.x, after = to.z * map.width + to.x
      if (map.tiles[before] !== "bridge" && terrain !== "bridge" && !Number.isFinite(elevationStep(map.elevation, before, after))) return false
    } else if (!Number.isFinite(shortcutCost(map, points[i - 1], point, true, nearby, unitCost))) return false
    from = to
  }
  return true
}
