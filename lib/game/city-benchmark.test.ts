import { describe, expect, it } from "vitest"
import { createFootpaths } from "./footpaths"
import { createBenchmarkCity, cityBenchmarkStats, routeBenchmarkCity } from "./city-benchmark"
import { buildingStepAllowed } from "./building-navigation"
import { DEFAULT_WALK_SPEED } from "./base-person/gait"
import { generateTravelers } from "./travelers"
import { createSim, stepSim } from "./sim"
import { worldToTileX, worldToTileZ, type GameMap } from "./map/types"

function fixture(): GameMap {
  const map = createBenchmarkCity({ width: 512, depth: 512, tiles: Array(512 * 512).fill("forest"), buildings: [], seed: 12345 })
  map.footpaths = createFootpaths(map)
  return map
}
describe("city stress fixture", () => {
  it("keeps 240 nonoverlapping catalogue buildings and the surrounding forest", () => {
    const map = fixture()
    expect(map.buildings).toHaveLength(240)
    expect(new Set(map.buildings.map(b => b.buildType)).size).toBeGreaterThanOrEqual(8)
    expect(map.tiles.filter(t => t === "forest").length).toBeGreaterThan(200000)
    for (const [i, a] of map.buildings.entries()) for (const b of map.buildings.slice(i + 1))
      expect(a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z).toBe(false)
  })
  it("routes real walkers around footprints and renews varied destinations at 6×", () => {
    const map = fixture(), people = generateTravelers(12345, 120), sim = createSim(people, map)
    routeBenchmarkCity(sim, map)
    const moved = new Set<number>()
    for (let tick = 0; tick < 900; tick++) {
      routeBenchmarkCity(sim, map)
      const previous = [...sim.travelers.values()].map(s => ({ x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) }))
      stepSim(sim, people, map, DEFAULT_WALK_SPEED, 12 / 60)
      let i = 0
      for (const actor of sim.travelers.values()) {
        const next = { x: worldToTileX(map, actor.x), z: worldToTileZ(map, actor.z) }
        if (next.x !== previous[i].x || next.z !== previous[i].z) moved.add(actor.id)
        expect(buildingStepAllowed(map, map.buildings, previous[i], next, true), JSON.stringify({ tick, id: actor.id, from: previous[i++], next, activity: actor.activity, route: actor.constructionReturn?.slice(0, 3) })).toBe(true)
      }
    }
    const stats = cityBenchmarkStats(sim, map)!
    expect(stats.failed).toBe(0)
    expect(stats.active).toBeGreaterThan(115)
    expect(stats.completed).toBeGreaterThan(50)
    expect(stats.uniqueDestinations).toBeGreaterThan(120)
    expect(moved.size).toBe(120)
  }, 60000)
})
