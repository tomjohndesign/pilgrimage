import { afterEach, describe, expect, it } from "vitest"
import { clearDemolishedBuildings } from "./demolition"
import { createSim, stepSim } from "./sim"
import { BUILD_CATALOG } from "./balance"
import { almsAccess, almsRegistry, type AlmsMonk } from "./alms-table"
import { createMonkNeeds } from "./monk-work"
import { TRAVELER_TYPES, type Traveler } from "./travelers"
import type { BuildingDef, GameMap } from "./map/types"
import { generateMap } from "./map/generate-map"
import { generateTravelers } from "./travelers"
import { generateMonks } from "./monks"
import { emptyFoodStock } from "./storage"

describe("demolition cleanup", () => {
  it("releases residents and stored goods without advancing time or disturbing other travelers", () => {
    const map = generateMap({ seed: 31 })
    const travelers = generateTravelers(31, 3)
    const sim = createSim(travelers, map)
    const [worker, resident, unaffected] = [...sim.travelers.values()]
    const before = { ...unaffected }
    Object.assign(worker, { employer: "demolished", home: "surviving-home", activity: "posted" })
    Object.assign(resident, { home: "demolished", activity: "sleeping" })
    const monk = { ...generateMonks(31)[0], home: "demolished", bedSlot: 0 }
    sim.joinedMonks.set(monk.id, monk)
    sim.foodStores.set("demolished", emptyFoodStock())
    sim.foodStores.set("surviving-home", emptyFoodStock())
    sim.piles.set("pile", { id: "pile", campId: "demolished", wood: 10, slot: 0 })
    const time = sim.time
    clearDemolishedBuildings(sim, new Set(["demolished"]), map)
    expect(sim.time).toBe(time)
    expect(worker).toMatchObject({ employer: null, home: "surviving-home", activity: "idle", jobless: true })
    expect(resident).toMatchObject({ home: null, activity: "walking" })
    expect(sim.joinedMonks.get(monk.id)?.home).toBeUndefined()
    expect(sim.foodStores.has("demolished")).toBe(false)
    expect(sim.foodStores.has("surviving-home")).toBe(true)
    expect(sim.piles.size).toBe(0)
    expect(unaffected).toEqual(before)
  })
})

describe("errands interrupted by demolition", () => {
  afterEach(() => { almsRegistry.current = null })

  function breadFixture() {
    const table: BuildingDef = { ...BUILD_CATALOG.find(b => b.id === "alms-table")!, id: "bread", buildType: "alms-table", x: 13, z: 4, rotation: 0, layoutSeed: 0 }
    const map: GameMap = { width: 24, depth: 12, tiles: Array(288).fill("grass"),
      buildings: [{ id: "chapel", label: "Chapel", x: 10, z: 3, w: 2, d: 2, height: .9, color: "tan", roofColor: "brown" }, table],
      site: { hovelId: "chapel", door: { x: 11, z: 5 }, branch: [{ x: 11, z: 7 }, { x: 11, z: 6 }, { x: 11, z: 5 }], junction: 11 },
      road: Array.from({ length: 24 }, (_, x) => ({ x, z: 7 })) }
    for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
    const access = almsAccess(map, table, true)
    const monk: AlmsMonk = { ...createMonkNeeds(1), ...access.stand, activity: "keepingAlms", route: [], pause: 0,
      destination: "grounds", outings: 0, prayerSpot: undefined,
      almsDuty: { tableId: table.id, map, stand: access.stand, heading: access.heading } }
    almsRegistry.current = { road: map.road, monks: [monk] }
    const travelers: Traveler[] = [0, 1].map(id => ({ id, name: `Walker ${id}`, type: TRAVELER_TYPES.peasant,
      attributes: { happiness: 80, gold: 0, status: 50, hunger: id ? 100 : 5, thirst: 100, piety: 0, stamina: 80, jobless: false, skills: [], age: 30 },
      offset: .5, direction: 1, pace: 1 }))
    const sim = createSim(travelers, map)
    Object.assign(sim.balance.rules, { hungerDecay: 0, thirstDecay: 0, staminaDecay: 0, happinessDecay: 0 })
    return { map, travelers, sim, tick: () => stepSim(sim, travelers, map, 1, .1) }
  }

  it("does not leave the alms table reserved by a bread trip the demolition cut short", () => {
    const { map, sim, tick } = breadFixture()
    const a = sim.travelers.get(0)!, b = sim.travelers.get(1)!
    tick()
    expect(a.activity).toBe("toBread")
    // A settler on the way: the player demolishes their house; they keep their job.
    a.employer = "camp"; a.home = "house"
    clearDemolishedBuildings(sim, new Set(["house"]), map)
    expect(a.activity).toBe("idle")
    expect(a.breadVisit).toBeUndefined()
    b.hunger = 5; b.breadRetry = 0
    for (let i = 0; i < 1200; i++) tick()
    expect(b.hunger).toBeGreaterThan(5)
  })

  it("never counts a stale bread visit, including the caller's own, as a reservation", () => {
    const { sim, tick } = breadFixture()
    const a = sim.travelers.get(0)!
    tick()
    expect(a.activity).toBe("toBread")
    // Left over from an errand some other change cut short.
    const stale = a.breadVisit!
    Object.assign(a, { activity: "walking", offRoadRoute: null, walkFrom: null, breadRetry: 0 })
    a.breadVisit = stale
    for (let i = 0; i < 1200 && a.hunger <= 5; i++) tick()
    expect(a.hunger).toBeGreaterThan(5)
  })

  it("drops an abandoned haul and every errand the forced change orphans", () => {
    const map = generateMap({ seed: 31 })
    const sim = createSim(generateTravelers(31, 1), map)
    const [hauler] = [...sim.travelers.values()]
    Object.assign(hauler, { employer: "camp", home: "house", activity: "hauling", carrying: 3, deliveryBuilding: "store" })
    hauler.breadVisit = { tableId: "bread", stand: { x: 0, y: 0, z: 0 }, heading: 0, returnTo: { x: 0, y: 0, z: 0 }, buildings: map.buildings, arrival: [] }
    hauler.musicVisit = { performerId: 9, cycle: 0, spot: { x: 0, y: 0, z: 0 } }
    hauler.naturalWaterVisit = { heading: 0, spot: { x: 0, y: 0, z: 0 }, back: { x: 0, y: 0, z: 0 }, route: [], buildings: map.buildings }
    clearDemolishedBuildings(sim, new Set(["store"]), map)
    expect(hauler).toMatchObject({ activity: "idle", carrying: 0, employer: "camp" })
    expect(hauler.breadVisit).toBeUndefined()
    expect(hauler.musicVisit).toBeUndefined()
    expect(hauler.naturalWaterVisit).toBeUndefined()
  })
})
