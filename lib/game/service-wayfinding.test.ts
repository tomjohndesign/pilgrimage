import { afterEach, describe, expect, it, vi } from "vitest"
import { buildingEntry } from "./building-rotation"
import { buildingStepAllowed } from "./building-navigation"
import { workerRoute } from "./construction"
import { createFootpaths, markGroundChanged } from "./footpaths"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "./map/types"
import { surfaceHeight } from "./map/bridges"
import { DEFAULT_ELEVATION } from "./map/elevation"
import { servicePlans, walkingDistance } from "./service-wayfinding"
import { sharedDestinationRoute, withDestinationRoutes, withWorkerRouteMemory, workerDestinationField, workerNavigationVersion, workerRouteMemoryStats } from "./worker-route-memory"
import { DEFAULT_WAYFINDING, useWayfindingStore, wayfindingSchema } from "./wayfinding-settings"
import { breadVisitPlan } from "./alms-table"
import { waterVisitPlan } from "./water-sources/navigation"

// Exercise live debug edits through the same settings accessor used in game.
vi.mock("./wayfinding-settings", async importOriginal => {
  const module = await importOriginal<typeof import("./wayfinding-settings")>()
  return { ...module, wayfindingSettings: () => module.useWayfindingStore.getState().settings }
})

function world(width = 70, depth = 20): GameMap { return { width, depth, tiles: Array(width * depth).fill("grass"), buildings: [] } }
function building(id: string, x: number, z: number, buildType = "well"): BuildingDef {
  return { id, x, z, w: 1, d: 1, height: 1, label: id, color: "tan", roofColor: "brown", buildType }
}
function point(map: GameMap, x: number, z: number) { return { x: tileToWorldX(map, x), z: tileToWorldZ(map, z), y: surfaceHeight(map, x, z) } }
afterEach(() => useWayfindingStore.setState({ settings: DEFAULT_WAYFINDING }))

