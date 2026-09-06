import { isComplete, isMonkShelter } from "./construction"
import type { BuildingDef, GameMap, TilePos } from "./map/types"

export function containsTile(building: BuildingDef, p: TilePos): boolean {
  return p.x >= building.x && p.x < building.x + building.w && p.z >= building.z && p.z < building.z + building.d
}

/** The roofless shrine has a gate at the centre of each of its four walls. */
export function shrineGates(building: BuildingDef): Array<{ outside: TilePos; inside: TilePos }> {
  const x = building.x + Math.floor(building.w / 2), z = building.z + Math.floor(building.d / 2)
  return [
    { outside: { x, z: building.z - 1 }, inside: { x, z: building.z } },
    { outside: { x, z: building.z + building.d }, inside: { x, z: building.z + building.d - 1 } },
    { outside: { x: building.x - 1, z }, inside: { x: building.x, z } },
    { outside: { x: building.x + building.w, z }, inside: { x: building.x + building.w - 1, z } },
  ]
}

/** Closed buildings block walking. Shrine visits cross walls only at a gate. */
export function buildingStepAllowed(map: GameMap, buildings: readonly BuildingDef[], from: TilePos, to: TilePos, enterShrine = false): boolean {
  for (const building of buildings) {
    // Lumber camps are open yards, with no walls or doors.
    if ((building.buildType === "lumberCamp" || building.id.startsWith("lumberCamp-")) &&
      (!building.construction || building.construction.work >= building.construction.required)) continue
    const a = containsTile(building, from), b = containsTile(building, to)
    if (!a && !b) continue
    if (enterShrine && isMonkShelter(building) && isComplete(building)) {
      if (a && b) continue
      const inside = a ? from : to, outside = a ? to : from
      if (inside.z === building.z + building.d - 1 && outside.z === building.z + building.d && inside.x === outside.x) continue
      return false
    }
    if (!enterShrine || building.id !== map.site?.hovelId) return false
    // Leave the relic table clear.
    const cx = building.x + Math.floor(building.w / 2), cz = building.z + Math.floor(building.d / 2)
    if (to.x === cx && to.z === cz) return false
    if (a && b) continue
    const same = (p: TilePos, q: TilePos) => p.x === q.x && p.z === q.z
    if (!shrineGates(building).some(g => a
      ? same(from, g.inside) && same(to, g.outside)
      : same(from, g.outside) && same(to, g.inside))) return false
  }
  return true
}
