import { describe, expect, it } from "vitest"
import { travelerWeariness, wearySpeedScale, MIN_WEARY_SPEED } from "./traveler-weariness"

describe("traveler weariness", () => {
  it.each(["hunger", "thirst", "stamina"] as const)("slows smoothly for low %s, with a nonzero floor", need => {
    const needs = { hunger: 100, thirst: 100, stamina: 100 }
    expect(travelerWeariness(needs)).toBe(0)
    expect(wearySpeedScale(needs)).toBe(1)
    needs[need] = 25
    expect(travelerWeariness(needs)).toBe(0)
    needs[need] = 12.5
    expect(travelerWeariness(needs)).toBe(0.5)
    expect(wearySpeedScale(needs)).toBe(0.8)
    needs[need] = 0
    expect(wearySpeedScale(needs)).toBe(MIN_WEARY_SPEED)
    expect(wearySpeedScale({ hunger: 0, thirst: 0, stamina: 0 })).toBe(MIN_WEARY_SPEED)
    needs[need] = 100
    expect(travelerWeariness(needs)).toBe(0)
  })
})
