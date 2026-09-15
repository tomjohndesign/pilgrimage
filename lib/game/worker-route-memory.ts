import { buildingSpatialQuery } from "./building-spatial"
import { MinHeap, ROUTE_DIRS } from "./map/route"
import { buildingStepAllowed, containsTile } from "./building-navigation"
import { surfaceHeight } from "./map/bridges"
import { elevationStep } from "./map/elevation"
import { TERRAIN } from "./map/terrain"
import { tileAt, worldToTileX, worldToTileZ, tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./map/types"
import type { WanderSpot } from "./monk-wander"
import { shortcutCost } from "./walking-shortcuts"

const REFRESH_SECONDS = 30
const CAPACITY = 16384
interface Memory {
  width: number; depth: number; routes: Map<number, { at: number; points: WanderSpot[] }>
  hits: number; planned: number; invalidated: number
  fields: Map<string, DestinationField>; fieldBuilds: number; fieldHits: number
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
    destinationFields: memory?.fields.size ?? 0, fieldBuilds: memory?.fieldBuilds ?? 0, fieldHits: memory?.fieldHits ?? 0,
    destinationCells: [...(memory?.fields.values() ?? [])].reduce((sum, f) => sum + f.distance.size, 0),
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
    memory = { width: map.width, depth: map.depth, routes: new Map(), hits: 0, planned: 0, invalidated: 0, fields: new Map(), fieldBuilds: 0, fieldHits: 0 }
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


export interface DestinationField {
  goal: TilePos; budget: number; distance: Map<number, number>; next: Map<number, number>
}
interface NavigationVersion {
  buildings: string; tiles: GameMap["tiles"]; elevation: GameMap["elevation"]
  ground: number; width: number; depth: number; site: string; crossroads: GameMap["crossroads"]
}
const versions = new WeakMap<GameMap, NavigationVersion>()
const destinationScopes = new WeakMap<GameMap, number>()

/** Geometry only: construction completion changes clearance, serving a visitor does not.
 * Editors replacing terrain/elevation or calling markGroundChanged invalidate immediately. */
export function workerNavigationVersion(map: GameMap): object {
  const buildings = JSON.stringify(map.buildings.map(b => [b.id, b.buildType, b.x, b.z, b.w, b.d,
    b.rotation, b.layoutSeed, b.hearthZ, b.supportId, b.churchId, b.floorHeight,
    !b.construction || b.construction.work >= b.construction.required]))
  const site = JSON.stringify(map.site), old = versions.get(map), ground = map.footpaths?.ground ?? 0
  if (old && old.buildings === buildings && old.tiles === map.tiles && old.elevation === map.elevation &&
    old.ground === ground && old.width === map.width && old.depth === map.depth && old.site === site && old.crossroads === map.crossroads) return old
  const version = { buildings, tiles: map.tiles, elevation: map.elevation, ground, width: map.width, depth: map.depth, site, crossroads: map.crossroads }
  versions.set(map, version)
  const memory = memories.get(map)
  if (memory) { memory.fields.clear(); memory.routes.clear() }
  corridors.delete(map)
  return version
}

/** Share bounded reverse Dijkstra searches in the worker cache. A tile is one unit of actual
 * grid travel; terrain, cliffs and directed doorway rules define legal edges.
 * Each predecessor is tested in the direction the NPC will walk. */
export function workerDestinationField(map: GameMap, goal: TilePos, budget: number): DestinationField {
  workerNavigationVersion(map)
  let memory = memories.get(map)
  if (!memory) {
    memory = { width: map.width, depth: map.depth, routes: new Map(), hits: 0, planned: 0, invalidated: 0,
      fields: new Map(), fieldBuilds: 0, fieldHits: 0 }
    memories.set(map, memory)
  }
  const key = `${goal.x},${goal.z}:${budget}`, existing = memory.fields.get(key)
  if (existing) { memory.fieldHits++; memory.fields.delete(key); memory.fields.set(key, existing); return existing }
  const field: DestinationField = { goal: { ...goal }, budget, distance: new Map(), next: new Map() }
  const end = goal.z * map.width + goal.x
  if (Number.isInteger(goal.x) && Number.isInteger(goal.z) && tileAt(map, goal.x, goal.z) && TERRAIN[map.tiles[end]].passable) {
    const queue = new MinHeap(), closed = new Set<number>(), nearby = buildingSpatialQuery(map.buildings)
    const church = map.buildings.find(b => b.id === map.site?.hovelId)
    const interiorDirections = [...ROUTE_DIRS, [1, 1], [1, -1], [-1, 1], [-1, -1]]
    field.distance.set(end, 0); field.next.set(end, -1); queue.push(end, 0)
    while (queue.size) {
      const cell = queue.pop()
      if (closed.has(cell)) continue
      closed.add(cell)
      const to = { x: cell % map.width, z: Math.floor(cell / map.width) }
      // Match the shrine's diagonal interior connections, with their real length.
      const directions = church && containsTile(church, to) ? interiorDirections : ROUTE_DIRS
      for (const [dx, dz] of directions) {
        const from = { x: to.x + dx, z: to.z + dz }, terrain = tileAt(map, from.x, from.z)
        const index = from.z * map.width + from.x
        const distance = field.distance.get(cell)! + Math.hypot(dx, dz)
        if (distance > budget || !terrain || !TERRAIN[terrain].passable || closed.has(index) || distance >= (field.distance.get(index) ?? Infinity)) continue
        if (dx && dz && (!church || !containsTile(church, from))) continue
        const a = nearby(from), b = nearby(to)
        if (!buildingStepAllowed(map, a, from, to, true) || (a !== b && !buildingStepAllowed(map, b, from, to, true))) continue
        if (terrain !== "bridge" && map.tiles[cell] !== "bridge" && !Number.isFinite(elevationStep(map.elevation, index, cell))) continue
        field.distance.set(index, distance); field.next.set(index, cell); queue.push(index, distance)
      }
    }
  }
  memory.fieldBuilds++; memory.fields.set(key, field)
  // Sparse fields grow with the travel budget, never the world's full area.
  let cells = [...memory.fields.values()].reduce((sum, f) => sum + f.distance.size, 0)
  while (memory.fields.size > 64 || cells > 262144) {
    const first = memory.fields.keys().next().value!
    cells -= memory.fields.get(first)!.distance.size; memory.fields.delete(first)
  }
  return field
}

export function withDestinationRoutes<T>(map: GameMap, budget: number, run: () => T): T {
  const previous = destinationScopes.get(map)
  destinationScopes.set(map, budget)
  try { return run() }
  finally { if (previous === undefined) destinationScopes.delete(map); else destinationScopes.set(map, previous) }
}

/** Undefined leaves ordinary wear-aware worker routes alone. Service searches
 * use the same reverse tree for cost discovery and waypoint reconstruction. */
export function sharedDestinationRoute(map: GameMap, start: TilePos, goal: TilePos): TilePos[] | null | undefined {
  const budget = destinationScopes.get(map)
  if (budget === undefined) return undefined
  if (![start.x, start.z, goal.x, goal.z].every(Number.isInteger) || !tileAt(map, start.x, start.z)) return null
  const field = workerDestinationField(map, goal, budget)
  let cell = start.z * map.width + start.x
  if (!field.distance.has(cell)) return null
  const route: TilePos[] = []
  while (cell !== -1) {
    route.push({ x: cell % map.width, z: Math.floor(cell / map.width) })
    cell = field.next.get(cell)!
  }
  return route
}

export function destinationWorldRoute(map: GameMap, start: TilePos, goal: TilePos): WanderSpot[] | null | undefined {
  const route = sharedDestinationRoute(map, start, goal)
  if (!route) return route
  return route.map(p => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z), y: surfaceHeight(map, p.x, p.z) }))
}


/** Debug cold-cache comparison and explicit notification after in-place map edits. */
export function rebuildWorkerNavigation(map: GameMap): void {
  versions.delete(map)
  workerNavigationVersion(map)
}
