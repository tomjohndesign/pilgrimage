import { computeDarkShade } from "./forest-field"
import { groundHeight } from "./elevation"
import { isRoadTerrain } from "./road"
import { signpostPlacement, SIGNPOST_CLEARANCE, type SignpostPlacement } from "./signpost"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./types"

/** Keep broad ancient crowns from covering the warning board and skull. */
export const FOREST_WARNING_CLEARANCE = 2.2

const routes = (map: GameMap) => [
  ...(map.darkForests ?? []).map(forest => forest.approach),
  ...(map.shortcuts ?? []).map(shortcut => shortcut.tiles),
]

const trackCache = new WeakMap<GameMap, Set<number>>()
/** Authored forest ways retain a faint trace, including their approach outside the canopy. */
export function forestTrackTiles(map: GameMap): ReadonlySet<number> {
  let tiles = trackCache.get(map)
  if (!tiles) {
    tiles = new Set(routes(map).flatMap(route => route.filter(p => tileAt(map, p.x, p.z) === "track").map(p => p.z * map.width + p.x)))
    trackCache.set(map, tiles)
  }
  return tiles
}

/** Mark the first shaded threshold from each end of a through-track, and each grove approach. */
export function forestEntrancePlacements(map: GameMap): SignpostPlacement[] {
  const shade = computeDarkShade(map), out: SignpostPlacement[] = []
  const shrine = signpostPlacement(map)
  const walks = [...routes(map), ...(map.shortcuts ?? []).map(s => [...s.tiles].reverse())]
  for (const route of walks) {
    const threshold = route.findIndex(p => shade[p.z * map.width + p.x] >= .12)
    if (threshold < 0) continue
    let placed = false
    for (let offset = 0; offset < 5 && !placed; offset++) {
      const i = Math.max(0, threshold - 1 - offset), at = route[i], next = route[i + 1] ?? route[i - 1]
      if (!next) continue
      const dx = next.x - at.x, dz = next.z - at.z
      const sides: TilePos[] = [{ x: -dz, z: dx }, { x: dz, z: -dx }]
      sides.sort((a, b) => Number(["forest", "darkwood"].includes(tileAt(map, at.x + a.x, at.z + a.z) ?? ""))
        - Number(["forest", "darkwood"].includes(tileAt(map, at.x + b.x, at.z + b.z) ?? "")))
      for (const side of sides) {
        const tile = { x: at.x + side.x, z: at.z + side.z }, terrain = tileAt(map, tile.x, tile.z)
        if (!terrain || isRoadTerrain(terrain) || !["grass", "clearing", "forest", "darkwood", "dirt", "sand"].includes(terrain)) continue
        if (map.buildings.some(b => tile.x >= b.x && tile.x < b.x + b.w && tile.z >= b.z && tile.z < b.z + b.d)) continue
        if (map.site?.door.x === tile.x && map.site.door.z === tile.z) continue
        const x = tileToWorldX(map, tile.x) - side.x * .2, z = tileToWorldZ(map, tile.z) - side.z * .2
        const height = groundHeight(map, tile.x - side.x * .2, tile.z - side.z * .2)
        if (Math.abs(height - groundHeight(map, at.x, at.z)) > .25) continue
        if (shrine && Math.hypot(x - shrine.x, z - shrine.z) < SIGNPOST_CLEARANCE * 2) continue
        if (out.some(p => Math.hypot(x - p.x, z - p.z) < 3)) { placed = true; break }
        // The board and skull face approaching walkers; local +Z is its front.
        out.push({ tile, x, z, yaw: Math.atan2(-dx, -dz) })
        placed = true; break
      }
    }
  }
  return out
}
