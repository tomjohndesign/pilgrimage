import { workerNavigationVersion } from "../worker-route-memory"
import { isComplete, workerRoute } from "../construction"
import { buildingEntry, buildingYaw } from "../building-rotation"
import { buildingCentre } from "../buildings"
import { shortcutCost } from "../walking-shortcuts"
import { groundHeight } from "../map/elevation"
import { surfaceHeight } from "../map/bridges"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "../map/types"
import { waterSourceAccessPoints, type WaterSourceKind, type WaterSourcePlacement } from "./assets"

export interface WaterPoint { x: number; y: number; z: number }
/** Match the drink threshold so happiness decides between taverns and free water. */
export const WATER_SEEK_THRESHOLD = 60
export const WATER_VISIT_SECONDS = 8

export function isWaterSource(building: BuildingDef): building is BuildingDef & { buildType: WaterSourceKind } {
  return building.buildType === "well" || building.buildType === "watering-hole"
}

/** Shared by placed sprites and navigation, including rotated and raised sites. */
export function waterSourcePlacement(map: GameMap, building: BuildingDef & { buildType: WaterSourceKind }): WaterSourcePlacement {
  const centre = buildingCentre(map, building)
  return { ...centre, kind: building.buildType, yaw: buildingYaw(building.rotation),
    y: groundHeight(map, building.x + (building.w - 1) / 2, building.z + (building.d - 1) / 2) }
}

export interface WaterVisit {
  /** A drink beside the chapel approach resumes the reserved shrine visit. */
  resumeActivity?: "toRelic" | "fromRelic"
  exitCleared?: boolean
  sourceId: string
  kind: WaterSourceKind
  stand: WaterPoint
  heading: number
  /** Clear final walk from the selected side to its dipping edge. */
  approach: WaterPoint[]
  returnTo: WaterPoint
  navigation?: object
  buildings: GameMap["buildings"]
}

export function waterVisitPlan(map: GameMap, source: BuildingDef, from: WaterPoint, back: WaterPoint) {
  if (!isWaterSource(source) || !isComplete(source)) return null
  const placement = waterSourcePlacement(map, source)
  let best: { visit: WaterVisit; route: WaterPoint[]; distance: number } | null = null
  for (const access of waterSourceAccessPoints(placement)) {
    const dx = access.stand.x - placement.x, dz = access.stand.z - placement.z
    const side = Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 1 : 3) : (dz < 0 ? 2 : 0)
    const entry = buildingEntry(source.buildType === "well" ? { ...source, rotation: side } : source)
    const front = { x: tileToWorldX(map, entry.x), y: surfaceHeight(map, entry.x, entry.z), z: tileToWorldZ(map, entry.z) }
    // Align outside the footprint before stepping up to the curb. The final
    // strip stays on this side, so nobody crosses the shaft to reach water.
    const aligned = Math.abs(dx) > Math.abs(dz) ? { ...front, z: access.stand.z } : { ...front, x: access.stand.x }
    if (!Number.isFinite(shortcutCost(map, front, aligned, true))) continue
    const onward = workerRoute(map, from, entry)
    if (!onward) continue
    const approach = [front, aligned, access.stand]
    const route = [...onward, ...approach]
    let distance = 0, previous = from
    for (const point of route) { distance += Math.hypot(point.x - previous.x, point.z - previous.z); previous = point }
    if (best && best.distance <= distance) continue
    const visit: WaterVisit = { sourceId: source.id, kind: source.buildType, stand: access.stand,
      heading: Math.atan2(access.water.x - access.stand.x, access.water.z - access.stand.z),
      approach, returnTo: { x: back.x, y: back.y, z: back.z }, navigation: workerNavigationVersion(map), buildings: map.buildings }
    best = { visit, route, distance }
  }
  return best && { visit: best.visit, route: best.route }
}
