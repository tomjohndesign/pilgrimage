import { GAME_HOUR_SECONDS } from "../calendar"
import type { GameMap } from "../map/types"
import { MONK_COUNT, type Monk } from "../monks"
import { roadPosition, type SimState, type SimTraveler } from "../sim"
import { emptyFoodStock, type FoodStock } from "../storage"
import type { Traveler } from "../travelers"
import type { TreeModel } from "../trees/render-model"
import type { SimulationSave, TravelerSave } from "./schema"

/**
 * The living world, reduced to what lasts. Everyone's attributes, purse,
 * job and home survive; the errand they were on does not. A traveler rejoins
 * the road where they were, and a resident wakes idle on the spot and asks
 * for work, so the population picks its day back up within a few seconds
 * rather than carrying half-finished routes, seats and carts across a reload.
 *
 * Wildlife, worn footpaths and the brothers' own routine are rebuilt from
 * the seed; only their effects on the economy are kept.
 */
export function captureSimulation(sim: SimState, treeModel: TreeModel): SimulationSave {
  return {
    time: sim.time,
    treeModel,
    visits: sim.visits,
    wood: sim.wood,
    shrineGold: sim.shrineGold,
    tradeGold: sim.tradeGold,
    constructionWood: sim.constructionWood,
    shrineQueueSequence: sim.shrineQueueSequence,
    admissionSequence: sim.admissionSequence,
    relic: { ...sim.relic },
    felled: [...sim.felled].sort((a, b) => a - b),
    treeResources: [...sim.treeResources].map(([index, tree]) => [index, { ...tree }]),
    foodStores: [...sim.foodStores].map(([id, stock]) => [id, { ...stock }]),
    piles: [...sim.piles.values()].map(pile => ({ ...pile })),
    travelers: [...sim.travelers.values()].map(captureTraveler),
    joinedMonks: [...sim.joinedMonks].map(([travelerId, monk]) => ({ travelerId, monk: captureMonk(monk) })),
  }
}

function captureTraveler(s: SimTraveler): TravelerSave {
  return {
    id: s.id,
    gold: s.gold, piety: s.piety, happiness: s.happiness,
    hunger: s.hunger, thirst: s.thirst, stamina: s.stamina,
    hoursSinceChurch: s.hoursSinceChurch,
    jobless: s.jobless,
    employer: s.employer, jobSlot: s.jobSlot, home: s.home,
    deliveryBuilding: s.deliveryBuilding ?? undefined,
    beggar: s.beggar, goldlessSeconds: s.goldlessSeconds,
    carrying: s.carrying,
    visits: s.visits, visitCooldown: s.visitCooldown, admissionPaid: s.admissionPaid,
    fled: s.fled, rolls: s.rolls, cycle: s.cycle,
    direction: s.direction, progress: s.progress, laneOffset: s.laneOffset, lane: s.lane,
    position: { x: s.x, y: s.y, z: s.z },
  }
}

function captureMonk(monk: Monk): SimulationSave["joinedMonks"][number]["monk"] {
  return {
    id: monk.id, name: monk.name, duty: monk.duty, complexion: monk.complexion,
    attributes: { ...monk.attributes, skills: [...monk.attributes.skills] },
    home: monk.home, bedSlot: monk.bedSlot,
    arrival: monk.arrival ? { ...monk.arrival } : undefined,
  }
}

/**
 * Apply a save to a sim freshly created for the same world and cast. Records
 * that no longer fit — a building that is gone, a tree index past the end —
 * are skipped rather than failing the whole load.
 */
