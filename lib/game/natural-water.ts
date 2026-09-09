import { buildingSpatialQuery } from "./building-spatial"
import { elevationStep } from "./map/elevation"
import { shorelineCorners, shorelineInset } from "./map/shoreline"
import { ROUTE_DIRS } from "./map/route"
import { TERRAIN, TILE_HEIGHT } from "./map/terrain"
import { walkingSurface } from "./map/walking-surface"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import type { WanderSpot } from "./monk-wander"

/** Maximum actual walk from the path to a bank, in tiles. */
export const WATER_DETOUR_LIMIT = 6
/** Consider free water as soon as a paid counter would offer a drink. */
export const WATER_THIRST_THRESHOLD = 60
export const WATER_DRINK_SECONDS = 3

export interface WaterStop {
  spot: WanderSpot
  route: WanderSpot[]
}

/** A bounded dry-ground search: nearby water across a wall or cliff is no source. */
export function naturalWaterStop(map: GameMap, from: WanderSpot): WaterStop | null {
  const start = { x: worldToTileX(map, from.x), z: worldToTileZ(map, from.z) }
  const nearby = buildingSpatialQuery(map.buildings)
  const clear = (x: number, z: number) => {
    const ground = tileAt(map, x, z)
    return !!ground && TERRAIN[ground].passable && !nearby({ x, z }).some(b =>
      x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d)
  }
  if (!clear(start.x, start.z)) return null
  const point = (x: number, z: number): WanderSpot => {
    const wx = tileToWorldX(map, x), wz = tileToWorldZ(map, z)
    return { x: wx, z: wz, y: walkingSurface(map, wx, wz).height }
  }
  const centre = point(start.x, start.z)
  const alignment = Math.abs(centre.x - from.x) + Math.abs(centre.z - from.z)
  const nodes = [{ ...start, parent: -1, distance: alignment }]
  const seen = new Set([start.z * map.width + start.x])
  for (let head = 0; head < nodes.length; head++) {
    const node = nodes[head], index = node.z * map.width + node.x
    // Drink from dry land, never from a bridge deck above the river.
    if (map.tiles[index] !== "bridge" && node.distance + .3 <= WATER_DETOUR_LIMIT) {
      for (const [dx, dz] of ROUTE_DIRS) {
        const x = node.x + dx, z = node.z + dz
        if (tileAt(map, x, z) !== "water") continue
        const water = z * map.width + x
        if (map.water?.motion?.[water] === "waterfall") continue
        if (shorelineInset(.5 + dx * .3, .5 + dz * .3, shorelineCorners(map, node.x, node.z)) > 0) continue
        const bank = point(node.x, node.z)
        const spot = { x: bank.x + dx * .3, z: bank.z + dz * .3, y: bank.y }
        spot.y = walkingSurface(map, spot.x, spot.z).height
        const level = TILE_HEIGHT + (map.water?.surface?.[water] ?? 0)
        if (Math.abs(spot.y - level) > .6 || Math.abs(spot.y - bank.y) > .6) continue
        const route: WanderSpot[] = []
        for (let i = head; i >= 0; i = nodes[i].parent) route.push(point(nodes[i].x, nodes[i].z))
        route.reverse()
        return { spot, route: [{ x: centre.x, y: from.y, z: from.z }, ...route, spot] }
      }
    }
    if (node.distance + 1 + .3 > WATER_DETOUR_LIMIT) continue
    for (const [dx, dz] of ROUTE_DIRS) {
      const x = node.x + dx, z = node.z + dz, next = z * map.width + x
      if (seen.has(next) || !clear(x, z)) continue
      if (map.tiles[index] !== "bridge" && map.tiles[next] !== "bridge" &&
        !Number.isFinite(elevationStep(map.elevation, index, next))) continue
      seen.add(next)
      nodes.push({ x, z, parent: head, distance: node.distance + 1 })
    }
  }
  return null
}
