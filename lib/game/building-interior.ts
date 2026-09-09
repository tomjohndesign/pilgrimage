import { marketYardContains } from "./market-layout"
import { groundHeight } from "./map/elevation"
import { worldToTileX, worldToTileZ, type GameMap } from "./map/types"

/** Footprint containment excludes units flying above the building. */
export function unitInterior(map: GameMap, unit?: { x: number; y: number; z: number }): string | null {
  if (!unit) return null
  const x = worldToTileX(map, unit.x), z = worldToTileZ(map, unit.z)
  let selected: string | null = null, highest = -Infinity
  for (const building of map.buildings) {
    if (!(x >= building.x && x < building.x+building.w && z >= building.z && z < building.z+building.d) || marketYardContains(building,{x,z})) continue
    const floor = groundHeight(map,building.x+(building.w-1)/2,building.z+(building.d-1)/2)+(building.floorHeight ?? 0)
    if (floor > highest && unit.y >= floor-.2 && unit.y < floor+building.height) { selected=building.id; highest=floor }
  }
  return selected
}
