import { describe, expect, it, vi } from "vitest"
import { benchmarkWork, resetBenchmarkWork } from "./benchmark-work"
import { createFootpaths } from "./footpaths"
import { createBenchmarkCity, cityBenchmarkStats, routeBenchmarkCity } from "./city-benchmark"
import { buildingStepAllowed } from "./building-navigation"
import { DEFAULT_WALK_SPEED } from "./base-person/gait"
import { generateTravelers } from "./travelers"
import { createSim, GAME_DAY_SECONDS, stepSim } from "./sim"
import { withWorkerRouteMemory, workerRouteMemoryStats } from "./worker-route-memory"
import { simulationFrameStep } from "./simulation-store"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"

function fixture(): GameMap {
  const map = createBenchmarkCity({ width: 512, depth: 512, tiles: Array(512 * 512).fill("forest"), buildings: [], seed: 12345 }, "routing-stress")
  map.footpaths = createFootpaths(map)
  return map
}
describe("city stress fixture", () => {
  it("defaults to normal gameplay and never replaces people's activities or routes", () => {
    const map = createBenchmarkCity({ width: 512, depth: 512, tiles: Array(512 * 512).fill("forest"), buildings: [], seed: 12345 })
    map.footpaths = createFootpaths(map)
    const people = generateTravelers(12345, 120), sim = createSim(people, map)
    let roadSamples = 0, maxRoadDeviation = 0
    for (let tick = 0; tick < 200; tick++) {
      const before = structuredClone([...sim.travelers.values()])
      routeBenchmarkCity(sim, map)
      expect([...sim.travelers.values()]).toEqual(before)
      stepSim(sim, people, map, DEFAULT_WALK_SPEED, .4)
      // This fixture's highway is straight. Ordinary road walkers must stay
      // on their chosen lane even at the 6× / 30 FPS simulation step.
      for (const actor of sim.travelers.values()) if (actor.activity === "walking" && !actor.convoy && !actor.track && !actor.roadShortcut && !actor.praying) {
        roadSamples++
        maxRoadDeviation = Math.max(maxRoadDeviation, Math.hypot(actor.x - tileToWorldX(map, actor.progress), actor.z - (tileToWorldZ(map, map.road![0].z) - actor.lane)))
      }
    }
    const stats = cityBenchmarkStats(sim, map)!
    expect(stats).toMatchObject({ mode: "gameplay", assigned: 0, completed: 0, failed: 0 })
    expect(stats.onRoad).toBeGreaterThan(100)
    expect(stats.onRoad + stats.offRoad).toBe(120)
    expect(stats.nearRoad).toBeGreaterThanOrEqual(stats.onRoad)
    expect(roadSamples).toBeGreaterThan(10000)
    expect(maxRoadDeviation).toBeLessThan(.001)
  }, 60000)
  it("keeps 240 nonoverlapping catalogue buildings and the surrounding forest", () => {
    const map = fixture()
    expect(map.buildings).toHaveLength(240)
    expect(new Set(map.buildings.map(b => b.buildType)).size).toBeGreaterThanOrEqual(8)
    expect(map.tiles.filter(t => t === "forest").length).toBeGreaterThan(200000)
    for (const [i, a] of map.buildings.entries()) for (const b of map.buildings.slice(i + 1))
      expect(a.x < b.x + b.w && a.x + a.w > b.x && a.z < b.z + b.d && a.z + a.d > b.z).toBe(false)
  })
  it("replays completed pedestrian routes only for diagnostics and restores fresh planning", () => {
    vi.stubEnv("NEXT_PUBLIC_GAME_BENCHMARK", "1")
    benchmarkWork.replayRoutes = true
    try {
      const map = fixture(), people = generateTravelers(12345, 48), sim = createSim(people, map)
      for (let tick = 0; tick < 600; tick++) {
        routeBenchmarkCity(sim, map)
        const before = [...sim.travelers.values()].map(s => ({ x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) }))
        stepSim(sim, people, map, DEFAULT_WALK_SPEED, 1.2)
        let i = 0
        for (const actor of sim.travelers.values()) {
          const next = { x: worldToTileX(map, actor.x), z: worldToTileZ(map, actor.z) }
          expect(buildingStepAllowed(map, map.buildings, before[i++], next, true)).toBe(true)
        }
      }
      const stats = cityBenchmarkStats(sim, map)!
      expect(stats.failed).toBe(0)
      expect(stats.replayCached).toBeGreaterThan(40)
      expect(stats.replayed).toBeGreaterThan(100)
      resetBenchmarkWork()
      routeBenchmarkCity(sim, map)
      expect(cityBenchmarkStats(sim, map)!.replayCached).toBe(0)
    } finally { resetBenchmarkWork(); vi.unstubAllEnvs() }
  })
  it.each([1 / 60, .034, .1])("routes real walkers around footprints at 6× with %s-second display frames", delta => {
    const map = fixture(), people = generateTravelers(12345, 120), sim = createSim(people, map)
    routeBenchmarkCity(sim, map)
    const moved = new Set<number>()
    for (let tick = 0; tick < 900; tick++) {
      const previous = [...sim.travelers.values()].map(s => ({ x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z) }))
      const { ticks, dt } = simulationFrameStep(delta, 12)
      for (let step = 0; step < ticks; step++) withWorkerRouteMemory(map, sim.time * GAME_DAY_SECONDS, () => {
        routeBenchmarkCity(sim, map)
        stepSim(sim, people, map, DEFAULT_WALK_SPEED, dt)
      })
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
    expect(workerRouteMemoryStats(map).planned).toBeGreaterThan(0)
  }, 60000)
})
