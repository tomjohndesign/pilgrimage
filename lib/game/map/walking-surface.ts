import { BRIDGE_RISE, bridgeLayout, bridgeCornerAt, ropeDeckHeight } from "./bridges"
import { groundHeight } from "./elevation"
import { TILE_HEIGHT } from "./terrain"
import type { GameMap } from "./types"

/** Height and grade of the rendered triangle/deck, sampled in centred world coordinates. */
export function walkingSurface(map: GameMap, wx: number, wz: number) {
  if (bridgeCornerAt(map, wx, wz)) return { height: TILE_HEIGHT + BRIDGE_RISE, dx: 0, dz: 0 }
  const x = wx + map.width / 2 - 0.5, z = wz + map.depth / 2 - 0.5
  const tx = Math.max(0, Math.min(map.width - 1, Math.floor(x + 0.5)))
  const tz = Math.max(0, Math.min(map.depth - 1, Math.floor(z + 0.5)))
  const index = tz * map.width + tx, layout = bridgeLayout(map)
  const span = layout.ropeAt.get(index)
  if (span) {
    const first = span.tiles[0], last = span.tiles[span.tiles.length - 1]
    const along = (x - (first.x + last.x) / 2) * span.dx + (z - (first.z + last.z) / 2) * span.dz
    const grade = 8 * (span.ropeSag ?? 0) * along / span.tiles.length ** 2
    return { height: ropeDeckHeight(span, along), dx: grade * span.dx, dz: grade * span.dz }
  }
  const rise = layout.rise[index]
  if (rise > 0) {
    const ramp = layout.rampsAt.get(index)
    const dx = ramp ? BRIDGE_RISE * ramp.dx : 0, dz = ramp ? BRIDGE_RISE * ramp.dz : 0
    return { height: TILE_HEIGHT + rise + (x - tx) * dx + (z - tz) * dz, dx, dz }
  }
  if (!map.elevation) return { height: TILE_HEIGHT, dx: 0, dz: 0 }
  const c = map.elevation.corners, i = index * 4
  const first = x - tx + z - tz <= 0
  return {
    height: groundHeight(map, x, z),
    dx: first ? c[i + 1] - c[i] : c[i + 3] - c[i + 2],
    dz: first ? c[i + 2] - c[i] : c[i + 3] - c[i + 1],
  }
}
