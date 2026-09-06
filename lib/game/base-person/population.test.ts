import { ACTION_CLIPS } from "./pose"
import { describe, expect, it } from "vitest"
import { TRAVELER_TYPES } from "../travelers"
import { PERSON_CLIPS } from "./pose"
import { DEFAULT_DESIGN, DESIGN_CONTROLS, validatePersonDesign, type DesignKey } from "./design"
import { populationDesign, POPULATION_PROFILES, travelerAppearance } from "./population"
import { DEFAULT_POPULATION, populationVisual } from "./population-assets"

describe("road character population", () => {
  it("keeps identity stable across ordering and crowd size, with mixed bodies and sizes", () => {
    const people = Array.from({ length: 200 }, (_, id) => travelerAppearance(12345, id))
    expect(new Set(people.map(p => p.variant)).size).toBe(6)
    expect(new Set(people.map(p => p.scale)).size).toBeGreaterThan(15)
    for (let id = 0; id < people.length; id++) {
      expect(travelerAppearance(12345, id)).toEqual(people[id])
      expect(people[id].scale).toBeGreaterThanOrEqual(0.9)
      expect(people[id].scale).toBeLessThanOrEqual(1.1)
      expect(POPULATION_PROFILES[people[id].variant].bodyType).toBe(people[id].bodyType)
      if (id % 2 === 1) expect(people[id].bodyType).not.toBe(people[id - 1].bodyType)
    }
    expect(Array.from({ length: 200 }, (_, id) => travelerAppearance(54321, id))).not.toEqual(people)
  })
  it("uses calling colors and keeps every varied property within editor bounds", () => {
    for (const type of Object.values(TRAVELER_TYPES)) for (let variant = 0; variant < 6; variant++) {
      for (const bound of ["min", "max"] as const) {
        const base = { ...DEFAULT_DESIGN }
        for (const key of Object.keys(DESIGN_CONTROLS) as DesignKey[]) base[key] = DESIGN_CONTROLS[key][bound]
        const design = populationDesign(type, variant, base)
        expect(validatePersonDesign(design)).toEqual(design)
        expect(design.tunicColor).toBe(type.color)
        expect(design.bodyType).toBe(variant < 3 ? "Male" : "Female")
        if (variant >= 3) { expect(design.beard).toBe(false); expect(design.hairStyle).toBe("Long") }
      }
    }
    const profiles = POPULATION_PROFILES.map((_, i) => populationDesign(TRAVELER_TYPES.peasant, i))
    expect(new Set(profiles.map(p => p.torsoHeight)).size).toBe(3)
    expect(new Set(profiles.map(p => p.build)).size).toBeGreaterThan(2)
  })
  it("registers every calling and body in matching walk, idle and shadow rows", () => {
    for (const type of Object.values(TRAVELER_TYPES)) for (let variant = 0; variant < 6; variant++) {
      const visual = populationVisual(type.id, variant, null)
      expect(visual.design).toEqual(populationDesign(type, variant))
      expect(visual.rowOffset).toBe(variant * 8)
      expect(visual.walk.rows).toBe(48)
      expect(visual.idle.rows).toBe(48)
      for (const clip of ACTION_CLIPS) {
        expect(visual.actions[clip]?.url).toContain(`${type.id}-${clip}.png`)
        expect(visual.actions[clip]?.shadow).toContain(`shadow-${clip}.png`)
        expect(visual.actions[clip]?.rows).toBe(visual.walk.rows)
        expect(visual.actions[clip]?.columns).toBe(PERSON_CLIPS[clip].frames)
      }
      expect(visual.walk.columns).toBe(8)
      expect(visual.idle.columns).toBe(1)
      expect(visual.center).toEqual([0.5, 1 - 48.5 / 64])
      expect(visual.strideRatio).toBeGreaterThan(0)
      expect(visual.shadow).toEqual(DEFAULT_POPULATION.shadows)
      for (let facing = 0; facing < 8; facing++) expect(visual.rowOffset + facing).toBeLessThan(48)
    }
  })
})
