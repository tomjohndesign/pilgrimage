import { groundHeight } from "./map/elevation"
import { worldToTileX, worldToTileZ, type GameMap } from "./map/types"

/** Footprint containment excludes units flying above the building. */
export function unitInterior(map: GameMap, unit?: { x: number; y: number; z: number }): string | null {
  if (!unit) return null
  const x = worldToTileX(map, unit.x), z = worldToTileZ(map, unit.z)
  const building = map.buildings.find(b => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d)
  if (!building) return null
  const floor = groundHeight(map, building.x + (building.w - 1) / 2, building.z + (building.d - 1) / 2)
  return unit.y >= floor - .2 && unit.y < floor + building.height ? building.id : null
}
