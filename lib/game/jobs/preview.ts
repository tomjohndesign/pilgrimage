import { travelerAppearance } from "../base-person/population"
import { BUILDING_KINDS, type PlacedBuilding } from "../buildings"
import { buildingEntry } from "../building-rotation"
import { assignBuildingTask } from "../construction"
import { buildingSupports } from "../character-support"
import { tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"
import { surfaceHeight } from "../map/bridges"
import { jobBuildings } from "../settlement"
import type { SimTraveler } from "../sim"
import { TRAVELER_TYPES, type Traveler } from "../travelers"

/** Extra identities keep the staffed demo independent of the traffic slider. */
export function previewResidents(map: GameMap) {
  const seen = new Map<string, number>()
  const homes = map.buildings.filter(b => b.buildType === "house").flatMap(b =>
    buildingSupports(b).filter(s => s.clips.includes("sleeping")).map(() => b.id))
  let index = 0
  let nextId = 1_000_000
  return jobBuildings(map).filter(b => b.id.startsWith("preview-")).flatMap(building =>
    Array.from({ length: BUILDING_KINDS[building.kind].jobs }, (_, jobSlot) => {
      const order = seen.get(building.kind) ?? 0
      seen.set(building.kind, order + 1)
      const bodyType = order % 2 === 0 ? "Male" : "Female"
      let id = nextId
      while (travelerAppearance(map.seed ?? 0, id).bodyType !== bodyType) id++
      nextId = id + 1
      const name = (bodyType === "Male" ? ["Aldwin", "Oswin", "Edric", "Wulf", "Baldric", "Godwin"]
        : ["Willa", "Agnes", "Edith", "Aelfwyn", "Hilda", "Rowena"])[index % 6]
      const traveler: Traveler = { id, name, type: TRAVELER_TYPES[building.kind === "market" ? "vendor" : "peasant"],
        offset: 0, direction: 1, pace: 1,
        attributes: { age: 24 + index, gold: 40, status: 25, piety: 60, hunger: 100, thirst: 100,
          stamina: 100, jobless: false, skills: [...BUILDING_KINDS[building.kind].trades] } }
      return { traveler, building, jobSlot, home: homes[index++] ?? null }
    }))
}

/** Start at the actual work posts; the normal simulation owns every subsequent action. */
export function placePreviewResident(actor: SimTraveler, map: GameMap,
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
