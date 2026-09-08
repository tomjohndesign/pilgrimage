import { buildingSupports } from "./character-support"
import { isComplete, isHouse, isMonkShelter } from "./construction"
import type { BuildingDef, GameMap } from "./map/types"
import { MONK_COUNT } from "./monks"

/** Capacity follows the sleeping places in the authored building, including rotations. */
export function housingBeds(building: BuildingDef): number {
  return isComplete(building) && (isHouse(building) || isMonkShelter(building))
    ? buildingSupports(building).filter(support => support.clips.includes("sleeping")).length : 0
}

export function monkBeds(map: GameMap) {
  return map.buildings.filter(isMonkShelter).flatMap(building =>
    Array.from({ length: housingBeds(building) }, (_, slot) => ({ home: building.id, slot })))
}

/** Founders reserve their beds first; visitors never consume a permanent place. */
export function vacantMonkBed(map: GameMap, joined: Iterable<{ home?: string; bedSlot?: number }>) {
  const beds = monkBeds(map)
  const taken = [...joined]
  return beds.slice(MONK_COUNT).find(bed => !taken.some(monk => monk.home === bed.home && monk.bedSlot === bed.slot))
}

export function enclaveHousing(map: GameMap, settlers: number, monks: number) {
  const capacity = (test: (b: BuildingDef) => boolean) => map.buildings.filter(test).reduce((sum, b) => sum + housingBeds(b), 0)
  const places = (occupied: number, total: number) => ({ occupied, capacity: total, available: Math.max(0, total - occupied) })
  return { people: places(settlers, capacity(isHouse)), monks: places(monks, capacity(isMonkShelter)) }
}
