import { describe, expect, it } from "vitest"
import { generateTravelers } from "./travelers"
import { generateMonks } from "./monks"
import { rollCharacterAge } from "./character-age"

describe("character ages", () => {
  it("starts at 18 and uses one random draw per age", () => {
    for (const elders of [false, true]) {
      let draws = 0
      expect(rollCharacterAge(() => { draws++; return 0 }, elders)).toBe(18)
      expect(draws).toBe(1)
      expect(rollCharacterAge(() => 1 - Number.EPSILON, elders)).toBe(elders ? 65 : 39)
    }
  })

  it("keeps the road young with older ages reserved for a minority of knights and friars", () => {
    const travelers = generateTravelers(31337, 10000)
    const average = travelers.reduce((sum, t) => sum + t.attributes.age, 0) / travelers.length
    expect(average).toBeGreaterThan(23)
    expect(average).toBeLessThan(27)
    expect(travelers.filter(t => t.attributes.age <= 35).length / travelers.length).toBeGreaterThan(0.85)
    for (const type of ["knight", "friar"]) {
      const group = travelers.filter(t => t.type.id === type)
      const elders = group.filter(t => t.attributes.age >= 40)
      expect(elders.length / group.length).toBeGreaterThan(0.1)
      expect(elders.length / group.length).toBeLessThan(0.3)
    }
    for (const traveler of travelers.filter(t => t.attributes.age >= 40)) {
      expect(["knight", "friar"]).toContain(traveler.type.id)
    }
  })

  it("also makes most monks young while retaining occasional elders", () => {
    const ages = Array.from({ length: 500 }, (_, seed) => generateMonks(seed)).flat().map(m => m.attributes.age)
    expect(Math.min(...ages)).toBe(18)
    expect(Math.max(...ages)).toBe(65)
    expect(ages.reduce((sum, age) => sum + age, 0) / ages.length).toBeLessThan(32)
    const olderShare = ages.filter(age => age >= 40).length / ages.length
    expect(olderShare).toBeGreaterThan(0.15)
    expect(olderShare).toBeLessThan(0.25)
  })
})
