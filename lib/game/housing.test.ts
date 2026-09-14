import { describe, expect, it } from "vitest"
import { BUILD_CATALOG } from "./balance"
import { HOUSE_BEDS } from "./building-art/early-geometry"
import { housingBeds, housingCapacity, vacantHouseBunk, enclaveHousing, monkBeds, vacantMonkBed } from "./housing"
import { MONK_COUNT } from "./monks"
import type { BuildingDef, GameMap } from "./map/types"

const building = (type: "house" | "monk-shelter", id = type): BuildingDef => ({
  ...BUILD_CATALOG.find(b => b.id === type)!, id, buildType: type, x: 1, z: 1,
})
const map = (buildings: BuildingDef[]): GameMap => ({ width: 20, depth: 20, tiles: Array(400).fill("grass"), buildings })

describe("enclave housing", () => {
  it("counts four bunks and eight resident places, separates monks, and excludes construction", () => {
    const house = building("house"), shelter = building("monk-shelter")
    const site = { ...house, construction: { work: 0, required: 10 } }
    const world = map([house, shelter, site])
    expect(housingBeds(house)).toBe(4)
    expect(housingCapacity(house)).toBe(8)
    expect(housingCapacity(site)).toBe(0)
    expect(enclaveHousing(world, 1, MONK_COUNT)).toEqual({
      people: { occupied: 1, capacity: 8, available: 7 },
      monks: { occupied: MONK_COUNT, capacity: housingBeds(shelter), available: Math.max(0, housingBeds(shelter) - MONK_COUNT) },
    })
    site.construction.work = 10
    expect(enclaveHousing(world, 1, MONK_COUNT).people.capacity).toBe(16)
    expect(housingBeds({ ...house, w: house.d, d: house.w, rotation: 1 })).toBe(HOUSE_BEDS)
  })

  it("offers any spare bunk, including one freed by a different resident", () => {
    const house = building("house")
    const residents: Array<{ buildingTask?: { purpose: string; buildingId: string; slot: number } }> = Array.from({ length: 8 }, () => ({}))
    for (let i = 0; i < 4; i++) {
      const slot = vacantHouseBunk(house, residents, residents[i])
      expect(slot).not.toBeNull()
      residents[i].buildingTask = { purpose: "rest", buildingId: house.id, slot: slot! }
    }
    expect(new Set(residents.slice(0, 4).map(r => r.buildingTask!.slot)).size).toBe(4)
    expect(vacantHouseBunk(house, residents, residents[4])).toBeNull()
    residents[1].buildingTask = undefined
    expect(vacantHouseBunk(house, residents, residents[7])).toBe(1)
    expect(vacantHouseBunk(house, residents, residents[0])).toBe(0)
    expect(vacantHouseBunk({ ...house, construction: { work: 0, required: 1 } }, residents)).toBeNull()
  })

  it("reserves founding beds and never allocates the same place twice", () => {
    const world = map([building("monk-shelter"), { ...building("monk-shelter"), id: "second" }])
    const joined: { home: string; bedSlot: number }[] = []
    for (let bed = vacantMonkBed(world, joined); bed; bed = vacantMonkBed(world, joined)) {
      joined.push({ home: bed.home, bedSlot: bed.slot })
    }
    expect(joined).toHaveLength(monkBeds(world).length - MONK_COUNT)
    expect(new Set(joined.map(m => `${m.home}:${m.bedSlot}`)).size).toBe(joined.length)
    expect(vacantMonkBed(world, joined)).toBeUndefined()
    expect(enclaveHousing(world, 0, MONK_COUNT + joined.length).monks.available).toBe(0)
  })
})
