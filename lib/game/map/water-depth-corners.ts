import { depthBandCorners } from "./depth-field"
import type { GameMap } from "./types"

/** Depth colours meet in crisp halves, using the same shared-edge rules as ground. */
export function waterDepthCorners(map: GameMap): Int8Array {
  const depths = map.tiles.map((terrain, i) => terrain === "water" || terrain === "bridge"
    ? Math.min(3, Math.max(1, map.water?.depth[i] ?? 1)) : 0)
  return depthBandCorners(map, depths)
}
