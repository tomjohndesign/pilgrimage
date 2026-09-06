import { MALLET_CONTACT_REACH } from "./base-person/building"
import { BASE_CHARACTER_SCALE, PERSON_SPRITE_SCALE } from "./base-person/gait"
import { BASE_PERSON } from "./base-person/pose"
import { surfaceHeight } from "./map/bridges"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type BuildingDef, type GameMap, type TilePos } from "./map/types"
import { settlementRoute } from "./settlement-route"
import type { WanderSpot } from "./monk-wander"

export interface Construction { work: number; required: number; cost?: { gold: number; wood: number } }
/** Worker-seconds: small sites finish quickly; doubling the area quadruples the work. */
export function constructionWork(w: number, d: number): number { return Math.max(12, 6 * (w * d) ** 2) }
export function isComplete(building: BuildingDef): boolean {
  return !building.construction || building.construction.work >= building.construction.required
}
export function constructionStage(building: BuildingDef): number {
  return isComplete(building) ? 3 : Math.min(2, Math.floor(building.construction!.work / building.construction!.required * 3))
}
export function isMonkShelter(b: BuildingDef): boolean { return b.buildType === "shelter" || b.buildType === "monk-shelter" }
export function buildingEntrance(b: BuildingDef): TilePos { return { x: b.x, z: b.z + b.d } }

export interface BuildingTask {
  buildingId: string
  purpose: "build" | "rest"
  route: WanderSpot[]
  destination: WanderSpot
  /** Reroute when placement changes the obstacles. */
  buildings: readonly BuildingDef[]
}
export interface Worker extends WanderSpot { buildingTask?: BuildingTask; workSlot?: number; workScale?: number }
export function workerRoute(map: GameMap, actor: WanderSpot, goal: TilePos): WanderSpot[] | null {
  const start = { x: worldToTileX(map, actor.x), z: worldToTileZ(map, actor.z) }
  // A footprint may be placed beneath an idle resident. Let them leave that
  // new site before treating it as an obstacle on subsequent trips.
  const obstacles = map.buildings.filter(b => isComplete(b) || !(start.x >= b.x && start.x < b.x + b.w && start.z >= b.z && start.z < b.z + b.d))
  const route = settlementRoute(map, obstacles, start, goal, false, true)
  return route?.map(p => ({ x: tileToWorldX(map, p.x), y: surfaceHeight(map, p.x, p.z), z: tileToWorldZ(map, p.z) })) ?? null
}

/** The mallet's forward reach, converted through the actual sprite's bake camera. */
export function constructionStandOff(characterScale = BASE_CHARACTER_SCALE): number {
  return MALLET_CONTACT_REACH * PERSON_SPRITE_SCALE * characterScale / BASE_PERSON.camera.viewSize
}

/** Only reachable jobs qualify; several free residents may cooperate on one site. */
export function assignBuildingTask(actor: Worker, map: GameMap, purpose: BuildingTask["purpose"], focusedBuildingId?: string): boolean {
  const candidates = map.buildings.filter(b => purpose === "build" ? !isComplete(b) : isMonkShelter(b) && isComplete(b))
    .filter(b => !focusedBuildingId || b.id === focusedBuildingId)
    .sort((a, b) => Math.hypot(tileToWorldX(map, a.x) - actor.x, tileToWorldZ(map, a.z) - actor.z) -
      Math.hypot(tileToWorldX(map, b.x) - actor.x, tileToWorldZ(map, b.z) - actor.z))
  for (const building of candidates) {
    const entrance = buildingEntrance(building)
    const destination = { x: tileToWorldX(map, entrance.x), y: surfaceHeight(map, entrance.x, entrance.z), z: tileToWorldZ(map, entrance.z) }
    if (purpose === "rest") {
      const beds = Math.max(1, Math.floor((building.w - 0.3) / 0.55))
      destination.x += (building.w - 1) / 2 + ((actor.workSlot ?? 0) % beds - (beds - 1) / 2) * 0.5
      destination.z = tileToWorldZ(map, building.z) + (building.d - 1) / 2 - building.d * 0.08
    } else {
      // The front wall sits just inside the footprint. End the walk at mallet
      // reach, not at the centre of the next tile, and spread helpers along it.
      destination.z -= 0.5 + 0.055 - constructionStandOff(actor.workScale)
    }
    for (let attempt = 0; attempt < (purpose === "build" ? 4 : 1); attempt++) {
      if (purpose === "build") destination.x = tileToWorldX(map, building.x) + (building.w - 1) / 2 +
        (((actor.workSlot ?? 0) + attempt) % 4 - 1.5) * Math.min(0.45, (building.w - 0.5) / 3)
      // Approach the front before the short final step to the wall. Even a
      // large character must not cut diagonally through the footprint.
      const frontage = { x: worldToTileX(map, destination.x), z: entrance.z }
      const route = purpose === "build" ? workerRoute(map, actor, frontage) : routeToDestination(map, actor, destination)
      if (!route) continue
      if (purpose === "build") route.push({ ...destination })
      actor.buildingTask = { buildingId: building.id, purpose, route, destination: { ...destination }, buildings: map.buildings }
      return true
    }
  }
  return false
}

