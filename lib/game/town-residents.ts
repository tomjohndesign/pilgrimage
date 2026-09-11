import { BUILDING_KINDS, type PlacedBuilding } from "./buildings"
import { travelerAppearance } from "./base-person/population"
import type { GameMap } from "./map/types"
import { TRAVELER_TYPES, type Traveler } from "./travelers"

/** The tavern keepers, one per job slot, in the order they take the counter. */
const FOUNDING_HOUSEHOLD: readonly (readonly [string, "Male" | "Female"])[] =
  [["Aldwin", "Male"], ["Edith", "Female"], ["Godric", "Male"], ["Mildrith", "Female"]]

const FOUNDING_ID_OFFSETS = [0, 50, 25, 75]

/** Towns keep their founding household through traffic changes and annexation. */
export function townResidents(map: GameMap) {
  return (map.towns ?? []).flatMap((town, index) => {
    const tavern = map.buildings.find(b => b.id === town.tavernId)
    const house = map.buildings.find(b => b.townId === town.id && b.buildType === "house")
    if (!tavern || !house) return []
    const building: PlacedBuilding = { ...tavern, kind: "tavern" }
    return Array.from({ length: BUILDING_KINDS.tavern.jobs }, (_, jobSlot) => {
      // The founding pair keep the ids saved games already know them by.
      let id = 2_000_000 + index * 100 + (FOUNDING_ID_OFFSETS[jobSlot] ?? jobSlot * 25)
      const [name, body] = FOUNDING_HOUSEHOLD[jobSlot % FOUNDING_HOUSEHOLD.length]
      while (travelerAppearance(map.seed ?? 0, id).bodyType !== body) id++
      const traveler: Traveler = {
        id, name: `${name} of ${town.name}`,
        type: TRAVELER_TYPES.peasant, pace: 1, direction: 1,
        offset: town.junction / Math.max(1, (map.road?.length ?? 1) - 1),
        attributes: { age: 28 + jobSlot * 5, gold: 40, piety: 30, happiness: 75, status: 25,
          hunger: 100, thirst: 100, stamina: 100,
          jobless: false, skills: [...BUILDING_KINDS.tavern.trades] },
      }
      return { traveler, building, jobSlot, home: house.id }
    })
  })
}
