import { walkWorker, workerRoute } from "./construction"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"
import type { MonkRoutine } from "./monk-routine"
import { MONK_TIRED_AT, type MonkNeeds } from "./monk-work"
import type { monkWander, WanderSpot } from "./monk-wander"

export const MONK_JOBS = ["auto", "keeper", "almoner", "builder"] as const
export type MonkJob = typeof MONK_JOBS[number]
export const MONK_JOB_LABELS: Record<MonkJob, string> = {
  auto: "Help where needed", keeper: "Relic keeper", almoner: "Almoner — serve bread", builder: "Builder",
}
export interface KeeperDuty { map: GameMap; station: WanderSpot & { heading: number } }
export type WorkingMonk = MonkRoutine & MonkNeeds & { keeperDuty?: KeeperDuty }

/** Assigned keepers have first choice; free brothers cover their rest breaks.
 * An office is a preference, never a reason to work through exhaustion. */
export function chooseRelicKeeper(states: readonly WorkingMonk[], jobs: readonly MonkJob[], unavailable: ReadonlySet<number>, current: number | null): number | null {
  const eligible = (index: number) => !unavailable.has(index) && states[index].stamina > MONK_TIRED_AT &&
    !states[index].outdoorRest && !states[index].workExit?.length && !states[index].buildingTask && ["auto", "keeper"].includes(jobs[index])
  const preferred = states.findIndex((_, i) => jobs[i] === "keeper" && eligible(i))
  if (preferred >= 0) return preferred
  if (current !== null && eligible(current)) return current
  const free = states.findIndex((_, i) => eligible(i))
  return free < 0 ? null : free
}

export function stopKeepingRelic(s: WorkingMonk, map: GameMap, grounds: ReturnType<typeof monkWander>): void {
  if (!s.keeperDuty) return
  s.keeperDuty = undefined
  const door = map.site?.door
  const front = door ? { x: tileToWorldX(map, door.x), y: s.y, z: tileToWorldZ(map, door.z) } : s
  const rest = grounds.spots.filter(p => Math.hypot(p.x - front.x, p.z - front.z) > .5)
    .sort((a, b) => Math.hypot(a.x - front.x, a.z - front.z) - Math.hypot(b.x - front.x, b.z - front.z))[0]
  s.route = grounds.route(s, rest ?? front)
  if (s.stamina <= MONK_TIRED_AT) { s.workExit = s.route; s.route = [] }
  s.destination = "home"; s.pause = 0; s.activity = "walking"
}

/** Replacements walk through the church doorway and around its furniture. */
export function stepRelicKeeper(s: WorkingMonk, map: GameMap, grounds: ReturnType<typeof monkWander>,
  station: KeeperDuty["station"], speed: number, dt: number, showing: boolean): boolean {
  if (dt <= 0) return !!s.keeperDuty
  if (!s.keeperDuty || s.keeperDuty.map !== map) {
    let route = grounds.route(s, station)
    if (!route.length && Math.hypot(s.x - station.x, s.z - station.z) > .01 && map.site) {
      const door = { x: tileToWorldX(map, map.site.door.x), y: s.y, z: tileToWorldZ(map, map.site.door.z) }
      const outside = workerRoute(map, s, map.site.door), inside = grounds.route(door, station)
      if (outside && inside.length) route = [...outside, ...inside]
    }
    if (!route.length && Math.hypot(s.x - station.x, s.z - station.z) > .01) return false
    s.keeperDuty = { map, station }; s.route = route; s.pause = 0
  }
  s.stamina = Math.max(0, s.stamina - .125 * dt)
  s.activity = walkWorker(s, s.route, speed, dt) ? showing ? "showingRelic" : "keepingRelic" : "toKeepRelic"
  return true
}
