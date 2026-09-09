import { describe, expect, it } from "vitest"
import { BUILD_CATALOG } from "../balance"
import { createSim, stepSim } from "../sim"
import { TRAVELER_TYPES, type Traveler } from "../travelers"
import { type BuildingDef, type GameMap } from "../map/types"
import { WATER_VISIT_SECONDS, waterVisitPlan } from "./navigation"

function setup(kind: "well" | "watering-hole" = "well", count = 1) {
  const def = BUILD_CATALOG.find(b => b.id === kind)!
  const source: BuildingDef = { ...def, id: "water", buildType: kind, x: 10, z: 3 }
  const map: GameMap = { width: 24, depth: 12, tiles: Array(24 * 12).fill("grass"), buildings: [source],
    road: Array.from({ length: 24 }, (_, x) => ({ x, z: 7 })) }
  for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
  const travelers: Traveler[] = Array.from({ length: count }, (_, id) => ({ id, name: `Walker ${id}`, type: TRAVELER_TYPES.peasant,
    attributes: { happiness: 80, gold: 0, status: 50, hunger: 80, thirst: 5, piety: 0, stamina: 80, jobless: false, skills: [], age: 30 },
    offset: .5, direction: 1, pace: 1 }))
  const sim = createSim(travelers, map)
  Object.assign(sim.balance.rules, { thirstDecay: 0, hungerDecay: 0, staminaDecay: 0 })
  const state = sim.travelers.get(0)!
  const tick = (dt = .1) => stepSim(sim, travelers, map, 1, dt)
  const until = (condition: () => boolean) => {
    for (let i = 0; i < 2000 && !condition(); i++) tick()
    expect(condition(), JSON.stringify({ activity: state.activity, position: [state.x,state.z], visit: state.waterVisit, route: state.offRoadRoute, employer: state.employer })).toBe(true)
  }
  return { sim, map, source, state, travelers, tick, until }
}

