import { describe, expect, it } from "vitest"

import {
  generateRelic,
  relicBound,
  relicDraw,
  RELICS,
  relicTitle,
  TURN_ASIDE_DRAW,
  turnsAside,
  visitChance,
} from "./relic"
import { DEFAULT_BALANCE } from "./balance"
import { generateTravelers, TRAVELER_TYPES, type Traveler, type TravelerAttributes } from "./travelers"

const who = (piety: number, status: number): TravelerAttributes => ({
  happiness: 80,
  gold: 10,
  status,
  hunger: 50,
  thirst: 50,
  piety,
  stamina: 50,
  jobless: false,
  skills: [],
  age: 30,
})

describe("relic draw", () => {
  const holy = { sanctity: 95, spectacle: 40, doubt: 15 }
  const dubious = { sanctity: 30, spectacle: 95, doubt: 90 }

  it("forecasts an independent evangelism roll only for travelers who would decline", () => {
    const traveler = { ...who(0, 100), hunger: 100, thirst: 100 }
    const obscure = { sanctity: 0, spectacle: 0, doubt: 100 }
    expect(visitChance(traveler, obscure, 0, DEFAULT_BALANCE, 0.05)).toBeCloseTo(0.145)
    const balance = structuredClone(DEFAULT_BALANCE)
    for (const [ordinary, expected] of [[0.2, 0.24], [0.5, 0.525], [1, 1]]) {
      balance.rules.hospitalityBaseChance = ordinary
      expect(visitChance({ ...traveler, hunger: 0 }, obscure, 0, balance, 0.05)).toBeCloseTo(expected)
    }
  })

  it.each(["hunger", "thirst"] as const)("requires a reputation for reliable hospitality when %s is empty", (need) => {
    const traveler = { ...who(0, 100), hunger: 100, thirst: 100, stamina: 100, [need]: 0 }
    const obscure = { sanctity: 0, spectacle: 0, doubt: 100 }
    expect(visitChance(traveler, obscure, 0)).toBeCloseTo(0.1)
    expect(visitChance(traveler, obscure, 10)).toBeCloseTo(0.105)
    expect(visitChance(traveler, obscure, 50)).toBeCloseTo(0.225)
    expect(visitChance(traveler, obscure, 100)).toBeCloseTo(0.6)
    expect(visitChance(traveler, obscure, 200)).toBeCloseTo(0.6)
    expect(visitChance(traveler, obscure, -100)).toBeCloseTo(0.1)
    const balance = structuredClone(DEFAULT_BALANCE)
    balance.rules.hospitalityBaseChance = 0.2
    balance.rules.drawCap = 200
    expect(visitChance(traveler, obscure, 100, balance)).toBeCloseTo(0.325)
  })

  it("starts with about one visitor in ten and attracts a wider crowd as renown grows", () => {
    let early = 0, established = 0, count = 0
    for (let seed = 1; seed <= 20; seed++) {
      const relic = generateRelic(seed)
      for (const traveler of generateTravelers(seed, 60)) {
        early += visitChance(traveler.attributes, relic.stats, 10)
        established += visitChance(traveler.attributes, relic.stats, 100)
        count++
      }
    }
    expect(early / count).toBeGreaterThanOrEqual(0.1)
    expect(early / count).toBeLessThan(0.12)
    expect(established).toBeGreaterThan(early * 2)
  })

  it("gives ordinary and moderately needy passersby a ten percent chance at founding renown", () => {
    for (const renown of [0, 10, 20, 30]) {
      for (const piety of [0, 30, 60, 80]) {
        expect(visitChance({ ...who(piety, 0), hunger: 30, thirst: 30 }, holy, renown)).toBe(0.1)
        expect(visitChance({ ...who(piety, 0), hunger: 30, thirst: 30 }, dubious, renown)).toBe(0.1)
      }
    }
    expect(visitChance(who(95, 20), holy, 0)).toBeGreaterThan(0)
  })

  it("only draws food and water need below the threshold, never tiredness alone", () => {
    const obscure = { sanctity: 0, spectacle: 0, doubt: 100 }
    const traveler = { ...who(0, 100), hunger: 100, thirst: 100, stamina: 0 }
    for (const renown of [0, 30, 100]) expect(visitChance(traveler, obscure, renown)).toBe(0.1)
    for (const need of ["hunger", "thirst"] as const) {
      expect(visitChance({ ...traveler, [need]: 20 }, obscure, 0)).toBe(0.1)
      expect(visitChance({ ...traveler, [need]: 10 }, obscure, 0)).toBeCloseTo(0.1)
      expect(visitChance({ ...traveler, [need]: 30 }, obscure, 100)).toBeCloseTo(0.3)
    }
    expect(visitChance({ ...traveler, hunger: 60, thirst: 60 }, obscure, 100)).toBe(0.1)
  })

  it("applies live piety, need and hospitality strength settings", () => {
    const balance = structuredClone(DEFAULT_BALANCE)
    balance.rules.earlyVisitPiety = 70
    expect(visitChance(who(80, 0), holy, 0, balance)).toBeGreaterThan(0)
    balance.rules.hospitalityNeedThreshold = 40
    balance.rules.hospitalityRenownBonus = 0.2
    expect(visitChance(who(0, 100), holy, 0, balance)).toBe(0.1)
    expect(visitChance({ ...who(0, 100), hunger: 20 }, holy, 0, balance)).toBeCloseTo(0.1)
    expect(visitChance({ ...who(0, 100), thirst: 0 }, { sanctity: 0, spectacle: 0, doubt: 100 }, 100, balance)).toBeCloseTo(0.3)
  })

  it("pulls the devout harder toward a holy relic than the worldly", () => {
    expect(relicDraw(who(100, 20), holy, 10)).toBeGreaterThan(relicDraw(who(20, 20), holy, 10))
    expect(relicDraw(who(100, 20), holy, 10)).toBeGreaterThanOrEqual(TURN_ASIDE_DRAW)
  })

  it("draws the idle and curious to a marvel, but the high-born sniff at doubt", () => {
    // Same thin piety: a peasant is more taken by the spectacle than a lord.
    expect(relicDraw(who(20, 10), dubious, 10)).toBeGreaterThan(relicDraw(who(20, 95), dubious, 10))
    expect(relicDraw(who(20, 95), dubious, 10)).toBeLessThan(TURN_ASIDE_DRAW)
  })

  it("grows with the renown of the whole shrine", () => {
    expect(relicDraw(who(70, 30), holy, 90)).toBeGreaterThan(
      relicDraw(who(70, 30), holy, 5),
    )
  })

  it("sends a different, smaller crowd down the track than walks the road", () => {
    // A holy relic: enough draw that someone turns aside even while it is
    // barely known, never so much that the whole road does.
    const seed = Array.from({ length: 50 }, (_, i) => i + 1).find(
      (s) => generateRelic(s).stats.sanctity >= 80,
    )!
    const relic = generateRelic(seed)
    const travelers = generateTravelers(seed, 60).map((t) => ({ ...t, attributes: { ...t.attributes, hunger: 100, thirst: 100, stamina: 100 } }))
    const bound = relicBound(travelers, relic, 10)
    expect(bound.length).toBeGreaterThan(0)
    expect(bound.length).toBeLessThan(travelers.length)
    expect(bound.every((t) => turnsAside(t, relic, 10))).toBe(true)
    // Pilgrims turn aside for it more readily than the rest of the road.
    const share = (pick: (t: Traveler) => boolean) => {
      const of = travelers.filter(pick)
      return of.length ? of.filter((t) => turnsAside(t, relic, 10)).length / of.length : 0
    }
    expect(share((t) => t.type === TRAVELER_TYPES.pilgrim)).toBeGreaterThan(
      share((t) => t.type !== TRAVELER_TYPES.pilgrim),
    )
  })
})

