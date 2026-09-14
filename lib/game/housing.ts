import { shrineMonkCapacity } from "./shrine-upgrade"
import { buildingSupports } from "./character-support"
import { isComplete, isHouse, isMonkShelter } from "./construction"
import type { BuildingDef, GameMap } from "./map/types"
import { MONK_COUNT } from "./monks"

/** Physical sleeping places in the authored building, including rotations. */
export function housingBeds(building: BuildingDef): number {
  return isComplete(building) && (isHouse(building) || isMonkShelter(building))
    ? buildingSupports(building).filter(support => support.clips.includes("sleeping")).length : 0
}

/** House population allowance is separate from simultaneous sleeping capacity. */
export function housingCapacity(building: BuildingDef): number {
  return housingBeds(building) * (isHouse(building) ? 2 : 1)
}

type RestingResident = { buildingTask?: { purpose: string; buildingId: string; slot: number } }

/** Reserve an unoccupied bunk before starting the walk home. Residents have no
 * assigned bunks; both sleepers and residents already on their way count. */
export function vacantHouseBunk(building: BuildingDef, residents: Iterable<RestingResident>, actor?: RestingResident): number | null {
  const beds = housingBeds(building)
  if (!isHouse(building) || !beds) return null
  const taken = new Set<number>()
  for (const resident of residents) {
    const task = resident.buildingTask
    if (resident !== actor && task?.purpose === "rest" && task.buildingId === building.id) taken.add(task.slot % beds)
  }
  const current = actor?.buildingTask
  if (current?.purpose === "rest" && current.buildingId === building.id
    && current.slot >= 0 && current.slot < beds && !taken.has(current.slot)) return current.slot
  for (let slot = 0; slot < beds; slot++) if (!taken.has(slot)) return slot
  return null
}

export function monkBeds(map: GameMap) {
  return map.buildings.filter(b => b.owner !== "independent" && isMonkShelter(b)).flatMap(building =>
    Array.from({ length: housingBeds(building) }, (_, slot) => ({ home: building.id, slot })))
}

/** Founders reserve their beds first; visitors never consume a permanent place. */
export function vacantMonkBed(map: GameMap, joined: Iterable<{ home?: string; bedSlot?: number }>) {
  const beds = monkBeds(map)
  const taken = [...joined]
  if (MONK_COUNT + taken.length >= shrineMonkCapacity(map)) return undefined
  return beds.slice(MONK_COUNT).find(bed => !taken.some(monk => monk.home === bed.home && monk.bedSlot === bed.slot))
}

export function enclaveHousing(map: GameMap, settlers: number, monks: number) {
  const capacity = (test: (b: BuildingDef) => boolean) => map.buildings.filter(b => b.owner !== "independent" && test(b)).reduce((sum, b) => sum + housingCapacity(b), 0)
  const places = (occupied: number, total: number) => ({ occupied, capacity: total, available: Math.max(0, total - occupied) })
  return { people: places(settlers, capacity(isHouse)), monks: places(monks, Math.min(capacity(isMonkShelter), shrineMonkCapacity(map))) }
}
