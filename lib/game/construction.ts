import { buildingEntry, buildingYaw, rotatedFootprint, rotateBuildingPoint } from "./building-rotation"
import { MALLET_CONTACT_REACH } from "./base-person/building"
import { BASE_CHARACTER_SCALE, PERSON_SPRITE_SCALE } from "./base-person/gait"
import { BASE_PERSON } from "./base-person/pose"
import { surfaceHeight } from "./map/bridges"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type BuildingDef, type GameMap, type TilePos } from "./map/types"
import { settlementRoute } from "./settlement-route"
import type { WanderSpot } from "./monk-wander"
import { buildingSupports } from "./character-support"

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
export function buildingEntrance(b: BuildingDef): TilePos { return buildingEntry(b) }

export interface BuildingTask {
  buildingId: string
  purpose: "build" | "rest"
  slot: number
  heading: number
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

/** Place work and rest positions in the same rotated local space as the building. */
function taskPosition(map: GameMap, building: BuildingDef, purpose: BuildingTask["purpose"], slot: number, scale?: number) {
  const local = rotatedFootprint(building, building.rotation)
  const beds = purpose === "rest" ? buildingSupports(building).filter(s => s.clips.includes("sleeping")) : []
  const bed = beds[slot % beds.length]
  if (purpose === "rest" && !bed) return null
  const x = purpose === "build" ? (slot % 4 - 1.5) * Math.min(0.45, (local.w - 0.5) / 3)
    : bed.anchor.x
  const z = purpose === "build" ? local.d / 2 - 0.055 + constructionStandOff(scale) : bed.anchor.z
  const offset = rotateBuildingPoint(x, z, building.rotation)
  const approach = rotateBuildingPoint(x, (local.d + 1) / 2, building.rotation)
  const cx = tileToWorldX(map, building.x) + (building.w - 1) / 2
  const cz = tileToWorldZ(map, building.z) + (building.d - 1) / 2
  const frontage = { x: worldToTileX(map, cx + approach.x), z: worldToTileZ(map, cz + approach.z) }
  return { destination: { x: cx + offset.x, z: cz + offset.z, y: surfaceHeight(map, frontage.x, frontage.z) }, frontage,
    heading: (bed?.heading ?? Math.PI) + buildingYaw(building.rotation) }
}

/** Only reachable jobs qualify; several free residents may cooperate on one site. */
export function assignBuildingTask(actor: Worker, map: GameMap, purpose: BuildingTask["purpose"], focusedBuildingId?: string): boolean {
  const candidates = map.buildings.filter(b => purpose === "build" ? !isComplete(b) : isMonkShelter(b) && isComplete(b))
    .filter(b => !focusedBuildingId || b.id === focusedBuildingId)
    .sort((a, b) => Math.hypot(tileToWorldX(map, a.x) - actor.x, tileToWorldZ(map, a.z) - actor.z) -
      Math.hypot(tileToWorldX(map, b.x) - actor.x, tileToWorldZ(map, b.z) - actor.z))
  for (const building of candidates) {
    for (let attempt = 0; attempt < (purpose === "build" ? 4 : 1); attempt++) {
      const slot = (actor.workSlot ?? 0) + attempt
      const target = taskPosition(map, building, purpose, slot, actor.workScale)
      if (!target) continue
      const { destination, frontage, heading } = target
      const route = purpose === "build" ? workerRoute(map, actor, frontage) : routeToDestination(map, actor, destination)
      if (!route) continue
      if (purpose === "build") route.push(destination)
      actor.buildingTask = { buildingId: building.id, purpose, slot, heading, route,
        destination: { ...destination }, buildings: map.buildings }
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
  const target = taskPosition(map, building, task.purpose, task.slot, actor.workScale)
  if (!target) { actor.buildingTask = undefined; return null }
  const resized = Math.hypot(task.destination.x - target.destination.x, task.destination.z - target.destination.z) > 0.001
  task.destination = target.destination
  task.heading = target.heading
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
    const route = task.purpose === "build" ? workerRoute(map, actor, target.frontage) : routeToDestination(map, actor, task.destination)
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
