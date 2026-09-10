import { isWaterTerrain } from "./terrain"
import { depthBandCorners } from "./depth-field"
import type { GameMap } from "./types"

/** Depth colours meet in crisp halves, using the same shared-edge rules as ground. */
export function waterDepthCorners(map: GameMap): Int8Array {
  const depths = map.tiles.map((terrain, i) => isWaterTerrain(terrain)
    ? Math.min(3, Math.max(1, map.water?.depth[i] ?? 1)) : 0)
  const corners = depthBandCorners(map, depths)
  // Keep the entire walkable crossing visibly shallow; deeper neighbours may
  // still borrow its colour to soften the edge of the gravel shelf.
  for (let i = 0; i < corners.length; i++) if (map.tiles[i] === "ford") corners[i] = -1
  return corners
}
