import { buildingEntrance, constructionWork, isComplete } from "./construction"
import { rotatedFootprint, buildingEntry, buildingApproaches, type BuildingRotation } from "./building-rotation"
import { groundHeight, levelBuildingGround } from "./map/elevation"
import { buildingKind, placementProblem, PLACEMENT_PROBLEM_LABELS, type PlacedBuilding } from "./buildings"
import { settlementRoute, shrineRoadHead } from "./settlement-route"
import { buildInfluence, getBuildInfluence, type BuildInfluence } from "./build-influence"
import type { SimState } from "./sim"
import { DEFAULT_ADMISSION_FEE } from "./shrine-visit"
import { TERRAIN } from "./map/terrain"
import { establishedFootpath } from "./footpaths"
import { tileAt, type BuildingDef, type GameMap, type TilePos } from "./map/types"
import type { Monk } from "./monks"
import type { Relic } from "./relic"

import { BUILD_CATALOG, DEFAULT_BALANCE, buildCatalog, type GameBalance } from "./balance"
import type { BuildDefinition, Resources } from "./balance"
export { BUILD_CATALOG, type BuildDefinition, type Resources } from "./balance"

/** Default aliases for simulation fixtures and callers without browser tuning. */
export const STARTING_RESOURCES = {
  gold: DEFAULT_BALANCE.rules.startingGold,
  wood: DEFAULT_BALANCE.rules.startingWood,
}
export const SETTLEMENT_RADIUS = DEFAULT_BALANCE.rules.buildRadius

export interface Settlement {
  /** Generated buildings permanently acquired when connected influence reaches them. */
  claimedBuildings: string[]
  /** Terrain after successful purchases; the generated base map stays immutable. */
  elevation?: GameMap["elevation"]
  resources: Resources
  /** Cumulative harvest already credited; spending never credits it again. */
  deliveredWood: number
  spentWood: number
  shrineAdmission: number
  collectedAdmission: number
  /** Counter takings already credited; sales never credit the same coin twice. */
  collectedTrade: number
  /** Only player-built additions. The founding hovel stays on the base map. */
  structures: BuildingDef[]
}

export function createSettlement(balance: GameBalance = DEFAULT_BALANCE): Settlement {
  return {
    claimedBuildings: [],
    resources: { gold: balance.rules.startingGold, wood: balance.rules.startingWood },
    structures: [],
    deliveredWood: 0,
    spentWood: 0,
    shrineAdmission: DEFAULT_ADMISSION_FEE,
    collectedAdmission: 0,
    collectedTrade: 0,
  }
}

/** Preserve generated IDs and residents; ownership is a session overlay on the base map. */
export function settlementMap(baseMap: GameMap, settlement: Settlement): GameMap {
  const claimed = new Set(settlement.claimedBuildings)
  return { ...baseMap, elevation: settlement.elevation ?? baseMap.elevation,
    buildings: [...baseMap.buildings.map(b => claimed.has(b.id) ? { ...b, owner: undefined } : b), ...settlement.structures] }
}

/** A footprint touching connected influence joins immediately; its renown can reach neighbours. */
export function claimTownBuildings(settlement: Settlement, baseMap: GameMap, balance: GameBalance = DEFAULT_BALANCE): Settlement {
  let result = settlement
  while (true) {
    const map = settlementMap(baseMap, result)
    const independent = map.buildings.filter(b => b.owner === "independent")
    if (!independent.length) return result
    const influence = buildInfluence(map, balance).connected
    const reached = independent.filter(b => {
      for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) {
        if (influence[z * map.width + x]) return true
      }
      return false
    })
    if (!reached.length) return result
    result = { ...result, claimedBuildings: [...result.claimedBuildings, ...reached.map(b => b.id)] }
  }
}

/** Tavern and stall takings are earned in the simulation and credited once. */
export function creditTrade(settlement: Settlement, receipts: number): Settlement {
  if (receipts <= settlement.collectedTrade) return settlement
  return {
    ...settlement,
    collectedTrade: receipts,
    resources: { ...settlement.resources, gold: settlement.resources.gold + receipts - settlement.collectedTrade },
  }
}

