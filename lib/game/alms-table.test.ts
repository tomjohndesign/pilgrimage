import { createSettlement, purchaseStructure, settlementMap } from "./settlement"
import { generateMonks } from "./monks"
import { generateRelic } from "./relic"
import { captureSettlement, restoreSettlement } from "./save/settlement"
import { afterEach, describe, expect, it } from "vitest"
import { BUILD_CATALOG } from "./balance"
import { almsAccess, almsRegistry, almsStaffed, breadVisitPlan, stepMonkAlms, type AlmsMonk } from "./alms-table"
import { buildingApproaches } from "./building-rotation"
import { churchWingGates, churchAdditionError } from "./church-additions"
import { buildingStepAllowed, containsTile } from "./building-navigation"
import { placementBuildingLayout, placementRoofRotation, placementClearance } from "./building-placement-layout"
import { createMonkNeeds, MONK_TIRED_AT } from "./monk-work"
import { createSim, stepSim } from "./sim"
import { captureSimulation, restoreSimulation } from "./save/simulation"
import { TRAVELER_TYPES, type Traveler } from "./travelers"
import type { BuildingDef, GameMap } from "./map/types"

function setup(count = 1) {
  const table: BuildingDef = { ...BUILD_CATALOG.find(b => b.id === "alms-table")!, id: "bread", buildType: "alms-table", x: 13, z: 4, rotation: 0, layoutSeed: 0 }
  const map: GameMap = { width: 24, depth: 12, tiles: Array(288).fill("grass"), buildings: [{ id: "chapel", label: "Chapel", x: 10, z: 3, w: 2, d: 2, height: .9, color: "tan", roofColor: "brown" }, table],
    site: { hovelId: "chapel", door: { x: 11, z: 5 }, branch: [{ x: 11, z: 7 }, { x: 11, z: 6 }, { x: 11, z: 5 }], junction: 11 },
    road: Array.from({ length: 24 }, (_, x) => ({ x, z: 7 })) }
  for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
  const access = almsAccess(map, table, true)
  const monk: AlmsMonk = { ...createMonkNeeds(1), ...access.stand, activity: "keepingAlms", route: [], pause: 0,
    destination: "grounds", outings: 0, prayerSpot: undefined,
    almsDuty: { tableId: table.id, map, stand: access.stand, heading: access.heading } }
  almsRegistry.current = { road: map.road, monks: [monk] }
  const travelers: Traveler[] = Array.from({ length: count }, (_, id) => ({ id, name: `Walker ${id}`, type: TRAVELER_TYPES.peasant,
    attributes: { happiness: 80, gold: 0, status: 50, hunger: 5, thirst: 100, piety: 0, stamina: 80, jobless: false, skills: [], age: 30 },
    offset: .5, direction: 1, pace: 1 }))
  const sim = createSim(travelers, map), state = sim.travelers.get(0)!
  Object.assign(sim.balance.rules, { hungerDecay: 0, thirstDecay: 0, staminaDecay: 0, happinessDecay: 0 })
  const tick = (dt = .1) => stepSim(sim, travelers, map, 1, dt)
  const until = (condition: () => boolean) => {
    for (let i = 0; i < 2000 && !condition(); i++) tick()
    expect(condition(), JSON.stringify({ activity: state.activity, pos: [state.x, state.z], route: state.offRoadRoute })).toBe(true)
  }
  return { map, table, monk, sim, state, travelers, tick, until }
}
afterEach(() => { almsRegistry.current = null })

