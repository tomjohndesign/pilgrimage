import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"
import { monkWander, type WanderSpot } from "./monk-wander"
import type { MonkRoutine } from "./monk-routine"
import { shrineLayout } from "./shrine-layout"
import { BASE_PERSON, PERSON_CLIPS } from "./base-person/pose"

export const RELIC_PRAYER_RADIUS = 3
export const PROCESSION_SECONDS = 45
export const RELIC_LIFT_SECONDS = PERSON_CLIPS.hoisting.frames / BASE_PERSON.defaultFps
export type ProcessionStage = "idle" | "approaching" | "lifting" | "carrying" | "returning" | "lowering"
export interface RelicProcession {
  monkId: number | null
  stage: ProcessionStage
  elapsed: number
  route: WanderSpot[]
  position: WanderSpot | null
}

export function createRelicProcession(): RelicProcession {
  return { monkId: null, stage: "idle", elapsed: 0, route: [], position: null }
}
export function relicIsCarried(p: RelicProcession) {
  return p.stage === "lifting" || p.stage === "carrying" || p.stage === "returning" || p.stage === "lowering"
}

/** A little hysteresis keeps worshippers from flickering at the edge of the crowd. */
export function nearProcession(p: RelicProcession | null | undefined, who: { x: number; y: number; z: number }, praying = false): boolean {
  if (!p?.position || !relicIsCarried(p)) return false
  return Math.hypot(who.x - p.position.x, who.z - p.position.z) <= RELIC_PRAYER_RADIUS + (praying ? 0.5 : 0)
    && Math.abs(who.y - p.position.y) < 1
}

/** The scene owns the live object; simulation reads it without storing frame-rate React state. */
export const processionRegistry: { current: RelicProcession | null } = { current: null }

export function processionGrounds(map: GameMap, wander = monkWander(map)) {
  if (!map.site || !wander.centre) return null
  const door = wander.spots.find(p => p.x === tileToWorldX(map, map.site!.door.x) && p.z === tileToWorldZ(map, map.site!.door.z))
  if (!door) return null
  const centre = wander.centre
  const shrine = map.buildings.find(b => b.id === map.site!.hovelId)
  if (!shrine) return null
  const { rotation } = shrineLayout(shrine, map.site.door)
  // Collect from behind the altar, regardless of which way the shrine faces.
  const altar = wander.prayerSpots.find(spot =>
    (spot.x - centre.x) * -Math.sin(rotation) + (spot.z - centre.z) * -Math.cos(rotation) > 0.5)
  if (!altar) return null
  return { door, altar, centre, wander }
}
export type ProcessionGrounds = NonNullable<ReturnType<typeof processionGrounds>>

function routeToAltar(actor: WanderSpot, grounds: ProcessionGrounds): WanderSpot[] {
  return grounds.wander.route(actor, grounds.altar)
}

export function startProcession(p: RelicProcession, monkId: number, actor: WanderSpot, grounds: ProcessionGrounds): boolean {
  if (p.stage !== "idle") return false
  const route = routeToAltar(actor, grounds)
  if (!route.length) return false
  Object.assign(p, { monkId, stage: "approaching", elapsed: 0, route, position: { x: actor.x, y: actor.y, z: actor.z } })
  return true
}

/** A completed prayer arrival behind the altar can become a spontaneous procession. */
export function startAltarProcession(p: RelicProcession, monkId: number, actor: MonkRoutine,
  grounds: ProcessionGrounds): boolean {
  if (actor.activity !== "praying" || actor.destination !== "prayer" || actor.route.length
    || Math.hypot(actor.x - grounds.altar.x, actor.z - grounds.altar.z) > 0.01) return false
  if (!startProcession(p, monkId, actor, grounds)) return false
  // Already at the pickup point. Use the same hoist and return animation as a command.
  p.stage = "lifting"
  p.route = []
  return true
}

/** Spend the actual distance budget across corners; never count a turn as travel. */
function walkRoute(actor: WanderSpot, route: WanderSpot[], distance: number): void {
  while (route.length) {
    const target = route[0], dx = target.x - actor.x, dz = target.z - actor.z, length = Math.hypot(dx, dz)
    if (length > distance) {
      actor.x += dx / length * distance; actor.z += dz / length * distance
      actor.y += (target.y - actor.y) * distance / length
      break
    }
    Object.assign(actor, target); route.shift(); distance -= length
  }
}

/** Returns an exit path after setting the relic back down. Paused callers pass zero dt. */
export function stepProcession(p: RelicProcession, actor: WanderSpot, grounds: ProcessionGrounds,
  dt: number, speed: number, pick: () => WanderSpot, returnRequested = false): WanderSpot[] | null {
  if (dt <= 0 || p.stage === "idle") return null
  p.elapsed += dt
  const enter = (stage: ProcessionStage) => { p.stage = stage; p.elapsed = 0 }
  if (p.stage === "carrying" && (returnRequested || p.elapsed >= PROCESSION_SECONDS)) {
    p.route = routeToAltar(actor, grounds)
    enter("returning")
  }
  if (p.stage === "approaching" || p.stage === "returning" || p.stage === "carrying") {
    walkRoute(actor, p.route, speed * dt)
    if (!p.route.length) {
      if (p.stage === "approaching") enter("lifting")
      else if (p.stage === "returning") enter("lowering")
      else p.route = grounds.wander.route(actor, pick())
    }
  } else if (p.elapsed >= RELIC_LIFT_SECONDS) {
    if (p.stage === "lifting") {
      enter("carrying")
      p.route = grounds.wander.route(actor, pick())
    } else {
      Object.assign(p, createRelicProcession())
      return grounds.wander.route(actor, pick())
    }
  }
  p.position = { x: actor.x, y: actor.y, z: actor.z }
  return null
}
