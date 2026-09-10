import { describe, expect, it } from "vitest"
import { BUILD_CATALOG } from "../balance"
import { buildingEntry } from "../building-rotation"
import { settlementRoute } from "../settlement-route"
import { createSim, stepSim } from "../sim"
import { townResidents } from "../town-residents"
import { waterVisitPlan } from "../water-sources/navigation"
import { generateMap } from "./generate-map"
import { addPathSprings, addTownWells, FOUNDING_WELL_ID, hasNearbyWater } from "./seeded-water"
import { addRoadsideTowns } from "./roadside-towns"
import { createCrossroads } from "./crossroads"
import { isWoods } from "./terrain"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./types"

function roadMap(seed = 1): GameMap {
  const width = 400, depth = 80
  const map: GameMap = { width, depth, seed, buildings: [], tiles: Array(width * depth).fill("forest"),
    road: Array.from({ length: width }, (_, x) => ({ x, z: 40 })) }
  for (const p of map.road!) map.tiles[p.z * width + p.x] = "path"
  return map
}

describe("generated drinking water", () => {
  it("counts sources at 124 tiles, but not beyond the radius", () => {
    const map = roadMap(), from = { x: 100, z: 40 }
    map.tiles[40 * map.width + 224] = "water"
    expect(hasNearbyWater(map, from)).toBe(true)
    map.tiles[40 * map.width + 224] = "forest"
    map.tiles[40 * map.width + 225] = "water"
    expect(hasNearbyWater(map, from)).toBe(false)
    map.buildings.push({ ...BUILD_CATALOG.find(b => b.id === "well")!, id: "existing", buildType: "well", x: 224, z: 40 })
    expect(hasNearbyWater(map, from)).toBe(true)
    map.buildings[0].construction = { work: 0, required: 10 }
    expect(hasNearbyWater(map, from)).toBe(false)
  })

  it("gives dry towns accessible wells and leaves supplied towns alone", () => {
    const map = roadMap()
    addRoadsideTowns(map)
    expect(map.towns).toHaveLength(2)
    for (const town of map.towns!) {
      const well = map.buildings.find(b => b.townId === town.id && b.buildType === "well")!
      expect(well).toBeDefined()
      const start = map.road![town.junction]
      const point = { x: tileToWorldX(map, start.x), z: tileToWorldZ(map, start.z), y: .2 }
      expect(waterVisitPlan(map, well, point, point)).not.toBeNull()
      expect(town.buildingIds).toContain(well.id)
    }
    const count = map.buildings.length
    addTownWells(map)
    expect(map.buildings).toHaveLength(count)

    const supplied = roadMap()
    for (let x = 0; x < supplied.width; x++) supplied.tiles[20 * supplied.width + x] = "water"
    addRoadsideTowns(supplied)
    expect(supplied.towns).toHaveLength(2)
    expect(supplied.buildings.some(b => b.buildType === "well")).toBe(false)
  })

  it("does not put crossroads in front of generated taverns or at well spurs", () => {
    const map = roadMap()
    addRoadsideTowns(map)
    const before = [...map.tiles]
    expect(map.buildingAccessTiles!.length).toBeGreaterThan(0)
    createCrossroads(map)
    expect(map.crossroads).toEqual([])
    expect(map.tiles).toEqual(before)
    for (const town of map.towns!) for (const id of town.buildingIds) {
      const building = map.buildings.find(b => b.id === id)!
      expect(settlementRoute(map, map.buildings, map.road![town.junction], buildingEntry(building))).not.toBeNull()
    }
  })

  it("scatters reproducible springs off paths with a reachable dipping edge", () => {
    const a = roadMap(), b = roadMap(), c = roadMap(42)
    addPathSprings(a); addPathSprings(b); addPathSprings(c)
    expect(a.buildings.length).toBeGreaterThan(0)
    expect(a.buildings).toEqual(b.buildings)
    expect(a.buildings).not.toEqual(c.buildings)
    for (const spring of a.buildings) {
      const start = a.road!.reduce((best, p) => Math.hypot(p.x - spring.x, p.z - spring.z) < Math.hypot(best.x - spring.x, best.z - spring.z) ? p : best)
      const point = { x: tileToWorldX(a, start.x), z: tileToWorldZ(a, start.z), y: .2 }
      expect(waterVisitPlan(a, spring, point, point)).not.toBeNull()
      expect(Math.min(Math.abs(spring.z - 40), Math.abs(spring.z + spring.d - 1 - 40))).toBeGreaterThanOrEqual(2)
      expect(spring.buildType).toBe("watering-hole")
    }
    expect(a.road!.every(p => a.tiles[p.z * a.width + p.x] === "path")).toBe(true)
  })

  it("lets thirsty town residents leave work to drink at their generated well", () => {
    const map = roadMap()
    addRoadsideTowns(map)
    const travelers = townResidents(map).map(r => r.traveler)
    const sim = createSim(travelers, map)
    Object.assign(sim.balance.rules, { thirstDecay: 0, hungerDecay: 0, staminaDecay: 0 })
    for (const s of sim.travelers.values()) {
      s.thirst = 5
      let drank = false
      for (let i = 0; i < 2000; i++) {
        stepSim(sim, travelers, map, 1, .1)
        if (s.activity === "drinking") drank = true
        if (drank && s.activity === "posted") break
      }
      expect(drank).toBe(true)
      expect(s.activity).toBe("posted")
      expect(s.thirst).toBe(100)
    }
  })

  it.each([...[1, 7919, 42].map(seed => ({ seed, width: 192 })), { seed: 110867, width: 128 }])("connects the enclave well to the chapel path and clears its trees ($seed, $width)", ({ seed, width }) => {
    const map = generateMap({ seed, width, depth: width })
    const well = map.buildings.find(b => b.id === FOUNDING_WELL_ID)!
    expect(well).toBeDefined()
    const paths: GameMap = { ...map, tiles: map.tiles.map(t => ["track", "path", "bridge"].includes(t) ? t : "forest") }
    expect(settlementRoute(paths, paths.buildings, map.site!.door, buildingEntry(well))).not.toBeNull()
    for (let z = well.z - 1; z <= well.z + well.d; z++) for (let x = well.x - 1; x <= well.x + well.w; x++) {
      expect(isWoods(map.tiles[z * map.width + x])).toBe(false)
    }
    const p = map.site!.branch.reduce((best, p) => Math.hypot(p.x - well.x, p.z - well.z) < Math.hypot(best.x - well.x, best.z - well.z) ? p : best)
    const point = { x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z), y: .2 }
    expect(waterVisitPlan(map, well, point, point)).not.toBeNull()
    expect(well.owner).toBeUndefined()
  }, 20000)
})