describe("shared service wayfinding", () => {
  it("chooses the longer geographic separation when a nearby source needs a detour", () => {
    const map = world(), from = point(map, 5, 5)
    const near = building("near", 7, 4), far = building("far", 5, 13)
    map.buildings = [near, far]
    for (let z = 0; z < 14; z++) map.tiles[z * map.width + 6] = "water"
    const plans = servicePlans(map, from, map.buildings, b => waterVisitPlan(map, b, from, from))
    expect(plans.map(p => p.building.id)).toEqual(["far", "near"])
    expect(plans[0].distance).toBeLessThan(plans[1].distance)
  })

  it("finds service beyond 12 tiles but rejects a complete approach beyond 40", () => {
    const map = world(), from = point(map, 2, 5)
    map.buildings = [building("reachable", 32, 4, "alms-table"), building("too-far", 43, 4, "alms-table")]
    const plans = servicePlans(map, from, map.buildings, b => breadVisitPlan(map, b, from, from))
    expect(plans.map(p => p.building.id)).toEqual(["reachable"])
    expect(plans[0].distance).toBeGreaterThan(12)
  })

  it("rejects a near destination behind a detour exceeding the budget", () => {
    const map = world(60, 60), from = point(map, 5, 5), goal = building("well", 7, 4)
    map.buildings = [goal]
    for (let z = 0; z < 30; z++) map.tiles[z * map.width + 6] = "water"
    expect(servicePlans(map, from, [goal], b => waterVisitPlan(map, b, from, from))).toEqual([])
  })

  it("shares a destination field across starting locations and gives every walker its own route", () => {
    const map = world(), goal = { x: 35, z: 5 }
    withWorkerRouteMemory(map, 1, () => withDestinationRoutes(map, 42, () => {
      const a = workerRoute(map, point(map, 5, 5), goal)!, b = workerRoute(map, point(map, 7, 5), goal)!
      expect(walkingDistance(point(map, 5, 5), a)).toBe(30)
      a.pop(); expect(b.at(-1)?.x).toBe(tileToWorldX(map, 35))
    }))
    expect(workerRouteMemoryStats(map)).toMatchObject({ fieldBuilds: 1, fieldHits: 1, planned: 0 })
  })

  it("invalidates on placement, demolition, rotation, completion and terrain changes", () => {
    const map = world(), goal = { x: 20, z: 5 }, initial = workerDestinationField(map, goal, 40)
    const wall = building("wall", 12, 0, "house"); wall.d = 20
    map.buildings.push(wall)
    const blocked = workerDestinationField(map, goal, 40)
    expect(blocked).not.toBe(initial); expect(blocked.distance.has(5 * map.width + 5)).toBe(false)
    map.buildings.pop()
    const clear = workerDestinationField(map, goal, 40)
    expect(clear.distance.get(5 * map.width + 5)).toBe(15)
    const house = building("house", 10, 8, "house"); house.construction = { work: 0, required: 10 }; map.buildings.push(house)
    const unfinished = workerDestinationField(map, goal, 40)
    house.construction.work = 5; expect(workerDestinationField(map, goal, 40)).toBe(unfinished)
    house.construction.work = 10; const complete = workerDestinationField(map, goal, 40); expect(complete).not.toBe(unfinished)
    house.rotation = 1; expect(workerDestinationField(map, goal, 40)).not.toBe(complete)
    map.footpaths = createFootpaths(map)
    const terrain = workerDestinationField(map, goal, 40)
    map.tiles[5 * map.width + 19] = "water"; markGroundChanged(map.footpaths)
    expect(workerDestinationField(map, goal, 40)).not.toBe(terrain)
    expect(workerDestinationField(map, goal, 40).distance.has(5 * map.width + 19)).toBe(false)
  })

  it("does not rebuild geometry when only debug availability or budget changes", () => {
    const map = world(), goal = { x: 20, z: 5 }, version = workerNavigationVersion(map), field = workerDestinationField(map, goal, 40)
    useWayfindingStore.getState().apply(JSON.stringify({ ...DEFAULT_WAYFINDING, closedDestinations: ["well"] }))
    expect(workerNavigationVersion(map)).toBe(version)
    expect(workerDestinationField(map, goal, 40)).toBe(field)
    workerDestinationField(map, goal, 25)
    expect(workerDestinationField(map, goal, 40)).toBe(field)
  })

  it("obeys entrances and every directed wall edge", () => {
    const map = world(), house = building("home", 10, 5, "house"); house.w = 3; house.d = 3; map.buildings = [house]
    const goal = { x: 20, z: 5 }
    const route = withDestinationRoutes(map, 40, () => sharedDestinationRoute(map, { x: 11, z: 6 }, goal))!
    expect(route).toContainEqual(buildingEntry(house))
    for (let i = 1; i < route.length; i++) expect(buildingStepAllowed(map, map.buildings, route[i - 1], route[i], true)).toBe(true)
  })

  it("respects cliff direction and lets bridges cross elevation boundaries", () => {
    const map = world(4, 1)
    map.elevation = { settings: DEFAULT_ELEVATION, height: [0, 0, 1, 1], corners: Array(16).fill(0), slope: [0, 0, 0, 0], cliffs: [0, 1, 2, 0] }
    expect(workerDestinationField(map, { x: 3, z: 0 }, 40).distance.has(0)).toBe(false)
    map.tiles = [...map.tiles]; map.tiles[2] = "bridge"
    expect(workerDestinationField(map, { x: 3, z: 0 }, 40).distance.get(0)).toBe(3)
  })

  it("applies JSON budget and closure edits to new trips without rebuilding geometry", () => {
    const map = world(), from = point(map, 2, 5), source = building("well", 32, 4)
    map.buildings = [source]
    const plans = () => servicePlans(map, from, [source], b => waterVisitPlan(map, b, from, from))
    expect(plans()).toHaveLength(1)
    const builds = workerRouteMemoryStats(map).fieldBuilds
    useWayfindingStore.getState().apply(JSON.stringify({ ...DEFAULT_WAYFINDING, closedDestinations: ["well"] }))
    expect(plans()).toHaveLength(0)
    useWayfindingStore.getState().apply(JSON.stringify(DEFAULT_WAYFINDING))
    expect(plans()).toHaveLength(1)
    expect(workerRouteMemoryStats(map).fieldBuilds).toBe(builds)
    useWayfindingStore.getState().apply(JSON.stringify({ ...DEFAULT_WAYFINDING, travelBudget: 20 }))
    expect(plans()).toHaveLength(0)
  })

  it("allows a JSON geographic comparison while retaining the walking budget", () => {
    const map = world(), from = point(map, 5, 5)
    map.buildings = [building("near", 7, 4), building("far", 5, 13)]
    for (let z = 0; z < 14; z++) map.tiles[z * map.width + 6] = "water"
    const plans = () => servicePlans(map, from, map.buildings, b => waterVisitPlan(map, b, from, from))
    expect(plans()[0].building.id).toBe("far")
    useWayfindingStore.getState().apply(JSON.stringify({ ...DEFAULT_WAYFINDING, selection: "geographic" }))
    expect(plans()[0].building.id).toBe("near")
  })

  it("validates portable JSON atomically", () => {
    const before = useWayfindingStore.getState().settings
    expect(() => useWayfindingStore.getState().apply('{"travelBudget": -1}')).toThrow()
    expect(useWayfindingStore.getState().settings).toBe(before)
    expect(wayfindingSchema.safeParse({ ...DEFAULT_WAYFINDING, travelBudget: 101 }).success).toBe(false)
    expect(wayfindingSchema.safeParse({ ...DEFAULT_WAYFINDING, typo: true }).success).toBe(false)
    expect(wayfindingSchema.parse(JSON.parse(JSON.stringify(DEFAULT_WAYFINDING)))).toEqual(DEFAULT_WAYFINDING)
  })
})
