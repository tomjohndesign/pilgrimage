import { describe, expect, it } from "vitest"
import { createFootpaths, markGroundChanged, recordWalkingPath, regrowFootpaths } from "./footpaths"
import { blockedRoad, findRoadDiversion, findRoadShortcut, takeRoadShortcut, retireBypassedRoad, exploresRoadShortcut, shortcutCost, smoothWalkingRoute } from "./walking-shortcuts"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap, type TilePos } from "./map/types"
import { DEFAULT_ELEVATION } from "./map/elevation"
import { createSim, stepSim } from "./sim"
import { generateTravelers, TRAVELER_TYPES } from "./travelers"

function fixture(): GameMap {
  const road = [{ x: 1, z: 6 }, { x: 2, z: 6 }, { x: 3, z: 6 }, { x: 3, z: 5 }, { x: 3, z: 4 },
    { x: 4, z: 4 }, { x: 5, z: 4 }, { x: 6, z: 4 }, { x: 6, z: 5 }, { x: 6, z: 6 },
    { x: 7, z: 6 }, { x: 8, z: 6 }, { x: 9, z: 6 }]
  const map: GameMap = { width: 16, depth: 12, tiles: Array(192).fill("grass"), buildings: [], road, footpaths: createFootpaths() }
  for (const p of road) map.tiles[p.z * map.width + p.x] = "path"
  map.footpaths = createFootpaths(map)
  return map
}
const world = (map: GameMap, p: TilePos) => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z), y: .2 })
function pointAt(map: GameMap, progress: number) {
  const i = Math.floor(progress), a = map.road![i], b = map.road![Math.min(i + 1, map.road!.length - 1)]
  return world(map, { x: a.x + (b.x - a.x) * (progress - i), z: a.z + (b.z - a.z) * (progress - i) })
}
function walk(map: GameMap, a: TilePos, b: TilePos, passes: number) {
  for (let pass = 0; pass < passes; pass++) {
    let before = a
    for (let step = 1; step <= 100; step++) {
      const after = { x: a.x + (b.x - a.x) * step / 100, z: a.z + (b.z - a.z) * step / 100 }
      recordWalkingPath(map.footpaths!, map, before, after); before = after
    }
  }
}

