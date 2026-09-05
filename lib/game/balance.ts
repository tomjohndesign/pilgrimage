/** Pure balance data, shared by gameplay, the tuning page and the specification. */
export type BuildId = "shelter" | "workshop" | "garden" | "cross" | "hall"

export interface Resources {
  gold: number
  wood: number
}

export interface BuildDefinition {
  id: BuildId
  label: string
  category: "buildings" | "scenery"
  description: string
  cost: Resources
  renown: number
  requiredRenown: number
  income: Resources
  w: number
  d: number
  height: number
  color: string
  roofColor: string
}

export const BUILD_CATALOG: readonly BuildDefinition[] = [
  {
    id: "shelter",
    label: "Pilgrim shelter",
    category: "buildings",
    description: "Hospitality brings offerings.",
    cost: { gold: 45, wood: 35 },
    renown: 8,
    requiredRenown: 0,
    income: { gold: 3, wood: 0 },
    w: 2,
    d: 2,
    height: 0.7,
    color: "#b99a72",
    roofColor: "#855642",
  },
  {
    id: "workshop",
    label: "Woodcutter’s lodge",
    category: "buildings",
    description: "Timber for the growing shrine.",
    cost: { gold: 60, wood: 45 },
    renown: 6,
    requiredRenown: 0,
    income: { gold: 0, wood: 8 },
    w: 2,
    d: 2,
    height: 0.85,
    color: "#8c7658",
    roofColor: "#4e5e45",
  },
  {
    id: "garden",
    label: "Cloister garden",
    category: "scenery",
    description: "A peaceful place for contemplation.",
    cost: { gold: 20, wood: 10 },
    renown: 4,
    requiredRenown: 0,
    income: { gold: 0, wood: 0 },
    w: 2,
    d: 1,
    height: 0.12,
    color: "#8c7658",
    roofColor: "#668347",
  },
  {
    id: "cross",
    label: "Carved cross",
    category: "scenery",
    description: "A landmark of the brotherhood’s devotion.",
    cost: { gold: 15, wood: 20 },
    renown: 3,
    requiredRenown: 0,
    income: { gold: 0, wood: 0 },
    w: 1,
    d: 1,
    height: 1.1,
    color: "#8c7658",
    roofColor: "#b99a72",
  },
  {
    id: "hall",
    label: "Shrine hall",
    category: "buildings",
    description: "A gathering place worthy of a sanctuary.",
    cost: { gold: 120, wood: 90 },
    renown: 18,
    requiredRenown: 40,
    income: { gold: 8, wood: 0 },
    w: 3,
    d: 2,
    height: 1.3,
    color: "#c6b998",
    roofColor: "#78504b",
  },
]