function routeToDestination(map: GameMap, actor: WanderSpot, destination: WanderSpot): WanderSpot[] | null {
  const route = workerRoute(map, actor, { x: worldToTileX(map, destination.x), z: worldToTileZ(map, destination.z) })
  if (route) route.push(destination)
  return route
}

export function walkWorker(actor: WanderSpot, route: WanderSpot[], speed: number, dt: number): boolean {
  let distance = Math.max(0, speed * dt)
  while (route.length) {
    const goal = route[0], length = Math.hypot(goal.x - actor.x, goal.z - actor.z)
    if (length > distance) {
      const t = distance / length
      actor.x += (goal.x - actor.x) * t; actor.y += (goal.y - actor.y) * t; actor.z += (goal.z - actor.z) * t
      return false
    }
    Object.assign(actor, goal)
    distance -= length
    route.shift()
  }
  return true
}

/** Progress is paid in worker-seconds, only while standing at the site's entrance. */
export function stepBuildingTask(actor: Worker, map: GameMap, speed: number, dt: number): "walking" | "building" | "sleeping" | null {
  const task = actor.buildingTask
  if (!task || dt <= 0) return null
  const building = map.buildings.find(b => b.id === task.buildingId)
  if (!building || (task.purpose === "build" && isComplete(building)) || (task.purpose === "rest" && !isComplete(building))) {
    actor.buildingTask = undefined
    return null
  }
  const targetZ = task.purpose === "build" ? tileToWorldZ(map, building.z + building.d) - 0.555 + constructionStandOff(actor.workScale) : task.destination.z
  const resized = Math.abs(task.destination.z - targetZ) > 0.001
  task.destination.z = targetZ
  // Keep the current job and route when another site appears. Only an obstacle
  // on the remaining route or work position should interrupt a focused worker.
  const newObstacles = task.buildings === map.buildings ? [] : map.buildings.filter(b => b.id !== task.buildingId &&
    !task.buildings.some(previous => previous.id === b.id && previous.x === b.x && previous.z === b.z && previous.w === b.w && previous.d === b.d))
  const routeBlocked = newObstacles.length > 0 && [...task.route, task.destination].some(point => {
    const x = worldToTileX(map, point.x), z = worldToTileZ(map, point.z)
    return newObstacles.some(b => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d)
  })
  task.buildings = map.buildings
  if (resized || routeBlocked || (!task.route.length && Math.hypot(actor.x - task.destination.x, actor.z - task.destination.z) > 0.001)) {
    const route = task.purpose === "build" ? workerRoute(map, actor, { x: worldToTileX(map, task.destination.x), z: building.z + building.d }) : routeToDestination(map, actor, task.destination)
    if (route && task.purpose === "build") route.push(task.destination)
    if (!route) {
      // Try another work position on the same job before giving up on it.
      if (task.purpose === "build" && assignBuildingTask(actor, map, "build", task.buildingId)) return "walking"
      actor.buildingTask = undefined
      return null
    }
    task.route = route; task.buildings = map.buildings
  }
  if (task.route.length) {
    walkWorker(actor, task.route, speed, dt)
    return "walking"
  }
  if (task.purpose === "rest") return "sleeping"
  const construction = building.construction!
  construction.work = Math.min(construction.required, construction.work + dt)
  return "building"
}
