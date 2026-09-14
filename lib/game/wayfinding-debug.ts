import { almsStaffed, breadVisitPlan, type AlmsMonk } from "./alms-table"
import { buildingEntry, wellApproaches } from "./building-rotation"
import { isComplete } from "./construction"
import type { Selection } from "./camera-store"
import { openCounters, routeWorldPoint, simRegistry, type SimTraveler } from "./sim"
import { surfaceHeight } from "./map/bridges"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap, type TilePos } from "./map/types"
import type { WanderSpot } from "./monk-wander"
import { servicePlans, walkingDistance } from "./service-wayfinding"
import { isWaterSource, waterVisitPlan } from "./water-sources/navigation"
import { tavernVisitPlan } from "./tavern"
import { workerDestinationField, workerRouteMemoryStats } from "./worker-route-memory"
import { wayfindingSettings } from "./wayfinding-settings"

export const monkWayfindingRegistry: { current: { map: GameMap; actors: Map<number, AlmsMonk> } | null } = { current: null }
export interface DebugJourney {
  kind: "traveler" | "monk"; id: number; activity: string; destination?: string; route: WanderSpot[]; remaining: number
}
function travelerDestination(s: SimTraveler, map: GameMap): string | undefined {
  if (s.activity === "toBread") return s.breadVisit?.tableId
  if (s.activity === "toWater") return s.waterVisit?.sourceId
  if (s.activity === "toTavern") return s.tavernVisit?.plan.buildingId
  if (["toBuild", "toPost"].includes(s.activity)) return s.buildingTask?.buildingId
  if (s.activity === "toHome") return s.home ?? undefined
  if (s.activity === "hauling") return s.deliveryBuilding ?? s.employer ?? undefined
  if (s.activity === "toRelic") return map.site?.hovelId
}
function gridPoints(map: GameMap, tiles: readonly TilePos[], progress: number, direction = 1) {
  const rest = direction > 0 ? tiles.slice(Math.floor(progress) + 1) : tiles.slice(0, Math.ceil(progress)).reverse()
  return rest.map(p => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z), y: surfaceHeight(map, p.x, p.z) }))
}
function travelerRoute(s: SimTraveler, map: GameMap): WanderSpot[] {
  if (s.offRoadRoute?.length) return s.offRoadRoute
  if (["toBuild", "toPost", "toHome"].includes(s.activity) && s.buildingTask) return s.buildingTask.route
  if (["toRelic", "fromRelic"].includes(s.activity) && s.shrineRoute) return gridPoints(map, s.shrineRoute, s.branchProgress, s.activity === "toRelic" ? 1 : -1)
  if (["fromHome", "fromBuild"].includes(s.activity) && s.constructionReturn) return s.constructionReturn
  if (s.workRoute && ["toWork", "toHome", "fromHome", "hauling"].includes(s.activity)) return gridPoints(map, s.workRoute, s.workProgress)
  if (["walking", "fleeing", "seeking"].includes(s.activity)) {
    const track = s.track && map.shortcuts?.[s.track.index]
    const route = track ? track.tiles : map.road ?? [], progress = track ? s.track!.progress : s.progress
    if (route.length < 2) return []
    const points: WanderSpot[] = []
    // Sample the same curved lanes used by the simulation, including bridges.
    for (let p = progress + s.direction * .25; p >= 0 && p <= route.length - 1; p += s.direction * .25)
      points.push(routeWorldPoint(map, route, p, s.lane, track || undefined))
    points.push(routeWorldPoint(map, route, s.direction > 0 ? route.length - 1 : 0, s.lane, track || undefined))
    return points
  }
  return []
}
/** Remaining waypoints, copied for inspection; never expose mutable simulation arrays. */
export function wayfindingJourneys(map: GameMap, selection: Selection | null): DebugJourney[] {
  const result: DebugJourney[] = [], sim = simRegistry.current
  const add = (kind: DebugJourney["kind"], id: number, activity: string, from: WanderSpot, points: WanderSpot[], destination?: string) => {
    if (!selection || !(selection.kind === kind && selection.id === id || selection.kind === "building" && selection.id === destination)) return
    result.push({ kind, id, activity, destination, route: [from, ...points].map(p => ({ x: p.x, y: p.y, z: p.z })), remaining: walkingDistance(from, points) })
  }
  if (sim && sim.world.road === map.road) for (const s of sim.travelers.values()) add("traveler", s.id, s.activity, s, travelerRoute(s, map), travelerDestination(s, map))
  const monks = monkWayfindingRegistry.current
  if (monks && monks.map.road === map.road) for (const [id, s] of monks.actors) {
    const points = s.workExit?.length ? s.workExit : s.buildingTask?.route.length ? s.buildingTask.route : s.route
    const destination = points.length ? s.almsDuty?.tableId ?? s.buildingTask?.buildingId : undefined
    add("monk", id, s.activity, s, points, destination)
  }
  return result
}

