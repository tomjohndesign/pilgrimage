import { describe, expect, it } from "vitest"
import { createRelicProcession, nearProcession, processionGrounds, relicIsCarried, startProcession, stepProcession } from "./relic-procession"
import { createSim, stepSim } from "./sim"
import { generateTravelers, TRAVELER_TYPES } from "./travelers"
import { worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import { buildingStepAllowed } from "./building-navigation"
import { admissionFee, shrineVisitRoute } from "./shrine-visit"

function fixture() {
  const map: GameMap = { width: 15, depth: 15, tiles: Array(225).fill("grass"), seed: 1,
    buildings: [{ id: "shrine", x: 6, z: 6, w: 3, d: 3, height: 1, label: "Shrine", color: "", roofColor: "" }],
    site: { hovelId: "shrine", door: { x: 7, z: 9 }, junction: 7, branch: [{ x: 7, z: 10 }, { x: 7, z: 9 }] },
    road: Array.from({ length: 15 }, (_, x) => ({ x, z: 10 })) }
  const grounds = processionGrounds(map)!
  const actor = { ...grounds.door }, p = createRelicProcession()
  const pick = () => grounds.wander.spots.at(-1)!
  return { map, grounds, actor, p, pick }
}

describe("relic procession", () => {
  it("collects from every shrine prayer spot and keeps procession routes on the grid", () => {
    const { map, grounds, pick } = fixture()
    for (const spot of grounds.wander.prayerSpots) {
      const actor = { ...spot }, p = createRelicProcession()
      expect(startProcession(p, 0, actor, grounds)).toBe(true)
      let completed = false
      for (let tick = 0; tick < 2000; tick++) {
        const from = { x: worldToTileX(map, actor.x), z: worldToTileZ(map, actor.z) }
        const exit = stepProcession(p, actor, grounds, 0.1, 0.4, pick)
        const to = { x: worldToTileX(map, actor.x), z: worldToTileZ(map, actor.z) }
        const tx = actor.x + map.width / 2 - 0.5, tz = actor.z + map.depth / 2 - 0.5
        expect(Math.min(Math.abs(tx - Math.round(tx)), Math.abs(tz - Math.round(tz)))).toBeLessThan(1e-8)
        if (from.x !== to.x || from.z !== to.z) expect(buildingStepAllowed(map, map.buildings, from, to, true)).toBe(true)
        if (exit) { completed = true; break }
      }
      expect(completed).toBe(true)
    }
  })

  it("collects one relic through the gate, walks, and returns it to the table", () => {
    const { grounds, actor, p, pick } = fixture()
    expect(startProcession(p, 0, actor, grounds)).toBe(true)
    expect(startProcession(p, 1, actor, grounds)).toBe(false)
    expect(relicIsCarried(p)).toBe(false)
    const stages = new Set([p.stage])
    let exit = null, distance = 0, carriedDistance = 0
    for (let tick = 0; tick < 2000 && !exit; tick++) {
      const x = actor.x, z = actor.z, carrying = p.stage === "carrying"
      exit = stepProcession(p, actor, grounds, 0.1, 0.4, pick)
      const moved = Math.hypot(actor.x - x, actor.z - z)
      expect(moved).toBeLessThanOrEqual(0.0400001)
      distance += moved
      if (carrying) carriedDistance += moved
      stages.add(p.stage)
    }
    expect([...stages]).toEqual(["approaching", "lifting", "carrying", "returning", "lowering", "idle"])
    expect(distance).toBeGreaterThan(5)
    expect(carriedDistance).toBeGreaterThan(3)
    expect(actor).toEqual(grounds.altar)
    expect(exit).toEqual(grounds.wander.route(actor, pick()))
    expect(p.monkId).toBeNull()
    expect(relicIsCarried(p)).toBe(false)
    expect(startProcession(p, 0, actor, grounds)).toBe(true)
  })

  it("holds the entire pose on pause and honors an early return", () => {
    const { grounds, actor, p, pick } = fixture()
    startProcession(p, 0, actor, grounds)
    while (p.stage !== "carrying") stepProcession(p, actor, grounds, 0.1, 0.4, pick)
    const before = structuredClone({ p, actor })
    stepProcession(p, actor, grounds, 0, 0.4, pick, true)
    expect({ p, actor }).toEqual(before)
    stepProcession(p, actor, grounds, 0.1, 0.4, pick, true)
    expect(["returning", "lowering"]).toContain(p.stage)
  })

  it("limits prayer to nearby ground and releases people as the relic passes", () => {
    const { p } = fixture()
    Object.assign(p, { stage: "carrying", position: { x: 0, y: 0, z: 0 } })
    expect(nearProcession(p, { x: 2, y: 0, z: 0 })).toBe(true)
    expect(nearProcession(p, { x: 4, y: 0, z: 0 })).toBe(false)
    expect(nearProcession(p, { x: 0, y: 2, z: 0 })).toBe(false)
    expect(nearProcession(p, { x: 3.2, y: 0, z: 0 }, true)).toBe(true)
    p.stage = "idle"
    expect(nearProcession(p, { x: 0, y: 0, z: 0 }, true)).toBe(false)
  })

  it("pauses travelers and loaded workers without losing their work or road progress", () => {
    const { map, p } = fixture()
    const travelers = generateTravelers(1, 2)
    const sim = createSim(travelers, map)
    sim.procession = p
    const s = sim.travelers.get(travelers[0].id)!
    Object.assign(p, { stage: "carrying", position: { x: s.x, y: s.y, z: s.z } })
    const progress = s.progress, activity = s.activity, x = s.x
    stepSim(sim, travelers, map, 0.4, 0.1)
    expect(s.praying).toBe(true)
    expect(s.progress).toBe(progress)
    expect(s.x).toBe(x)
    expect(s.activity).toBe(activity)
    p.stage = "idle"
    stepSim(sim, travelers, map, 0.4, 0.1)
    expect(s.praying).toBe(false)
    expect(s.progress).not.toBe(progress)
    Object.assign(s, { activity: "hauling", carrying: 5, tree: 3 })
    Object.assign(p, { stage: "carrying", position: { x: s.x, y: s.y, z: s.z } })
    stepSim(sim, travelers, map, 0.4, 0.1)
    expect(s.praying).toBe(true)
    expect(s.carrying).toBe(5)
    expect(s.tree).toBe(3)
    expect(s.activity).toBe("hauling")
  })

  it("pauses a merchant's shop routine and resumes at the same point after prayer", () => {
    const { map, p } = fixture()
    const travelers = generateTravelers(1, 1).map(t => ({ ...t, type: TRAVELER_TYPES.vendor }))
    const sim = createSim(travelers, map), merchant = sim.travelers.get(travelers[0].id)!
    sim.procession = p
    Object.assign(merchant, { activity: "vending", keeperTime: 4.5, timer: 20 })
    Object.assign(p, { stage: "carrying", position: { x: merchant.x, y: merchant.y, z: merchant.z } })
    stepSim(sim, travelers, map, 0.4, 0.1)
    expect(merchant.praying).toBe(true)
    expect(merchant.activity).toBe("vending")
    expect(merchant.keeperTime).toBe(4.5)
    expect(merchant.timer).toBe(20)
    p.stage = "idle"
    stepSim(sim, travelers, map, 0.4, 0.1)
    expect(merchant.praying).toBe(false)
    expect(merchant.activity).toBe("vending")
    expect(merchant.keeperTime).toBeCloseTo(4.6)
    expect(merchant.timer).toBeCloseTo(19.9)
  })

  it("preserves admission and paid visit time when a procession interrupts a visitor", () => {
    const { map, p } = fixture(), travelers = generateTravelers(1, 1)
    const sim = createSim(travelers, map), visitor = sim.travelers.get(travelers[0].id)!
    const route = shrineVisitRoute(map, visitor.id, 0)!
    Object.assign(visitor, { activity: "toRelic", shrineRoute: route, branchProgress: route.length - 1,
      gold: 10, hunger: 100, thirst: 100, stamina: 100 })
    sim.procession = p
    const pray = () => Object.assign(p, { stage: "carrying", position: { x: visitor.x, y: visitor.y, z: visitor.z } })
    pray()
    stepSim(sim, travelers, map, 0.4, 0.1)
    expect(visitor.praying).toBe(true)
    expect(visitor.gold).toBe(10)
    expect(sim.admissionPayments).toHaveLength(0)
    p.stage = "idle"
    stepSim(sim, travelers, map, 0.4, 0.1)
    expect(visitor.activity).toBe("visiting")
    expect(visitor.gold).toBe(10 - admissionFee(map))
    expect(sim.admissionPayments).toHaveLength(1)
    const timer = visitor.timer
    pray()
    stepSim(sim, travelers, map, 0.4, 0.1)
    expect(visitor.timer).toBe(timer)
    expect(visitor.admissionPaid).toBe(admissionFee(map))
    p.stage = "idle"
    stepSim(sim, travelers, map, 0.4, 0.1)
    expect(visitor.timer).toBeCloseTo(timer - 0.1)
    expect(visitor.gold).toBe(10 - admissionFee(map))
    expect(sim.shrineGold).toBe(admissionFee(map))
    expect(sim.admissionPayments).toHaveLength(1)
  })
})
