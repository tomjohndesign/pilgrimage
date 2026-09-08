import { describe, expect, it } from "vitest"

import { generateTravelers, MAX_TRAFFIC, travelerCountForMap, TRAVELER_TYPES } from "./travelers"
import { POPULATION_PROFILES, travelerAppearance } from "./base-person/population"

describe("travelerCountForMap", () => {
  it("preserves the default crowd and scales with map area", () => {
    expect(travelerCountForMap({ width: 128, depth: 128 })).toBe(12)
    expect(travelerCountForMap({ width: 64, depth: 64 })).toBe(3)
    expect(travelerCountForMap({ width: 256, depth: 256 })).toBe(48)
    expect(travelerCountForMap({ width: 128, depth: 256 })).toBe(24)
  })

  it("applies the chosen density and allows empty roads at every size", () => {
    for (const size of [64, 128, 256, 512]) {
      const map = { width: size, depth: size }
      expect(travelerCountForMap(map, 24)).toBe(travelerCountForMap(map) * 2)
      expect(travelerCountForMap(map, 0)).toBe(0)
    }
    expect(travelerCountForMap({ width: 512, depth: 512 }, MAX_TRAFFIC)).toBe(10_000)
  })

  it("rounds to a whole crowd and ignores invalid densities", () => {
    const map = { width: 96, depth: 96 }
    expect(generateTravelers(7, travelerCountForMap(map))).toHaveLength(7)
    for (const density of [-1, NaN, Infinity]) {
      expect(travelerCountForMap(map, density)).toBe(0)
    }
  })
})

describe("generateTravelers", () => {
  it("includes a monk and a vendor in normal road crowds", () => {
    for (const seed of [0, 1, 42, 12345]) for (const count of [6, 12, 30]) {
      const travelers = generateTravelers(seed, count)
      expect(travelers.some(t => t.type.id === "friar" && t.type.label === "Monk")).toBe(true)
      expect(travelers.some(t => t.type.id === "vendor")).toBe(true)
    }
  })
  it("starts passing travelers supplied for their own journey", () => {
    for (const seed of [1, 42, 12345]) {
      for (const { attributes } of generateTravelers(seed, 100)) {
        expect(attributes.hunger).toBeGreaterThanOrEqual(80)
        expect(attributes.thirst).toBeGreaterThanOrEqual(80)
      }
    }
  })
  it("matches first names to the rendered population profile across seeds and callings", () => {
    const women = new Set([
      "Berta", "Dilys", "Frida", "Hawise", "Isolde", "Maude", "Osanna",
      "Quenild", "Sybil", "Wilmot", "Ysabel",
    ])
    const callings = { Male: new Set<string>(), Female: new Set<string>() }
    for (const seed of [0, 7, 12345, 31337]) {
      for (const traveler of generateTravelers(seed, 500)) {
        if (traveler.type.id === "friar") {
          expect(traveler.name).toMatch(/^Brother /)
          continue
        }
        const { variant } = travelerAppearance(seed, traveler.id)
        const { bodyType } = POPULATION_PROFILES[variant]
        expect(women.has(traveler.name.split(" ")[0]), traveler.name).toBe(bodyType === "Female")
        callings[bodyType].add(traveler.type.id)
      }
    }
    for (const seen of Object.values(callings)) {
      expect([...seen].sort()).toEqual(Object.keys(TRAVELER_TYPES).filter(id => id !== "friar").sort())
    }
  })

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
      expect(a.age).toBeGreaterThanOrEqual(18)
      expect(a.age).toBeLessThanOrEqual(["knight", "friar"].includes(t.type.id) ? 65 : 39)
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

  it("weights callings as percent shares of the road, peasants at 60", () => {
    const total = Object.values(TRAVELER_TYPES).reduce((sum, t) => sum + t.weight, 0)
    expect(total).toBeCloseTo(100, 10)
    expect(TRAVELER_TYPES.peasant.weight).toBe(60)
  })

  it("fills roughly six in ten places on the road with peasants", () => {
    const travelers = generateTravelers(31337, 2000)
    const peasants = travelers.filter((t) => t.type.id === "peasant").length / travelers.length
    expect(peasants).toBeGreaterThan(0.55)
    expect(peasants).toBeLessThan(0.65)
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

it("keeps minstrels scarce and beggars slower than the other road walkers", () => {
  const crowd = generateTravelers(42, 10000)
  const minstrels = crowd.filter(t => t.type.id === "minstrel").length
  expect(minstrels / crowd.length).toBeGreaterThan(0.01)
  expect(minstrels / crowd.length).toBeLessThan(0.025)
  expect(crowd.some(t => t.type.id === "beggar")).toBe(true)
  expect(Object.values(TRAVELER_TYPES).reduce((sum, t) => sum + t.weight, 0)).toBe(100)
  for (const type of Object.values(TRAVELER_TYPES).filter(t => t.id !== "beggar")) {
    expect(TRAVELER_TYPES.beggar.paceMax).toBeLessThan(type.paceMin)
  }
})
