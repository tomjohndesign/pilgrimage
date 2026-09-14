import { afterEach, expect, it } from "vitest"
import { createSim, simRegistry } from "./sim"
import { TRAVELER_TYPES, type Traveler } from "./travelers"
import type { GameMap } from "./map/types"
import { wayfindingJourneys, wayfindingSnapshot } from "./wayfinding-debug"
import { almsRegistry, almsAccess, type AlmsMonk } from "./alms-table"
import { BUILD_CATALOG } from "./balance"
import { createMonkNeeds } from "./monk-work"
import { workerDestinationField, workerRouteMemoryStats } from "./worker-route-memory"

function setup() {
  const table = { ...BUILD_CATALOG.find(b => b.id === "alms-table")!, id: "bread", buildType: "alms-table", x: 10, z: 4 }
  const map: GameMap = { width: 24, depth: 12, tiles: Array(288).fill("grass"), buildings: [table], road: Array.from({ length: 24 }, (_, x) => ({ x, z: 7 })) }
  const t: Traveler = { id: 1, name: "Walker", type: TRAVELER_TYPES.peasant, attributes: { age: 30, happiness: 80, gold: 0, status: 50, hunger: 5, thirst: 100, piety: 0, stamina: 80, jobless: false, skills: [] }, offset: .5, direction: 1, pace: 1 }
  const sim = createSim([t], map), actor = sim.travelers.get(1)!
  simRegistry.current = sim
  return { map, sim, actor, table }
}
afterEach(() => { simRegistry.current = null; almsRegistry.current = null })

it("shows remaining routes without consuming them and excludes returning customers from incoming lists", () => {
  const { map, actor } = setup()
  actor.activity = "toBread"
  actor.breadVisit = { tableId: "bread", stand: { x: 1, y: .2, z: 0 }, heading: 0, returnTo: { ...actor }, buildings: map.buildings, arrival: [] }
  actor.offRoadRoute = [{ x: 0, y: .2, z: 0 }, { x: 1, y: .2, z: 0 }]
  const incoming = wayfindingJourneys(map, { kind: "building", id: "bread" })
  expect(incoming.map(j => j.id)).toEqual([1])
  incoming[0].route.pop()
  expect(actor.offRoadRoute).toHaveLength(2)
  actor.activity = "fromBread"
  expect(wayfindingJourneys(map, { kind: "building", id: "bread" })).toEqual([])
  expect(wayfindingJourneys(map, { kind: "traveler", id: 1 })).toHaveLength(1)
})

it("inspects geometric access to an unstaffed table and keeps its field when a monk arrives", () => {
  const { map, table } = setup(), access = almsAccess(map, table, true)
  const unstaffed = wayfindingSnapshot(map, { kind: "traveler", id: 1 })
  expect(unstaffed.candidates[0]).toMatchObject({ availability: "unstaffed", reachability: "within budget" })
  const field = workerDestinationField(map, access.entry, 42), builds = workerRouteMemoryStats(map).fieldBuilds
  const monk: AlmsMonk = { ...createMonkNeeds(0), ...access.stand, activity: "keepingAlms", route: [], pause: 0, destination: "grounds", outings: 0, prayerSpot: undefined,
    almsDuty: { tableId: table.id, map, stand: access.stand, heading: access.heading } }
  almsRegistry.current = { road: map.road, monks: [monk] }
  expect(wayfindingSnapshot(map, { kind: "traveler", id: 1 }).candidates[0].availability).toBe("available")
  expect(workerDestinationField(map, access.entry, 42)).toBe(field)
  expect(workerRouteMemoryStats(map).fieldBuilds).toBe(builds)
})
