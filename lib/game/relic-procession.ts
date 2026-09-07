import { walkingSurface } from "./map/walking-surface"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"
import { monkWander, type WanderSpot } from "./monk-wander"
import type { MonkRoutine } from "./monk-routine"
import { shrineApproach } from "./settlement-route"
import { shrineLayout } from "./shrine-layout"
import { BASE_PERSON, PERSON_CLIPS } from "./base-person/pose"

export const RELIC_PRAYER_RADIUS = 3
/** Linger at the junction after completing the full outward walk. */
export const PROCESSION_ROAD_SECONDS = 12
/** One roll per altar prayer, with a quiet period at startup and between outings. */
export const PROCESSION_CHANCE = 0.08
export const PROCESSION_COOLDOWN = 180
export const PROCESSION_PIETY = 5
export const RELIC_LIFT_SECONDS = PERSON_CLIPS.hoisting.frames / BASE_PERSON.defaultFps
export type ProcessionStage = "idle" | "approaching" | "lifting" | "carrying" | "returning" | "lowering"
export interface RelicProcession {
  monkId: number | null
  stage: ProcessionStage
  elapsed: number
  route: WanderSpot[]
  position: WanderSpot | null
  /** Completed outward waypoints, so even a mid-step recall retraces the path. */
  trail: WanderSpot[]
  cooldown: number
  blessed: Set<string>
  blessingSequence: number
  blessings: Array<WanderSpot & { id: number; amount: number }>
}

export function createRelicProcession(): RelicProcession {
  return { monkId: null, stage: "idle", elapsed: 0, route: [], position: null, trail: [], cooldown: PROCESSION_COOLDOWN,
    blessed: new Set(), blessingSequence: 0, blessings: [] }
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

/** One visible piety reward per person per outing, regardless of faith or occupation. */
export function blessByProcession(p: RelicProcession, id: string, who: WanderSpot & { piety: number }): void {
  if (p.blessed.has(id) || !nearProcession(p, who)) return
  p.blessed.add(id)
  const amount = Math.min(PROCESSION_PIETY, 100 - who.piety)
  if (amount <= 0) return
  who.piety += amount
  p.blessings.push({ id: ++p.blessingSequence, amount, x: who.x, y: who.y, z: who.z })
  if (p.blessings.length > 128) p.blessings.shift()
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
  const branch = [...shrineApproach(map)].reverse().map(tile => {
    const x = tileToWorldX(map, tile.x), z = tileToWorldZ(map, tile.z)
    return { x, z, y: walkingSurface(map, x, z).height }
  })
  return { door, altar, centre, wander, branch }
}
export type ProcessionGrounds = NonNullable<ReturnType<typeof processionGrounds>>

function routeToAltar(actor: WanderSpot, grounds: ProcessionGrounds): WanderSpot[] {
  return grounds.wander.route(actor, grounds.altar)
}

export function startProcession(p: RelicProcession, monkId: number, actor: WanderSpot, grounds: ProcessionGrounds): boolean {
  if (p.stage !== "idle") return false
  const route = routeToAltar(actor, grounds)
  if (!route.length) return false
  p.blessed.clear()
  p.trail = []
  Object.assign(p, { monkId, stage: "approaching", elapsed: 0, route, position: { x: actor.x, y: actor.y, z: actor.z } })
  return true
}

/** A completed prayer arrival behind the altar can become a spontaneous procession. */
export function startAltarProcession(p: RelicProcession, monkId: number, actor: MonkRoutine,
  grounds: ProcessionGrounds, rng: () => number): boolean {
  if (p.stage !== "idle" || actor.processionConsidered || actor.activity !== "praying" || actor.destination !== "prayer" || actor.route.length
    || Math.hypot(actor.x - grounds.altar.x, actor.z - grounds.altar.z) > 0.01) return false
  actor.processionConsidered = true
  if (p.cooldown > 0 || rng() >= PROCESSION_CHANCE) return false
  if (!startProcession(p, monkId, actor, grounds)) return false
  // Already at the pickup point. Use the same hoist and return animation as a command.
  p.stage = "lifting"
  p.route = []
  return true
}

/** Spend the actual distance budget across corners; never count a turn as travel. */
function walkRoute(actor: WanderSpot, route: WanderSpot[], distance: number, trail?: WanderSpot[]): void {
  while (route.length) {
    const target = route[0], dx = target.x - actor.x, dz = target.z - actor.z, length = Math.hypot(dx, dz)
    if (length > distance) {
      actor.x += dx / length * distance; actor.z += dz / length * distance
      actor.y += (target.y - actor.y) * distance / length
      break
    }
    Object.assign(actor, target); route.shift(); distance -= length
    trail?.push({ ...target })
  }
}

/** Returns an exit path after setting the relic back down. Paused callers pass zero dt. */
export function stepProcession(p: RelicProcession, actor: WanderSpot, grounds: ProcessionGrounds,
  dt: number, speed: number, pick: () => WanderSpot, returnRequested = false): WanderSpot[] | null {
  if (dt <= 0 || p.stage === "idle") return null
  p.elapsed += dt
  const enter = (stage: ProcessionStage) => { p.stage = stage; p.elapsed = 0 }
  if (p.stage === "carrying" && (returnRequested || (!p.route.length && p.elapsed >= PROCESSION_ROAD_SECONDS))) {
    p.route = [...p.trail].reverse()
    enter("returning")
  }
  if (p.stage === "approaching" || p.stage === "returning" || p.stage === "carrying") {
    walkRoute(actor, p.route, speed * dt, p.stage === "carrying" ? p.trail : undefined)
    // Only time spent at the road counts toward the return; long paths must finish.
    if (p.stage === "carrying" && p.route.length) p.elapsed = 0
    if (!p.route.length) {
      if (p.stage === "approaching") enter("lifting")
      else if (p.stage === "returning") enter("lowering")
    }
  } else if (p.elapsed >= RELIC_LIFT_SECONDS) {
    if (p.stage === "lifting") {
      enter("carrying")
      p.trail = [{ x: actor.x, y: actor.y, z: actor.z }]
      p.route = [...grounds.wander.route(actor, grounds.door), ...grounds.branch]
    } else {
      Object.assign(p, { monkId: null, stage: "idle", elapsed: 0, route: [], trail: [], position: null, cooldown: PROCESSION_COOLDOWN })
      return grounds.wander.route(actor, pick())
    }
  }
  p.position = { x: actor.x, y: actor.y, z: actor.z }
  return null
}
