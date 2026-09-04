import { describe, expect, it } from "vitest"

import { generateTravelers, TRAVELER_TYPES } from "./travelers"

describe("generateTravelers", () => {
  it("is fully determined by its seed", () => {
    const a = generateTravelers(12345, 20)
    const b = generateTravelers(12345, 20)
    expect(a).toEqual(b)
  })

  it("produces a different cast for a different seed", () => {
    const a = generateTravelers(1, 20)
    const b = generateTravelers(2, 20)
    expect(a.map((t) => t.name)).not.toEqual(b.map((t) => t.name))
  })

  it("produces exactly the requested count, ids unique and stable", () => {
    const travelers = generateTravelers(7, 15)
    expect(travelers).toHaveLength(15)
    expect(travelers.map((t) => t.id)).toEqual(Array.from({ length: 15 }, (_, i) => i))
    expect(generateTravelers(7, 0)).toEqual([])
  })

  it("keeps every traveler within their type's bounds", () => {
    for (const t of generateTravelers(99, 200)) {
      expect(t.type).toBe(TRAVELER_TYPES[t.type.id])
      expect(t.offset).toBeGreaterThanOrEqual(0)
      expect(t.offset).toBeLessThan(1)
      expect(Math.abs(t.direction)).toBe(1)
      expect(t.pace).toBeGreaterThanOrEqual(t.type.paceMin)
      expect(t.pace).toBeLessThanOrEqual(t.type.paceMax)
      expect(t.name).toMatch(/\S+ \S+/)
    }
  })

  it("rolls attributes inside their type's ranges, skills from the type's pool", () => {
    for (const t of generateTravelers(31337, 300)) {
      const a = t.attributes
      const within = (value: number, range: { min: number; max: number }) =>
        value >= range.min && value <= range.max
      expect(within(a.gold, t.type.gold), `${t.name} gold ${a.gold}`).toBe(true)
      expect(within(a.status, t.type.status), `${t.name} status ${a.status}`).toBe(true)
      expect(within(a.piety, t.type.piety), `${t.name} piety ${a.piety}`).toBe(true)
      for (const need of [a.hunger, a.thirst, a.stamina] as const) {
        expect(need).toBeGreaterThanOrEqual(0)
        expect(need).toBeLessThanOrEqual(100)
      }
      expect(a.age).toBeGreaterThanOrEqual(16)
      expect(a.age).toBeLessThanOrEqual(60)
      expect(Number.isInteger(a.gold)).toBe(true)

      expect(within(a.skills.length, t.type.skillCount)).toBe(true)
      expect(new Set(a.skills).size, `${t.name} skills are unique`).toBe(a.skills.length)
      for (const skill of a.skills) expect(t.type.skills).toContain(skill)

      if (t.type.joblessChance === 0) {
        expect(a.jobless, `${t.type.id} is never jobless`).toBe(false)
      }
    }
  })

  it("makes joblessness common among pilgrims but not universal", () => {
    const pilgrims = generateTravelers(555, 400).filter((t) => t.type.id === "pilgrim")
    const jobless = pilgrims.filter((t) => t.attributes.jobless).length
    expect(jobless).toBeGreaterThan(pilgrims.length * 0.3)
    expect(jobless).toBeLessThan(pilgrims.length * 0.7)
  })

  it("sends traffic both ways and mixes the callings", () => {
    const travelers = generateTravelers(4242, 200)
    const eastbound = travelers.filter((t) => t.direction === 1).length
    expect(eastbound).toBeGreaterThan(40)
    expect(eastbound).toBeLessThan(160)

    const kinds = new Set(travelers.map((t) => t.type.id))
    expect(kinds.size).toBeGreaterThanOrEqual(4)
  })
})