describe("monk-served bread", () => {
  it("draws a penniless traveler, serves 40 food and returns to the road", () => {
    const { state, tick, until } = setup()
    tick(); expect(state.activity).toBe("toBread")
    expect(state.enclaveVisitPending).toBe(true)
    until(() => state.activity === "receivingBread")
    const before = [state.happiness, state.gold, state.thirst, state.stamina]
    tick(2); expect(state.hunger).toBe(5)
    tick(2); expect(state.hunger).toBe(45)
    expect([state.happiness, state.gold, state.thirst, state.stamina]).toEqual(before)
    until(() => state.activity === "walking")
    expect(state.breadVisit).toBeUndefined()
  })

  it("caps food at half full and never serves while paused", () => {
    const { state, tick, until } = setup()
    state.hunger = 40
    tick(0); expect(state.activity).toBe("walking")
    until(() => state.activity === "receivingBread")
    tick(0); expect(state.hunger).toBe(40)
    tick(4); expect(state.hunger).toBe(50)
  })

  it("remembers the daily serving and assigned monk jobs through save/reload", () => {
    const { sim, state, map, travelers, tick, until } = setup()
    until(() => state.activity === "receivingBread"); tick(4)
    sim.monkJobs = { 0: "builder", 1: "keeper", 2: "almoner" }
    const restored = createSim(travelers, map)
    restoreSimulation(restored, captureSimulation(sim, "sprites"), travelers, map)
    expect(restored.monkJobs).toEqual(sim.monkJobs)
    expect(restored.travelers.get(0)!.lastBreadDay).toBe(0)
    state.activity = "walking"; state.breadVisit = undefined; state.breadRetry = 0; state.hunger = 5
    tick(); expect(state.breadVisit).toBeUndefined()
    sim.time = 1; state.breadRetry = 0
    tick(); expect(state.activity).toBe("toBread")
  })

  it.each(["absent", "walking", "sleeping", "unfinished", "other world"])("does not serve when the monk/table is %s", reason => {
    const { monk, state, table, tick, map } = setup()
    if (reason === "absent") almsRegistry.current = null
    if (reason === "walking") monk.activity = "toAlmsTable"
    if (reason === "sleeping") monk.activity = "sleeping"
    if (reason === "unfinished") table.construction = { work: 0, required: 10 }
    if (reason === "other world") almsRegistry.current!.road = [...map.road!]
    tick(); expect(state.breadVisit).toBeUndefined(); expect(state.hunger).toBe(5)
  })

  it.each(["rest", "removed"])("cancels a serving when its monk needs %s", reason => {
    const { state, monk, map, tick, until } = setup()
    until(() => state.activity === "receivingBread")
    if (reason === "rest") monk.activity = "sleeping"
    else map.buildings = []
    tick(); expect(state.activity).toBe("fromBread"); expect(state.hunger).toBe(5)
    until(() => state.activity === "walking")
  })

  it.each(["rest", "demolition"])("returns safely if service closes for %s while a visitor is approaching", reason => {
    const { state, monk, map, tick, until } = setup()
    tick(); tick()
    expect(state.activity).toBe("toBread")
    if (reason === "rest") monk.activity = "sleeping"
    else map.buildings = map.buildings.filter(b => b.buildType !== "alms-table")
    tick(); expect(state.activity).toBe("fromBread")
    expect(state.offRoadRoute?.length).toBeGreaterThan(0)
    until(() => state.activity === "walking")
    expect(state.hunger).toBe(5)
  })

  it("reserves one visitor per table", () => {
    const { sim, tick } = setup(2)
    tick(); expect([...sim.travelers.values()].filter(s => s.breadVisit)).toHaveLength(1)
  })

  it("returns a resident to their existing job", () => {
    const { state, tick, until } = setup()
    state.employer = "workplace"; state.activity = "idle"
    tick(); expect(state.activity).toBe("toBread")
    until(() => state.activity === "receivingBread"); tick(4)
    until(() => state.activity === "idle")
    expect(state.employer).toBe("workplace")
  })

  it.each(["toRelic", "fromRelic"] as const)("resumes the reserved %s visit", activity => {
    const { state, tick, until, map } = setup()
    state.activity = activity; state.shrineRoute = map.site!.branch; state.branchProgress = .5; state.shrineSeat = "queue-0"
    const departure = { x: state.x, z: state.z }
    until(() => state.activity === "receivingBread"); tick(4)
    until(() => state.activity === activity)
    expect({ x: state.x, z: state.z }).toEqual(departure)
    expect(state.branchProgress).toBe(.5); expect(state.shrineSeat).toBe("queue-0")
  })

  it.each([0, 1, 2, 3] as const)("walks directly to a standalone table at rotation %i", rotation => {
    const { map, table, state, monk } = setup()
    table.rotation = rotation
    const customer = almsAccess(map, table)
    expect(buildingApproaches(map, table)).toEqual([customer.entry])
    const plan = breadVisitPlan(map, table, state, state)!
    expect(plan).not.toBeNull()
    expect(plan.route.at(-1)).toEqual(customer.stand)
    const tiles = plan.route.map(p => ({ x: p.x + map.width / 2 - .5, z: p.z + map.depth / 2 - .5 }))
    expect(tiles.some(p => containsTile(map.buildings[0], p))).toBe(false)
    for (let i = 1; i < tiles.length; i++) expect(buildingStepAllowed(map, map.buildings, tiles[i - 1], tiles[i], true)).toBe(true)
    monk.almsDuty = undefined; monk.x = state.x; monk.z = state.z; monk.activity = "walking"
    for (let i = 0; i < 400 && !["keepingAlms"].includes(monk.activity); i++) stepMonkAlms(monk, map, 1, .1, [monk], false)
    expect(monk.activity).toBe("keepingAlms")
  })

  it.each([0, 1, 2, 3] as const)("allows ordinary detached placement and retains rotation %i", rotation => {
    const { map, table } = setup()
    map.buildings = map.buildings.filter(b => b.id !== table.id)
    const candidate = { ...table, x: 7, z: 4, rotation }
    expect(churchAdditionError(map, candidate)).toBeNull()
    expect(placementClearance(map, candidate)).toBeNull()
    expect(placementBuildingLayout(map, candidate).churchId).toBeUndefined()
    const def = BUILD_CATALOG.find(b => b.id === "alms-table")!
    expect(placementRoofRotation(map, def, candidate, rotation)).toBe(rotation)
    const result = purchaseStructure(createSettlement(), map, generateMonks(1), [generateRelic(1)], def.id, candidate, undefined, 0, rotation)
    expect(result.error).toBeNull()
    expect(result.settlement.structures[0]).toMatchObject({ x: 7, z: 4, rotation })
    expect(result.settlement.structures[0].churchId).toBeUndefined()
    expect(placementClearance(map, { ...candidate, x: map.buildings[0].x, z: map.buildings[0].z })).not.toBeNull()
  })

  it("serves bread without any church on the map", () => {
    const { map, table, state, tick, until } = setup()
    map.site = undefined; map.buildings = [table]
    until(() => state.activity === "receivingBread"); tick(4)
    expect(state.hunger).toBe(45)
  })

  it("removes old church attachments from existing and saved tables", () => {
    const { map, table } = setup()
    table.churchId = "chapel"
    expect(churchWingGates(map)).toEqual([])
    const base = { ...map, buildings: map.buildings.filter(b => b.id !== table.id) }
    const settlement = { ...createSettlement(), structures: [table] }
    expect(settlementMap(base, settlement).buildings.find(b => b.id === table.id)!.churchId).toBeUndefined()
    const save = captureSettlement(settlement)
    expect(save.structures[0].churchId).toBeUndefined()
    save.structures[0].churchId = "chapel"
    const restored = restoreSettlement(base, save).structures[0]
    expect(restored.churchId).toBeUndefined()
    expect([restored.x, restored.z]).toEqual([table.x, table.z])
  })

  it("walks a free monk to the rear, opens on arrival, and releases his post for rest", () => {
    const { map, monk } = setup()
    monk.almsDuty = undefined; monk.x += 3; monk.activity = "walking"
    stepMonkAlms(monk, map, 1, .1, [monk], false)
    expect(monk.activity).toBe("toAlmsTable"); expect(almsStaffed(map, "bread")).toBe(false)
    for (let i = 0; i < 300 && !almsStaffed(map, "bread"); i++) stepMonkAlms(monk, map, 1, .1, [monk], false)
    expect(almsStaffed(map, "bread")).toBe(true)
    monk.stamina = MONK_TIRED_AT
    expect(stepMonkAlms(monk, map, 1, .1, [monk], false)).toBe(false)
    expect(monk.almsDuty).toBeUndefined(); expect(almsStaffed(map, "bread")).toBe(false)
  })
})
