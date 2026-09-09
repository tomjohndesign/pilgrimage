import { createBenchmarkCity, routeBenchmarkCity } from "./city-benchmark"
import { jobBuildings } from "./settlement"
import { afterAll, bench, describe } from "vitest"
import { Session } from "node:inspector"
import { writeFile } from "node:fs/promises"
import { BASE_CHARACTER_SCALE, DEFAULT_WALK_SPEED, walkSpeedScale } from "./base-person/gait"
import { travelerAppearance } from "./base-person/population"
import { populationVisual } from "./base-person/population-assets"
import { vendorSpeedScale } from "./transport/assets"
import { createFootpaths, setFootpathObstacles } from "./footpaths"
import { generateMap } from "./map/generate-map"
import { DEFAULT_MOVEMENT } from "./motion"
import { generateRelic } from "./relic"
import { createSim, stepSim } from "./sim"
import { generateTravelers } from "./travelers"
import { withTravelParties } from "./travel-parties"
import { growTreePlacements } from "./trees/dimensions"
import { placeTrees } from "./trees/placement"
import { TREE_SPECIES } from "./trees/species"
import { deriveSeed, SEED_STREAM } from "./rng"
import { simulationFrameStep } from "./simulation-store"

const seed = 12345
const generated = generateMap({ seed, width: 512, depth: 512 })
const terrain = ["city", "city-stress"].includes(process.env.BENCH_SCENARIO ?? "") ? createBenchmarkCity(generated, process.env.BENCH_SCENARIO === "city-stress" ? "routing-stress" : "gameplay") : generated
const trees = growTreePlacements(placeTrees(terrain, TREE_SPECIES), deriveSeed(seed, SEED_STREAM.treeShapes), TREE_SPECIES, 1)
if (process.env.BENCH_SIM_PROFILE) {
  const session = new Session()
  session.connect()
  session.post("Profiler.enable")
  session.post("Profiler.start")
  afterAll(async () => {
    const profile = await new Promise((resolve, reject) => session.post("Profiler.stop", (error, result) => error ? reject(error) : resolve(result.profile)))
    await writeFile(process.env.BENCH_SIM_PROFILE!, JSON.stringify(profile))
    session.disconnect()
  })
}

describe("512 × 512, full population simulation", () => {
  for (const count of process.env.BENCH_COUNT ? [Number(process.env.BENCH_COUNT)] : [2000, 3840, 6000, 10000]) {
    const map = { ...terrain, footpaths: createFootpaths(terrain) }
    setFootpathObstacles(map.footpaths, trees.map(tree => ({ x: tree.x, z: tree.z, radius: Math.max(.18, (tree.footprint ?? .3) * .5) })))
    const cast = generateTravelers(seed, count)
    const travelers = process.env.BENCH_PARTIES === "1" ? withTravelParties(cast, seed) : cast
    const sim = createSim(travelers, map, [], generateRelic(seed).stats)
    sim.trees = trees
    sim.buildings = jobBuildings(map)
    const scales = new Map(travelers.map(t => {
      const appearance = travelerAppearance(seed, t.id), scale = BASE_CHARACTER_SCALE * appearance.scale
      const visual = populationVisual(t.type.id, appearance.variant, null, t.attributes.age)
      const speed = walkSpeedScale(visual.walkStride, scale)
      return [t.id, t.type.id === "vendor" ? vendorSpeedScale(t.id, scale, speed) : speed]
    }))
    bench(`${count} travelers${process.env.BENCH_PARTIES === "1" ? " in parties" : " individually"}`, () => {
      const { ticks, dt } = simulationFrameStep(1 / 60, Number(process.env.BENCH_SIM_RATE ?? 2))
      for (let tick = 0; tick < ticks; tick++) {
        routeBenchmarkCity(sim, map)
        stepSim(sim, travelers, map, DEFAULT_WALK_SPEED, dt, DEFAULT_MOVEMENT, scales, BASE_CHARACTER_SCALE)
      }
    }, { time: 0, iterations: 180, warmupTime: 0, warmupIterations: Number(process.env.BENCH_WARMUP_TICKS ?? 60) })
  }
})