describe("traffic gradually cuts off detours", () => {
  it("lets arriving walkers adopt new wear after three simulation seconds", () => {
    const map = fixture()
    const travelers = generateTravelers(7, 8).map(t => ({ ...t, type: TRAVELER_TYPES.peasant, direction: 1 as const,
      pace: 1, offset: 1 / (map.road!.length - 1), attributes: { ...t.attributes, hunger: 100, thirst: 100, stamina: 100, jobless: false } }))
    const sim = createSim(travelers, map)
    // With seed 0, ordinal 0 explores and ordinal 1 follows established wear.
    const follower = sim.travelers.get(travelers[1].id)!
    stepSim(sim, travelers, map, 0, .1)
    expect(follower.roadShortcut).toBeUndefined()
    walk(map, pointAt(map, 1), pointAt(map, 10), 20)
    expect(findRoadShortcut(map, 1, 1, p => pointAt(map, p), false)).not.toBeNull()
    // Simulate a fresh arrival at this stretch while retaining the shared cache.
    const arrival = () => {
      Object.assign(follower, { progress: 1, ...pointAt(map, 1), shortcutCheck: undefined })
      stepSim(sim, travelers, map, 0, .1)
    }
    stepSim(sim, [], map, 0, 1)
    arrival()
    expect(follower.roadShortcut).toBeUndefined()
    stepSim(sim, [], map, 0, 3)
    arrival()
    expect(follower.roadShortcut).toBeDefined()
  })

  it("invalidates cached shortcuts immediately when the ground changes", () => {
    const map = fixture()
    const take = () => takeRoadShortcut(map, 1, 1, 0, p => pointAt(map, p), true, 1)
    expect(take()).not.toBeNull()
    map.tiles = map.tiles.map(terrain => terrain === "grass" ? "water" : terrain)
    markGroundChanged(map.footpaths!)
    expect(take()).toBeNull()
  })

  it("keeps a pioneer in small pedestrian populations without rerolling at each bend", () => {
    for (const population of [3, 8, 20]) for (const seed of [1, 7, 42]) {
      const chosen = Array.from({ length: population }, (_, ordinal) => exploresRoadShortcut(ordinal, 0, seed, population))
      expect(chosen.filter(Boolean)).toHaveLength(Math.ceil(population / 8))
      expect(Array.from({ length: population }, (_, ordinal) => exploresRoadShortcut(ordinal, 0, seed, population))).toEqual(chosen)
    }
  })
  it("lets road pedestrians take cuts at walking speed and rejoin without changing the road", () => {
    const map = fixture(), original = structuredClone(map.road)
    const travelers = generateTravelers(42, 20).map(t => ({ ...t, type: TRAVELER_TYPES.peasant, direction: 1 as const,
      pace: 1, offset: 1 / (map.road!.length - 1), attributes: { ...t.attributes, hunger: 100, thirst: 100, stamina: 100, jobless: false } }))
    const sim = createSim(travelers, map)
    const cutting = new Set<number>(), rejoined = new Set<number>()
    for (let frame = 0; frame < 180; frame++) {
      const before = new Map([...sim.travelers].map(([id, s]) => [id, { x: s.x, z: s.z, cutting: !!s.roadShortcut }]))
      stepSim(sim, travelers, map, 1, .1)
      for (const [id, s] of sim.travelers) {
        if (s.roadShortcut) cutting.add(id)
        if (before.get(id)!.cutting) {
          expect(Math.hypot(s.x - before.get(id)!.x, s.z - before.get(id)!.z)).toBeLessThanOrEqual(.10001)
          if (!s.roadShortcut) rejoined.add(id)
        }
      }
    }
    expect(cutting.size).toBeGreaterThan(0)
    expect(cutting.size).toBeLessThan(5) // Exploration is chosen per journey, not at every tile.
    expect(rejoined.size).toBeGreaterThan(0)
    expect(map.road).toEqual(original)
    expect([...map.footpaths!.contacts.values()].some(c => map.tiles[Math.floor(c.az) * map.width + Math.floor(c.ax)] === "grass")).toBe(true)
  })
  it("lets an explorer shorten a zigzag without wearing a route before walking it", () => {
    const map = fixture()
    const cut = findRoadShortcut(map, 1, 1, p => pointAt(map, p), true)!
    expect(cut).not.toBeNull()
    expect(findRoadShortcut(map, 1, 1, p => pointAt(map, p), false)).toBeNull()
    expect(cut.length).toBeLessThan(cut.end - cut.start - 1)
    expect(map.footpaths!.contacts.size).toBe(0)
    expect(map.footpaths!.edges.size).toBe(0)
    const reverse = findRoadShortcut(map, 10, -1, p => pointAt(map, p), true)!
    expect(reverse.end).toBeLessThan(reverse.start)
  })

  it("makes a walked shortcut increasingly attractive while abandoned tracks regrow", () => {
    const map = fixture(), a = pointAt(map, 1), b = pointAt(map, 10)
    const fresh = shortcutCost(map, a, b)
    expect(shortcutCost(map, a, b, true)).toBeLessThan(fresh)
    walk(map, a, b, 1)
    expect(shortcutCost(map, a, b)).toBeCloseTo(fresh)
    walk(map, a, b, 15)
    expect(shortcutCost(map, a, b)).toBeLessThan(fresh * .75)
    const route = map.road!.slice(1, 11).map(p => world(map, p))
    expect(smoothWalkingRoute(map, route).length).toBeLessThan(route.length)
    const worn = shortcutCost(map, a, b)
    regrowFootpaths(map.footpaths!, 15)
    expect(shortcutCost(map, a, b)).toBeGreaterThan(worn)
  })

  it("retires only a completed, established bypass, while leaving the rest of the road intact", () => {
    const map = fixture(), from = pointAt(map, 1), to = pointAt(map, 10)
    const length = Math.hypot(to.x - from.x, to.z - from.z)
    const cut = { from, to, start: 1, end: 10, length, distance: length }
    retireBypassedRoad(map, cut)
    expect(map.footpaths!.rerouted.size).toBe(0)
    walk(map, from, to, 20)
    retireBypassedRoad(map, { ...cut, distance: 0 })
    expect(map.footpaths!.rerouted.size).toBe(0)
    retireBypassedRoad(map, cut)
    expect(map.footpaths!.rerouted.size).toBeGreaterThan(0)
    regrowFootpaths(map.footpaths!, 100)
    expect(map.footpaths!.founding.get(6 * map.width + 1)).toBe(.6)
    expect(map.footpaths!.founding.get(4 * map.width + 4)).toBe(0)
  })

  it("leaves straight routes alone and never cuts past gameplay junctions", () => {
    const map = fixture()
    map.road = Array.from({ length: 14 }, (_, x) => ({ x: x + 1, z: 6 }))
    expect(findRoadShortcut(map, 1, 1, p => pointAt(map, p), true)).toBeNull()
    const bent = fixture()
    bent.site = { junction: 5, branch: [], door: { x: 4, z: 5 }, hovelId: "shrine" }
    const cut = findRoadShortcut(bent, 1, 1, p => pointAt(bent, p), true)
    expect(cut === null || cut.end <= 3.5).toBe(true)
    expect(findRoadShortcut(bent, 5, 1, p => pointAt(bent, p), true)).toBeNull()
  })

  it.each(["water", "forest", "darkwood", "bridge"] as const)("rejects cuts across %s even with exploration bias", terrain => {
    const map = fixture(), a = pointAt(map, 1), b = pointAt(map, 10)
    map.tiles[6 * map.width + 4] = terrain
    expect(shortcutCost(map, a, b, true)).toBe(Infinity)
  })

  it("checks cliffs, trees, buildings and blocked diagonal corners", () => {
    const map = fixture(), a = world(map, { x: 3, z: 6 }), b = world(map, { x: 6, z: 6 })
    map.footpaths!.obstacles = [{ ...world(map, { x: 4, z: 6 }), radius: .3 }]
    expect(shortcutCost(map, a, b, true)).toBe(Infinity)
    map.footpaths!.obstacles[0].z += .4
    expect(shortcutCost(map, a, b, true)).toBe(Infinity) // Body clearance beside a trunk.
    map.footpaths!.obstacles = []
    map.buildings.push({ id: "hut", x: 4, z: 6, w: 1, d: 1, height: 1, label: "Hut", color: "", roofColor: "" })
    expect(shortcutCost(map, a, b, true)).toBe(Infinity)
    expect(shortcutCost(map, world(map, { x: 3, z: 6 }), world(map, { x: 4, z: 7 }), true)).toBe(Infinity)
    map.buildings = []
    map.elevation = { settings: DEFAULT_ELEVATION, height: Array(192).fill(0), corners: [], cliffs: [], slope: [] }
    map.elevation.height[6 * map.width + 4] = 3
    expect(shortcutCost(map, a, b, true)).toBe(Infinity)
  })
})

