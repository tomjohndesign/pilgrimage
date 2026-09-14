import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "./map/types"
import type { WanderSpot } from "./monk-wander"
import { buildingCentre } from "./buildings"
import { wayfindingSettings } from "./wayfinding-settings"
import { withDestinationRoutes } from "./worker-route-memory"

export function walkingDistance(from: WanderSpot, route: readonly WanderSpot[]): number {
  let distance = 0, previous = from
  for (const point of route) {
    distance += Math.hypot(point.x - previous.x, point.z - previous.z) || Math.abs(point.y - previous.y)
    previous = point
  }
  return distance
}

/** Availability belongs to callers. Plans don't reserve seats or mutate actors.
 * Compare the complete approach, including narrow interior and service lanes. */
export function servicePlans<T extends { route: WanderSpot[] }>(map: GameMap, from: WanderSpot,
  buildings: readonly BuildingDef[], plan: (building: BuildingDef) => T | null, includeClosed = false) {
  const settings = wayfindingSettings()
  return withDestinationRoutes(map, settings.travelBudget + 2, () => buildings.flatMap(building => {
    if (!includeClosed && settings.closedDestinations.includes(building.id)) return []
    // An admissible lower bound saves fields for remote buildings. Only the
    // complete walked route below determines eligibility, never this bound.
    const x = tileToWorldX(map, building.x), z = tileToWorldZ(map, building.z)
    const dx = Math.max(x - 2 - from.x, 0, from.x - (x + building.w + 1))
    const dz = Math.max(z - 2 - from.z, 0, from.z - (z + building.d + 1))
    if (Math.hypot(dx, dz) > settings.travelBudget) return []
    const result = plan(building)
    if (!result) return []
    const distance = walkingDistance(from, result.route)
    if (distance > settings.travelBudget) return []
    const centre = buildingCentre(map, building)
    return [{ building, plan: result, distance, rank: settings.selection === "travel" ? distance : Math.hypot(centre.x - from.x, centre.z - from.z) }]
  }).sort((a, b) => a.rank - b.rank || a.building.id.localeCompare(b.building.id)))
}
