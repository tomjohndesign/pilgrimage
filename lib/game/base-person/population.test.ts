import { GREY_HAIR_COLOR } from "../character-age"
import { monkVisual } from "./monk-assets"
import { ACTION_CLIPS, PERSON_CLIPS } from "./pose"
import { describe, expect, it } from "vitest"
import { TRAVELER_TYPES } from "../travelers"
import { DEFAULT_DESIGN, DESIGN_CONTROLS, validatePersonDesign, type DesignKey } from "./design"
import { populationDesign, POPULATION_PROFILES, travelerAppearance } from "./population"
import { DEFAULT_POPULATION, populationVisual } from "./population-assets"

describe("road character population", () => {
  it("keeps identity stable across ordering and crowd size, with mixed bodies at a uniform scale", () => {
    const people = Array.from({ length: 200 }, (_, id) => travelerAppearance(12345, id))
    expect(new Set(people.map(p => p.variant)).size).toBe(6)
    expect(new Set(people.map(p => p.scale))).toEqual(new Set([1]))
    for (let id = 0; id < people.length; id++) {
      expect(travelerAppearance(12345, id)).toEqual(people[id])
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
        if (variant >= 3) { expect(design.beard).toBe(false); expect(design.hairStyle).toBe(POPULATION_PROFILES[variant].hair) }
      }
    }
    const profiles = POPULATION_PROFILES.map((_, i) => populationDesign(TRAVELER_TYPES.peasant, i))
    expect(new Set(profiles.map(p => p.torsoHeight)).size).toBe(3)
    expect(new Set(profiles.map(p => p.build)).size).toBeGreaterThan(2)
  })
  it("selects grey hair at 40 while preserving bodies, gait and every activity", () => {
    for (const type of ["knight", "friar"] as const) for (let variant = 0; variant < 6; variant++) {
      const young = populationVisual(type, variant, null, 39)
      const old = populationVisual(type, variant, null, 40)
      expect(old.design).toEqual({ ...young.design, hairColor: GREY_HAIR_COLOR })
      expect(old.rowOffset).toBe(young.rowOffset)
      expect(old.walkStride).toBe(young.walkStride)
      expect(old.center).toEqual(young.center)
      expect(old.scale).toBe(young.scale)
      expect(old.walk.url).toContain(`${type}-grey-walk.png`)
      expect(old.idle.url).toContain(`${type}-grey-idle.png`)
      for (const clip of ACTION_CLIPS.filter(clip => clip !== "preaching")) {
        expect(old.actions[clip]?.url).toContain(`${type}-grey-${clip}.png`)
        expect(old.actions[clip]?.columns).toBe(young.actions[clip]?.columns)
      }
    }
    const youngMonk = monkVisual(39), oldMonk = monkVisual(40)
    expect(oldMonk.design).toEqual({ ...youngMonk.design, hairColor: GREY_HAIR_COLOR })
    expect(oldMonk.walkStride).toBe(youngMonk.walkStride)
    expect(oldMonk.walk.columns).toBe(youngMonk.walk.columns)
    for (const clip of ACTION_CLIPS) {
      expect(oldMonk.actions[clip]?.url).not.toBe(youngMonk.actions[clip]?.url)
      expect(oldMonk.actions[clip]?.columns).toBe(youngMonk.actions[clip]?.columns)
    }
  })

  it("ships a pack whose palette reserves the skin and hair steps for the body", () => {
    // Without it the road recolour is off: props share those colours in older bakes.
    expect(DEFAULT_POPULATION.reservedTones).toBe(true)
    expect(populationVisual("peasant", 0, null).reservedTones).toBe(true)
  })

  it("registers every calling and body in matching walk, idle and shadow rows", () => {
    for (const type of Object.values(TRAVELER_TYPES)) for (let variant = 0; variant < 6; variant++) {
      const visual = populationVisual(type.id, variant, null)
      expect(visual.design).toEqual(populationDesign(type, variant))
      expect(visual.rowOffset).toBe(variant * 8)
      expect(visual.walk.rows).toBe(48)
      expect(visual.idle.rows).toBe(48)
      for (const clip of ACTION_CLIPS.filter(clip => clip !== "preaching")) {
        expect(visual.actions[clip]?.url).toContain(`${type.id}-${clip}.png`)
        expect(visual.actions[clip]?.shadow).toContain(`shadow-${clip}.png`)
        expect(visual.actions[clip]?.rows).toBe(visual.walk.rows)
        expect(visual.actions[clip]?.columns).toBe(PERSON_CLIPS[clip].frames)
      }
      expect(visual.walk.columns).toBe(20)
      expect(visual.walk.strides).toBe(1)
      expect(visual.idle.columns).toBe(1)
      expect(visual.center).toEqual([0.5, 1 - 48.5 / 64])
      expect(visual.strideRatio).toBeGreaterThan(0)
      expect(visual.shadow).toEqual(DEFAULT_POPULATION.shadows)
      for (let facing = 0; facing < 8; facing++) expect(visual.rowOffset + facing).toBeLessThan(48)
    }
  })
})
