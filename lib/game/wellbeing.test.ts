import { describe, expect, it } from "vitest"
import { GAME_HOUR_SECONDS } from "./calendar"
import { stepDevotion, stepHappiness } from "./wellbeing"

describe("devotion over game time", () => {
  it("drains only the hours beyond a day without church, independently of tick size", () => {
    const whole = { piety: 50 }, ticks = { piety: 50 }
    stepDevotion(whole, 48 * GAME_HOUR_SECONDS, false)
    for (let i = 0; i < 48 * 4; i++) stepDevotion(ticks, GAME_HOUR_SECONDS / 4, false)
    expect(whole.piety).toBeCloseTo(49.52)
    expect(ticks.piety).toBeCloseTo(whole.piety)
  })

  it("renews the grace period during church attendance", () => {
    const npc = { piety: 50, hoursSinceChurch: 100 }
    stepDevotion(npc, GAME_HOUR_SECONDS, true)
    expect(npc).toEqual({ piety: 50, hoursSinceChurch: 0 })
    stepDevotion(npc, 24 * GAME_HOUR_SECONDS, false)
    expect(npc.piety).toBe(50)
    stepDevotion(npc, GAME_HOUR_SECONDS, false)
    expect(npc.piety).toBeCloseTo(49.98)
  })

  it("raises piety during prayer and respects both bounds and paused time", () => {
    const npc = { piety: 50, hoursSinceChurch: 100 }
    stepDevotion(npc, 0, true, true)
    expect(npc).toEqual({ piety: 50, hoursSinceChurch: 100 })
    stepDevotion(npc, 2 * GAME_HOUR_SECONDS, true, true)
    expect(npc.piety).toBe(56)
    stepDevotion(npc, 100 * GAME_HOUR_SECONDS, true, true)
    expect(npc.piety).toBe(100)
    stepDevotion(npc, 10000 * GAME_HOUR_SECONDS, false)
    expect(npc.piety).toBe(0)
  })
})

describe("employment and happiness", () => {
  it("sustains high worker happiness across days, independently of tick size", () => {
    const whole = { happiness: 20 }, ticks = { happiness: 20 }, traveler = { happiness: 80 }
    stepHappiness(whole, 72, true, false)
    for (let i = 0; i < 720; i++) stepHappiness(ticks, .1, true, false)
    stepHappiness(traveler, 72, false, false)
    expect(whole.happiness).toBeGreaterThan(84)
    expect(ticks.happiness).toBeCloseTo(whole.happiness, 8)
    expect(traveler.happiness).toBe(44)
    const paused = { happiness: 40 }
    stepHappiness(paused, 0, true, false)
    expect(paused.happiness).toBe(40)
  })
})
