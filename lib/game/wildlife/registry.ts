import type { WildlifeAnimal, WildlifeWorld } from "./simulation"
/** Live state for the shared map inspector; owned by the mounted wildlife scene. */
export const wildlifeRegistry: { current: WildlifeWorld | null } = { current: null }

/**
 * The animal with this id. Ids are not array positions: removing a coop drops
 * its flock from the middle of the list and later flocks keep their ids. The
 * direct slot still matches for every animal before the first removed one.
 */
export function wildlifeAnimal(animals: readonly WildlifeAnimal[] | undefined, id: number) {
  if (!animals) return undefined
  const direct = animals[id]
  return direct?.id === id ? direct : animals.find(animal => animal.id === id)
}
