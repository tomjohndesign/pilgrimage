import { describe, expect, it } from "vitest"

import { generateMonks, MONK_COUNT } from "./monks"

describe("generateMonks", () => {
  it("is fully determined by its seed", () => {
    expect(generateMonks(12345)).toEqual(generateMonks(12345))
  })

  it("raises a brotherhood of four with distinct names and offices, led by the keeper", () => {
    for (let seed = 0; seed < 50; seed++) {
      const monks = generateMonks(seed)
      expect(monks).toHaveLength(MONK_COUNT)
      expect(new Set(monks.map((m) => m.name)).size).toBe(MONK_COUNT)
      expect(new Set(monks.map((m) => m.duty)).size).toBe(MONK_COUNT)
      expect(monks[0].duty).toBe("Keeper of the Relic")
      for (const m of monks) {
        expect(m.name).toMatch(/^Brother /)
        expect(m.attributes.piety).toBeGreaterThanOrEqual(75)
        expect(m.attributes.skills.length).toBeGreaterThanOrEqual(1)
        expect(new Set(m.attributes.skills).size).toBe(m.attributes.skills.length)
      }
    }
  })
})
