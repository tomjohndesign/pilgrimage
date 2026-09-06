import { walkingSurface } from "./map/walking-surface"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"
import { monkWander, type WanderSpot } from "./monk-wander"
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
  const dx = door.x - centre.x, dz = door.z - centre.z
  const alongX = Math.abs(dx) > Math.abs(dz)
  // Align with the open gate, then stop beside the table instead of crossing it.
  const gate = { ...door, x: alongX ? door.x : centre.x, z: alongX ? centre.z : door.z }
  const altar = { x: centre.x + (alongX ? Math.sign(dx) * 0.5 : 0),
    z: centre.z + (alongX ? 0 : Math.sign(dz) * 0.5), y: 0 }
  altar.y = walkingSurface(map, altar.x, altar.z).height
  return { door, gate, altar, centre, wander }
}
export type ProcessionGrounds = NonNullable<ReturnType<typeof processionGrounds>>

function routeToAltar(actor: WanderSpot, grounds: ProcessionGrounds): WanderSpot[] {
  const route = grounds.wander.route(actor, grounds.door)
  if (route.length) return [...route, grounds.gate, grounds.altar]
  // A second command can arrive while the previous carrier is still leaving
  // the enclosure. He can turn back along the same unobstructed gate corridor.
  const { altar, gate } = grounds
  const dx = gate.x - altar.x, dz = gate.z - altar.z, lengthSquared = dx * dx + dz * dz
  const t = lengthSquared ? ((actor.x - altar.x) * dx + (actor.z - altar.z) * dz) / lengthSquared : 0
  if (t >= 0 && t <= 1 && Math.hypot(actor.x - altar.x - dx * t, actor.z - altar.z - dz * t) < 0.05) return [altar]
  return []
}

export function startProcession(p: RelicProcession, monkId: number, actor: WanderSpot, grounds: ProcessionGrounds): boolean {
  if (p.stage !== "idle") return false
  const route = routeToAltar(actor, grounds)
  if (!route.length) return false
  Object.assign(p, { monkId, stage: "approaching", elapsed: 0, route, position: { x: actor.x, y: actor.y, z: actor.z } })
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
      p.route = [grounds.gate, grounds.door, ...grounds.wander.route(grounds.door, pick())]
    } else {
      Object.assign(p, createRelicProcession())
      return [grounds.gate, grounds.door, ...grounds.wander.route(grounds.door, pick())]
    }
  }
  p.position = { x: actor.x, y: actor.y, z: actor.z }
  return null
}
