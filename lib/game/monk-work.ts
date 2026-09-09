import { assignBuildingTask, stepBuildingTask, walkWorker, workerRoute, type BuildingTask } from "./construction"
import { worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import type { MonkRoutine } from "./monk-routine"
import type { monkWander, WanderSpot } from "./monk-wander"
import { buildingAt } from "./settlement"

export const MONK_TIRED_AT = 25
export const MONK_WAKE_AT = 95
export interface MonkNeeds { home?: string; bedSlot?: number; workSlot: number; stamina: number; buildingTask?: BuildingTask; jobSearch: number }
export function createMonkNeeds(index: number): MonkNeeds { return { workSlot: index, stamina: 100 - index * 6, jobSearch: 0 } }

/** Finish assigned construction before resting; tired monks cannot take new work. */
export function stepMonkWork(s: MonkRoutine & MonkNeeds, map: GameMap, speed: number, dt: number): boolean {
  if (dt <= 0) return !!s.buildingTask
  if (s.activity !== "sleeping") s.stamina = Math.max(0, s.stamina - dt * (s.activity === "building" ? 0.4 : 0.125))
  s.jobSearch = Math.max(0, s.jobSearch - dt)
  if (s.stamina <= MONK_TIRED_AT && !s.buildingTask && s.jobSearch === 0) {
    const workSlot = s.workSlot
    s.workSlot = s.bedSlot ?? workSlot
    const assigned = assignBuildingTask(s, map, "rest", s.home)
    s.workSlot = workSlot
    if (assigned) { s.route = []; s.pause = 0 }
    else s.jobSearch = 3
  }
  if (!s.buildingTask && s.stamina > MONK_TIRED_AT && s.jobSearch === 0 && s.activity !== "praying") {
    if (assignBuildingTask(s, map, "build")) { s.route = []; s.pause = 0 }
    else s.jobSearch = 2
  }
  if (s.buildingTask) {
    const state = stepBuildingTask(s, map, speed, dt)
    if (state) {
      // Brothers only build and sleep; a posted work state cannot reach them.
      s.activity = state === "walking" ? s.buildingTask!.purpose === "rest" ? "toShelter" : "toBuild"
        : state === "posted" ? "resting" : state
      if (state === "sleeping") {
        s.stamina = Math.min(100, s.stamina + dt * 4)
        if (s.stamina >= MONK_WAKE_AT) { s.buildingTask = undefined; s.activity = "resting"; s.pause = 1; s.destination = "home" }
      }
      return true
    }
    s.activity = "resting"
    s.destination = "home"
  }
  // Jobs can take a brother beyond the small wandering grounds. Walk home first.
  if (map.site && Math.hypot(s.x - (map.site.door.x - map.width / 2 + 0.5), s.z - (map.site.door.z - map.depth / 2 + 0.5)) > 0.01 &&
    (s.activity === "toBuild" || s.activity === "toShelter" || s.activity === "building" || s.activity === "sleeping" || s.destination === "home")) {
    if (!s.route.length) { s.route = workerRoute(map, s, map.site.door) ?? []; s.destination = "home" }
    s.activity = "walking"
    if (walkWorker(s, s.route, speed, dt)) { s.destination = "grounds"; s.activity = "resting"; s.pause = 1 }
    return true
  }
  return false
}

/**
 * Keep a brother on his errand after the map changes beneath him. Placing a
 * building must not restart anyone's day: only a route that now crosses a new
 * footprint is re-planned to the same goal, and only a brother standing inside
 * a fresh footprint walks out to the door. Everyone else carries on.
 */
export function replanMonkAfterMapChange(s: MonkRoutine, map: GameMap, wander: Pick<ReturnType<typeof monkWander>, "route">): void {
  const blocked = (p: WanderSpot) => {
    const building = buildingAt(map, worldToTileX(map, p.x), worldToTileZ(map, p.z))
    return !!building && building.id !== map.site?.hovelId
  }
  const goHome = () => {
    if (!map.site) return
    s.route = workerRoute(map, s, map.site.door) ?? []
    s.destination = "home"
    s.pause = 0
  }
  if (blocked(s)) { goHome(); return }
  if (!s.route.some(blocked)) return
  const goal = s.route[s.route.length - 1]
  const route = s.destination === "home" && map.site ? workerRoute(map, s, map.site.door) ?? [] : wander.route(s, goal)
  if (route.length) s.route = route
  else goHome()
}
