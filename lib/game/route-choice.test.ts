import { describe, expect, it } from "vitest"

import {
  holdsNerve,
  nerve,
  PIOUS_PIETY,
  takesTrack,
  trackChance,
  WEARY_STAMINA,
} from "./route-choice"
import type { TravelerTypeId } from "./travelers"

const fresh = (type: TravelerTypeId, piety = 50) => ({ type, piety, stamina: 100 })

describe("trackChance", () => {
  it("never sends merchants, vendors, or minstrels down the track, whatever their state", () => {
    for (const type of ["merchant", "vendor", "minstrel"] as const) {
      expect(trackChance(fresh(type))).toBe(0)
      expect(trackChance({ type, piety: 100, stamina: 0 })).toBe(0)
    }
  })

  it("lets knights sometimes take it, regardless of piety or stamina", () => {
    const chance = trackChance(fresh("knight"))
    expect(chance).toBeGreaterThan(0.3)
    expect(chance).toBeLessThan(0.8)
    expect(trackChance({ type: "knight", piety: 0, stamina: 0 })).toBe(chance)
    expect(trackChance({ type: "knight", piety: 100, stamina: 100 })).toBe(chance)
  })

  it("keeps ordinary pilgrims and friars on the road", () => {
    expect(trackChance(fresh("pilgrim"))).toBe(0)
    expect(trackChance(fresh("friar", 70))).toBe(0)
    expect(trackChance({ type: "pilgrim", piety: PIOUS_PIETY - 1, stamina: WEARY_STAMINA })).toBe(0)
  })

  it("tempts the very pious and the worn out, most of all both", () => {
    const pious = trackChance({ type: "pilgrim", piety: PIOUS_PIETY, stamina: 100 })
    const weary = trackChance({ type: "pilgrim", piety: 50, stamina: WEARY_STAMINA - 1 })
    const both = trackChance({ type: "pilgrim", piety: 100, stamina: 0 })
    expect(pious).toBeGreaterThan(0)
    expect(weary).toBeGreaterThan(0)
    expect(both).toBeGreaterThan(Math.max(pious, weary))
    // Friars follow the same rule — their faith stays their fear.
    expect(trackChance({ type: "friar", piety: PIOUS_PIETY, stamina: 100 })).toBe(pious)
    expect(trackChance({ type: "friar", piety: 50, stamina: 0 })).toBe(weary)
  })

  it("resolves against a roll", () => {
    const state = { type: "knight" as const, piety: 50, stamina: 100 }
    expect(takesTrack(state, 0)).toBe(true)
    expect(takesTrack(state, 0.999)).toBe(false)
    expect(takesTrack(fresh("merchant"), 0)).toBe(false)
  })
})

describe("nerve", () => {
  it("has knights press on far more often than anyone else", () => {
    for (const type of ["pilgrim", "friar", "merchant", "vendor", "minstrel"] as const) {
      expect(nerve(fresh("knight"))).toBeGreaterThan(nerve(fresh(type)) + 0.3)
    }
  })

  it("steadies the very pious", () => {
    expect(nerve({ type: "pilgrim", piety: 100, stamina: 50 })).toBeGreaterThan(nerve(fresh("pilgrim")))
    expect(nerve({ type: "pilgrim", piety: 100, stamina: 50 })).toBeLessThanOrEqual(1)
  })

  it("resolves against a roll", () => {
    expect(holdsNerve(fresh("knight"), 0)).toBe(true)
    expect(holdsNerve(fresh("minstrel"), 0.999)).toBe(false)
  })
})
