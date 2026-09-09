import { isComplete, workerRoute } from "../construction"
import { buildingEntry, buildingYaw } from "../building-rotation"
import { buildingCentre } from "../buildings"
import { groundHeight } from "../map/elevation"
import { surfaceHeight } from "../map/bridges"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "../map/types"
import { waterSourceAccessPoints, type WaterSourceKind, type WaterSourcePlacement } from "./assets"

export interface WaterPoint { x: number; y: number; z: number }
/** Match the drink threshold so happiness decides between taverns and free water. */
export const WATER_SEEK_THRESHOLD = 60
/** Includes a town well across the road from a tavern's rear work posts. */
export const WATER_SEEK_RADIUS = 12
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
  /** Clear final walk between the footprint's front and its dipping edge. */
  approach: WaterPoint[]
  returnTo: WaterPoint
  buildings: GameMap["buildings"]
}

export function waterVisitPlan(map: GameMap, source: BuildingDef, from: WaterPoint, back: WaterPoint) {
  if (!isWaterSource(source) || !isComplete(source)) return null
  const placement = waterSourcePlacement(map, source)
  const access = waterSourceAccessPoints(placement)[0]
  const entry = buildingEntry(source)
  const route = workerRoute(map, from, entry)
  if (!route) return null
  const front = { x: tileToWorldX(map, entry.x), y: surfaceHeight(map, entry.x, entry.z), z: tileToWorldZ(map, entry.z) }
  // First align with the water point while outside the footprint, then enter
  // only the clear front strip; never path across the well shaft or pool.
  const aligned = source.rotation === 1 || source.rotation === 3
    ? { ...front, z: access.stand.z } : { ...front, x: access.stand.x }
  const approach = [front, aligned, access.stand]
  const visit: WaterVisit = { sourceId: source.id, kind: source.buildType, stand: access.stand,
    heading: Math.atan2(access.water.x - access.stand.x, access.water.z - access.stand.z),
    approach, returnTo: { x: back.x, y: back.y, z: back.z }, buildings: map.buildings }
  return { visit, route: [...route, ...approach] }
}
