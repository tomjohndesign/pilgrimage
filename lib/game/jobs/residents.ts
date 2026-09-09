import type { PlacedBuilding } from "../buildings"
import { buildingEntry } from "../building-rotation"
import { assignBuildingTask } from "../construction"
import { tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"
import { surfaceHeight } from "../map/bridges"
import type { SimTraveler } from "../sim"

/** Start at the actual work posts; the normal simulation owns every subsequent action. */
export function placeResident(actor: SimTraveler, map: GameMap,
  resident: { building: PlacedBuilding; jobSlot: number; home: string | null }) {
  const { building, jobSlot, home } = resident
  const entry = buildingEntry(building)
  Object.assign(actor, { employer: building.id, jobSlot, home, jobless: false, convoy: false,
    x: tileToWorldX(map, entry.x) + (jobSlot - 1) * .14, z: tileToWorldZ(map, entry.z),
    y: surfaceHeight(map, entry.x, entry.z), activity: "idle", timer: 1 + jobSlot, moveSpeed: 0,
    workSlot: jobSlot, offRoadRoute: null })
  if (assignBuildingTask(actor, map, "work", building.id)) {
    Object.assign(actor, actor.buildingTask!.destination)
    actor.buildingTask!.route = []
    actor.activity = "posted"
  }
}
