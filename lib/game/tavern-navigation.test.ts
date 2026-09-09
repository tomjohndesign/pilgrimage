import { describe, expect, it } from "vitest"
import { BUILD_CATALOG } from "./balance"
import { rotatedFootprint, type BuildingRotation, buildingEntry, rotateBuildingPoint } from "./building-rotation"
import { tavernLayout, tavernLocalPoint, tavernSegmentClear, tavernWorkStop } from "./tavern-layout"
import { tavernInteriorRoute, tavernWalkingRoute, tavernWorldPoint } from "./tavern-navigation"
import { servingCounter, tavernSeats, tavernVisitPlan } from "./tavern"
import { buildingStepAllowed } from "./building-navigation"
import { createSim, stepSim } from "./sim"
import { townResidents } from "./town-residents"
import { TRAVELER_TYPES } from "./travelers"
import { type GameMap, type TilePos, tileToWorldX, tileToWorldZ } from "./map/types"

function fixture(rotation: BuildingRotation = 0) {
  const def = BUILD_CATALOG.find(b => b.id === "tavern")!
  const tavern = { ...def, id: "tavern", townId: "town", buildType: "tavern", x: 10, z: 10,
    ...rotatedFootprint(def, rotation), rotation }
  const house = { ...BUILD_CATALOG.find(b => b.id === "house")!, id: "house", townId: "town", buildType: "house", x: 5, z: 5 }
  const map: GameMap = { width: 30, depth: 30, tiles: Array(900).fill("grass"), buildings: [tavern, house],
    road: Array.from({ length: 30 }, (_, x) => ({ x, z: 20 })),
    towns: [{ id: "town", name: "Hazelwick", junction: 11, tavernId: "tavern", buildingIds: ["tavern", "house"] }] }
  const local = (p: TilePos) => tavernLocalPoint(tavern, { x: p.x + map.width / 2 - .5, z: p.z + map.depth / 2 - .5 })
  return { map, tavern, local }
}

describe("tavern aisles", () => {
  it("serves a road traveler while both keepers are walking inside, then seats them and lets them leave", () => {
    const { map, local } = fixture()
    const people = townResidents(map).map(r => r.traveler), sim = createSim(people, map)
    for (let tick = 0; tick < 400 && ![...sim.travelers.values()].every(s => s.activity === "toPost"); tick++) {
      stepSim(sim, people, map, 1, .05)
    }
    expect([...sim.travelers.values()].every(s => s.activity === "toPost")).toBe(true)
    const traveler = { ...people[0], id: 7, type: TRAVELER_TYPES.peasant, offset: 11 / 29,
      attributes: { ...people[0].attributes, hunger: 40, thirst: 40, gold: 20 } }
    const customer = createSim([traveler], map).travelers.get(traveler.id)!
    sim.travelers.set(traveler.id, customer)
    people.push(traveler)
    stepSim(sim, people, map, 1, .05)
    expect(customer.activity).toBe("toTavern")
    const obstacles = tavernLayout(3, 4).obstacles
    let seated = false
    for (let tick = 0; tick < 2400 && customer.tavernVisit; tick++) {
      const before = { x: customer.x, z: customer.z }, seat = customer.tavernVisit.plan.seat!
      stepSim(sim, people, map, 1, .05)
      expect(tavernSegmentClear(obstacles, local(before), local(customer), seat.id),
        JSON.stringify({ tick, from: local(before), to: local(customer), activity: customer.activity })).toBe(true)
      if (customer.activity === "sitting") seated = true
    }
    expect(seated).toBe(true)
    expect(customer.tavernVisit).toBeUndefined()
    expect(customer.gold).toBe(15)
    expect(customer.activity).toBe("walking")
  })

  it.each([0, 1, 2, 3] as const)("reaches every bench and both doors without crossing furniture at rotation %s", rotation => {
    const { map, tavern, local } = fixture(rotation), counter = servingCounter(map, tavern)
    const { obstacles } = tavernLayout(3, 4)
    for (const seat of tavernSeats(map, tavern)) {
      const route = tavernWalkingRoute(map, counter.point, seat.point, seat.id)
      expect(route).toBeTruthy()
      for (let i = 1; i < route!.length; i++) {
        expect(tavernSegmentClear(obstacles, local(route![i - 1]), local(route![i]), i === route!.length - 1 ? seat.id : undefined)).toBe(true)
      }
      expect(route!.at(-1)!.x).toBeCloseTo(seat.point.x)
      expect(route!.at(-1)!.z).toBeCloseTo(seat.point.z)
      for (const side of [1, -1] as const) {
        const door = buildingEntry(tavern, false, side)
        const outside = { x: tileToWorldX(map, door.x), y: 0.2, z: tileToWorldZ(map, door.z) }
        const exit = tavernWalkingRoute(map, seat.point, outside)
        expect(exit).toBeTruthy()
        for (let i = 1; i < exit!.length; i++) expect(tavernSegmentClear(obstacles, local(exit![i - 1]), local(exit![i]), i === 1 ? seat.id : undefined)).toBe(true)
        expect(tavernVisitPlan(map, tavern, door)).not.toBeNull()
      }
    }
  })

  it.each([0, 1, 2, 3] as const)("blocks coarse tile routes and diagonals across tables at rotation %s", rotation => {
    const { map, tavern } = fixture(rotation)
    const tile = (x: number, z: number) => {
      const p = rotateBuildingPoint(x, z, rotation)
      return { x: tavern.x + (tavern.w - 1) / 2 + p.x, z: tavern.z + (tavern.d - 1) / 2 + p.z }
    }
    expect(buildingStepAllowed(map, map.buildings, tile(-1.35, .88), tile(0, .88), true)).toBe(false)
    expect(buildingStepAllowed(map, map.buildings, tile(0, -.2), tile(0, .2), true)).toBe(true)
    expect(tavernInteriorRoute(tavern, { x: 0, z: 0 }, { x: -.69, z: .88 })).toBeNull()
  })

  it.each([0, 1, 2, 3] as const)("keeps workers walking through clear aisles with their jobs intact at rotation %s", rotation => {
    const { map, tavern, local } = fixture(rotation)
    const residents = townResidents(map), people = residents.map(r => r.traveler), sim = createSim(people, map)
    const obstacles = tavernLayout(3, 4).obstacles, distance = [0, 0], pauses = [0, 0]
    for (let tick = 0; tick < 400; tick++) {
      const before = people.map(t => ({ ...sim.travelers.get(t.id)! }))
      stepSim(sim, people, map, 1, .05)
      people.forEach((t, i) => {
        const s = sim.travelers.get(t.id)!
        expect(s.employer).toBe("tavern")
        expect(["toPost", "posted"]).toContain(s.activity)
        expect(tavernSegmentClear(obstacles, local(before[i]), local(s))).toBe(true)
        distance[i] += Math.hypot(s.x - before[i].x, s.z - before[i].z)
        if (s.activity === "posted") pauses[i]++
      })
    }
    for (let i = 0; i < 2; i++) { expect(distance[i]).toBeGreaterThan(2); expect(pauses[i]).toBeGreaterThan(20) }
    for (let slot = 0; slot < 2; slot++) for (let stop = 0; stop < 4; stop++) {
      expect(tavernWalkingRoute(map, tavernWorldPoint(map, tavern, tavernWorkStop(slot, stop, 3, 4)), servingCounter(map, tavern).point)).toBeTruthy()
    }
  })
})
