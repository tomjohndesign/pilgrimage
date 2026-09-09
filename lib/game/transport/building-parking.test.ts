import { createSim, stepSim } from "../sim"
import { generateTravelers, TRAVELER_TYPES } from "../travelers"
import { describe, expect, it } from "vitest"
import { BUILDING_KINDS } from "../buildings"
import { buildingYaw, rotateBuildingPoint, rotatedFootprint, type BuildingRotation } from "../building-rotation"
import { structureParts } from "../building-art/structure"
import { marketYardContains } from "../market-layout"
import { tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"
import { alignCart } from "./follow"
import { cartOffset } from "./assets"
import { cartPath, driveSegment, marketParking } from "./building-parking"
import { convoyBuildingsClear, convoyClear } from "./navigation"

function fixture(rotation: BuildingRotation = 0) {
  const building = { ...BUILDING_KINDS.market, ...rotatedFootprint(BUILDING_KINDS.market, rotation),
    id: "market", buildType: "market", x: 12, z: 12, rotation }
  const map: GameMap = { width: 30, depth: 30, tiles: Array(900).fill("grass"), buildings: [building] }
  const local = (x: number, z: number) => {
    const p = rotateBuildingPoint(x, z, rotation)
    return { x: tileToWorldX(map, building.x) + 1.5 + p.x, z: tileToWorldZ(map, building.z) + 1.5 + p.z }
  }
  return { map, building, local }
}

describe("market cart yard", () => {
  it.each([0, 1, 2, 3] as const)("parks the entire convoy behind the stall at rotation %s", rotation => {
    for (const puller of ["hand", "donkey", "horse"] as const) {
      const { map, building, local } = fixture(rotation), wheelbase = -cartOffset(puller) * 1.5
      const initial = alignCart(local(-5, -1), Math.PI / 2 + buildingYaw(rotation), wheelbase)
      const plan = marketParking(map, building, initial, puller, 1.5, { trees: [] })
      expect(plan).not.toBeNull()
      let pose = initial
      for (const point of plan!.entry.slice(1)) {
        const next = driveSegment(pose, point, wheelbase, (p, heading) =>
          convoyClear(map, p, puller, 1.5, false, heading) && convoyBuildingsClear(map, p, puller, 1.5, heading))
        expect(next).not.toBeNull()
        pose = next!
      }
      expect(pose).toEqual(plan!.parked)
      expect(marketYardContains(building, { x: pose.x + 14.5, z: pose.z + 14.5 })).toBe(true)
      expect(marketYardContains(building, { x: pose.hitch.x + 14.5, z: pose.hitch.z + 14.5 })).toBe(true)
    }
  })

  it("rejects occupied bays and old stalls without space for a cart", () => {
    const { map, building, local } = fixture(), initial = alignCart(local(-5, -1), Math.PI / 2, -cartOffset("horse") * 1.5)
    const blocked = { trees: [], obstacles: [{ ...local(0, -1), heading: 0, halfWidth: 2, halfLength: 1 }] }
    expect(marketParking(map, building, initial, "horse", 1.5, blocked)).toBeNull()
    expect(marketParking(map, { ...building, w: 2, d: 2 }, initial, "horse", 1.5, { trees: [] })).toBeNull()
  })

  it("leaves the yard open to the sky with a rear hitching rail", () => {
    const { building } = fixture(), parts = structureParts(building)
    expect(parts.some(p => p.name === "cart-yard")).toBe(true)
    expect(parts.some(p => p.name === "hitching-rail")).toBe(true)
    for (const roof of parts.filter(p => p.layer === "roof")) {
      const zs = roof.vertices ? roof.vertices.filter((_, i) => i % 3 === 2).map(z => z + roof.position[2])
        : [roof.position[2] - (roof.size?.[2] ?? 0) / 2]
      expect(Math.min(...zs)).toBeGreaterThanOrEqual(-.05)
    }
  })
})

describe("cart building collisions", () => {
  it.each([[1, .1], [-1, .1], [1, 1.25], [-1, 1.25]] as const)(
    "passes a building with pedestrians on the approach in direction %s with dt %s", (direction, dt) => {
    const { map } = fixture()
    map.road = Array.from({ length: 30 }, (_, x) => ({ x, z: 4 }))
    for (const p of map.road) map.tiles[p.z * map.width + p.x] = "path"
    map.buildings[0] = { ...map.buildings[0], buildType: "tavern", x: 13, z: 3, w: 2, d: 3 }
    const travelers = generateTravelers(1, 2)
    const start = direction === 1 ? 7 : 20
    Object.assign(travelers[0], { id: 8, type: TRAVELER_TYPES.vendor, direction, offset: start / 29, pace: 1 })
    Object.assign(travelers[1], { id: 1, type: TRAVELER_TYPES.peasant, direction, offset: (start - direction) / 29, pace: 1 })
    for (const t of travelers) Object.assign(t.attributes, { piety: 0, hunger: 100, thirst: 100, stamina: 100 })
    const sim = createSim(travelers, map), s = sim.travelers.get(8)!
    s.timer = 10000
    let diverted = false
    for (let i = 0; i < Math.ceil(50 / dt); i++) {
      stepSim(sim, travelers, map, 1, dt)
      expect(convoyBuildingsClear(map, s.cartPose!, "horse", 1.5)).toBe(true)
      diverted ||= !!s.roadShortcut
      if (diverted && !s.roadShortcut) break
    }
    expect(diverted).toBe(true)
    expect(direction * (s.progress - 14)).toBeGreaterThan(0)
    expect(s.roadShortcut).toBeUndefined()
  })

  it.each([[1, .1, 8], [-1, .1, 26], [1, 1.25, 8], [-1, 1.25, 26], [1, .1, 16.2], [-1, .1, 15.8]] as const)(
    "passes a tavern on the inside of a road bend in direction %s with dt %s from %s", (direction, dt, start) => {
    const { map } = fixture()
    map.road = [
      ...Array.from({ length: 17 }, (_, x) => ({ x, z: 11 })),
      ...Array.from({ length: 18 }, (_, z) => ({ x: 16, z: z + 12 })),
    ]
    for (const p of map.road) map.tiles[p.z * map.width + p.x] = "path"
    map.buildings[0] = { ...map.buildings[0], buildType: "tavern", x: 13, z: 12, w: 3, d: 3 }
    const traveler = generateTravelers(1, 1)[0]
    Object.assign(traveler, { id: 8, type: TRAVELER_TYPES.vendor, direction, offset: start / 34, pace: 1 })
    Object.assign(traveler.attributes, { piety: 0, hunger: 100, thirst: 100, stamina: 100 })
    const sim = createSim([traveler], map), s = sim.travelers.get(8)!
    s.timer = 10000
    for (let i = 0; i < Math.ceil(35 / dt); i++) {
      stepSim(sim, [traveler], map, 1, dt)
      expect(convoyBuildingsClear(map, s.cartPose!, "horse", 1.5)).toBe(true)
      if (direction * (s.progress - 16) > 8) break
    }
    expect(direction * (s.progress - 16)).toBeGreaterThan(8)
    expect(s.roadShortcut).toBeUndefined()
  })

  it("finds buildings beside a long convoy's axle and observes in-place footprint moves", () => {
    const { map } = fixture()
    map.buildings[0] = { ...map.buildings[0], buildType: "tavern", x: 13, z: 12, w: 2, d: 3 }
    const pose = alignCart({ x: 8, z: 0 }, Math.PI / 2, 8)
    expect(convoyBuildingsClear(map, pose, "horse", 1.5)).toBe(false)
    map.buildings[0].z += 15
    expect(convoyBuildingsClear(map, pose, "horse", 1.5)).toBe(true)
    map.buildings[0].z -= 15
    expect(convoyBuildingsClear(map, pose, "horse", 1.5)).toBe(false)
  })

  it.each([1, -1] as const)("keeps the simulated horse and cart outside buildings while detouring in direction %s", direction => {
    const { map } = fixture()
    map.road = Array.from({ length: 30 }, (_, x) => ({ x, z: 4 }))
    for (const p of map.road) map.tiles[p.z * map.width + p.x] = "path"
    map.buildings[0] = { ...map.buildings[0], buildType: "tavern", x: 13, z: 3, w: 2, d: 3 }
    const traveler = generateTravelers(1, 1)[0]
    Object.assign(traveler, { id: 8, type: TRAVELER_TYPES.vendor, direction, offset: (direction === 1 ? 7 : 20) / 29, pace: 1 })
    Object.assign(traveler.attributes, { piety: 0, hunger: 100, thirst: 100, stamina: 100 })
    const sim = createSim([traveler], map), s = sim.travelers.get(8)!
    s.timer = 10000
    let diverted = false
    for (let i = 0; i < 500; i++) {
      stepSim(sim, [traveler], map, 1, .1)
      expect(s.cartPose).toBeDefined()
      expect(convoyBuildingsClear(map, s.cartPose!, "horse", 1.5)).toBe(true)
      diverted ||= !!s.roadShortcut
      if (diverted && !s.roadShortcut) break
    }
    expect(diverted).toBe(true)
    expect(s.roadShortcut).toBeUndefined()
    expect(direction * (s.progress - 14)).toBeGreaterThan(0)
  })

  it("routes a horse and trailing cart around a building without entering it", () => {
    const { map } = fixture()
    map.buildings[0] = { ...map.buildings[0], buildType: "tavern", x: 13, z: 12, w: 2, d: 3 }
    const initial = alignCart({ x: -5, z: -1 }, Math.PI / 2, -cartOffset("horse") * 1.5)
    const goal = { x: 5, z: -1 }
    expect(driveSegment(initial, goal, -cartOffset("horse") * 1.5,
      p => convoyBuildingsClear(map, p, "horse", 1.5))).toBeNull()
    const route = cartPath(map, initial, goal, "horse", 1.5, { trees: [] })
    expect(route).not.toBeNull()
    let pose = initial
    for (const point of route!.entry.slice(1)) {
      const next = driveSegment(pose, point, -cartOffset("horse") * 1.5,
        (p, heading) => convoyBuildingsClear(map, p, "horse", 1.5, heading))
      expect(next).not.toBeNull()
      pose = next!
    }
  })
})
