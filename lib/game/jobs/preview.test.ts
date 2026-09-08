import { describe, expect, it } from "vitest"
import { generateMap } from "../map/generate-map"
import { BUILD_CATALOG, DEFAULT_BALANCE } from "../balance"
import { buildingPreviewBalance, buildingPreviewSettlement } from "../building-preview"
import { jobBuildings } from "../settlement"
import { BUILDING_KINDS } from "../buildings"
import { travelerAppearance } from "../base-person/population"
import { createSim, stepSim } from "../sim"
import { previewResidents, placePreviewResident } from "./preview"

const world = generateMap({ seed: 42 })
const settlement = buildingPreviewSettlement(world, buildingPreviewBalance(DEFAULT_BALANCE), true)
const map = { ...world, elevation: settlement.elevation ?? world.elevation, buildings: [...world.buildings, ...settlement.structures] }

describe("staffed settlement demo", () => {
  it("includes every purchasable building and staffs every workplace with both genders represented", () => {
    for (const building of BUILD_CATALOG) expect(map.buildings.some(b => b.buildType === building.id)).toBe(true)
    const residents = previewResidents(map)
    expect(residents).toHaveLength(9)
    expect(new Set(residents.map(r => r.traveler.id)).size).toBe(residents.length)
    expect(residents.every(r => r.home !== null)).toBe(true)
    for (const building of jobBuildings(map)) {
      const staff = residents.filter(r => r.building.id === building.id)
      expect(staff.length).toBe(BUILDING_KINDS[building.kind].jobs)
    }
    for (const kind of Object.keys(BUILDING_KINDS)) expect(new Set(residents.filter(r => r.building.kind === kind)
      .map(r => travelerAppearance(map.seed ?? 0, r.traveler.id).bodyType))).toEqual(new Set(["Male", "Female"]))
  })

  it("starts posted workers at real work positions and retains their jobs during simulation", () => {
    const residents = previewResidents(map), travelers = residents.map(r => r.traveler)
    const sim = createSim(travelers, map)
    sim.buildings = jobBuildings(map)
    for (const resident of residents) {
      const actor = sim.travelers.get(resident.traveler.id)!
      placePreviewResident(actor, map, resident)
      if (resident.building.kind !== "workshop") {
        expect(actor.activity).toBe("posted")
        expect(actor.buildingTask?.purpose).toBe("work")
        expect(actor.buildingTask?.route).toEqual([])
      }
    }
    for (let i = 0; i < 100; i++) stepSim(sim, travelers, map, .4, .1)
    for (const resident of residents) expect(sim.travelers.get(resident.traveler.id)?.employer).toBe(resident.building.id)
  })
})