/** Donations are earned in the simulation and credited once, even after spending. */
export function creditAdmission(settlement: Settlement, receipts: number): Settlement {
  if (receipts <= settlement.collectedAdmission) return settlement
  return {
    ...settlement,
    collectedAdmission: receipts,
    resources: { ...settlement.resources, gold: settlement.resources.gold + receipts - settlement.collectedAdmission },
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

/** One second chance per junction encounter, regardless of how many crosses are built. */
export function settlementEvangelism(map: GameMap): number {
  let chance = 0
  for (const building of map.buildings) {
    if (building.owner === "independent" || !isComplete(building)) continue
    const def = BUILD_CATALOG.find(item => item.id === building.buildType)
    chance = Math.max(chance, def?.evangelism ?? 0)
  }
  return chance
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
    if (building.owner === "independent" || !isComplete(building)) continue
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

/** Legacy callers cannot create resources: NPC receipts and deliveries own income. */
export function settlementIncome(_settlement: Settlement, _residentCount: number, _balance: GameBalance = DEFAULT_BALANCE): Resources {
  return { gold: 0, wood: 0 }
}

export function collectIncome(settlement: Settlement, _residentCount: number, _balance: GameBalance = DEFAULT_BALANCE): Settlement {
  return settlement
}

export function canAfford(resources: Resources, cost: Resources): boolean {
  return resources.gold >= cost.gold && resources.wood >= cost.wood
}

export function buildingAt(map: GameMap, x: number, z: number): BuildingDef | undefined {
  return map.buildings.find((b) => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d)
}

/** Shared terrain feedback for the influence overlay and the full footprint check. */
export function buildTileError(map: GameMap, x: number, z: number, influence: BuildInfluence): string | null {
  const terrain = tileAt(map, x, z)
  if (!terrain) return "The whole structure must fit on the map."
  if (buildingAt(map, x, z)) return "Another structure occupies this space."
  if(map.site?.door.x===x && map.site.door.z===z) return "Keep the shrine approach clear."
  if(map.buildings.some(b => buildingApproaches(map,b).some(p=>p.x===x && p.z===z)))
    return "Keep access to existing buildings clear: reserve the entrance path tile."
  // Ground the traffic has already made its own counts as open ground: the
  // road, the shrine track, and any crossing worn in by walking feet.
  if (!establishedFootpath(map, x, z) && (!TERRAIN[terrain].buildable || terrain === "hills"))
    return "Choose flat, open ground or a worn path; keep woods and water clear."
  // Only the run through the old growth; a track's two mouths are road tiles.
  if (map.shortcuts?.some(track => track.tiles.slice(1, -1).some(tile => tile.x === x && tile.z === z)))
    return "Keep the forest track clear: the old growth leaves no way around it."
  if (map.elevation?.cliffs[z * map.width + x]) return "Choose level ground away from cliffs."
  if (map.water?.depth[z * map.width + x]) return "Structures need dry ground."
  if (!influence.connected[z * map.width + x])
    return "Build beside the shrine approach or within connected influence from a renown source."
  return null
}

/**
 * A settlement may grow over the road — travellers walk around a footprint and
 * wear their own way past it — so long as there is a way around to be found.
 * The road's two ends are where travellers come and go; those stay clear.
 */
export function roadBlockError(map: GameMap, buildings: readonly BuildingDef[]): string | null {
  const road = map.road
  if (!road) return null
  const blocked = road.map(p => buildings.some(b => p.x >= b.x && p.x < b.x + b.w && p.z >= b.z && p.z < b.z + b.d))
  for (let i = 0; i < road.length; i++) {
    if (!blocked[i] || (i > 0 && blocked[i - 1])) continue
    let last = i
    while (last + 1 < road.length && blocked[last + 1]) last++
    if (i === 0 || last === road.length - 1) return "Leave the road clear where it leaves the map."
    if (!settlementRoute(map, buildings, road[i - 1], road[last + 1]))
      return "Leave a way around the road for passing travellers."
  }
  return null
}

/** Validate the entire footprint; the shrine approach and water stay clear. */
export function placementError(
  map: GameMap,
  def: BuildDefinition,
  at: TilePos,
  balance: GameBalance = DEFAULT_BALANCE,
  rotation: BuildingRotation = 0,
): string | null {
  const footprint = rotatedFootprint(def, rotation)
  const hovel = map.buildings.find((b) => b.id === map.site?.hovelId)
  if (!hovel) return "A founding shrine is needed before building."
  if (!Number.isInteger(at.x) || !Number.isInteger(at.z)) return "Choose a tile on the map."
  const influence = getBuildInfluence(map, balance)
  for (let z = at.z; z < at.z + footprint.d; z++) {
    for (let x = at.x; x < at.x + footprint.w; x++) {
      const error = buildTileError(map, x, z, influence)
      if (error) return error
      if (map.elevation && Math.abs(groundHeight(map, x, z) - groundHeight(map, at.x, at.z)) > 0.2) return "Choose level ground away from cliffs."
    }
  }
  if (def.id === "workshop") {
    const problem = placementProblem(map, map.buildings, "workshop", at.x, at.z, rotation)
    if (problem) return PLACEMENT_PROBLEM_LABELS[problem]
  }
  // Reserve construction frontage and preserve access to every existing building.
  if (map.site) {
    const candidate = { buildType: def.id, ...def, ...footprint, rotation, ...at, id: "construction-preview", construction: { work: 0, required: 1 } }
    const approaches=buildingApproaches(map,candidate)
    for(const approach of approaches) {
      const terrain=tileAt(map,approach.x,approach.z)
      if(!terrain || !TERRAIN[terrain].passable || buildingAt(map,approach.x,approach.z)
        || (map.water?.depth[approach.z*map.width+approach.x] ?? 0)>0)
        return "Keep access clear with a path tile outside the entrance."
      if(Math.abs(groundHeight(map,approach.x,approach.z)-groundHeight(map,at.x,at.z))>.2)
        return "The entrance path needs level ground."
    }
    const occupied = [...map.buildings, candidate]
    if ((approaches.length ? approaches : [buildingEntrance(candidate)]).some(entry=>!settlementRoute(map, occupied, map.site!.door, entry)))
      return "Keep access to the construction entrance clear."
    const roadBlock = roadBlockError(map, occupied)
    if (roadBlock) return roadBlock
    // The shrine's own track is buildable ground, but its door must stay
    // reachable — from the nearest stretch of road still clear to walk on.
    const junction = shrineRoadHead(map, occupied)
    if (junction && !settlementRoute(map, occupied, junction, map.site.door))
      return "Leave a way through from the road to the shrine door."
    for (const camp of map.buildings.filter(b => b.buildType)) {
      const entries=buildingApproaches(map,camp)
      if ((entries.length ? entries : [buildingEntry(camp)]).some(entry=>!settlementRoute(map, occupied, map.site!.door, entry)))
        return "Keep access to existing buildings clear."
    }
  }
  return null
}

export function woodcutterHuts(map: GameMap): PlacedBuilding[] {
  return map.buildings.filter((b) => b.owner !== "independent" && b.buildType === "workshop" && isComplete(b))
    .map((b) => ({ ...b, kind: "workshop" }))
}

/** Every completed structure with work in it: huts, taverns, folds and stalls. */
export function jobBuildings(map: GameMap, includeIndependent = false): PlacedBuilding[] {
  return map.buildings.flatMap((b) => {
    const kind = (includeIndependent || b.owner !== "independent") && isComplete(b) ? buildingKind(b.buildType) : null
    return kind ? [{ ...b, kind }] : []
  })
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
  rotation: BuildingRotation = 0,
): { settlement: Settlement; error: string | null } {
  const def = buildCatalog(balance).find((item) => item.id === type)
  if (!def) return { settlement, error: "Unknown structure." }
  const map = settlementMap(baseMap, settlement)
  if (settlementRenown(map, residents, relics, balance, completedVisits).total < def.requiredRenown)
    return { settlement, error: `Requires ${def.requiredRenown} shrine renown.` }
  if (!canAfford(settlement.resources, def.cost))
    return { settlement, error: "Not enough gold or wood." }
  const error = placementError(map, def, at, balance, rotation)
  if (error) return { settlement, error }
  const building: BuildingDef = {
    id: `${def.id === "workshop" ? "workshop" : "settlement"}-${settlement.structures.length}`,
    buildType: def.id,
    label: def.label,
    x: at.x,
    z: at.z,
    ...rotatedFootprint(def, rotation),
    rotation,
    height: def.height,
    color: def.color,
    roofColor: def.roofColor,
    construction: { work: 0, required: constructionWork(def.w, def.d), cost: { ...def.cost } },
  }
  return {
    settlement: {
      ...settlement,
      elevation: levelBuildingGround(map, building),
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
