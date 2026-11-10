import { walkingSurface } from "./map/walking-surface"
import type { GameMap } from "./map/types"
import type { SimState } from "./sim"

/** Release occupants and errands immediately, including while the simulation is paused. */
export function clearDemolishedBuildings(sim: SimState, removed: ReadonlySet<string>, map: GameMap): void {
  if (!removed.size) return
  const gone = (id: string | null | undefined) => !!id && removed.has(id)
  sim.buildings = sim.buildings.filter(b => !removed.has(b.id))
  for (const s of sim.travelers.values()) {
    const lostJob = gone(s.employer)
    const lostHome = gone(s.home)
    const interrupted = lostJob || lostHome || gone(s.buildingTask?.buildingId)
      || gone(s.deliveryBuilding) || gone(s.tavernVisit?.plan.buildingId)
      || gone(s.waterVisit?.sourceId) || gone(s.marketParking?.buildingId)
    if (lostJob) { s.employer = null; s.jobless = true; s.herding = undefined }
    if (lostHome) { s.home = null; s.homeLarder = undefined }
    if (!interrupted) continue
    s.buildingTask = undefined
    s.constructionReturn = undefined
    s.deliveryBuilding = undefined
    s.tavernVisit = undefined
    s.waterVisit = undefined
    s.marketParking = undefined
    // Every errand the forced change below abandons: left set, these hold
    // reservations or make later trips refuse this person.
    s.breadVisit = undefined
    s.naturalWaterVisit = undefined
    s.penFoodVisit = undefined
    s.almsVisit = undefined
    s.musicVisit = undefined
    s.customerVisit = undefined
    s.shrineSeat = undefined
    s.shrinePlace = undefined
    s.shrineQueueOrder = undefined
    // An abandoned haul is dropped; wells, alms tables and pens refuse anyone still carrying.
    s.carrying = 0
    s.workRoute = null
    s.workTarget = null
    s.tree = null
    s.walkFrom = null
    s.offRoadRoute = null
    s.spot = null
    s.diversionCheck = undefined
    s.activity = s.employer || s.home ? "idle" : "walking"
    s.timer = 0
    s.y = walkingSurface(map, s.x, s.z).height
  }
  for (const [id, monk] of sim.joinedMonks) {
    if (gone(monk.home)) sim.joinedMonks.set(id, { ...monk, home: undefined, bedSlot: undefined })
  }
  for (const animal of sim.wildlife?.animals ?? []) {
    if (gone(animal.fold?.penId)) { animal.fold = undefined; animal.target = null; animal.rest = 0 }
  }
  for (const id of removed) sim.foodStores.delete(id)
  for (const [id, pile] of sim.piles) if (removed.has(pile.campId)) sim.piles.delete(id)
  sim.resourceRevision++
}
