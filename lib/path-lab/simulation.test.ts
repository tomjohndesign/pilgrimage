import { describe, expect, it } from "vitest"
import { advanceWorld, createPathWorld as createPermutationWorld, DEFAULT_PATH_SETTINGS as defaults, ESTABLISH, findRoute, indexAt, labBuilding, LAB_DAY, placeLabBuilding, placementIssue, ROAD_Z, updateNetwork, walkJourney, worldStats, pathEdgeIndex, recurringRoute, setDestinationOpen, type Experiment, type Journey } from "./simulation"

import { DEFAULT_PERMUTATION, LAYOUTS, readPermutation } from "./permutations"
import { buildingEntry } from "../game/building-rotation"

// Existing hand-authored fixtures keep their specific coordinates.
const createPathWorld = (experiment: Experiment, settings = defaults, shared = true) => createPermutationWorld(experiment, settings, shared, { ...DEFAULT_PERMUTATION, layout: "original", sources: "west" })
const quiet = { ...defaults, traffic: 0 }

describe("path playground simulation", () => {
  it("deposits wear by actual distance in the crossed tiles, with no idle or spawn wear", () => {
    const world = createPathWorld("town", quiet)
    const route = [indexAt(4, 3), indexAt(5, 3), indexAt(6, 3)]
    const journey: Journey = { id: 0, route, edge: 0, progress: 0, returning: false, through: false }
    walkJourney(world, journey, 0, .1)
    expect(world.wear[route[0]]).toBe(0)
    walkJourney(world, journey, 1.5, .1)
    expect(world.wear[route[0]]).toBeCloseTo(.05)
    expect(world.wear[route[1]]).toBeCloseTo(.1)
    expect(world.wear[route[2]]).toBe(0)
    expect(world.wear[indexAt(9, 3)]).toBe(0)
  })

  it("runs the same simulation across frame subdivisions and a single day step", () => {
    const one = createPathWorld("routes"), many = createPathWorld("routes")
    advanceWorld(one, LAB_DAY, defaults)
    for (let i = 0; i < 600; i++) advanceWorld(many, .1, defaults)
    expect(many.wear).toEqual(one.wear)
    expect(many.journeys).toEqual(one.journeys)
    expect(many.completed).toEqual(one.completed)
    expect(many.time).toBe(one.time)
  })

  it("recovers toward a per-tile floor even without any walkers", () => {
    const world = createPathWorld("wear", quiet)
    const road = indexAt(30, ROAD_Z), field = indexAt(8, 3)
    world.wear[field] = .8
    advanceWorld(world, defaults.halfLife * LAB_DAY, quiet)
    expect(world.wear[road]).toBeCloseTo(defaults.roadFloor + (.8 - defaults.roadFloor) / 2, 8)
    expect(world.wear[field]).toBeCloseTo(.4, 8)
    advanceWorld(world, 1000, { ...quiet, halfLife: .25 })
    expect(world.wear[field]).toBe(0)
    expect(world.wear[road]).toBeGreaterThanOrEqual(defaults.roadFloor)
  })

  it("needs sustained wear and connectivity before a trace becomes frontage", () => {
    const world = createPathWorld("town")
    const i = indexAt(5, ROAD_Z - 1), isolated = indexAt(8, 3)
    world.wear[i] = ESTABLISH - .01; updateNetwork(world)
    expect(world.established[i]).toBe(0)
    world.wear[i] = ESTABLISH; world.wear[isolated] = 1; updateNetwork(world)
    expect(world.connected[i]).toBe(1)
    expect(world.connected[isolated]).toBe(0)
    world.wear[i] = .3; updateNetwork(world)
    expect(world.established[i]).toBe(1)
    world.wear[i] = .24; updateNetwork(world)
    expect(world.connected[i]).toBe(0)
  })

  it("concentrates shared journeys into fewer traces on the same map", () => {
    const independent = createPathWorld("routes", defaults, false), shared = createPathWorld("routes")
    advanceWorld(independent, LAB_DAY * 2, defaults); advanceWorld(shared, LAB_DAY * 2, defaults)
    expect(shared.serial).toBe(independent.serial)
    expect(worldStats(shared).traces).toBeLessThan(worldStats(independent).traces)
    expect(worldStats(shared).connected).toBeGreaterThan(0)
  })

  it("changes road sections according to local passage, not the global journey rate", () => {
    const world = createPathWorld("wear")
    advanceWorld(world, LAB_DAY * 3, defaults)
    expect(world.wear[indexAt(5, ROAD_Z)]).toBeGreaterThan(world.wear[indexAt(31, ROAD_Z)])
    world.trafficOn = false
    const spawned = world.serial
    advanceWorld(world, LAB_DAY, defaults)
    expect(world.serial).toBe(spawned)
    expect(world.journeys).toHaveLength(0)
  })

  it("allows off-road destinations but checks the rotated shelter entrance and full footprint", () => {
    const world = createPathWorld("town")
    const hut = labBuilding(4, 4, "workshop", 0, 1)
    const shelter = labBuilding(4, 4, "shelter", 0, 1)
    expect(placementIssue(world, hut, defaults)).toBeNull()
    expect(placementIssue(world, shelter, defaults)).toMatch(/connected/)
    const frontage = labBuilding(5, 13, "shelter", 0, 1)
    expect(placementIssue(world, frontage, defaults)).toBeNull()
    expect(placementIssue(world, { ...frontage, rotation: 2 }, defaults)).toMatch(/connected/)
    expect(placementIssue(world, labBuilding(12, 8, "workshop", 0, 1), defaults)).toMatch(/woods/)
    expect(placementIssue(world, labBuilding(5, ROAD_Z, "workshop", 0, 1), defaults)).toMatch(/paths/)
    expect(placementIssue(world, labBuilding(33, 4, "workshop", 0, 1), defaults)).toMatch(/inside/)
  })

  it("placement attracts actual journeys without painting a path and reset clears additions", () => {
    const world = createPathWorld("town"), before = world.wear.slice()
    expect(placeLabBuilding(world, labBuilding(4, 4, "workshop", 0, 1), defaults)).toBeNull()
    expect(world.wear).toEqual(before)
    expect(world.buildings).toHaveLength(2)
    advanceWorld(world, LAB_DAY, defaults)
    expect(world.wear[indexAt(4, 6)]).toBeGreaterThan(0)
    expect(createPathWorld("town").buildings).toHaveLength(1)
  })

  it("replans a return trip when a new footprint covers ground already crossed", () => {
    const world = createPathWorld("town", quiet)
    world.journeys.push({ id: 0, route: [3, 4, 5, 6, 7, 8, 9].map(x => indexAt(x, 4)), edge: 4, progress: 0, returning: false, through: false })
    expect(placeLabBuilding(world, labBuilding(4, 3, "workshop", 0, 1), quiet)).toBeNull()
    advanceWorld(world, 1, quiet)
    expect(world.journeys[0].returning).toBe(true)
    expect(world.journeys[0].route.every(i => !world.blocked[i])).toBe(true)
  })

  it("finds obstacle-safe routes and tolerates unreachable entrances", () => {
    const world = createPathWorld("town")
    const start = indexAt(2, ROAD_Z), goal = indexAt(18, 5)
    const route = findRoute(world, start, goal, defaults)!
    expect(route[0]).toBe(start); expect(route.at(-1)).toBe(goal)
    expect(route.every(i => !world.blocked[i])).toBe(true)
    world.blocked[goal] = 1
    expect(findRoute(world, start, goal, defaults)).toBeNull()
  })
})


