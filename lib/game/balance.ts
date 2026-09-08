import { MARKET_WIDTH, MARKET_DEPTH } from "./market-layout"
import { STOREHOUSE_FOOD_CAPACITY } from "./storage"

/** Pure balance data, shared by gameplay, the tuning page and the specification. */
export type BuildId = "shelter" | "workshop" | "garden" | "cross" | "hall" | "storehouse"
  | "monk-shelter" | "house" | "tavern" | "wood-shelter" | "market" | "guard-post" | "lumberCamp"
  | "sheep-pen"

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
  /** Second-chance probability for passersby; only the strongest completed source applies. */
  evangelism?: number
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
    description: "A place for pilgrims to rest.",
    cost: { gold: 45, wood: 35 },
    renown: 0,
    requiredRenown: 0,
    income: { gold: 0, wood: 0 },
    w: 2,
    d: 2,
    height: 0.62,
    color: "#b99a72",
    roofColor: "#855642",
  },
  {
    id: "workshop",
    label: "Woodcutter’s hut",
    category: "buildings",
    description: "Three jobs felling nearby trees. Workers carry timber to a storehouse or back to the hut.",
    cost: { gold: 60, wood: 45 },
    renown: 0,
    requiredRenown: 0,
    income: { gold: 0, wood: 0 },
    w: 3,
    d: 2,
    height: 0.68,
    color: "#8c7658",
    roofColor: "#4e5e45",
  },
  {
    id: "garden",
    label: "Cloister garden",
    category: "scenery",
    description: "A peaceful place for contemplation.",
    cost: { gold: 20, wood: 10 },
    renown: 1,
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
    description: "Evangelism: 5%. Once complete, gives travelers who would otherwise pass one extra chance to visit the relic. Additional crosses do not stack this chance.",
    cost: { gold: 60, wood: 45 },
    renown: 2,
    evangelism: 0.05,
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
    income: { gold: 0, wood: 0 },
    w: 2,
    d: 3,
    height: 0.78,
    color: "#c6b998",
    roofColor: "#78504b",
  },
  {
    id: "storehouse", label: "Storehouse", category: "buildings",
    description: "Covered storage for harvested timber, grain, vegetables, fruit and fish.",
    cost: { gold: 60, wood: 45 }, renown: 0, requiredRenown: 0,
    income: { gold: 0, wood: 0 }, w: 2, d: 2, height: 0.62,
    color: "#7a5a3a", roofColor: "#54402c",
  },
  {
    id: "monk-shelter", label: "Monks’ shelter", category: "buildings",
    description: "An open-front sleeping shelter with a hearth. Tired monks rest here until their stamina recovers.",
    cost: { gold: 50, wood: 40 }, renown: 2, requiredRenown: 0,
    income: { gold: 0, wood: 0 }, w: 3, d: 2, height: 0.62,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "house", label: "House", category: "buildings",
    description: "A log hut with a hearth and two straw beds. Settlers who take work here move in, and come home to sleep when they tire.",
    cost: { gold: 40, wood: 30 }, renown: 1, requiredRenown: 0,
    income: { gold: 0, wood: 0 }, w: 2, d: 2, height: 0.70,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "wood-shelter", label: "Wood shelter", category: "buildings",
    description: "An open lean-to that keeps split wood and spare poles dry.",
    cost: { gold: 20, wood: 20 }, renown: 0, requiredRenown: 0,
    income: { gold: 0, wood: 0 }, w: 2, d: 1, height: 0.62,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "lumberCamp", label: "Timber yard", category: "buildings",
    description: "An open yard for stacking felled timber. No doorway, so it reserves no entrance tile.",
    cost: { gold: 40, wood: 30 }, renown: 0, requiredRenown: 0,
    income: { gold: 0, wood: 0 }, w: 2, d: 2, height: 0.65,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "market", label: "Market stall", category: "buildings",
    description: "A cloth-canopied stall with a rear cart yard. A passing vendor parks their cart and animal here and settles to sell food and wares.",
    cost: { gold: 50, wood: 30 }, renown: 3, requiredRenown: 10,
    income: { gold: 0, wood: 0 }, w: MARKET_WIDTH, d: MARKET_DEPTH, height: 0.65,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "guard-post", label: "Guard post", category: "buildings",
    description: "A sheltered watch post that reassures travelers on the approach.",
    cost: { gold: 70, wood: 50 }, renown: 4, requiredRenown: 15,
    income: { gold: 0, wood: 0 }, w: 2, d: 2, height: 0.65,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "tavern", label: "Tavern", category: "buildings",
    description: "Two jobs behind the counter. Travelers and settlers buy food and drink here for gold, then sit at the tables. Its front and back doors each keep a clear path tile.",
    cost: { gold: 150, wood: 110 }, renown: 12, requiredRenown: 25,
    income: { gold: 0, wood: 0 }, w: 3, d: 4, height: 0.78,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "sheep-pen", label: "Sheep pen", category: "buildings",
    description: "Two shepherds gather roaming sheep and lead them back to the open railed pen beside a hut and hearth.",
    cost: { gold: 55, wood: 45 }, renown: 2, requiredRenown: 5,
    income: { gold: 0, wood: 0 }, w: 3, d: 2, height: 0.70,
    color: "#8c7658", roofColor: "#a59164",
  },
]

