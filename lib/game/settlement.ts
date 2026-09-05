import { placementProblem, PLACEMENT_PROBLEM_LABELS, type PlacedBuilding } from "./buildings"
import { settlementRoute } from "./settlement-route"
import type { SimState } from "./sim"
import { TERRAIN } from "./map/terrain"
import { tileAt, type BuildingDef, type GameMap, type TilePos } from "./map/types"
import type { Monk } from "./monks"
import type { Relic } from "./relic"

import { DEFAULT_BALANCE, buildCatalog, type GameBalance } from "./balance"
import type { BuildDefinition, Resources } from "./balance"
export { BUILD_CATALOG, type BuildDefinition, type Resources } from "./balance"

/** Default aliases for simulation fixtures and callers without browser tuning. */
export const INCOME_INTERVAL_MS = DEFAULT_BALANCE.rules.incomeSeconds * 1000
export const STARTING_RESOURCES = {
  gold: DEFAULT_BALANCE.rules.startingGold,
  wood: DEFAULT_BALANCE.rules.startingWood,
}
export const SETTLEMENT_RADIUS = DEFAULT_BALANCE.rules.buildRadius

export interface Settlement {
  resources: Resources
  /** Cumulative harvest already credited; spending never credits it again. */
  deliveredWood: number
  spentWood: number
  /** Only player-built additions. The founding hovel stays on the base map. */
  structures: BuildingDef[]
}

export function createSettlement(balance: GameBalance = DEFAULT_BALANCE): Settlement {
  return {
    resources: { gold: balance.rules.startingGold, wood: balance.rules.startingWood },
    structures: [],
    deliveredWood: 0,
    spentWood: 0,
  }
}

export function relicRenown(relic: Relic, balance: GameBalance = DEFAULT_BALANCE): number {
  const { sanctity, spectacle, doubt } = relic.stats
  const r = balance.rules
  return Math.max(
    r.relicMinimum,
    Math.round(
      (sanctity * r.sanctityWeight + spectacle * r.spectacleWeight - doubt * r.doubtWeight) /
        r.relicDivisor,
    ),
  )
}

export function individualRenown(monk: Monk, balance: GameBalance = DEFAULT_BALANCE): number {
  const r = balance.rules
  return Math.max(
    r.individualMinimum,
    Math.round(monk.attributes.piety / r.pietyDivisor) +
      monk.attributes.skills.length * r.skillRenown,
  )
}

/** Renown belongs to the whole establishment; contributions remain inspectable. */
export function settlementRenown(
  map: GameMap,
  residents: readonly Monk[],
  relics: readonly Relic[],
  balance: GameBalance = DEFAULT_BALANCE,
  completedVisits = 0,
) {
  let buildings = 0
  let scenery = 0
  for (const building of map.buildings) {
    if (building.id === map.site?.hovelId) buildings += balance.rules.hovelRenown
    const def = buildCatalog(balance).find((item) => item.id === building.buildType)
    if (def?.category === "buildings") buildings += def.renown
    if (def?.category === "scenery") scenery += def.renown
  }
  const individuals = residents.reduce((sum, monk) => sum + individualRenown(monk, balance), 0)
  const relicContribution = relics.reduce((sum, relic) => sum + relicRenown(relic, balance), 0)
  const visits = completedVisits * balance.rules.visitRenown
  return {
    visits,
    buildings,
    individuals,
    scenery,
    relics: relicContribution,
    total: buildings + individuals + scenery + relicContribution + visits,
  }
}

export function renownTiers(balance: GameBalance = DEFAULT_BALANCE) {
  return [
    { label: "Humble shrine", renown: 0 },
    { label: "Sanctuary", renown: balance.rules.sanctuaryRenown },
    { label: "Pilgrimage site", renown: balance.rules.pilgrimageRenown },
    { label: "Renowned establishment", renown: balance.rules.renownedRenown },
  ]
}
export const RENOWN_TIERS = renownTiers()

export function settlementIncome(
  settlement: Settlement,
  residentCount: number,
  balance: GameBalance = DEFAULT_BALANCE,
): Resources {
  // The founding brothers collect offerings and gather timber, even without buildings.
  const income = {
    gold: residentCount * balance.rules.residentGold,
    wood: residentCount * balance.rules.residentWood,
  }
  for (const building of settlement.structures) {
    const def = buildCatalog(balance).find((item) => item.id === building.buildType)
    if (def) {
      income.gold += def.income.gold
      income.wood += def.income.wood
    }
  }
  return income
}

export function collectIncome(
  settlement: Settlement,
  residentCount: number,
  balance: GameBalance = DEFAULT_BALANCE,
): Settlement {
  const income = settlementIncome(settlement, residentCount, balance)
  return {
    ...settlement,
    resources: {
      gold: settlement.resources.gold + income.gold,
      wood: settlement.resources.wood + income.wood,
    },
  }
}

export function canAfford(resources: Resources, cost: Resources): boolean {
  return resources.gold >= cost.gold && resources.wood >= cost.wood
}