export const RULE_GROUPS = [
  "Treasury & construction",
  "Resident income",
  "Resident renown",
  "Relic renown",
  "Progression",
  "Traveler attraction",
] as const
export const RULE_FIELDS = [
  {
    key: "startingGold",
    group: "Treasury & construction",
    label: "Starting gold",
    description: "Treasury when a new settlement is founded. New settlements only.",
    default: 200,
    min: 0,
    max: 100000,
    step: 1,
  },
  {
    key: "startingWood",
    group: "Treasury & construction",
    label: "Starting wood",
    description: "Timber when a new settlement is founded. New settlements only.",
    default: 160,
    min: 0,
    max: 100000,
    step: 1,
  },
  {
    key: "incomeSeconds",
    group: "Treasury & construction",
    label: "Income interval (seconds)",
    description:
      "Time between income payments while the game tab is visible. Changing this restarts the interval.",
    default: 10,
    min: 1,
    max: 300,
    step: 1,
  },
  {
    key: "buildRadius",
    group: "Treasury & construction",
    label: "Build radius (tiles)",
    description:
      "Every tile of a new footprint must fit within this distance of the hovel’s centre. Existing structures stay.",
    default: 12,
    min: 2,
    max: 128,
    step: 1,
  },
  {
    key: "residentGold",
    group: "Resident income",
    label: "Gold per resident",
    description: "Offerings collected per resident per income payment.",
    default: 1,
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    key: "residentWood",
    group: "Resident income",
    label: "Wood per resident",
    description: "Timber gathered per resident per income payment.",
    default: 2,
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    key: "hovelRenown",
    group: "Resident renown",
    label: "Founding hovel renown",
    description: "The original shrine building’s contribution.",
    default: 5,
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    key: "pietyDivisor",
    group: "Resident renown",
    label: "Piety divisor",
    description: "Each resident contributes round(piety ÷ this value), plus their skills.",
    default: 40,
    min: 1,
    max: 1000,
    step: 1,
  },
  {
    key: "skillRenown",
    group: "Resident renown",
    label: "Renown per skill",
    description: "Added for each of a resident’s skills.",
    default: 1,
    min: 0,
    max: 100,
    step: 1,
  },
  {
    key: "individualMinimum",
    group: "Resident renown",
    label: "Minimum individual renown",
    description: "Lower bound on each resident’s contribution.",
    default: 1,
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    key: "sanctityWeight",
    group: "Relic renown",
    label: "Sanctity weight",
    description: "Multiplies sanctity in the relic’s renown contribution.",
    default: 0.65,
    min: 0,
    max: 5,
    step: 0.01,
  },
  {
    key: "spectacleWeight",
    group: "Relic renown",
    label: "Spectacle weight",
    description: "Multiplies spectacle in the relic’s renown contribution.",
    default: 0.35,
    min: 0,
    max: 5,
    step: 0.01,
  },
  {
    key: "doubtWeight",
    group: "Relic renown",
    label: "Doubt penalty weight",
    description: "Weighted doubt is subtracted before division and rounding.",
    default: 0.25,
    min: 0,
    max: 5,
    step: 0.01,
  },
  {
    key: "relicDivisor",
    group: "Relic renown",
    label: "Relic divisor",
    description: "Divides the weighted relic score before rounding to whole renown.",
    default: 7,
    min: 1,
    max: 1000,
    step: 1,
  },
  {
    key: "relicMinimum",
    group: "Relic renown",
    label: "Minimum relic renown",
    description: "Lower bound on each relic’s contribution.",
    default: 1,
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    key: "sanctuaryRenown",
    group: "Progression",
    label: "Sanctuary threshold",
    description: "Renown needed for the second title. Building unlocks are set separately below.",
    default: 40,
    min: 1,
    max: 100000,
    step: 1,
  },
  {
    key: "pilgrimageRenown",
    group: "Progression",
    label: "Pilgrimage site threshold",
    description: "Must exceed the sanctuary threshold.",
    default: 80,
    min: 2,
    max: 100000,
    step: 1,
  },
  {
    key: "renownedRenown",
    group: "Progression",
    label: "Renowned establishment threshold",
    description: "Must exceed the pilgrimage site threshold.",
    default: 150,
    min: 3,
    max: 100000,
    step: 1,
  },
  {
    key: "drawBase",
    group: "Traveler attraction",
    label: "Base draw multiplier",
    description: "Multiplier for a shrine with zero renown.",
    default: 0.75,
    min: 0,
    max: 5,
    step: 0.01,
  },
  {
    key: "drawBonus",
    group: "Traveler attraction",
    label: "Maximum renown draw bonus",
    description: "Added to the base multiplier once renown reaches the draw cap.",
    default: 0.5,
    min: 0,
    max: 5,
    step: 0.01,
  },
  {
    key: "drawCap",
    group: "Traveler attraction",
    label: "Renown draw cap",
    description: "Renown above this still counts for progression but adds no further attraction.",
    default: 100,
    min: 1,
    max: 100000,
    step: 1,
  },
  {
    key: "turnAsideDraw",
    group: "Traveler attraction",
    label: "Turn-aside draw threshold",
    description: "Minimum attraction score counted in the shrine’s traffic forecast.",
    default: 40,
    min: 0,
    max: 1000,
    step: 1,
  },
] as const
export type RuleKey = (typeof RULE_FIELDS)[number]["key"]

