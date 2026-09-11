import { ELEVATION_CONTROLS, elevationSettings, type ElevationSettings } from "../map/elevation"
import { parseSceneVisibility } from "../scene-visibility"
import { treeModelForGame } from "../trees/render-model"
import type { CityBenchmarkMode } from "../city-benchmark"
import { DEFAULT_WORLD_SETTINGS, type DisplaySettings, type WorldSettings } from "./settings"

/**
 * The play URL names a world: `seed`, `size`, and the generator version, plus
 * whichever generation inputs differ from their defaults. Anyone opening the
 * link gets the same land. Display tuning stays out of it, though older links
 * that carried it are still read.
 */
export interface PlayQuery {
  seed?: number
  world: Partial<WorldSettings>
  display: Partial<DisplaySettings>
  benchmark?: CityBenchmarkMode
  lab?: PlayLab
}

/** Test worlds for watching one system at work. `relic-line`: everyone on the
 * road is devout enough to turn in for the relic every time, so the line at the
 * church, companies and singles together, can be watched at leisure. Pair it
 * with a small, open map and a short branch. */
export type PlayLab = "relic-line"
export const RELIC_LINE_LAB_WORLD: Partial<WorldSettings> = { size: 128, coverage: 0, water: 0, relicDistance: 4, traffic: 60 }

type Params = Record<string, string | undefined>

const WORLD_PARAMS: Array<[query: string, key: Exclude<keyof WorldSettings, "elevation">, integer: boolean]> = [
  ["generation", "generation", true], ["size", "size", true], ["forest", "coverage", true], ["glades", "glades", true], ["clearings", "clearings", true],
  ["dark", "darkForests", true], ["relic", "relicDistance", true], ["traffic", "traffic", true],
  ["water", "water", true], ["rivers", "rivers", true], ["lakes", "lakes", true], ["ponds", "ponds", true],
]

function integer(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function decimal(value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export function parsePlayQuery(params: Params): PlayQuery {
  const world: Partial<WorldSettings> = {}
  for (const [query, key, isInteger] of WORLD_PARAMS) {
    const value = isInteger ? integer(params[query]) : decimal(params[query])
    if (key === "generation" && value !== 1 && value !== 2) continue
    if (value !== undefined) world[key] = value
  }
  const elevation: { -readonly [K in keyof ElevationSettings]?: number } = {}
  let shaped = false
  for (const key of Object.keys(ELEVATION_CONTROLS) as (keyof ElevationSettings)[]) {
    const value = decimal(params[`e_${key}`])
    if (value !== undefined) { elevation[key] = value; shaped = true }
  }
  if (shaped) world.elevation = elevationSettings(elevation)

  // Legacy display parameters: honoured when present so old links and the
  // benchmark recipes keep working, never written back.
  const display: Partial<DisplaySettings> = parseSceneVisibility(params)
  if (params.characters === "base" || params.characters === "callings") display.characterModel = params.characters
  if (params.trees !== undefined) display.treeModel = treeModelForGame(params.trees)
  for (const key of ["baseSize", "draftSize"] as const) {
    const scale = decimal(params[key])
    if (scale !== undefined) display[key] = Math.min(4, Math.max(0.5, scale))
  }
  if (params.timing === "distance" || params.timing === "fps") display.walkSync = params.timing === "distance"
  for (const [query, key, min, max] of [
    ["stride", "stride", 0.15, 1.2], ["variation", "paceVariation", 0, 0.4],
    ["easing", "pathEase", 0, 1], ["acceleration", "acceleration", 0, 1.5],
  ] as const) {
    const value = decimal(params[query])
    if (value !== undefined) display[key] = Math.max(min, Math.min(max, value))
  }
  const walkSpeed = decimal(params.speed)
  if (walkSpeed !== undefined) display.walkSpeed = walkSpeed
  const characterFps = integer(params.fps)
  if (characterFps !== undefined) display.characterFps = Math.min(24, Math.max(1, characterFps))
  const road = integer(params.road)
  if (road !== undefined) display.road = road
  for (const [query, key] of [["opacity", "roadOpacity"], ["shade", "roadShade"], ["edgeline", "roadEdgeLine"], ["edgewidth", "roadEdgeWidth"]] as const) {
    const value = decimal(params[query])
    if (value !== undefined) display[key] = value
  }

  const benchmark: CityBenchmarkMode | undefined =
    params.benchmark === "city" ? "gameplay" : params.benchmark === "city-stress" ? "routing-stress" : undefined
  const lab: PlayLab | undefined = params.lab === "relic-line" ? "relic-line" : undefined
  return { seed: integer(params.seed), world: lab ? { ...RELIC_LINE_LAB_WORLD, ...world } : world, display, benchmark, lab }
}

/** The query string for a world: seed, size and generator version always, other inputs only when changed. */
export function playQuery(seed: number, world: WorldSettings, benchmark?: false | CityBenchmarkMode, lab?: false | PlayLab): string {
  const query = new URLSearchParams({ seed: String(seed), size: String(world.size), generation: String(world.generation) })
  for (const [name, key] of WORLD_PARAMS) {
    if (key !== "size" && world[key] !== DEFAULT_WORLD_SETTINGS[key]) query.set(name, String(world[key]))
  }
  const elevation = elevationSettings(world.elevation)
  for (const [key, value] of Object.entries(elevation)) {
    if (value !== DEFAULT_WORLD_SETTINGS.elevation[key as keyof ElevationSettings]) query.set(`e_${key}`, String(value))
  }
  if (benchmark) query.set("benchmark", benchmark === "routing-stress" ? "city-stress" : "city")
  if (lab) query.set("lab", lab)
  return query.toString()
}
