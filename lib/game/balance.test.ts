import { describe, expect, it } from "vitest"
import {
  BUILD_CATALOG,
  DEFAULT_BALANCE,
  buildCatalog,
  buildingIncomeLabel,
  exportBalance,
  importBalance,
  validateBalance,
} from "./balance"
import {
  createSettlement,
  collectIncome,
  individualRenown,
  placementError,
  purchaseStructure,
  relicRenown,
  renownTiers,
  settlementRenown,
} from "./settlement"
import { generateMonks } from "./monks"
import { generateRelic, relicDraw, turnsAside } from "./relic"
import { generateTravelers } from "./travelers"
import type { GameMap } from "./map/types"

const fresh = () => structuredClone(DEFAULT_BALANCE)
function map(): GameMap {
  return {
    width: 40,
    depth: 40,
    tiles: Array(1600).fill("grass"),
    buildings: [
      {
        id: "hovel",
        label: "Hovel",
        x: 18,
        z: 18,
        w: 2,
        d: 2,
        height: 1,
        color: "#888",
        roofColor: "#444",
      },
    ],
    site: { hovelId: "hovel", door: { x: 18, z: 20 }, branch: [{ x: 18, z: 20 }], junction: 0 },
  }
}

describe("balance presets", () => {
  it("round-trips all defaults without sharing mutable objects", () => {
    const result = importBalance(exportBalance(DEFAULT_BALANCE))
    expect(result.balance).toEqual(DEFAULT_BALANCE)
    expect(result.balance).not.toBe(DEFAULT_BALANCE)
    expect(result.balance?.buildings.hall).not.toBe(DEFAULT_BALANCE.buildings.hall)
  })
  it("migrates earlier version 1 presets without losing edits", () => {
    const old = JSON.parse(exportBalance(DEFAULT_BALANCE))
    delete old.balance.rules.visitRenown
    delete old.balance.buildings.lumberCamp
    old.balance.rules.startingGold = 321
    old.balance.buildings.shelter.goldCost = 17
    const result = importBalance(JSON.stringify(old))
    expect(result.error).toBeNull()
    expect(result.balance?.rules.startingGold).toBe(321)
    expect(result.balance?.buildings.shelter.goldCost).toBe(17)
    expect(result.balance?.rules.visitRenown).toBe(0.5)
    expect(result.balance?.buildings.lumberCamp).toEqual(DEFAULT_BALANCE.buildings.lumberCamp)
    old.balance.buildings.lumberCamp = { goldCost: -1 }
    expect(importBalance(JSON.stringify(old)).balance).toBeNull()
  })
  it.each([NaN, Infinity, -1, 1.5, 100001, "200", null])(
    "rejects invalid starting supplies: %s",
    (value) => {
      const input = { ...fresh(), rules: { ...DEFAULT_BALANCE.rules, startingGold: value } }
      expect(validateBalance(input).balance).toBeNull()
    },
  )
  it("rejects missing fields, unknown versions and malformed JSON", () => {
    expect(validateBalance({ rules: {}, buildings: {} }).balance).toBeNull()
    expect(importBalance('{"version":2}').error).toMatch(/version/)
    expect(importBalance("oops").error).toMatch(/JSON/)
  })
  it("rejects zero divisors, sub-second timers and unordered tiers", () => {
    for (const key of ["pietyDivisor", "relicDivisor", "drawCap", "incomeSeconds"] as const) {
      const balance = fresh()
      balance.rules[key] = 0
      expect(validateBalance(balance).balance).toBeNull()
    }
    const balance = fresh()
    balance.rules.pilgrimageRenown = balance.rules.sanctuaryRenown
    expect(validateBalance(balance).error).toMatch(/thresholds/)
  })
  it("rejects invalid building fields atomically and accepts zero cost/income", () => {
    const balance = fresh()
    balance.buildings.hall.goldCost = -1
    expect(validateBalance(balance).balance).toBeNull()
    balance.buildings.hall.goldCost = 0
    balance.buildings.hall.goldIncome = 0
    expect(validateBalance(balance).balance).toEqual(balance)
  })
})

