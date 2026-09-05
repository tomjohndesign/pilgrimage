import { describe, expect, it } from "vitest"

import {
  generateRelic,
  relicBound,
  relicDraw,
  RELICS,
  relicTitle,
  TURN_ASIDE_DRAW,
  turnsAside,
} from "./relic"
import { generateTravelers, TRAVELER_TYPES, type Traveler, type TravelerAttributes } from "./travelers"

const who = (piety: number, status: number): TravelerAttributes => ({
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
  const holy = { sanctity: 95, spectacle: 40, doubt: 15, renown: 10 }
  const dubious = { sanctity: 30, spectacle: 95, doubt: 90, renown: 10 }

  it("pulls the devout harder toward a holy relic than the worldly", () => {
    expect(relicDraw(who(100, 20), holy)).toBeGreaterThan(relicDraw(who(20, 20), holy))
    expect(relicDraw(who(100, 20), holy)).toBeGreaterThanOrEqual(TURN_ASIDE_DRAW)
  })

  it("draws the idle and curious to a marvel, but the high-born sniff at doubt", () => {
    // Same thin piety: a peasant is more taken by the spectacle than a lord.
    expect(relicDraw(who(20, 10), dubious)).toBeGreaterThan(relicDraw(who(20, 95), dubious))
    expect(relicDraw(who(20, 95), dubious)).toBeLessThan(TURN_ASIDE_DRAW)
  })

  it("grows with renown, since nobody turns aside for a relic they've never heard of", () => {
    expect(relicDraw(who(70, 30), { ...holy, renown: 90 })).toBeGreaterThan(
      relicDraw(who(70, 30), { ...holy, renown: 5 }),
    )
  })

  it("sends a different, smaller crowd down the track than walks the road", () => {
    // A holy relic: enough draw that someone turns aside even while it is
    // barely known, never so much that the whole road does.
    const seed = Array.from({ length: 50 }, (_, i) => i + 1).find(
      (s) => generateRelic(s).stats.sanctity >= 80,
    )!
    const relic = generateRelic(seed)
    const travelers = generateTravelers(seed, 60).map((t) => ({
      ...t, attributes: { ...t.attributes, hunger: 100, thirst: 100, stamina: 100 },
    }))
    const bound = relicBound(travelers, relic)
    expect(bound.length).toBeGreaterThan(0)
    expect(bound.length).toBeLessThan(travelers.length)
    expect(bound.every((t) => turnsAside(t, relic))).toBe(true)
    // Pilgrims turn aside for it more readily than the rest of the road.
    const share = (pick: (t: Traveler) => boolean) => {
      const of = travelers.filter(pick)
      return of.length ? of.filter((t) => turnsAside(t, relic)).length / of.length : 0
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
      expect(relic.stats.renown).toBeGreaterThan(0)
      expect(relic.stats.renown).toBeLessThan(20)
    }
  })

  it("titles a relic for display", () => {
    expect(relicTitle({ ...generateRelic(1), name: "a thorn of the Crown" })).toBe("A thorn of the Crown")
  })
})
