import { afterEach, describe, expect, it } from "vitest"
import { BUILD_CATALOG } from "./balance"
import { BUILDING_KINDS } from "./buildings"
import { HOUSE_BEDS } from "./building-art/early-geometry"
import { type GameMap, tileToWorldX, tileToWorldZ } from "./map/types"
import { townResidents } from "./town-residents"
import { createSim, stepSim, GAME_DAY_SECONDS } from "./sim"
import { claimTownBuildings, createSettlement, jobBuildings, settlementMap, settlementRenown, creditTrade } from "./settlement"
import { enclaveHousing } from "./housing"
import { buildInfluence } from "./build-influence"
import { servingHouses } from "./tavern"
import { useBuildStore } from "./build-store"
import { buildingEntry } from "./building-rotation"
import { tavernVisitPlan } from "./tavern"

function fixture(): GameMap {
  const width = 80, depth = 35
  const building = (type: "tavern" | "house", x: number, z: number) => ({
    ...BUILD_CATALOG.find(b => b.id === type)!, id: `town-${type}`, buildType: type, x, z,
    owner: "independent" as const, townId: "town",
  })
  return { width, depth, tiles: Array(width * depth).fill("grass"), seed: 42,
    road: Array.from({ length: width }, (_, x) => ({ x, z: 20 })),
    site: { junction: 10, branch: Array.from({ length: 11 }, (_, i) => ({ x: 10, z: 20 - i })),
      door: { x: 10, z: 10 }, hovelId: "chapel" },
    buildings: [
      { id: "chapel", label: "Chapel", x: 8, z: 6, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" },
      building("tavern", 25, 16), building("house", 25, 10),
    ],
    towns: [{ id: "town", name: "Hazelwick", junction: 26, tavernId: "town-tavern", buildingIds: ["town-tavern", "town-house"] }],
  }
}

afterEach(() => useBuildStore.getState().reset())

describe("town households", () => {
  it("starts with the tavern staff employed in distinct posts and a shared home, without adding player settlers", () => {
    const map = fixture(), residents = townResidents(map), travelers = residents.map(r => r.traveler)
    const sim = createSim(travelers, map)
    expect(residents).toHaveLength(BUILDING_KINDS.tavern.jobs)
    expect(new Set(travelers.map(t => t.id)).size).toBe(BUILDING_KINDS.tavern.jobs)
    expect(new Set(travelers.map(t => t.name)).size).toBe(BUILDING_KINDS.tavern.jobs)
    for (const resident of residents) {
      expect(resident.traveler.attributes).toMatchObject({ hunger: 100, thirst: 100, stamina: 100 })
      expect(sim.travelers.get(resident.traveler.id)).toMatchObject({
        employer: "town-tavern", home: "town-house", jobless: false, activity: "posted", jobSlot: resident.jobSlot,
        hunger: 100, thirst: 100, stamina: 100,
      })
    }
    const staffed = (id: string) => [...sim.travelers.values()].some(s => s.employer === id && s.activity === "posted")
    expect(servingHouses(map, b => staffed(b.id))).toHaveLength(1)
    useBuildStore.getState().syncResources(sim, travelers)
    expect(useBuildStore.getState().settlers).toEqual([])
    expect(jobBuildings(map)).toEqual([])
    expect(enclaveHousing(map, 0, 0).people.capacity).toBe(0)
    expect(townResidents({ ...map, buildings: map.buildings.map(b => ({ ...b, owner: undefined })) }).map(r => r.traveler.id))
      .toEqual(travelers.map(t => t.id))
  })

  it("lets workers go home, recover in separate beds and return to their posts", () => {
    const map = fixture(), travelers = townResidents(map).map(r => r.traveler), sim = createSim(travelers, map)
    for (const s of sim.travelers.values()) { s.stamina = 10; s.gold = 0 }
    const slept = new Set<number>(), beds = new Set<number>()
    for (let elapsed = 0; elapsed < GAME_DAY_SECONDS; elapsed += .2) {
      stepSim(sim, travelers, map, 1, .2)
      for (const s of sim.travelers.values()) if (s.activity === "sleeping") { slept.add(s.id); beds.add(s.workSlot!) }
      if (slept.size === BUILDING_KINDS.tavern.jobs && [...sim.travelers.values()].every(s => s.activity === "posted")) break
    }
    expect(slept.size).toBe(BUILDING_KINDS.tavern.jobs)
    expect(beds.size).toBe(BUILDING_KINDS.tavern.jobs)
    for (const s of sim.travelers.values()) expect(s).toMatchObject({ activity: "posted", employer: "town-tavern", home: "town-house" })
  })
})

describe("acquiring town buildings", () => {
  it("claims on connected footprint contact, propagates influence, and preserves ownership and residents", () => {
    const base = fixture(), original = createSettlement()
    expect(claimTownBuildings(original, base)).toBe(original)
    const cross = { ...BUILD_CATALOG.find(b => b.id === "cross")!, id: "player-cross", buildType: "cross", x: 18, z: 15 }
    const expanded = { ...original, structures: [cross] }
    const before = settlementMap(base, expanded)
    const field = buildInfluence(before).connected
    expect(field[16 * base.width + 25]).toBe(1)
    expect(field[10 * base.width + 25]).toBe(0)
    const acquired = claimTownBuildings(expanded, base)
    expect(acquired.claimedBuildings.sort()).toEqual(["town-house", "town-tavern"])
    const map = settlementMap(base, acquired)
    expect(map.buildings.filter(b => b.owner === "independent")).toEqual([])
    expect(base.buildings.filter(b => b.owner === "independent")).toHaveLength(2)
    expect(claimTownBuildings(acquired, base)).toBe(acquired)
    expect(claimTownBuildings({ ...acquired, structures: [] }, base).claimedBuildings).toEqual(acquired.claimedBuildings)
    expect(jobBuildings(map)).toHaveLength(1)
    expect(enclaveHousing(map, 2, 0).people.capacity).toBe(HOUSE_BEDS)
    expect(settlementRenown(map, [], []).total).toBeGreaterThan(settlementRenown(before, [], []).total)
    const travelers = townResidents(base).map(r => r.traveler), sim = createSim(travelers, base)
    const people = [...sim.travelers.values()]
    sim.buildings = jobBuildings(map, true)
    useBuildStore.getState().syncResources(sim, travelers)
    expect(useBuildStore.getState().settlers).toHaveLength(BUILDING_KINDS.tavern.jobs)
    expect([...sim.travelers.values()]).toEqual(people)
  })

  it("does not claim disconnected influence across water", () => {
    const base = fixture()
    for (let z = 0; z < base.depth; z++) base.tiles[z * base.width + 20] = "water"
    const cross = { ...BUILD_CATALOG.find(b => b.id === "cross")!, id: "cross", buildType: "cross", x: 18, z: 15 }
    const settlement = { ...createSettlement(), structures: [cross] }
    expect(claimTownBuildings(settlement, base)).toBe(settlement)
  })

  it("credits only sales after acquisition, including a customer already at the counter", () => {
    const base = fixture(), travelers = townResidents(base).map(r => r.traveler), sim = createSim(travelers, base)
    const customer = sim.travelers.get(travelers[0].id)!, tavern = base.buildings[1]
    const entry = buildingEntry(tavern), plan = tavernVisitPlan(base, tavern, entry)!
    const buy = (map: GameMap) => {
      Object.assign(customer, { activity: "buying", timer: 0, hunger: 40, thirst: 100, gold: 20,
        x: tileToWorldX(map, entry.x), z: tileToWorldZ(map, entry.z), tavernVisit: { plan, served: false, returnTo: null } })
      stepSim(sim, travelers, map, 1, .01)
    }
    buy(base)
    expect(sim.tradeGold).toBe(0)
    const owned = { ...createSettlement(), claimedBuildings: [tavern.id] }, map = settlementMap(base, owned)
    sim.buildings = jobBuildings(map, true)
    buy(map)
    expect(sim.tradeGold).toBe(2)
    expect(creditTrade(owned, sim.tradeGold).resources.gold).toBe(owned.resources.gold + 2)
  })
})
