import type { GameMap } from "../map/types"
import type { TreePlacement } from "../trees/placement"
import { decodeObjectId, RELIC_OBJECT_ID } from "./outline"

/**
 * How far from a point, in tile coordinates, the tile an object in the world
 * ID buffer stands on is, so a picture of the land can be cut along whole
 * objects: a tree hanging over the rim shows entire when its trunk is inside,
 * and not at all when it is not. Tiles count by their centres.
 *
 * Buildings take the first block of IDs in map order and trees the next, in
 * placement order (see `buildingObjectId` and `treeObjectId`). Anything else,
 * including bare ground, which draws no ID, reports null and is cut by the
 * ground under it instead.
 */
export function objectTileDistance(id: number, centreX: number, centreZ: number, map: Pick<GameMap, "width" | "depth" | "buildings">,
  trees: readonly Pick<TreePlacement, "x" | "z">[]): number | null {
  if (id <= 0 || id >= RELIC_OBJECT_ID) return null
  const buildings = map.buildings
  if (id <= buildings.length) {
    // The nearest tile of the footprint: a building touching the disc shows whole.
    const building = buildings[id - 1]
    const dx = Math.max(building.x + .5 - centreX, 0, centreX - (building.x + building.w - .5))
    const dz = Math.max(building.z + .5 - centreZ, 0, centreZ - (building.z + building.d - .5))
    return Math.hypot(dx, dz)
  }
  const tree = trees[id - 1 - buildings.length]
  if (!tree) return null
  return Math.hypot(Math.floor(tree.x + map.width / 2) + .5 - centreX, Math.floor(tree.z + map.depth / 2) + .5 - centreZ)
}

/** The object ID a texel of the world ID buffer carries. */
export function texelObjectId(pixels: Uint8Array, offset: number): number {
  return decodeObjectId(pixels[offset] / 255, pixels[offset + 1] / 255, pixels[offset + 2] / 255)
}