describe("a footprint laid across the road", () => {
  const hut = { id: "hut", label: "Hut", x: 7, z: 6, w: 2, d: 1, height: .6, color: "", roofColor: "" }

  it("sends walkers around the obstruction and back onto the road beyond it", () => {
    const map = fixture()
    expect(findRoadDiversion(map, blockedRoad(map), pointAt(map, 10), 10, 1, p => pointAt(map, p))).toBeNull()
    map.buildings = [hut]
    const diversion = findRoadDiversion(map, blockedRoad(map), pointAt(map, 9), 9, 1, p => pointAt(map, p))!
    expect(diversion).not.toBeNull()
    expect(diversion.end).toBe(12)
    const points = [diversion.from, ...diversion.via!, diversion.to]
    expect(points.length).toBeGreaterThan(2)
    for (const p of points) {
      const x = worldToTileX(map, p.x), z = worldToTileZ(map, p.z)
      expect(x >= hut.x && x < hut.x + hut.w && z === hut.z, `(${x}, ${z}) clears the hut`).toBe(false)
    }
    // Walking around costs more ground than the road it replaces.
    expect(diversion.length).toBeGreaterThan(Math.abs(diversion.end - diversion.start))
    // The way back is the same detour in reverse.
    map.buildings = [hut]
    const back = findRoadDiversion(map, blockedRoad(map), pointAt(map, 12), 12, -1, p => pointAt(map, p))!
    expect(back.end).toBe(8)
  })

  it("never retires the road it only steps around", () => {
    const map = fixture()
    map.buildings = [hut]
    const diversion = findRoadDiversion(map, blockedRoad(map), pointAt(map, 9), 9, 1, p => pointAt(map, p))!
    retireBypassedRoad(map, { ...diversion, distance: diversion.length })
    expect(map.footpaths!.rerouted.size).toBe(0)
  })

  it("walks travelers around it in the sim, wearing a new way past", () => {
    const map = fixture()
    map.buildings = [hut]
    const travelers = generateTravelers(7, 8).map(t => ({ ...t, type: TRAVELER_TYPES.peasant, direction: 1 as const,
      pace: 1, offset: 1 / (map.road!.length - 1), attributes: { ...t.attributes, hunger: 100, thirst: 100, stamina: 100, jobless: false } }))
    const sim = createSim(travelers, map)
    const diverted = new Set<number>()
    for (let frame = 0; frame < 400; frame++) {
      stepSim(sim, travelers, map, 1, .1)
      for (const [id, s] of sim.travelers) {
        if (s.roadShortcut?.via) diverted.add(id)
        const x = worldToTileX(map, s.x), z = worldToTileZ(map, s.z)
        expect(x >= hut.x && x < hut.x + hut.w && z === hut.z, `traveler ${id} walks through the hut`).toBe(false)
      }
    }
    expect(diverted.size).toBeGreaterThan(0)
    expect([...map.footpaths!.edges.values()].some(e => e.wear > 0)).toBe(true)
  })
})
