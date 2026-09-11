import { monkBeds } from "./housing"
import type { GameMap } from "./map/types"
import { MONK_COUNT } from "./monks"
import type { SimState } from "./sim"

/** Buildings somebody lives or works in. Only these keep a hearth smoking and,
 * at a market stall, wares on the counter under a rigged cloth. */
export function occupiedBuildingIds(sim: Pick<SimState, "travelers" | "joinedMonks"> | null, map: GameMap): Set<string> {
  const occupied = new Set<string>()
  if (!sim) return occupied
  for (const person of sim.travelers.values()) {
    if (person.employer) occupied.add(person.employer)
    if (person.home) occupied.add(person.home)
  }
  // The founding brothers take the first beds; later vows record a home directly.
  for (const bed of monkBeds(map).slice(0, MONK_COUNT)) occupied.add(bed.home)
  for (const monk of sim.joinedMonks.values()) if (monk.home) occupied.add(monk.home)
  return occupied
}

export function sameIds(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false
  for (const id of a) if (!b.has(id)) return false
  return true
}