export const RULE_GROUPS = [
  "Treasury & construction",
  "Resident income",
  "Resident renown",
  "Relic renown",
  "Progression",
  "Traveler attraction",
  "Traveler needs",
] as const
export const RULE_FIELDS = [
  {
    key: "visitRenown", group: "Progression", label: "Renown per completed visit",
    description: "Word of mouth earned by the whole shrine. Applies to all visits in this settlement.",
    default: 0.5, min: 0, max: 100, step: 0.1,
  },
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
    label: "Influence radius at 5 renown (tiles)",
    description:
      "Renown sources radiate this far at 5 renown, scaled by the square root of their renown / 5. Connected influence and land beside the approach allow construction. Existing structures stay.",
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
    default: 0,
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    key: "residentWood",
    group: "Resident income",
    label: "Wood per resident",
    description: "Timber gathered per resident per income payment.",
    default: 0,
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
    default: 0.5,
    min: 0,
    max: 5,
    step: 0.01,
  },
  {
    key: "drawBonus",
    group: "Traveler attraction",
    label: "Maximum renown draw bonus",
    description: "Added to the base multiplier once renown reaches the draw cap.",
    default: 0.75,
    min: 0,
    max: 5,
    step: 0.01,
  },
  {
    key: "drawCap",
    group: "Traveler attraction",
    label: "Renown draw cap",
    description: "Renown at which relic attraction and hospitality reach their full strength. Higher renown still counts for progression.",
    default: 100,
    min: 1,
    max: 100000,
    step: 1,
  },
  {
    key: "turnAsideDraw",
    group: "Traveler attraction",
    label: "Turn-aside draw threshold",
    description: "Attraction score giving a fully willing traveler a 50% faith visit chance. Early visits also require exceptional piety.",
    default: 40,
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    key: "earlyVisitPiety", group: "Traveler attraction", label: "Piety needed at zero renown",
    description: "Faith visits begin above this piety and reach full willingness at 100. Renown adds up to 100 to effective piety, scaled by the square of renown / draw cap.",
    default: 90, min: 0, max: 99, step: 1,
  },
  {
    key: "hospitalityNeedThreshold", group: "Traveler attraction", label: "Food or water threshold at zero renown",
    description: "Only fullness or hydration below this level draws a hospitality visit. Renown raises the threshold toward 60, scaled by the square of renown / draw cap. Tiredness alone does not attract visitors.",
    default: 20, min: 1, max: 60, step: 1,
  },
  {
    key: "hospitalityBaseChance", group: "Traveler attraction", label: "Hospitality chance at zero renown",
    description: "Maximum chance of visiting an unknown shrine for food or water, reached only with an empty meter. Scales down to zero at the food or water threshold.",
    default: 0.1, min: 0, max: 1, step: 0.01,
  },
  {
    key: "hospitalityRenownBonus", group: "Traveler attraction", label: "Maximum renown hospitality bonus",
    description: "Added to the maximum hospitality chance at the draw cap, scaled by the square of renown / draw cap. The resulting chance is capped at 100% and still requires food or water need.",
    default: 0.5, min: 0, max: 1, step: 0.01,
  },
  {
    key: "hungerDecay", group: "Traveler needs", label: "Hunger drain per game hour",
    description: "Fullness lost per game hour. Default: 72 points per day, with a full bar lasting about 33 hours. Camping halves this rate; shrine hospitality restores it.",
    default: 3, min: 0, max: 50, step: 0.1,
  },
  {
    key: "thirstDecay", group: "Traveler needs", label: "Thirst drain per game hour",
    description: "Hydration lost per game hour. Default: 144 points per day, with a full bar lasting about 17 hours. Camping halves this rate; shrine hospitality restores it.",
    default: 6, min: 0, max: 50, step: 0.1,
  },
  {
    key: "staminaDecay", group: "Traveler needs", label: "Stamina drain per game hour",
    description: "Energy lost per game hour. Default: a full bar lasts about 48 hours, with travelers looking for lodging once it falls below 20. Camping restores stamina and tending a parked stall holds it steady; drinking does not restore energy.",
    default: 2.1, min: 0, max: 50, step: 0.1,
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
      income: { gold: 0, wood: 0 },
      renown: tuned.renown,
      requiredRenown: tuned.requiredRenown,
    }
  })
}