describe("permutations and emergent reinforcement", () => {
  it.each(Object.keys(LAYOUTS).filter(layout => layout !== "original"))("varies %s reproducibly while retaining access to every entrance", layout => {
    for (const seed of [1, 2, 17, 4294967295]) {
      const permutation = { ...DEFAULT_PERMUTATION, layout: layout as keyof typeof LAYOUTS, seed, destinations: 8 }
      const left = createPermutationWorld("routes", defaults, false, permutation)
      const right = createPermutationWorld("routes", defaults, true, permutation)
      expect(right.buildings).toHaveLength(8)
      expect(right.buildings).toEqual(left.buildings)
      expect(right.blocked).toEqual(left.blocked)
      for (const building of right.buildings) {
        const door = buildingEntry(building)
        expect(findRoute(right, indexAt(1, ROAD_Z), indexAt(door.x, door.z), defaults)).not.toBeNull()
      }
      const next = createPermutationWorld("routes", defaults, true, { ...permutation, seed: (seed + 1) >>> 0 })
      expect(next.buildings).not.toEqual(right.buildings)
    }
  })

  it("starts with identical individual routes on unused ground with turn preference disabled", () => {
    const left = createPermutationWorld("routes", defaults, false), right = createPermutationWorld("routes")
    left.wear.fill(0); right.wear.fill(0)
    const door = buildingEntry(right.buildings[0]), end = indexAt(door.x, door.z)
    for (let commuter = 0; commuter < 12; commuter++) expect(findRoute(right, indexAt(1, ROAD_Z), end, { ...defaults, turnPenalty: 0 }, commuter)).toEqual(findRoute(left, indexAt(1, ROAD_Z), end, defaults, commuter))
  })

  it("favors a deep emergent detour, but does not give a first trace the same pull", () => {
    const world = createPathWorld("routes")
    world.blocked.fill(0); world.wear.fill(0); world.terrainCost.fill(0)
    const start = indexAt(4, 4), end = indexAt(10, 4)
    const detour = [start, ...Array.from({ length: 7 }, (_, x) => indexAt(x + 4, 5)), end]
    detour.forEach((i, n) => { world.wear[i] = .04; if (n > 0) world.edgeWear[pathEdgeIndex(detour[n - 1], i)] = .04 })
    expect(findRoute(world, start, end, defaults)!.length).toBe(7)
    detour.forEach((i, n) => { world.wear[i] = 1; if (n > 0) world.edgeWear[pathEdgeIndex(detour[n - 1], i)] = 1 })
    const deep = findRoute(world, start, end, defaults)!
    expect(deep.some(i => Math.floor(i / 34) === 5)).toBe(true)
    expect(deep.every(i => detour.includes(i))).toBe(true)
  })

  it("opens a direct connection when following the old trail would cost too much", () => {
    const world = createPathWorld("routes")
    world.blocked.fill(0); world.wear.fill(0); world.terrainCost.fill(0)
    for (let z = 1; z <= 14; z++) { world.wear[indexAt(4, z)] = 1; world.wear[indexAt(10, z)] = 1 }
    for (let x = 4; x <= 10; x++) world.wear[indexAt(x, 1)] = 1
    expect(findRoute(world, indexAt(4, 14), indexAt(10, 14), defaults)).toHaveLength(7)
  })

  it("keeps recurring journeys stable without rerolling novel routes", () => {
    const world = createPathWorld("routes"), start = indexAt(1, ROAD_Z), end = indexAt(23, 6)
    const first = recurringRoute(world, start, end, defaults, 2)
    expect(recurringRoute(world, start, end, defaults, 14)).toEqual(first)
    expect(recurringRoute(world, start, end, defaults, 26)).toEqual(first)
  })

  it("requires actual repeated trips to deepen a route and lets abandoned alternatives fade", () => {
    const world = createPathWorld("routes", { ...defaults, halfLife: .5, permanentAt: 0 })
    advanceWorld(world, LAB_DAY * 3, { ...defaults, halfLife: .5, permanentAt: 0 })
    expect(worldStats(world).connected).toBeGreaterThan(0)
    const oldWear = world.wear.slice()
    world.buildings.forEach(b => setDestinationOpen(world, b.id, false))
    // Existing journeys finish; no unexplained exploration replaces the missing demand.
    advanceWorld(world, LAB_DAY, { ...defaults, halfLife: .5, permanentAt: 0 })
    expect(world.journeys).toHaveLength(0)
    advanceWorld(world, LAB_DAY * 4, { ...defaults, halfLife: .5, permanentAt: 0 })
    expect(worldStats(world).trails).toBe(0)
    expect(world.wear.some((value, i) => oldWear[i] > .5 && value < .1)).toBe(true)
  })

  it("routes local demand between open destinations, and stops when no pair remains", () => {
    const world = createPermutationWorld("town", defaults, true, { ...DEFAULT_PERMUTATION, sources: "local" })
    const entries = world.buildings.map(b => { const p = buildingEntry(b); return indexAt(p.x, p.z) })
    advanceWorld(world, 3, defaults)
    expect(world.journeys.length).toBeGreaterThan(0)
    world.journeys.forEach(j => {
      expect(entries).toContain(j.route[0]); expect(entries).toContain(j.route.at(-1))
      expect(j.route[0]).not.toBe(j.route.at(-1))
    })
    world.buildings.slice(1).forEach(b => setDestinationOpen(world, b.id, false))
    advanceWorld(world, LAB_DAY, defaults)
    expect(world.journeys).toHaveLength(0)
  })

  it("sanitizes shared permutation links", () => {
    expect(readPermutation(new URLSearchParams("seed=17&layout=clusters&sources=local&destinations=7"))).toEqual({ seed: 17, layout: "clusters", sources: "local", destinations: 7 })
    expect(readPermutation(new URLSearchParams("seed=NaN&layout=invalid&sources=invalid&destinations=500"))).toEqual({ ...DEFAULT_PERMUTATION, destinations: 8 })
  })
})