export function buildingAt(map: GameMap, x: number, z: number): BuildingDef | undefined {
  return map.buildings.find((b) => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d)
}

/** Validate the entire footprint; roads, the shrine approach and water stay clear. */
export function placementError(
  map: GameMap,
  def: BuildDefinition,
  at: TilePos,
  balance: GameBalance = DEFAULT_BALANCE,
): string | null {
  const hovel = map.buildings.find((b) => b.id === map.site?.hovelId)
  if (!hovel) return "A founding shrine is needed before building."
  if (!Number.isInteger(at.x) || !Number.isInteger(at.z)) return "Choose a tile on the map."
  for (let z = at.z; z < at.z + def.d; z++) {
    for (let x = at.x; x < at.x + def.w; x++) {
      const terrain = tileAt(map, x, z)
      if (!terrain) return "The whole structure must fit on the map."
      if (
        Math.hypot(x - (hovel.x + (hovel.w - 1) / 2), z - (hovel.z + (hovel.d - 1) / 2)) >
        balance.rules.buildRadius
      )
        return `Build within ${balance.rules.buildRadius} tiles of the founding shrine.`
      if (buildingAt(map, x, z)) return "Another structure occupies this space."
      if (!TERRAIN[terrain].buildable || terrain === "hills")
        return "Choose flat, open ground; keep woods, water and paths clear."
      if (map.water?.depth[z * map.width + x]) return "Structures need dry ground."
      if (
        map.site?.branch.some((tile) => tile.x === x && tile.z === z) ||
        (map.site?.door.x === x && map.site.door.z === z)
      )
        return "Keep the shrine approach clear."
    }
  }
  if (def.id === "lumberCamp") {
    const problem = placementProblem(map, map.buildings, "lumberCamp", at.x, at.z)
    if (problem) return PLACEMENT_PROBLEM_LABELS[problem]
  }
  // Every addition must preserve access to existing lumber yards.
  if (map.site) {
    const candidate = { ...def, ...at, id: def.id === "lumberCamp" ? "lumberCamp-preview" : "preview" }
    const occupied = [...map.buildings, candidate]
    for (const camp of lumberCamps(map)) {
      if (!settlementRoute(map, occupied, map.site.door, { x: camp.x, z: camp.z + camp.d }))
        return "Keep access to lumber camps clear."
    }
  }
  return null
}

export function lumberCamps(map: GameMap): PlacedBuilding[] {
  return map.buildings.filter((b) => b.buildType === "lumberCamp")
    .map((b) => ({ ...b, kind: "lumberCamp" }))
}

export function creditTimber(settlement: Settlement, deliveredWood: number): Settlement {
  const added = Math.max(0, deliveredWood - settlement.deliveredWood)
  return added ? { ...settlement, deliveredWood,
    resources: { ...settlement.resources, wood: settlement.resources.wood + added } } : settlement
}

/** Remove spent harvest from visible stacks; deliveries remain cumulative for crediting. */
export function syncTimberSpending(sim: SimState, spentWood: number): void {
  let remaining = Math.max(0, spentWood - sim.constructionWood)
  sim.constructionWood = Math.max(sim.constructionWood, spentWood)
  for (const [id, pile] of sim.piles) {
    if (!remaining) break
    const used = Math.min(remaining, pile.wood)
    remaining -= used
    if (used === pile.wood) sim.piles.delete(id)
    else sim.piles.set(id, { ...pile, wood: pile.wood - used })
    sim.resourceRevision++
  }
}

/** The purchase and placement are one transaction; failed builds spend nothing. */
export function purchaseStructure(
  settlement: Settlement,
  baseMap: GameMap,
  residents: readonly Monk[],
  relics: readonly Relic[],
  type: string,
  at: TilePos,
  balance: GameBalance = DEFAULT_BALANCE,
  completedVisits = 0,
): { settlement: Settlement; error: string | null } {
  const def = buildCatalog(balance).find((item) => item.id === type)
  if (!def) return { settlement, error: "Unknown structure." }
  const map = { ...baseMap, buildings: [...baseMap.buildings, ...settlement.structures] }
  if (settlementRenown(map, residents, relics, balance, completedVisits).total < def.requiredRenown)
    return { settlement, error: `Requires ${def.requiredRenown} shrine renown.` }
  if (!canAfford(settlement.resources, def.cost))
    return { settlement, error: "Not enough gold or wood." }
  const error = placementError(map, def, at, balance)
  if (error) return { settlement, error }
  const building: BuildingDef = {
    id: `${def.id === "lumberCamp" ? "lumberCamp" : "settlement"}-${settlement.structures.length}`,
    buildType: def.id,
    label: def.label,
    x: at.x,
    z: at.z,
    w: def.w,
    d: def.d,
    height: def.height,
    color: def.color,
    roofColor: def.roofColor,
  }
  return {
    settlement: {
      ...settlement,
      spentWood: settlement.spentWood + def.cost.wood,
      resources: {
        gold: settlement.resources.gold - def.cost.gold,
        wood: settlement.resources.wood - def.cost.wood,
      },
      structures: [...settlement.structures, building],
    },
    error: null,
  }
}
