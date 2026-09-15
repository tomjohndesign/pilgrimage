import { workerRoute } from "./construction"
import { wayfindingNetwork } from "./wayfinding-nodes"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "./map/types"
import type { WanderSpot } from "./monk-wander"
import { buildingCentre } from "./buildings"
import { buildingRouting, destinationEnabled, wayfindingSettings } from "./wayfinding-settings"
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
  buildings: readonly BuildingDef[], plan: (building: BuildingDef, origin: WanderSpot) => T | null, includeClosed = false) {
  const settings = wayfindingSettings()
  return buildings.flatMap(building => {
    const rules = buildingRouting(building.id, settings)
    return withDestinationRoutes(map, rules.travelBudget + 2, () => {
      if (!includeClosed && !destinationEnabled(building.id, settings)) return []
      // An admissible lower bound saves fields for remote buildings. Only the
      // complete walked route below determines eligibility, never this bound.
      const x = tileToWorldX(map, building.x), z = tileToWorldZ(map, building.z)
      const dx = Math.max(x - 2 - from.x, 0, from.x - (x + building.w + 1))
      const dz = Math.max(z - 2 - from.z, 0, from.z - (z + building.d + 1))
      if (Math.hypot(dx, dz) > rules.travelBudget) return []
      let origin = from, prefix: WanderSpot[] = []
      if (rules.viaNodeId) {
        const node = wayfindingNetwork(map).nodes.find(n => n.id === rules.viaNodeId)
        if (!node) return [] // A removed/foreign-world node must not silently change the experiment.
        const approach = workerRoute(map, from, node.tile)
        if (!approach) return []
        prefix = approach; origin = approach.at(-1) ?? from
      }
      const result = plan(building, origin)
      if (!result) return []
      result.route = [...prefix, ...result.route]
      // Charity customers retrace their full arrival if the post closes.
      const visit = (result as T & { visit?: { arrival?: WanderSpot[] } }).visit
      if (visit?.arrival) visit.arrival = [{ ...from }, ...result.route]
      const distance = walkingDistance(from, result.route)
      if (distance > rules.travelBudget) return []
      const centre = buildingCentre(map, building)
      return [{ building, plan: result, distance, rank: (settings.selection === "travel" ? distance : Math.hypot(centre.x - from.x, centre.z - from.z)) - rules.preference }]
    })
  }).sort((a, b) => a.rank - b.rank || a.building.id.localeCompare(b.building.id))
}
