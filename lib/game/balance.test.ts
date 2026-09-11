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
import { generateRelic, relicDraw, visitChance } from "./relic"
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
  it("moves the old guard-post default to 80 renown while preserving custom unlocks", () => {
    const old = JSON.parse(exportBalance(DEFAULT_BALANCE))
    old.version = 6
    old.balance.buildings["guard-post"].requiredRenown = 15
    expect(importBalance(JSON.stringify(old)).balance?.buildings["guard-post"].requiredRenown).toBe(80)
    old.balance.buildings["guard-post"].requiredRenown = 55
    expect(importBalance(JSON.stringify(old)).balance?.buildings["guard-post"].requiredRenown).toBe(55)
    const current = fresh()
    current.buildings["guard-post"].requiredRenown = 15
    expect(importBalance(exportBalance(current)).balance).toEqual(current)
  })
  it("round-trips all defaults without sharing mutable objects", () => {
    const result = importBalance(exportBalance(DEFAULT_BALANCE))
    expect(result.balance).toEqual(DEFAULT_BALANCE)
    expect(result.balance).not.toBe(DEFAULT_BALANCE)
    expect(result.balance?.buildings.hall).not.toBe(DEFAULT_BALANCE.buildings.hall)
  })
  it("migrates earlier version 1 presets without losing edits", () => {
    const old = JSON.parse(exportBalance(DEFAULT_BALANCE))
    delete old.balance.rules.visitRenown
    for (const key of ["hospitalityBaseChance", "hungerDecay", "thirstDecay", "staminaDecay"])
      delete old.balance.rules[key]
    delete old.balance.buildings.storehouse
    old.balance.rules.startingGold = 321
    old.balance.buildings.shelter.goldCost = 17
    const result = importBalance(JSON.stringify(old))
    expect(result.error).toBeNull()
    expect(result.balance?.rules.startingGold).toBe(321)
    expect(result.balance?.buildings.shelter.goldCost).toBe(17)
    expect(result.balance?.rules.visitRenown).toBe(0.5)
    for (const key of ["hospitalityBaseChance", "hungerDecay", "thirstDecay", "staminaDecay"] as const)
      expect(result.balance?.rules[key]).toBe(DEFAULT_BALANCE.rules[key])
    expect(result.balance?.buildings.storehouse).toEqual(DEFAULT_BALANCE.buildings.storehouse)
    old.balance.buildings.storehouse = { goldCost: -1 }
    expect(importBalance(JSON.stringify(old)).balance).toBeNull()
  })
  it("retires the lodge’s passive wood income when importing an old preset", () => {
    const old = JSON.parse(exportBalance(DEFAULT_BALANCE))
    old.version = 1
    old.balance.buildings.workshop.woodIncome = 8
    old.balance.buildings.workshop.goldCost = 71
    const result = importBalance(JSON.stringify(old))
    expect(result.error).toBeNull()
    expect(result.balance?.buildings.workshop.woodIncome).toBe(0)
    expect(result.balance?.buildings.workshop.goldCost).toBe(71)
  })
  it.each([1, 2])("updates old default need rates and adds attraction controls in version %i", (version) => {
    const old = JSON.parse(exportBalance(DEFAULT_BALANCE))
    old.version = version
    old.balance.rules.hungerDecay = 12.5
    old.balance.rules.thirstDecay = 25
    for (const key of ["earlyVisitPiety", "hospitalityNeedThreshold", "hospitalityRenownBonus"])
      delete old.balance.rules[key]
    const result = importBalance(JSON.stringify(old))
    expect(result.error).toBeNull()
    expect(result.balance?.rules).toEqual(DEFAULT_BALANCE.rules)
    old.balance.rules.hungerDecay = 8
    old.balance.rules.thirstDecay = 10
    expect(importBalance(JSON.stringify(old)).balance?.rules).toMatchObject({ hungerDecay: 8, thirstDecay: 10 })
  })
  it("updates previous default rates in saved presets while preserving custom tuning", () => {
    const old = JSON.parse(exportBalance(DEFAULT_BALANCE))
    old.version = 4
    Object.assign(old.balance.rules, { hungerDecay: 3, staminaDecay: 2.1, thirstDecay: 25 })
    old.balance.buildings.tavern.goldIncome = 10
    const result = importBalance(JSON.stringify(old))
    expect(result.error).toBeNull()
    expect(result.balance?.rules).toMatchObject({ hungerDecay: 0.375, staminaDecay: 1.05, thirstDecay: 25 })
    expect(result.balance?.buildings.tavern.goldIncome).toBe(10)
    Object.assign(old.balance.rules, { hungerDecay: 8, staminaDecay: 7 })
    expect(importBalance(JSON.stringify(old)).balance?.rules).toMatchObject({ hungerDecay: 8, staminaDecay: 7 })
    const current = fresh()
    Object.assign(current.rules, { hungerDecay: 3, staminaDecay: 2.1 })
    expect(importBalance(exportBalance(current)).balance).toEqual(current)
  })
  it("updates the previous default thirst rate in version 5 presets", () => {
    const old = JSON.parse(exportBalance(DEFAULT_BALANCE))
    old.version = 5
    old.balance.rules.thirstDecay = 6
    expect(importBalance(JSON.stringify(old)).balance?.rules.thirstDecay).toBe(0.75)
    old.balance.rules.thirstDecay = 9
    expect(importBalance(JSON.stringify(old)).balance?.rules.thirstDecay).toBe(9)
    const current = fresh()
    current.rules.thirstDecay = 6
    expect(importBalance(exportBalance(current)).balance).toEqual(current)
  })
  it("quarters version 6 need defaults and updates attraction without losing custom settings", () => {
    const old = JSON.parse(exportBalance(DEFAULT_BALANCE))
    old.version = 6
    old.balance.rules.earlyVisitPiety = 90
    Object.assign(old.balance.rules, { hungerDecay: 1.5, thirstDecay: 3, hospitalityBaseChance: 0.1 })
    expect(importBalance(JSON.stringify(old)).balance?.rules).toEqual(DEFAULT_BALANCE.rules)
    delete old.balance.rules.earlyVisitPiety
    Object.assign(old.balance.rules, { hungerDecay: 2, thirstDecay: 4, hospitalityBaseChance: 0.4 })
    expect(importBalance(JSON.stringify(old)).balance?.rules).toEqual(old.balance.rules)
    const current = fresh()
    Object.assign(current.rules, { hungerDecay: 1.5, thirstDecay: 3, hospitalityBaseChance: 0.1 })
    expect(importBalance(exportBalance(current)).balance).toEqual(current)
  })
  it("raises the old starting supplies in version 7 presets while keeping custom amounts", () => {
    const old = JSON.parse(exportBalance(DEFAULT_BALANCE))
    old.version = 7
    Object.assign(old.balance.rules, { startingGold: 200, startingWood: 160 })
    expect(importBalance(JSON.stringify(old)).balance?.rules).toEqual(DEFAULT_BALANCE.rules)
    Object.assign(old.balance.rules, { startingGold: 250, startingWood: 160 })
    const custom = importBalance(JSON.stringify(old)).balance?.rules
    expect(custom?.startingGold).toBe(250)
    expect(custom?.startingWood).toBe(DEFAULT_BALANCE.rules.startingWood)
    const current = fresh()
    Object.assign(current.rules, { startingGold: 200, startingWood: 160 })
    expect(importBalance(exportBalance(current)).balance).toEqual(current)
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
    expect(importBalance('{"version":99}').error).toMatch(/version/)
    expect(importBalance("oops").error).toMatch(/JSON/)
  })
  it("preserves custom needs and hospitality settings and rejects invalid values", () => {
    const balance = fresh()
    balance.rules.hospitalityBaseChance = 0.35
    balance.rules.hungerDecay = 0
    balance.rules.thirstDecay = 2.5
    balance.rules.staminaDecay = 7
    expect(importBalance(exportBalance(balance)).balance).toEqual(balance)
    balance.rules.hospitalityBaseChance = 1.1
    expect(importBalance(exportBalance(balance)).balance).toBeNull()
    balance.rules.hospitalityBaseChance = 0.35
    balance.rules.thirstDecay = -1
    expect(importBalance(exportBalance(balance)).balance).toBeNull()
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
  it("locks guard posts until 80 renown without charging for a locked purchase", () => {
    const world = map(), settlement = createSettlement()
    // The founding shrine supplies 5 renown; each completed visit adds 0.5.
    const locked = purchaseStructure(settlement, world, [], [], "guard-post", { x: 22, z: 18 }, undefined, 149)
    expect(locked.error).toBe("Requires 80 shrine renown.")
    expect(locked.settlement).toBe(settlement)
    const unlocked = purchaseStructure(settlement, world, [], [], "guard-post", { x: 22, z: 18 }, undefined, 150)
    expect(unlocked.error).toBeNull()
    expect(unlocked.settlement.structures[0].buildType).toBe("guard-post")
  })
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
  it("revalues structures but ignores legacy passive-income tuning", () => {
    const world = map()
    const existing = purchaseStructure(createSettlement(), world, [], [], "monk-shelter", {
      x: 22,
      z: 18,
    }).settlement
    existing.structures[0].construction!.work = existing.structures[0].construction!.required
    const before = structuredClone(existing)
    const balance = fresh()
    balance.buildings["monk-shelter"].renown = 50
    balance.buildings["monk-shelter"].goldIncome = 9
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
    expect(paid.resources.gold - existing.resources.gold).toBe(0)
    expect(paid.resources.wood - existing.resources.wood).toBe(0)
    expect(existing).toEqual(before)
    expect(buildingIncomeLabel(buildCatalog(balance).find(b => b.id === "monk-shelter")!, balance)).toBe("Adds monk housing when complete")
  })
  it("applies the tuned influence radius across the full footprint", () => {
    const balance = fresh()
    balance.rules.buildRadius = 20
    const at = { x: 34, z: 18 }
    expect(placementError(map(), BUILD_CATALOG[0], at)).toMatch(/influence/)
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
    const attributes = { ...pilgrim.attributes, hunger: 100, thirst: 100, stamina: 100 }
    const before = visitChance(attributes, relic.stats, 200, balance)
    balance.rules.turnAsideDraw = 1000
    const after = visitChance(attributes, relic.stats, 200, balance)
    expect(after).toBeLessThan(before)
    expect(after).toBeGreaterThan(0.1) // Faith still motivates a visit without relic interest.
  })
})
