import { afterEach, describe, expect, it } from "vitest"
import { crossedWoodcuttingImpact, woodcuttingProfile } from "../base-person/woodcutting"
import { DEFAULT_DESIGN, PERSON_PRESETS } from "../base-person/design"
import { TREE_IMPACT_DURATION, strikeTree, treeImpactAngle, treeImpacts } from "./impact"
import type { TreePlacement } from "./placement"

afterEach(() => treeImpacts.clear())

describe("axe impacts", () => {
  it("fires once per contact, including skipped frames and cycle wraps, and never while paused", () => {
    for (const design of [DEFAULT_DESIGN, PERSON_PRESETS.Female, PERSON_PRESETS.Monk]) {
      const profile = woodcuttingProfile(design)
      const contact = Math.ceil(profile.strikeEnd * 24)
      expect(crossedWoodcuttingImpact(contact - 0.1, contact, 24, profile)).toBe(true)
      expect(crossedWoodcuttingImpact(contact, contact + 0.9, 24, profile)).toBe(false)
      expect(crossedWoodcuttingImpact(contact, contact, 24, profile)).toBe(false)
      expect(crossedWoodcuttingImpact(contact - 2, contact + 3, 24, profile)).toBe(true)
      expect(crossedWoodcuttingImpact(23, 25, 24, profile)).toBe(false)
      expect(crossedWoodcuttingImpact(24 + contact - 1, 24 + contact, 24, profile)).toBe(true)
    }
  })

  it("recoils, rebounds with diminishing strength, and settles completely", () => {
    expect(treeImpactAngle(0)).toBe(0)
    expect(treeImpactAngle(0.05)).toBeGreaterThan(0)
    expect(treeImpactAngle(0.15)).toBeLessThan(0)
    expect(Math.abs(treeImpactAngle(0.15))).toBeLessThan(treeImpactAngle(0.05))
    expect(treeImpactAngle(TREE_IMPACT_DURATION)).toBe(0)
    expect(treeImpactAngle(10)).toBe(0)
  })

  it("restarts only the struck tree's recoil on another hit", () => {
    const oak: TreePlacement = { x: 1, y: 0, z: 2, species: "oak" }
    const birch: TreePlacement = { x: 2, y: 0, z: 2, species: "birch" }
    strikeTree(oak, 0)
    strikeTree(birch, 1)
    treeImpacts.get(oak)!.elapsed = 0.3
    treeImpacts.get(birch)!.elapsed = 0.2
    strikeTree(oak, Math.PI / 2)
    expect(treeImpacts.get(oak)).toEqual({ elapsed: 0, heading: Math.PI / 2 })
    expect(treeImpacts.get(birch)!.elapsed).toBe(0.2)
  })
})