describe("generateRelic", () => {
  it("is fully determined by its seed", () => {
    expect(generateRelic(12345)).toEqual(generateRelic(12345))
  })

  it("draws different relics for different seeds", () => {
    const names = new Set(Array.from({ length: 60 }, (_, i) => generateRelic(i * 7919 + 1).name))
    expect(names.size).toBeGreaterThan(10)
  })

  it("offers thirty-odd relics, every one with a distinct name", () => {
    expect(RELICS.length).toBeGreaterThanOrEqual(30)
    expect(new Set(RELICS.map((r) => r.name)).size).toBe(RELICS.length)
  })

  it("rolls stats inside the relic's own ranges", () => {
    for (let seed = 0; seed < 200; seed++) {
      const relic = generateRelic(seed)
      const def = RELICS[relic.id]
      expect(relic.name).toBe(def.name)
      expect(relic.stats.sanctity).toBeGreaterThanOrEqual(def.sanctity.min)
      expect(relic.stats.sanctity).toBeLessThanOrEqual(def.sanctity.max)
      expect(relic.stats.spectacle).toBeGreaterThanOrEqual(def.spectacle.min)
      expect(relic.stats.spectacle).toBeLessThanOrEqual(def.spectacle.max)
      expect(relic.stats.doubt).toBeGreaterThanOrEqual(def.doubt.min)
      expect(relic.stats.doubt).toBeLessThanOrEqual(def.doubt.max)
      expect(relic.stats).not.toHaveProperty("renown")
    }
  })

  it("titles a relic for display", () => {
    expect(relicTitle({ ...generateRelic(1), name: "a thorn of the Crown" })).toBe("A thorn of the Crown")
  })
})
