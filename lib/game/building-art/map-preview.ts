import { buildingDimensions } from "./dimensions"
import type { GameMap } from "../map/types"
import type { TerrainId } from "../map/terrain"
import type { BuildingRecipe } from "./style"

/** A repeatable test site, rendered with the same tiles and roads as /play.
 * Six tiles of clearance keep every supported footprint inside the map.
 */
export function buildingPreviewMap(recipe: BuildingRecipe): GameMap {
  const width = recipe.width + 12, depth = recipe.depth + 12
  const entranceZ = Math.ceil(depth / 2 + buildingDimensions(recipe).front)
  const roadZ = depth - 4, doorX = Math.floor(width / 2)
  const tiles: TerrainId[] = Array.from({ length: width * depth }, (_, i) => {
    const x = i % width, z = Math.floor(i / width)
    if (z === roadZ) return "path"
    if (x === doorX && z >= entranceZ && z < roadZ) return "track"
    if (x < 3 && z < 4 || x >= width - 3 && z < 3) return "forest"
    return "grass"
  })
  return {
    width, depth, tiles, seed: 7919,
    buildings: [{ id: "workshop", buildType: recipe.variant, label: recipe.subject, x: 6, z: 6, w: recipe.width, d: recipe.depth, height: recipe.wallHeight, color: "#e7d8b9", roofColor: "#c4a05f" }],
    road: Array.from({ length: width }, (_, x) => ({ x, z: roadZ })),
  }
}
