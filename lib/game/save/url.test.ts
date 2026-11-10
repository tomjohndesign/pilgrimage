import { describe, expect, it } from "vitest"

import { DEFAULT_ELEVATION } from "../map/elevation"
import { MAX_TRAFFIC } from "../travelers"
import { parseGameSave, SAVE_VERSION, worldIdentity } from "./schema"
import { DEFAULT_WORLD_SETTINGS } from "./settings"
import { parsePlayQuery, playQuery } from "./url"

describe("play URL", () => {
  it.each([1, 2, 3])("retains generator %i when sharing an older saved world", generation => {
    const query = playQuery(12, { ...DEFAULT_WORLD_SETTINGS, generation })
    expect(query).toContain(`generation=${generation}`)
    expect(parsePlayQuery(Object.fromEntries(new URLSearchParams(query))).world.generation).toBe(generation)
  })

  it("names a default world by seed, size and generator version", () => {
    expect(playQuery(42, DEFAULT_WORLD_SETTINGS)).toBe(`seed=42&size=${DEFAULT_WORLD_SETTINGS.size}&generation=4`)
  })

  it("writes only the generation inputs that differ from their defaults", () => {
    const query = playQuery(7, { ...DEFAULT_WORLD_SETTINGS, size: 256, coverage: 45, rivers: 2,
      elevation: { ...DEFAULT_ELEVATION, maxHeight: 3 } }, "routing-stress")
    expect(query).toBe("seed=7&size=256&generation=4&forest=45&rivers=2&e_maxHeight=3&benchmark=city-stress")
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

  it("holds world inputs to the bounds a save accepts, so a link never makes an unloadable world", () => {
    const parsed = parsePlayQuery({ seed: "5", rivers: "-2", lakes: "-9", forest: "150", glades: "-3", water: "101", traffic: "1000000", size: "9000" })
    expect(parsed.world).toEqual({ rivers: -1, lakes: -1, coverage: 100, glades: 0, water: 100, traffic: MAX_TRAFFIC, size: 512 })
    for (const q of [{ rivers: "-2" }, { forest: "150" }, { glades: "-3" }, { water: "101" }, { traffic: "1000000" }, { dark: "-1" }, { relic: "-4" }]) {
      const { world } = parsePlayQuery({ seed: "5", ...q })
      const save = { version: SAVE_VERSION, savedAt: "x", world: worldIdentity(5, { ...DEFAULT_WORLD_SETTINGS, ...world }),
        settlement: { claimedBuildings: [], resources: { gold: 10, wood: 5 }, deliveredWood: 0, spentWood: 0, shrineAdmission: 1,
          collectedAdmission: 0, collectedTrade: 0, structures: [] },
        simulation: { time: 1.5, treeModel: "sprites", visits: 0, wood: 0, shrineGold: 0, tradeGold: 0, constructionWood: 0,
          shrineQueueSequence: 0, admissionSequence: 0, relic: { sanctity: 50, spectacle: 50, doubt: 10 }, felled: [], treeResources: [],
          foodStores: [], piles: [], travelers: [], joinedMonks: [] },
        camera: { targetX: 0, targetZ: 0, viewIndex: 0, viewSize: 24 }, playback: { paused: false, speed: 2 } }
      const loaded = parseGameSave(JSON.parse(JSON.stringify(save)))
      expect(loaded.error, JSON.stringify(q)).toBeNull()
      expect(loaded.save?.world).toEqual(save.world)
    }
    expect(parsePlayQuery({ traffic: "40" }).world.traffic).toBe(40)
  })
})
