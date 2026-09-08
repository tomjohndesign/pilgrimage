import { describe, expect, it } from "vitest"
import { BUILD_CATALOG } from "./balance"
import { housingBeds, enclaveHousing, monkBeds, vacantMonkBed } from "./housing"
import { MONK_COUNT } from "./monks"
import type { BuildingDef, GameMap } from "./map/types"

const building = (type: "house" | "monk-shelter", id = type): BuildingDef => ({
  ...BUILD_CATALOG.find(b => b.id === type)!, id, buildType: type, x: 1, z: 1,
})
const map = (buildings: BuildingDef[]): GameMap => ({ width: 20, depth: 20, tiles: Array(400).fill("grass"), buildings })

describe("enclave housing", () => {
  it("counts actual beds, separates people and monks, and excludes construction", () => {
    const house = building("house"), shelter = building("monk-shelter")
    const site = { ...house, construction: { work: 0, required: 10 } }
    const world = map([house, shelter, site])
    expect(housingBeds(house)).toBe(2)
    expect(enclaveHousing(world, 1, MONK_COUNT)).toEqual({
      people: { occupied: 1, capacity: 2, available: 1 },
      monks: { occupied: MONK_COUNT, capacity: housingBeds(shelter), available: Math.max(0, housingBeds(shelter) - MONK_COUNT) },
    })
    site.construction.work = 10
    expect(enclaveHousing(world, 1, MONK_COUNT).people.capacity).toBe(4)
    expect(housingBeds({ ...house, w: house.d, d: house.w, rotation: 1 })).toBe(2)
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