export const BUILDING_FIELDS = [
  {
    key: "goldCost",
    label: "Gold cost",
    description: "Gold paid on successful placement.",
    min: 0,
    max: 100000,
    step: 1,
  },
  {
    key: "woodCost",
    label: "Wood cost",
    description: "Wood paid on successful placement.",
    min: 0,
    max: 100000,
    step: 1,
  },
  {
    key: "renown",
    label: "Renown",
    description: "Contribution of each placed copy, including existing copies.",
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    key: "requiredRenown",
    label: "Unlock renown",
    description: "Shrine renown required to place a new copy. Does not remove existing copies.",
    min: 0,
    max: 100000,
    step: 1,
  },
  {
    key: "goldIncome",
    label: "Gold per payment",
    description: "Added income per placed copy at every income payment.",
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    key: "woodIncome",
    label: "Wood per payment",
    description: "Added income per placed copy at every income payment.",
    min: 0,
    max: 1000,
    step: 1,
  },
] as const
export type BuildingBalance = Record<(typeof BUILDING_FIELDS)[number]["key"], number>
export interface GameBalance {
  rules: Record<RuleKey, number>
  buildings: Record<BuildId, BuildingBalance>
}
export const DEFAULT_BALANCE: GameBalance = {
  rules: Object.fromEntries(
    RULE_FIELDS.map((field) => [field.key, field.default]),
  ) as GameBalance["rules"],
  buildings: Object.fromEntries(
    BUILD_CATALOG.map((def) => [
      def.id,
      {
        goldCost: def.cost.gold,
        woodCost: def.cost.wood,
        renown: def.renown,
        requiredRenown: def.requiredRenown,
        goldIncome: def.income.gold,
        woodIncome: def.income.wood,
      },
    ]),
  ) as GameBalance["buildings"],
}

export function buildCatalog(balance: GameBalance = DEFAULT_BALANCE): BuildDefinition[] {
  return BUILD_CATALOG.map((def) => {
    const tuned = balance.buildings[def.id]
    return {
      ...def,
      cost: { gold: tuned.goldCost, wood: tuned.woodCost },
      income: { gold: tuned.goldIncome, wood: tuned.woodIncome },
      renown: tuned.renown,
      requiredRenown: tuned.requiredRenown,
    }
  })
}

export function buildingIncomeLabel(def: BuildDefinition, balance: GameBalance): string {
  const parts = [
    def.income.gold ? `+${def.income.gold} gold` : "",
    def.income.wood ? `+${def.income.wood} wood` : "",
  ].filter(Boolean)
  return parts.length
    ? `${parts.join(" · ")} / ${balance.rules.incomeSeconds}s`
    : "No resource income"
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}
function validNumber(
  value: unknown,
  field: { min: number; max: number; step: number },
): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= field.min &&
    value <= field.max &&
    Math.abs(value / field.step - Math.round(value / field.step)) < 0.00001
  )
}
/** Strict and atomic: malformed saves/imports can never supply partial game rules. */
export function validateBalance(
  input: unknown,
): { balance: GameBalance; error: null } | { balance: null; error: string } {
  const root = record(input)
  const rules = record(root?.rules)
  const buildings = record(root?.buildings)
  if (!rules || !buildings)
    return { balance: null, error: "Expected rules and buildings in the preset." }
  const clean = structuredClone(DEFAULT_BALANCE)
  for (const field of RULE_FIELDS) {
    const value = rules[field.key]
    if (!validNumber(value, field))
      return {
        balance: null,
        error: `${field.label}: use ${field.min}–${field.max} in steps of ${field.step}.`,
      }
    clean.rules[field.key] = value
  }
  if (
    clean.rules.sanctuaryRenown >= clean.rules.pilgrimageRenown ||
    clean.rules.pilgrimageRenown >= clean.rules.renownedRenown
  )
    return {
      balance: null,
      error:
        "Progression thresholds must increase: sanctuary < pilgrimage site < renowned establishment.",
    }
  for (const def of BUILD_CATALOG) {
    const building = record(buildings[def.id])
    for (const field of BUILDING_FIELDS) {
      const value = building?.[field.key]
      if (!validNumber(value, field))
        return {
          balance: null,
          error: `${def.label} · ${field.label}: use a whole number from ${field.min} to ${field.max}.`,
        }
      clean.buildings[def.id][field.key] = value
    }
  }
  return { balance: clean, error: null }
}
export const BALANCE_VERSION = 1
export function exportBalance(balance: GameBalance): string {
  return JSON.stringify({ version: BALANCE_VERSION, balance }, null, 2)
}
export function importBalance(json: string): ReturnType<typeof validateBalance> {
  try {
    const preset = record(JSON.parse(json))
    if (preset?.version !== BALANCE_VERSION)
      return { balance: null, error: "Unsupported preset version. Expected version 1." }
    return validateBalance(preset.balance)
  } catch {
    return { balance: null, error: "This file is not valid JSON." }
  }
}
