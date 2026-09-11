import { MARKET_WIDTH, MARKET_DEPTH } from "./market-layout"
import { STOREHOUSE_FOOD_CAPACITY } from "./storage"

/** Pure balance data, shared by gameplay, the tuning page and the specification. */
export type BuildId = "shelter" | "workshop" | "garden" | "cross" | "hall" | "storehouse"
  | "inn" | "monk-shelter" | "house" | "tavern" | "wood-shelter" | "market" | "guard-post" | "lumberCamp"
  | "sheep-pen" | "well" | "watering-hole"

export interface Resources {
  gold: number
  wood: number
}

export interface BuildDefinition {
  id: BuildId
  /** Retained for existing worlds and artwork, but unavailable for new construction. */
  retired?: boolean
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
    retired: true,
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
    description: "Six jobs felling nearby trees. Workers carry timber to a storehouse or back to the hut.",
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
    description: "A log hut with a hearth and six straw pallets, three on the floor and three on a sleeping shelf above. Settlers who take work here move in, and come home to sleep when they tire.",
    cost: { gold: 40, wood: 30 }, renown: 1, requiredRenown: 0,
    income: { gold: 0, wood: 0 }, w: 2, d: 2, height: 0.70,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "wood-shelter", label: "Wood shelter", category: "buildings",
    retired: true,
    description: "An open lean-to that keeps split wood and spare poles dry.",
    cost: { gold: 20, wood: 20 }, renown: 0, requiredRenown: 0,
    income: { gold: 0, wood: 0 }, w: 2, d: 1, height: 0.62,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "lumberCamp", label: "Timber yard", category: "buildings",
    retired: true,
    description: "An open yard for stacking felled timber. No doorway, so it reserves no entrance tile.",
    cost: { gold: 40, wood: 30 }, renown: 0, requiredRenown: 0,
    income: { gold: 0, wood: 0 }, w: 2, d: 2, height: 0.65,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "market", label: "Market stall", category: "buildings",
    description: "A stall with an open cart bay beside it. A passing vendor parks their cart and animal here, rigs the cloth and settles to sell food and wares.",
    cost: { gold: 50, wood: 30 }, renown: 3, requiredRenown: 10,
    income: { gold: 0, wood: 0 }, w: MARKET_WIDTH, d: MARKET_DEPTH, height: 0.65,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "guard-post", label: "Guard post", category: "buildings",
    description: "A sheltered watch post that reassures travelers on the approach.",
    cost: { gold: 70, wood: 50 }, renown: 4, requiredRenown: 80,
    income: { gold: 0, wood: 0 }, w: 2, d: 2, height: 0.65,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "tavern", label: "Tavern", category: "buildings",
    description: "Four jobs behind the counter. Low happiness draws travelers and settlers here for company, even when free water is nearby. They buy food and drink and recover happiness at the tables. Chairs and outdoor benches offer a free short rest, restoring up to 8 stamina. Keep both entrances and the benches clear.",
    cost: { gold: 150, wood: 110 }, renown: 12, requiredRenown: 25,
    income: { gold: 0, wood: 0 }, w: 3, d: 4, height: 0.78,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "inn", label: "Inn", category: "buildings",
    description: "Four jobs tending an open dormitory of bunks and beds. A standalone inn has a front reception area, door and fireplace. Over a completed tavern, it becomes a sleeping floor reached by ladder, with overhanging timber-and-plaster walls and a steep perpendicular roof.",
    cost: { gold: 100, wood: 85 }, renown: 6, requiredRenown: 15,
    income: { gold: 0, wood: 0 }, w: 3, d: 4, height: 1.2,
    color: "#b7ae94", roofColor: "#827052",
  },
  {
    id: "sheep-pen", label: "Sheep pen", category: "buildings",
    description: "Two shepherds gather roaming sheep and lead them back to the open railed pen beside a hut and hearth.",
    cost: { gold: 55, wood: 45 }, renown: 2, requiredRenown: 5,
    income: { gold: 0, wood: 0 }, w: 3, d: 2, height: 0.70,
    color: "#8c7658", roofColor: "#a59164",
  },
  {
    id: "well", label: "Timber well", category: "scenery",
    description: "Free drinking water for thirsty walkers and settlers. One person draws water at a time; keep its front approach clear.",
    cost: { gold: 20, wood: 15 }, renown: 0, requiredRenown: 0,
    income: { gold: 0, wood: 0 }, w: 2, d: 2, height: .58, color: "#877152", roofColor: "#95805c",
  },
  {
    id: "watering-hole", label: "Watering hole", category: "scenery",
    retired: true,
    description: "A shallow earthen pool with an open dipping edge. Thirsty walkers and settlers take turns drinking here for free.",
    cost: { gold: 10, wood: 0 }, renown: 0, requiredRenown: 0,
    income: { gold: 0, wood: 0 }, w: 3, d: 2, height: .1, color: "#847657", roofColor: "#526e67",
  },
]

