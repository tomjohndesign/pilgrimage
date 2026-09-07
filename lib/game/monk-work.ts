import { assignBuildingTask, stepBuildingTask, walkWorker, workerRoute, type BuildingTask } from "./construction"
import type { GameMap } from "./map/types"
import type { MonkRoutine } from "./monk-routine"

export const MONK_TIRED_AT = 25
export const MONK_WAKE_AT = 95
export interface MonkNeeds { workSlot: number; stamina: number; buildingTask?: BuildingTask; jobSearch: number }
export function createMonkNeeds(index: number): MonkNeeds { return { workSlot: index, stamina: 100 - index * 6, jobSearch: 0 } }

/** Rest takes precedence over new work. Prayer and explicit player orders can finish. */
export function stepMonkWork(s: MonkRoutine & MonkNeeds, map: GameMap, speed: number, dt: number): boolean {
  if (dt <= 0) return !!s.buildingTask
  if (s.activity !== "sleeping") s.stamina = Math.max(0, s.stamina - dt * (s.activity === "building" ? 0.8 : 0.25))
  s.jobSearch = Math.max(0, s.jobSearch - dt)
  if (s.stamina <= MONK_TIRED_AT && s.buildingTask?.purpose !== "rest" && s.jobSearch === 0) {
    s.buildingTask = undefined
    if (assignBuildingTask(s, map, "rest")) { s.route = []; s.pause = 0 }
    else s.jobSearch = 3
  }
  if (!s.buildingTask && s.stamina > MONK_TIRED_AT && s.jobSearch === 0 && s.activity !== "praying") {
    if (assignBuildingTask(s, map, "build")) { s.route = []; s.pause = 0 }
    else s.jobSearch = 2
  }
  if (s.buildingTask) {
    const state = stepBuildingTask(s, map, speed, dt)
    if (state) {
      s.activity = state === "walking" ? s.buildingTask!.purpose === "rest" ? "toShelter" : "toBuild" : state
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