describe("tuned gameplay", () => {
  it("uses starting funds, costs and unlocks from the supplied balance", () => {
    const balance = fresh()
    balance.rules.startingGold = 12
    balance.rules.startingWood = 9
    balance.buildings.hall = {
      ...balance.buildings.hall,
      requiredRenown: 0,
      goldCost: 12,
      woodCost: 9,
    }
    const settlement = createSettlement(balance)
    const bought = purchaseStructure(settlement, map(), [], [], "hall", { x: 22, z: 18 }, balance)
    expect(bought.error).toBeNull()
    expect(bought.settlement.resources).toEqual({ gold: 0, wood: 0 })
    expect(settlement.resources).toEqual({ gold: 12, wood: 9 })
    const relocked = fresh()
    relocked.buildings.hall.requiredRenown = 1000
    expect(
      purchaseStructure(bought.settlement, map(), [], [], "hall", { x: 22, z: 22 }, relocked).error,
    ).toMatch(/1000/)
    expect(bought.settlement.structures).toHaveLength(1)
  })
  it("revalues existing structures and income without changing their treasury or footprint", () => {
    const world = map()
    const existing = purchaseStructure(createSettlement(), world, [], [], "shelter", {
      x: 22,
      z: 18,
    }).settlement
    const before = structuredClone(existing)
    const balance = fresh()
    balance.buildings.shelter.renown = 50
    balance.buildings.shelter.goldIncome = 9
    balance.rules.residentGold = 3
    balance.rules.residentWood = 5
    balance.rules.incomeSeconds = 6
    const renown = settlementRenown(
      { ...world, buildings: [...world.buildings, ...existing.structures] },
      [],
      [],
      balance,
    )
    expect(renown.buildings).toBe(55)
    const paid = collectIncome(existing, 4, balance)
    expect(paid.resources.gold - existing.resources.gold).toBe(21)
    expect(paid.resources.wood - existing.resources.wood).toBe(20)
    expect(existing).toEqual(before)
    expect(buildingIncomeLabel(buildCatalog(balance)[0], balance)).toBe("+9 gold / 6s")
  })
  it("applies the tuned build radius across the full footprint", () => {
    const balance = fresh()
    balance.rules.buildRadius = 20
    const at = { x: 34, z: 18 }
    expect(placementError(map(), BUILD_CATALOG[0], at)).toMatch(/12 tiles/)
    expect(placementError(map(), BUILD_CATALOG[0], at, balance)).toBeNull()
  })
  it("uses tunable individual, relic and milestone rules", () => {
    const balance = fresh()
    balance.rules.pietyDivisor = 10
    balance.rules.skillRenown = 3
    balance.rules.relicMinimum = 200
    balance.rules.sanctuaryRenown = 60
    const monk = generateMonks(42)[0]
    expect(individualRenown(monk, balance)).toBe(
      Math.round(monk.attributes.piety / 10) + monk.attributes.skills.length * 3,
    )
    expect(relicRenown(generateRelic(42), balance)).toBe(200)
    expect(renownTiers(balance)[1].renown).toBe(60)
  })
  it("applies the tuned renown multiplier, cap and forecast threshold", () => {
    const balance = fresh()
    balance.rules.drawBase = 1
    balance.rules.drawBonus = 1
    balance.rules.drawCap = 200
    const relic = generateRelic(42)
    const pilgrim = generateTravelers(42, 60).find((t) => t.type.id === "pilgrim")!
    const base = relicDraw(pilgrim.attributes, relic.stats, 0, balance)
    expect(relicDraw(pilgrim.attributes, relic.stats, 200, balance)).toBeCloseTo(base * 2)
    expect(relicDraw(pilgrim.attributes, relic.stats, 500, balance)).toBeCloseTo(base * 2)
    balance.rules.turnAsideDraw = 1000
    expect(turnsAside({ ...pilgrim, attributes: { ...pilgrim.attributes, hunger: 100, thirst: 100, stamina: 100 } }, relic, 200, balance)).toBe(false)
  })
})