describe("NPC drinking", () => {
  it.each(["well", "watering-hole"] as const)("walks to %s, drinks for free and rejoins the road", kind => {
    const { state, tick, until } = setup(kind)
    tick(); expect(state.activity).toBe("toWater")
    expect(state.thirst).toBe(5)
    until(() => state.activity === (kind === "well" ? "drinking" : "drinkingLow"))
    const position = { x: state.x, z: state.z }
    tick(WATER_VISIT_SECONDS / 2)
    expect(state.thirst).toBe(55)
    expect({ x: state.x, z: state.z }).toEqual(position)
    expect([state.gold, state.hunger, state.stamina]).toEqual([0, 80, 80])
    until(() => state.activity === "walking")
    expect(state.thirst).toBe(100)
    expect(state.waterVisit).toBeUndefined()
  })

  it("reserves one drinker per source and releases the spot", () => {
    const { sim, state, tick, until } = setup("well", 2)
    tick()
    expect([...sim.travelers.values()].filter(s => s.waterVisit)).toHaveLength(1)
    until(() => state.activity === "fromWater" && state.waterVisit?.exitCleared === true)
    const second = sim.travelers.get(1)!
    // Keep the second walker nearby for its next bounded retry.
    second.x = state.x; second.z = state.z + 2; second.progress = 11; second.waterRetry = 0
    tick(); expect(second.activity).toBe("toWater")
  })

  it("lets another walker use a natural bank while the well is reserved", () => {
    const { sim, map, state, tick, until } = setup("well", 2)
    const second = sim.travelers.get(1)!
    Object.assign(second, { x: state.x, y: state.y, z: state.z, progress: state.progress })
    map.tiles[8 * map.width + 12] = "water"
    tick()
    expect(state.waterVisit?.sourceId).toBe("water")
    expect(state.naturalWaterVisit).toBeUndefined()
    expect(second.waterVisit).toBeUndefined()
    expect(second.naturalWaterVisit).toBeDefined()
    until(() => second.activity === "drinkingLow")
    expect(Number.isFinite(second.naturalWaterVisit?.heading)).toBe(true)
    until(() => second.activity === "walking")
    expect(second.thirst).toBe(100)
    expect(second.naturalWaterVisit).toBeUndefined()
    until(() => state.activity === "walking")
    expect(state.thirst).toBe(100)
  })

  it("finishes an eight-second drink on time despite fractional ticks and need decay", () => {
    const { state, sim, tick, until } = setup()
    sim.balance.rules.thirstDecay = 6
    until(() => state.activity === "drinking")
    for (let i = 0; i < 80; i++) tick(.1)
    expect(state.activity).toBe("fromWater")
    expect(state.thirst).toBe(100)
  })

  it("does not drink while paused or before arriving", () => {
    const { state, tick, until } = setup()
    tick(0); expect(state.activity).toBe("walking")
    tick(); expect(state.thirst).toBe(5)
    until(() => state.activity === "drinking")
    const timer = state.timer
    tick(0); expect([state.timer, state.thirst]).toEqual([timer, 5])
  })

  it("skips unfinished and unreachable sources", () => {
    const { source, state, tick, map } = setup()
    source.construction = { work: 0, required: 10 }
    tick(); expect(state.waterVisit).toBeUndefined()
    source.construction.work = 10
    for (let z = 2; z <= 5; z++) for (let x = 9; x <= 12; x++) {
      if (z === 2 || z === 5 || x === 9 || x === 12) map.tiles[z * map.width + x] = "water"
    }
    tick(); expect(state.waterVisit).toBeUndefined()
  })

  it("stops restoring thirst when its source disappears", () => {
    const { state, tick, until, map } = setup()
    until(() => state.activity === "drinking")
    map.buildings = []
    tick(); expect(state.activity).toBe("fromWater"); expect(state.thirst).toBe(5)
    until(() => state.activity === "walking")
  })

  it("keeps a settler's job and returns to idle after drinking", () => {
    const { state, tick, until } = setup()
    state.employer = "workplace"; state.activity = "idle"
    tick(); expect(state.activity).toBe("toWater")
    until(() => state.activity === "drinking")
    until(() => state.activity === "idle")
    expect(state.employer).toBe("workplace")
    expect(state.waterVisit).toBeUndefined()
  })

  it.each(["toRelic", "fromRelic"] as const)("resumes %s at the same chapel-approach point after drinking", activity => {
    const { state, tick, until, map } = setup()
    map.site = { junction: 10, branch: [{ x: 10, z: 7 }, { x: 10, z: 6 }], door: { x: 10, z: 6 }, hovelId: "chapel" }
    state.activity = activity
    state.shrineRoute = map.site.branch
    state.branchProgress = .5
    state.shrineSeat = "queue-0"
    const departure = { x: state.x, z: state.z }
    tick(); expect(state.activity).toBe("toWater")
    until(() => state.activity === "drinking")
    until(() => state.activity === activity)
    expect(state.thirst).toBe(100)
    expect({ x: state.x, z: state.z }).toEqual(departure)
    expect(state.branchProgress).toBe(.5)
    expect(state.shrineSeat).toBe("queue-0")
    expect(state.shrineRoute).toBe(map.site.branch)
  })

  it("reroutes around construction added during the approach", () => {
    const { map, state, tick, until } = setup()
    tick()
    const old = state.offRoadRoute
    map.buildings = [...map.buildings, { ...BUILD_CATALOG.find(b => b.id === "cross")!,
      id: "new-cross", buildType: "cross", x: 11, z: 6 }]
    tick()
    expect(state.offRoadRoute).not.toBe(old)
    until(() => state.activity === "drinking")
    expect(state.waterVisit?.buildings).toBe(map.buildings)
  })

  it("finishes the reserved strip when the map changes beside an arriving drinker", () => {
    const { map, state, tick, until } = setup()
    until(() => state.activity === "toWater" && state.offRoadRoute?.length === 1)
    map.buildings = [...map.buildings]
    tick()
    until(() => state.activity === "drinking")
    until(() => state.activity === "walking")
  })

  it.each([0, 1, 2, 3] as const)("routes to the clear front of rotation %i", rotation => {
    const { source, state, map } = setup()
    source.rotation = rotation
    const plan = waterVisitPlan(map, source, state, state)
    expect(plan).not.toBeNull()
    const { approach } = plan!.visit
    expect(approach.at(-1)).toEqual(plan!.visit.stand)
    expect(plan!.route.at(-1)).toEqual(plan!.visit.stand)
  })
})