export function buildingIncomeLabel(def: BuildDefinition, balance: GameBalance): string {
  return def.id === "workshop" ? "3 woodcutting jobs"
    : def.id === "tavern" ? "2 jobs · food & drink for gold"
    : def.id === "sheep-pen" ? "2 herding jobs"
    : def.id === "house" ? "Homes 2 settlers"
    : def.id === "monk-shelter" || def.id === "shelter" ? "Adds monk housing when complete"
    : def.id === "market" ? "Draws a vendor to keep it"
    : def.id === "storehouse" ? `Timber storage · ${STOREHOUSE_FOOD_CAPACITY} food capacity` : "No resource income"
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
export const BALANCE_VERSION = 4
export function exportBalance(balance: GameBalance): string {
  return JSON.stringify({ version: BALANCE_VERSION, balance }, null, 2)
}
export function importBalance(json: string): ReturnType<typeof validateBalance> {
  try {
    const preset = record(JSON.parse(json))
    const version = preset?.version
    if (version !== 1 && version !== 2 && version !== 3 && version !== BALANCE_VERSION)
      return { balance: null, error: "Unsupported preset version. Expected version 1, 2, 3 or 4." }
    // Add defaults for new structures while retaining all authored settings.
    const saved = record(preset?.balance)
    const rules = record(saved?.rules)
    const buildings = record(saved?.buildings)
    return validateBalance(saved && rules && buildings ? {
      ...saved,
      rules: {
        visitRenown: DEFAULT_BALANCE.rules.visitRenown,
        hospitalityBaseChance: DEFAULT_BALANCE.rules.hospitalityBaseChance,
        hungerDecay: DEFAULT_BALANCE.rules.hungerDecay,
        thirstDecay: DEFAULT_BALANCE.rules.thirstDecay,
        staminaDecay: DEFAULT_BALANCE.rules.staminaDecay,
        earlyVisitPiety: DEFAULT_BALANCE.rules.earlyVisitPiety,
        hospitalityNeedThreshold: DEFAULT_BALANCE.rules.hospitalityNeedThreshold,
        hospitalityRenownBonus: DEFAULT_BALANCE.rules.hospitalityRenownBonus,
        ...rules,
        // Adopt slower defaults in old saves without overwriting custom rates.
        ...(version !== BALANCE_VERSION && rules.hungerDecay === 12.5 ? { hungerDecay: DEFAULT_BALANCE.rules.hungerDecay } : {}),
        ...(version !== BALANCE_VERSION && rules.thirstDecay === 25 ? { thirstDecay: DEFAULT_BALANCE.rules.thirstDecay } : {}),
      },
      buildings: {
        ...DEFAULT_BALANCE.buildings,
        // The shepherd’s hut became the house; keep its authored tuning.
        ...(record(buildings["shepherd-hut"]) ? { house: buildings["shepherd-hut"] } : {}),
        ...buildings,
        // The hut now earns wood through deliveries; retire its old passive payment.
        ...(version === 1 && record(buildings.workshop) ? {
          workshop: { ...record(buildings.workshop), woodIncome: 0 },
        } : {}),
        // The tavern now earns at the counter; retire its old passive payment.
        ...(version !== BALANCE_VERSION && record(buildings.tavern)?.goldIncome === 10 ? {
          tavern: { ...record(buildings.tavern), goldIncome: 0 },
        } : {}),
      },
    } : preset?.balance)
  } catch {
    return { balance: null, error: "This file is not valid JSON." }
  }
}
