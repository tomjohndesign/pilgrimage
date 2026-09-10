import { describe, expect, it } from "vitest"

import { DEFAULT_ELEVATION } from "../map/elevation"
import { DEFAULT_WORLD_SETTINGS } from "./settings"
import { parsePlayQuery, playQuery } from "./url"

describe("play URL", () => {
  it("retains the generator when sharing an older saved world", () => {
    const query = playQuery(12, { ...DEFAULT_WORLD_SETTINGS, generation: 1 })
    expect(query).toContain("generation=1")
    expect(parsePlayQuery(Object.fromEntries(new URLSearchParams(query))).world.generation).toBe(1)
  })

  it("names a default world by seed, size and generator version", () => {
    expect(playQuery(42, DEFAULT_WORLD_SETTINGS)).toBe(`seed=42&size=${DEFAULT_WORLD_SETTINGS.size}&generation=2`)
  })

  it("writes only the generation inputs that differ from their defaults", () => {
    const query = playQuery(7, { ...DEFAULT_WORLD_SETTINGS, size: 256, coverage: 45, rivers: 2,
      elevation: { ...DEFAULT_ELEVATION, maxHeight: 3 } }, "routing-stress")
    expect(query).toBe("seed=7&size=256&generation=2&forest=45&rivers=2&e_maxHeight=3&benchmark=city-stress")
  })

  it("round-trips a world through the query string", () => {
    const world = { ...DEFAULT_WORLD_SETTINGS, size: 320, glades: 3, darkForests: 0, water: 12, ponds: 1,
      elevation: { ...DEFAULT_ELEVATION, scale: 48, cliffDensity: 1.5 } }
    const params = Object.fromEntries(new URLSearchParams(playQuery(99, world)))
    const parsed = parsePlayQuery(params)
    expect(parsed.seed).toBe(99)
    expect({ ...DEFAULT_WORLD_SETTINGS, ...parsed.world }).toEqual(world)
    expect(parsed.display).toEqual({})
    expect(parsed.benchmark).toBeUndefined()
  })

  it("still reads display tuning from older links without writing it back", () => {
    const parsed = parsePlayQuery({ seed: "5", showTrees: "0", characters: "callings", speed: "2.5", fps: "40",
      stride: "9", road: "2", trees: "procedural", timing: "fps" })
    expect(parsed.display).toEqual({ showTrees: false, characterModel: "callings", walkSpeed: 2.5, characterFps: 24,
      stride: 1.2, road: 2, treeModel: "sprites", walkSync: false })
    expect(parsed.world).toEqual({})
  })

  it("ignores malformed values", () => {
    const parsed = parsePlayQuery({ seed: "abc", size: "big", forest: "NaN", e_maxHeight: "tall", benchmark: "other" })
    expect(parsed).toEqual({ seed: undefined, world: {}, display: {}, benchmark: undefined })
  })
})