export function restoreSimulation(sim: SimState, save: SimulationSave, travelers: readonly Traveler[], map: GameMap, treeCount?: number): void {
  const cast = new Map(travelers.map(t => [t.id, t]))
  const buildingIds = new Set(map.buildings.map(b => b.id))
  const workplaceIds = new Set(sim.buildings.map(b => b.id))
  const roadLength = map.road ? map.road.length - 1 : 0
  const treeFits = (index: number) => treeCount === undefined || index < treeCount

  sim.time = save.time
  sim.visits = save.visits
  sim.wood = save.wood
  sim.shrineGold = save.shrineGold
  sim.tradeGold = save.tradeGold
  sim.constructionWood = save.constructionWood
  sim.shrineQueueSequence = save.shrineQueueSequence
  sim.admissionSequence = save.admissionSequence
  sim.relic = { ...save.relic }
  sim.admissionPayments = []

  sim.felled = new Set(save.felled.filter(treeFits))
  sim.treeResources = new Map(save.treeResources.filter(([index]) => treeFits(index)).map(([index, tree]) => [index, { ...tree }]))
  sim.foodStores = new Map(save.foodStores.filter(([id]) => buildingIds.has(id))
    .map(([id, stock]) => [id, { ...emptyFoodStock(), ...pickFood(stock) }]))
  sim.piles = new Map(save.piles.filter(pile => buildingIds.has(pile.campId)).map(pile => [pile.id, { ...pile }]))
  sim.resourceRevision++

  for (const { travelerId, monk } of save.joinedMonks) {
    const t = cast.get(travelerId)
    if (!t || t.type.id !== "friar") continue
    sim.joinedMonks.set(travelerId, {
      ...monk, id: MONK_COUNT + travelerId,
      complexion: monk.complexion as Monk["complexion"],
      attributes: { ...monk.attributes, skills: [...monk.attributes.skills] },
      home: monk.home && buildingIds.has(monk.home) ? monk.home : undefined,
      arrival: monk.arrival ? { ...monk.arrival } : undefined,
    })
    sim.travelers.delete(travelerId)
  }

  for (const record of save.travelers) {
    const s = sim.travelers.get(record.id)
    const t = cast.get(record.id)
    if (!s || !t) continue
    restoreTraveler(sim, s, t, record, map, roadLength, workplaceIds, buildingIds)
  }
  // Companies pick up from where their leader resumed and walk back into formation.
  for (const party of sim.parties.values()) {
    const leader = sim.travelers.get(party.members[0])
    if (!leader) continue
    party.progress = leader.progress; party.direction = leader.direction
    party.headTile = Math.floor(leader.progress); party.speed = 0; party.formed = false
    party.diversion = undefined; party.provisioned = false
  }
}

function pickFood(stock: Record<string, number>): Partial<FoodStock> {
  const empty = emptyFoodStock()
  return Object.fromEntries(Object.entries(stock).filter(([type]) => type in empty)) as Partial<FoodStock>
}

function restoreTraveler(
  sim: SimState, s: SimTraveler, t: Traveler, record: TravelerSave, map: GameMap, roadLength: number,
  workplaceIds: ReadonlySet<string>, buildingIds: ReadonlySet<string>,
): void {
  s.gold = record.gold
  s.piety = record.piety
  s.happiness = record.happiness
  s.hunger = record.hunger
  s.thirst = record.thirst
  s.stamina = record.stamina
  s.hoursSinceChurch = record.hoursSinceChurch
  s.jobless = record.jobless
  s.beggar = record.beggar
  s.goldlessSeconds = record.goldlessSeconds
  s.carrying = record.carrying
  s.visits = record.visits
  s.visitCooldown = record.visitCooldown
  s.admissionPaid = record.admissionPaid
  s.fled = record.fled
  s.rolls = record.rolls
  s.cycle = record.cycle
  s.direction = record.direction
  s.laneOffset = record.laneOffset
  s.moveSpeed = 0

  const employer = record.employer && workplaceIds.has(record.employer) ? record.employer : null
  s.employer = employer
  s.jobSlot = employer ? record.jobSlot : 0
  s.home = record.home && buildingIds.has(record.home) ? record.home : null
  s.deliveryBuilding = record.deliveryBuilding && buildingIds.has(record.deliveryBuilding) ? record.deliveryBuilding : null
  s.progress = Math.min(roadLength, Math.max(0, record.progress))
  s.lane = record.lane

  if (employer) {
    // A settler resumes on the spot and asks their workplace for a task.
    s.x = record.position.x; s.y = record.position.y; s.z = record.position.z
    s.activity = "idle"
    s.timer = GAME_HOUR_SECONDS
    s.convoy = false
    return
  }
  // Everyone else rejoins the road where they were, facing the way they went.
  const at = roadPosition(map, t, s.progress, s.lane)
  s.x = at.x; s.y = at.y; s.z = at.z
  s.activity = "walking"
  s.timer = 0
  s.branchEntryLane = s.lane
}
