import { groundQuadConnected, resolveCornerTiles } from "./ground-transitions"
import { SHORE_CORNERS } from "./shoreline"
import type { GameMap } from "./types"

/** Depth colours meet in crisp halves, using the same shared-edge rules as ground. */
export function waterDepthCorners(map: GameMap): Int8Array {
  const depths = map.tiles.map((terrain, i) => terrain === "water" || terrain === "bridge"
    ? Math.min(3, Math.max(1, map.water?.depth[i] ?? 1)) : 0)
  const candidates: { index: number; corner: number }[] = []
  for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
    const index = z * map.width + x
    if (!depths[index]) continue
    SHORE_CORNERS.forEach(([dx, dz], corner) => {
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nx >= map.width || nz < 0 || nz >= map.depth) return
      const donor = depths[z * map.width + nx]
      if (!donor || donor === depths[index] || depths[nz * map.width + x] !== donor || depths[nz * map.width + nx] !== donor) return
      if (groundQuadConnected(map, Math.min(x, nx), Math.min(z, nz))) candidates.push({ index, corner })
    })
  }
  return resolveCornerTiles(map.width, depths, candidates)
}