/** Geometry can be inspected even when a building is unstaffed or reserved. */
export function wayfindingFields(map: GameMap, buildingId: string) {
  const building = map.buildings.find(b => b.id === buildingId)
  if (!building) return []
  const goals = building.buildType === "well" ? wellApproaches(building)
    : building.buildType === "tavern" ? [buildingEntry(building), buildingEntry(building, false, -1)]
    : [buildingEntry(building)]
  return goals.map(goal => workerDestinationField(map, goal, wayfindingSettings().travelBudget))
}

export function wayfindingSnapshot(map: GameMap, selection: Selection | null) {
  const sim = simRegistry.current, settings = wayfindingSettings()
  const actor = selection?.kind === "traveler" && sim && sim.world.road === map.road ? sim.travelers.get(selection.id) : undefined
  const candidates = actor ? map.buildings.filter(b => b.buildType === "alms-table" || isWaterSource(b) || ["tavern", "market"].includes(b.buildType ?? "")).map(building => {
    const available = !isComplete(building) ? "construction" : settings.closedDestinations.includes(building.id) ? "debug closure"
      : building.buildType === "alms-table" && !almsStaffed(map, building.id) ? "unstaffed"
      : [...sim!.travelers.values()].some(s => s !== actor && (s.breadVisit?.tableId === building.id ||
        s.waterVisit?.sourceId === building.id && (s.activity !== "fromWater" || !s.waterVisit.exitCleared))) ? "reserved"
      : ["tavern", "market"].includes(building.buildType ?? "") && !openCounters(sim!, map).some(b => b.id === building.id) ? "closed" : "available"
    const plans = servicePlans<{ route: WanderSpot[] }>(map, actor, [building], b => {
      if (!isComplete(b)) return null
      if (b.buildType === "alms-table") return breadVisitPlan(map, b, actor, actor)
      if (isWaterSource(b)) return waterVisitPlan(map, b, actor, actor)
      const plan = tavernVisitPlan(map, b, { x: worldToTileX(map, actor.x), z: worldToTileZ(map, actor.z) }, new Set(), actor)
      return plan && { route: [...plan.route, plan.counter.point] }
    }, true)
    return { id: building.id, service: building.buildType, availability: available, distance: plans[0]?.distance ?? null,
      reachability: plans.length ? "within budget" : "outside budget or unreachable" }
  }) : []
  const selectedBuilding = selection?.kind === "building" ? map.buildings.find(b => b.id === selection.id) : undefined
  const destination = selectedBuilding ? { id: selectedBuilding.id, label: selectedBuilding.label, complete: isComplete(selectedBuilding),
    entry: buildingEntry(selectedBuilding), staffed: selectedBuilding.buildType === "alms-table" ? almsStaffed(map, selectedBuilding.id) : undefined,
    debugClosed: settings.closedDestinations.includes(selectedBuilding.id),
    fields: settings.showField ? wayfindingFields(map, selectedBuilding.id).map(field => ({ goal: field.goal, budget: field.budget, cells: field.distance.size })) : [] } : undefined
  return { settings, selection, destination, journeys: wayfindingJourneys(map, selection), candidates, cache: workerRouteMemoryStats(map) }
}
