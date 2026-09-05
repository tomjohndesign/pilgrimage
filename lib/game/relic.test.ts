import { describe, expect, it } from "vitest"

import { generateRelic, RELICS, relicTitle } from "./relic"

describe("generateRelic", () => {
  it("is fully determined by its seed", () => {
    expect(generateRelic(12345)).toEqual(generateRelic(12345))
  })

  it("draws different relics for different seeds", () => {
    const names = new Set(Array.from({ length: 60 }, (_, i) => generateRelic(i * 7919 + 1).name))
    expect(names.size).toBeGreaterThan(10)
  })

  it("offers thirty-odd relics, every one with a distinct name", () => {
    expect(RELICS.length).toBeGreaterThanOrEqual(30)
    expect(new Set(RELICS.map((r) => r.name)).size).toBe(RELICS.length)
  })

  it("rolls stats inside the relic's own ranges", () => {
    for (let seed = 0; seed < 200; seed++) {
      const relic = generateRelic(seed)
      const def = RELICS[relic.id]
      expect(relic.name).toBe(def.name)
      expect(relic.stats.sanctity).toBeGreaterThanOrEqual(def.sanctity.min)
      expect(relic.stats.sanctity).toBeLessThanOrEqual(def.sanctity.max)
      expect(relic.stats.spectacle).toBeGreaterThanOrEqual(def.spectacle.min)
      expect(relic.stats.spectacle).toBeLessThanOrEqual(def.spectacle.max)
      expect(relic.stats.doubt).toBeGreaterThanOrEqual(def.doubt.min)
      expect(relic.stats.doubt).toBeLessThanOrEqual(def.doubt.max)
      expect(relic.stats.renown).toBeGreaterThan(0)
      expect(relic.stats.renown).toBeLessThan(20)
    }
  })

  it("titles a relic for display", () => {
    expect(relicTitle({ ...generateRelic(1), name: "a thorn of the Crown" })).toBe("A thorn of the Crown")
  })
})
