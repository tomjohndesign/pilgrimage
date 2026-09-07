import { createMonkRoutine, stepMonkRoutine } from "./monk-routine"
import { tileToWorldX, tileToWorldZ } from "./map/types"
import { describe, expect, it, vi } from "vitest"
import { blessByProcession, PROCESSION_CHANCE, PROCESSION_COOLDOWN, createRelicProcession, nearProcession, processionGrounds, relicIsCarried, startAltarProcession, startProcession, stepProcession } from "./relic-procession"
import { createSim, stepSim } from "./sim"
import { generateTravelers, TRAVELER_TYPES } from "./travelers"
import { worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import { shrineFurnitureClear, buildingStepAllowed, containsTile } from "./building-navigation"
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
  it.each([0, 1, 2, 3])("collects behind the altar for shrine orientation %i", direction => {
    const { map } = fixture()
    const b = map.buildings[0]
    Object.assign(b, { w: direction % 2 ? 5 : 3, d: direction % 2 ? 3 : 5 })
    map.site!.door = [{ x: 7, z: 11 }, { x: 11, z: 7 }, { x: 7, z: 5 }, { x: 5, z: 7 }][direction]
    const grounds = processionGrounds(map)!
    const rear = [{ x: 7, z: 6 }, { x: 6, z: 7 }, { x: 7, z: 10 }, { x: 10, z: 7 }][direction]
    expect(grounds.altar.x).toBe(tileToWorldX(map, rear.x))
    expect(grounds.altar.z).toBe(tileToWorldZ(map, rear.z))
  })

  it("spontaneously hoists on a rear altar visit, parades, and leaves after returning", () => {
    const { grounds, p, pick } = fixture()
    p.cooldown = 0
    const index = grounds.wander.prayerSpots.indexOf(grounds.altar)
    const actor = createMonkRoutine(grounds.wander, index, () => .5)
    expect(startAltarProcession(p, index, actor, grounds, () => 0)).toBe(false)
    for (let tick = 0; tick < 1000 && p.stage === "idle"; tick++) {
      stepMonkRoutine(actor, grounds.wander, () => .5, .4, .1)
      startAltarProcession(p, index, actor, grounds, () => 0)
    }
    expect(p.stage).toBe("lifting")
    expect(p.monkId).toBe(index)
    expect(startAltarProcession(p, index + 1, actor, grounds, () => 0)).toBe(false)
    const stages = new Set([p.stage])
    let exit = null
    for (let tick = 0; tick < 2000 && !exit; tick++) {
      exit = stepProcession(p, actor, grounds, .1, .4, pick)
      stages.add(p.stage)
    }
    expect([...stages]).toEqual(["lifting", "carrying", "returning", "lowering", "idle"])
    expect(exit?.length).toBeGreaterThan(0)
    Object.assign(actor, { route: exit, pause: 0, destination: "grounds", activity: "walking" })
    expect(startAltarProcession(p, index, actor, grounds, () => 0)).toBe(false)
  })

  it("rolls only once per altar visit and respects the shared cooldown", () => {
    const { grounds, p } = fixture()
    const actor = createMonkRoutine(grounds.wander, 0, () => .5)
    Object.assign(actor, grounds.altar, { activity: "praying", destination: "prayer" })
    const rng = vi.fn(() => PROCESSION_CHANCE)
    expect(p.cooldown).toBe(PROCESSION_COOLDOWN)
    expect(startAltarProcession(p, 0, actor, grounds, rng)).toBe(false)
    expect(rng).not.toHaveBeenCalled()
    p.cooldown = 0
    actor.processionConsidered = false
    for (let frame = 0; frame < 600; frame++) expect(startAltarProcession(p, 0, actor, grounds, rng)).toBe(false)
    expect(rng).toHaveBeenCalledTimes(1)
    actor.processionConsidered = false
    expect(startAltarProcession(p, 0, actor, grounds, () => PROCESSION_CHANCE / 2)).toBe(true)
  })

  it.each([false, true])("follows a long winding branch and retraces it home (early return: %s)", early => {
    const { map } = fixture()
    map.road = Array.from({ length: 15 }, (_, x) => ({ x, z: 14 }))
    map.site!.branch = [
      ...Array.from({ length: 5 }, (_, x) => ({ x: 7 + x, z: 14 })),
      ...Array.from({ length: 4 }, (_, z) => ({ x: 11, z: 13 - z })),
      ...Array.from({ length: 4 }, (_, x) => ({ x: 10 - x, z: 10 })),
      map.site!.door,
    ]
    const grounds = processionGrounds(map)!, actor = { ...grounds.door }, p = createRelicProcession()
    const pick = () => grounds.door
    startProcession(p, 0, actor, grounds)
    const junction = grounds.branch.at(-1)!
    let reachedRoad = false, requested = false, carryingTime = 0, exit = null
    const visited: string[] = []
    for (let tick = 0; tick < 6000 && !exit; tick++) {
      if (p.stage === "carrying") {
        carryingTime += .1
        if (early && carryingTime > 80) requested = true
      }
      const before = { ...actor }
      exit = stepProcession(p, actor, grounds, .1, .1, pick, requested)
      expect(Math.hypot(actor.x - before.x, actor.z - before.z)).toBeLessThanOrEqual(.0100001)
      expect(Math.min(Math.abs(actor.x - before.x), Math.abs(actor.z - before.z))).toBeLessThan(1e-8)
      const tile = `${worldToTileX(map, actor.x)},${worldToTileZ(map, actor.z)}`
      if (tile !== visited.at(-1)) visited.push(tile)
      if (Math.hypot(actor.x - junction.x, actor.z - junction.z) < .001) reachedRoad = true
    }
    expect(exit?.length).toBeGreaterThan(0)
    expect(actor).toEqual(grounds.altar)
    expect(reachedRoad).toBe(!early)
    expect(carryingTime).toBeGreaterThan(45)
    const door = `${map.site!.door.x},${map.site!.door.z}`
    const outward = visited.slice(visited.indexOf(door, 1), visited.lastIndexOf(door) + 1)
    expect(outward.length).toBeGreaterThan(2)
    expect(outward).toEqual([...outward].reverse())
    expect(p.cooldown).toBe(PROCESSION_COOLDOWN)
  })

  it("blesses all occupations once per outing, caps piety, and emits only actual gains", () => {
    const { map, grounds, p } = fixture()
    const travelers = generateTravelers(1, Object.keys(TRAVELER_TYPES).length).map((t, i) => ({ ...t, type: Object.values(TRAVELER_TYPES)[i] }))
    const sim = createSim(travelers, map)
    sim.procession = p
    Object.assign(p, { stage: "carrying", position: grounds.door })
    for (const s of sim.travelers.values()) Object.assign(s, grounds.door, { piety: 20, gold: 0 })
    const last = sim.travelers.get(travelers.at(-1)!.id)!
    last.piety = 98
    stepSim(sim, travelers, map, .4, 0)
    expect(p.blessings).toHaveLength(0)
    stepSim(sim, travelers, map, .4, .1)
    for (const s of sim.travelers.values()) expect(s.piety).toBe(s === last ? 100 : 25)
    expect(p.blessings).toHaveLength(travelers.length)
    expect(p.blessings.at(-1)!.amount).toBe(2)
    for (let i = 0; i < 100; i++) stepSim(sim, travelers, map, .4, .1)
    expect(p.blessings).toHaveLength(travelers.length)
    p.position = { x: 100, y: 0, z: 100 }
    stepSim(sim, travelers, map, .4, .1)
    p.position = grounds.door
    for (const s of sim.travelers.values()) Object.assign(s, grounds.door)
    stepSim(sim, travelers, map, .4, .1)
    expect(p.blessings).toHaveLength(travelers.length)
    const monk = { ...grounds.door, piety: 80 }
    blessByProcession(p, `monk:${travelers[0].id}`, monk)
    expect(monk.piety).toBe(85)
    p.stage = "idle"
    startProcession(p, 0, grounds.door, grounds)
    Object.assign(p, { stage: "carrying", position: grounds.door })
    stepSim(sim, travelers, map, .4, .1)
    expect(sim.travelers.get(travelers[0].id)!.piety).toBe(30)
    expect(last.piety).toBe(100)
    expect(p.blessings.at(-1)!.id).toBe(p.blessingSequence)
  })

  it("leaves front and side altar worshippers praying", () => {
    const { grounds, p } = fixture()
    for (const [index, spot] of grounds.wander.prayerSpots.entries()) {
      if (spot === grounds.altar) continue
      const actor = createMonkRoutine(grounds.wander, index, () => .5)
      Object.assign(actor, spot, { activity: "praying", destination: "prayer" })
      expect(startAltarProcession(p, index, actor, grounds, () => 0)).toBe(false)
    }
  })

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
        expect(Math.min(Math.abs(tx * 2 - Math.round(tx * 2)), Math.abs(tz * 2 - Math.round(tz * 2)))).toBeLessThan(1e-8)
        if (containsTile(map.buildings[0], from) !== containsTile(map.buildings[0], to)) expect(buildingStepAllowed(map, map.buildings, from, to, true)).toBe(true)
        expect(shrineFurnitureClear(map.buildings[0], map.site!.door, { x: tx, z: tz }, { x: tx, z: tz })).toBe(true)
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
