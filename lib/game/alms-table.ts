import { buildingStepAllowed } from "./building-navigation"
import { buildingEntry, buildingYaw, rotateBuildingPoint } from "./building-rotation"
import { isComplete, walkWorker, workerRoute } from "./construction"
import { surfaceHeight } from "./map/bridges"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "./map/types"
import type { MonkRoutine } from "./monk-routine"
import { MONK_TIRED_AT, type MonkNeeds } from "./monk-work"

export const ALMS_HUNGER_GAIN = 40
export const ALMS_HUNGER_CAP = 50
export const ALMS_SEEK_RADIUS = 12

export const ALMS_SERVING_SECONDS = 4
type Point = { x: number; y: number; z: number }
export interface AlmsDuty { tableId: string; map: GameMap; stand: Point; heading: number }
export type AlmsMonk = MonkRoutine & MonkNeeds & { almsDuty?: AlmsDuty; almsRetry?: number }

/** Live staffing, scoped to this world. An assignment opens only after arrival. */
export const almsRegistry: { current: { road: GameMap["road"]; monks: AlmsMonk[] } | null } = { current: null }

export function almsStaffed(map: GameMap, tableId: string): boolean {
  const live = almsRegistry.current
  return !!live && live.road === map.road && live.monks.some(m => m.almsDuty?.tableId === tableId &&
    m.almsDuty.map === map && ["keepingAlms", "servingAlms"].includes(m.activity) &&
    Math.hypot(m.x - m.almsDuty.stand.x, m.z - m.almsDuty.stand.z) < .01)
}

/** The counter leaves a clear passage for its server within the one-tile plot. */
function almsPoint(table: BuildingDef, x: number, z: number) {
  const offset = rotateBuildingPoint(x * (table.layoutSeed === 1 ? -1 : 1), z, table.rotation)
  return { x: table.x + offset.x, z: table.z + offset.z }
}

/** The customer and server share an exterior approach, then take separate stations. */
export function almsAccess(map: GameMap, table: BuildingDef, server = false) {
  const entry = buildingEntry(table)
  const point = almsPoint(table, .23, server ? -.32 : .65)
  const stand = { x: tileToWorldX(map, point.x), y: surfaceHeight(map, table.x, table.z), z: tileToWorldZ(map, point.z) }
  const front = { x: tileToWorldX(map, entry.x), y: stand.y, z: tileToWorldZ(map, entry.z) }
  return { entry, front, stand, heading: buildingYaw(table.rotation) + (server ? 0 : Math.PI) }
}

/** Walk straight to a standalone table; the server goes around the counter. */
function almsArrival(map: GameMap, table: BuildingDef, from: Point, server: boolean): Point[] | null {
  const { entry } = almsAccess(map, table)
  const outside = workerRoute(map, from, entry)
  if (!outside) return null
  const lane = server ? [entry, almsPoint(table, -.2, .65), almsPoint(table, -.2, -.32), almsPoint(table, .23, -.32)]
    : [entry, almsPoint(table, .23, .65)]
  if (!lane.every((p, i) => !i || buildingStepAllowed(map, map.buildings, lane[i - 1], p, true))) return null
  return [...outside, ...lane.map(p => ({ x: tileToWorldX(map, p.x), y: surfaceHeight(map, table.x, table.z), z: tileToWorldZ(map, p.z) }))]
}

export interface BreadVisit {
  tableId: string
  stand: Point
  heading: number
  returnTo: Point
  buildings: GameMap["buildings"]
  arrival: Point[]
  resumeActivity?: "toRelic" | "fromRelic"
}

export function breadVisitPlan(map: GameMap, table: BuildingDef, from: Point, back: Point) {
  if (table.buildType !== "alms-table" || !isComplete(table)) return null
  const { stand, heading } = almsAccess(map, table)
  const route = almsArrival(map, table, from, false)
  if (!route) return null
  const visit: BreadVisit = { tableId: table.id, stand, heading, returnTo: { ...back }, buildings: map.buildings, arrival: [{ ...from }, ...route] }
  return { visit, route }
}

export function stopAlmsDuty(s: AlmsMonk): void {
  if (!s.almsDuty) return
  const table = s.almsDuty.map.buildings.find(b => b.id === s.almsDuty!.tableId)
  if (table && Math.hypot(s.x - s.almsDuty.stand.x, s.z - s.almsDuty.stand.z) < .01)
    s.workExit = [almsPoint(table, -.2, -.32), almsPoint(table, -.2, 1)].map(p => ({ x: tileToWorldX(s.almsDuty!.map, p.x), y: s.y, z: tileToWorldZ(s.almsDuty!.map, p.z) }))
  s.almsDuty = undefined; s.route = []; s.pause = 0
  s.activity = "walking"; s.destination = "home"; s.almsRetry = 3
}

/** Free brothers take an unclaimed table before looking for new construction.
 * Existing building/rest tasks finish first; tired servers return to their beds. */
export function stepMonkAlms(s: AlmsMonk, map: GameMap, speed: number, dt: number,
  others: readonly AlmsMonk[], serving: boolean): boolean {
  if (dt <= 0) return !!s.almsDuty
  s.almsRetry = Math.max(0, (s.almsRetry ?? 0) - dt)
  if (s.stamina <= MONK_TIRED_AT || s.outdoorRest || s.buildingTask || s.workExit?.length) { stopAlmsDuty(s); return false }
  const table = map.buildings.find(b => b.id === s.almsDuty?.tableId && b.buildType === "alms-table" && isComplete(b))
  if (s.almsDuty && !table) { stopAlmsDuty(s); return false }
  if (!s.almsDuty && (s.almsRetry || s.activity === "praying")) return false
  const candidates = table ? [table] : map.buildings.filter(b => b.buildType === "alms-table" && b.owner !== "independent" && isComplete(b) &&
    !others.some(m => m !== s && m.almsDuty?.tableId === b.id))
  if (!s.almsDuty || s.almsDuty.map !== map) {
    let assigned = false
    for (const candidate of candidates) {
      const { stand, heading } = almsAccess(map, candidate, true)
      const atPost = Math.hypot(s.x - stand.x, s.z - stand.z) < .01
      const route = atPost ? [] : almsArrival(map, candidate, s, true)
      if (!route) continue
      s.almsDuty = { tableId: candidate.id, map, stand, heading }
      s.route = route; s.pause = 0; s.activity = "toAlmsTable"
      assigned = true
      break
    }
    if (!assigned) { stopAlmsDuty(s); s.almsRetry = 5; return false }
  }
  s.stamina = Math.max(0, s.stamina - dt * .125)
  s.activity = walkWorker(s, s.route, speed, dt) ? serving ? "servingAlms" : "keepingAlms" : "toAlmsTable"
  return true
}
