import { makeRng } from "../rng"
import { TILE_HEIGHT } from "../map/terrain"
import { tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"
import { CHARACTER_PIXEL_SIZE } from "./pixel-scale"
import type { TerrainBlockBounds } from "./terrain-blocks"

const COLORS = ["#939687", "#aaa796", "#7b877e"] as const

/** Small exposed cobbles, stable per tile across terrain blocks and map edits.
 * Their low crowns leave ample ankle-deep water between stones for walking. */
export function fordStones(map: GameMap, bounds?: TerrainBlockBounds) {
  const stones: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw: number; color: string }> = []
  for (let z = bounds?.z ?? 0; z < (bounds?.endZ ?? map.depth); z++) for (let x = bounds?.x ?? 0; x < (bounds?.endX ?? map.width); x++) {
    const i = z * map.width + x
    if (map.tiles[i] !== "ford") continue
    const rng = makeRng((map.seed ?? 0) ^ Math.imul(i + 1, 0x45d9f3b))
    for (let cell = 0; cell < 9; cell++) {
      if (rng() < 0.25) continue
      const sx = (2 + Math.floor(rng() * 3)) * CHARACTER_PIXEL_SIZE
      const sy = (2 + Math.floor(rng() * 2)) * CHARACTER_PIXEL_SIZE
      stones.push({
        x: tileToWorldX(map, x) + (cell % 3 - 1) * 0.3 + (rng() - 0.5) * 0.12,
        z: tileToWorldZ(map, z) + (Math.floor(cell / 3) - 1) * 0.3 + (rng() - 0.5) * 0.12,
        y: TILE_HEIGHT + (map.water?.surface?.[i] ?? 0) - CHARACTER_PIXEL_SIZE,
        sx, sy, sz: sx * (0.7 + rng() * 0.5), yaw: rng() * Math.PI,
        color: COLORS[Math.floor(rng() * COLORS.length)],
      })
    }
  }
  return stones
}