export const RULE_GROUPS = [
  "Treasury & construction",
  "Resident income",
  "Resident renown",
  "Relic renown",
  "Progression",
  "Traveler attraction",
  "Settlement work",
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
    default: 500,
    min: 0,
    max: 100000,
    step: 1,
  },
  {
    key: "startingWood",
    group: "Treasury & construction",
    label: "Starting wood",
    description: "Timber when a new settlement is founded. New settlements only.",
    default: 400,
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
    key: "levellingLimit",
    group: "Treasury & construction",
    label: "Ground levelling limit (height units)",
    description:
      "Placing a building cuts and fills its footprint to the ground height under its centre, where the placement ghost sits. Construction is refused where any footprint tile or corner would move more than this, where the graded pad would break off as a cliff, or where an entrance tile differs from the floor by more than this.",
    default: 0.4,
    min: 0,
    max: 1,
    step: 0.05,
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
    description: "Attraction score giving half of the relic-specific faith bonus. Devout travelers also seek a modest shrine before its relic is famous.",
    default: 40,
    min: 0,
    max: 1000,
    step: 1,
  },
  {
    key: "hospitalityNeedThreshold", group: "Traveler attraction", label: "Food or water threshold at zero renown",
    description: "Only fullness or hydration below this level draws a hospitality visit. Renown raises the threshold toward 60, scaled by the square of renown / draw cap. Tiredness alone does not attract visitors.",
    default: 20, min: 1, max: 60, step: 1,
  },
  {
    key: "hospitalityBaseChance", group: "Traveler attraction", label: "Hospitality chance at zero renown",
    description: "Maximum chance of visiting an unknown shrine for food or water, reached only with an empty meter. Scales down to zero at the food or water threshold.",
    default: 1, min: 0, max: 1, step: 0.01,
  },
  {
    key: "hospitalityRenownBonus", group: "Traveler attraction", label: "Maximum renown hospitality bonus",
    description: "Added to the maximum hospitality chance at the draw cap, scaled by the square of renown / draw cap. The resulting chance is capped at 100% and still requires food or water need.",
    default: 0.5, min: 0, max: 1, step: 0.01,
  },
  {
    key: "joblessHireChance", group: "Settlement work", label: "Hiring chance without a trade",
    description: "Chance a visitor out of work takes an open place after seeing the relic. They still need a free house bed and a vacancy they can reach; a woodcutter also needs standing timber in range.",
    default: 0.9, min: 0, max: 1, step: 0.01,
  },
  {
    key: "employedHireChance", group: "Settlement work", label: "Hiring chance already in a trade",
    description: "Chance a visitor who already has work elsewhere gives it up for an open place. Monks, nuns and vendors keep their own callings whatever this is set to.",
    default: 0.05, min: 0, max: 1, step: 0.01,
  },
  {
    key: "dailyWage", group: "Settlement work", label: "Daily wage per worker",
    description: "Gold paid from the treasury to each settler working a player-owned place, once a game day. A settler eats and drinks about two thirds of a gold a day at the counter, so keep this above that or households slide into poverty. Much of it comes back over your own counter. Independent town households are paid by their own town.",
    default: 2, min: 0, max: 100, step: 1,
  },
  {
    key: "hearthHours", group: "Settlement work", label: "Hearth hours per hour at home",
    description: "A settler asleep at home eats and drinks their own bread and small beer, restoring this many hours’ worth of food and drink for every hour abed. Nights are short, so raising this much further lets the household larder replace the counter and no resident ever buys supper.",
    default: 12, min: 0, max: 1000, step: 1,
  },
  {
    key: "happinessDecay", group: "Traveler needs", label: "Happiness drain per game hour",
    description: "Happiness lost while away from tavern tables. Low happiness draws customers to staffed taverns.",
    default: 0.5, min: 0, max: 10, step: 0.1,
  },
  {
    key: "pietyDecay", group: "Traveler needs", label: "Piety drain per game hour",
    description: "Devotion lost after a day without church attendance. Default: 0.48 points per day. Prayer suspends the drain.",
    default: 0.02, min: 0, max: 1, step: 0.01,
  },
  {
    key: "prayerPiety", group: "Traveler needs", label: "Piety gained per hour of prayer",
    description: "Devotion gained by private church prayer and monks kneeling before the relic. Relic viewings and processions also grant their own rewards.",
    default: 3, min: 0, max: 20, step: 0.1,
  },
  {
    key: "hungerDecay", group: "Traveler needs", label: "Hunger drain per game hour",
    description: "Fullness lost per game hour. Default: 9 points per day, with a full bar lasting about 267 hours. Camping halves this rate; food service restores it.",
    default: 0.375, min: 0, max: 50, step: 0.025,
  },
  {
    key: "thirstDecay", group: "Traveler needs", label: "Thirst drain per game hour",
    description: "Hydration lost per game hour. Default: 18 points per day, with a full bar lasting about 133 hours. Camping halves this rate; shrine hospitality restores it.",
    default: 0.75, min: 0, max: 50, step: 0.025,
  },
  {
    key: "staminaDecay", group: "Traveler needs", label: "Stamina drain per game hour",
    description: "Energy lost per game hour. Default: a full bar lasts about 95 hours, with travelers looking for lodging once it falls below 20. Camping restores stamina, seated breaks restore a little, and tending a parked stall holds it steady. Standing drink stops do not restore energy.",
    default: 1.05, min: 0, max: 50, step: 0.05,
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
  return def.id === "workshop" ? "6 woodcutting jobs"
    : def.id === "tavern" ? "4 jobs · food & drink for gold"
    : def.id === "sheep-pen" ? "2 herding jobs"
    : def.id === "inn" ? "4 jobs · bunks & beds"
    : def.id === "house" ? "Homes 6 settlers"
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
export const BALANCE_VERSION = 8
export function exportBalance(balance: GameBalance): string {
  return JSON.stringify({ version: BALANCE_VERSION, balance }, null, 2)
}
export function importBalance(json: string): ReturnType<typeof validateBalance> {
  try {
    const preset = record(JSON.parse(json))
    const version = preset?.version
    if (typeof version !== "number" || ![1, 2, 3, 4, 5, 6, 7, BALANCE_VERSION].includes(version))
      return { balance: null, error: "Unsupported preset version. Expected version 1 to 8." }
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
        hospitalityNeedThreshold: DEFAULT_BALANCE.rules.hospitalityNeedThreshold,
        hospitalityRenownBonus: DEFAULT_BALANCE.rules.hospitalityRenownBonus,
        levellingLimit: DEFAULT_BALANCE.rules.levellingLimit,
        joblessHireChance: DEFAULT_BALANCE.rules.joblessHireChance,
        employedHireChance: DEFAULT_BALANCE.rules.employedHireChance,
        dailyWage: DEFAULT_BALANCE.rules.dailyWage,
        hearthHours: DEFAULT_BALANCE.rules.hearthHours,
        ...rules,
        // Adopt slower defaults in old saves without overwriting custom rates.
        ...((version < 4 && rules.hungerDecay === 12.5 || version < 5 && rules.hungerDecay === 3 || version < 7 && rules.hungerDecay === 1.5) ? { hungerDecay: DEFAULT_BALANCE.rules.hungerDecay } : {}),
        ...((version < 4 && rules.thirstDecay === 25 || version < 6 && rules.thirstDecay === 6 || version < 7 && rules.thirstDecay === 3) ? { thirstDecay: DEFAULT_BALANCE.rules.thirstDecay } : {}),
        ...(version < 7 && rules.hospitalityBaseChance === 0.1 ? { hospitalityBaseChance: DEFAULT_BALANCE.rules.hospitalityBaseChance } : {}),
        ...(version < 5 && rules.staminaDecay === 2.1 ? { staminaDecay: DEFAULT_BALANCE.rules.staminaDecay } : {}),
        // Found new settlements with the larger treasury unless the player tuned it.
        ...(version < 8 && rules.startingGold === 200 ? { startingGold: DEFAULT_BALANCE.rules.startingGold } : {}),
        ...(version < 8 && rules.startingWood === 160 ? { startingWood: DEFAULT_BALANCE.rules.startingWood } : {}),
      },
      buildings: {
        ...DEFAULT_BALANCE.buildings,
        // The shepherd’s hut became the house; keep its authored tuning.
        ...(record(buildings["shepherd-hut"]) ? { house: buildings["shepherd-hut"] } : {}),
        ...buildings,
        // Move the former default unlock later without replacing custom tuning.
        ...(version < 7 && record(buildings["guard-post"])?.requiredRenown === 15 ? {
          "guard-post": { ...record(buildings["guard-post"]), requiredRenown: DEFAULT_BALANCE.buildings["guard-post"].requiredRenown },
        } : {}),
        // The hut now earns wood through deliveries; retire its old passive payment.
        ...(version === 1 && record(buildings.workshop) ? {
          workshop: { ...record(buildings.workshop), woodIncome: 0 },
        } : {}),
        // The tavern now earns at the counter; retire its old passive payment.
        ...(version < 4 && record(buildings.tavern)?.goldIncome === 10 ? {
          tavern: { ...record(buildings.tavern), goldIncome: 0 },
        } : {}),
      },
    } : preset?.balance)
  } catch {
    return { balance: null, error: "This file is not valid JSON." }
  }
}
