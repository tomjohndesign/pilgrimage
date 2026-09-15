import { elevationStep } from "./elevation"
import { isRoadTerrain, roadTopologyTileAt } from "./road"
import type { CrossroadArm } from "./crossroads"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./types"

/** Keep crowns, rocks and ground plants clear of every post. */
export const SIGNPOST_CLEARANCE = 0.85
export interface SignpostPlacement {
  tile: TilePos
  x: number
  z: number
  yaw: number
}

/** Posts stand on the opposite verge at Ts and on central islands at crossroads. */
export function signpostPlacements(map: GameMap): (Omit<SignpostPlacement, "yaw"> & { arms: CrossroadArm[] })[] {
  return (map.crossroads ?? []).map(({ center, arms }) => ({
    tile: center, x: tileToWorldX(map, center.x), z: tileToWorldZ(map, center.z), arms,
  }))
}

/** First tile beyond the occupied road, measured in a cardinal direction. */
export function roadsideVergeTile(map: GameMap, origin: TilePos, direction: TilePos): TilePos | null {
  for (let distance = 1; distance <= 4; distance++) {
    const tile = { x: origin.x + direction.x * distance, z: origin.z + direction.z * distance }
    const terrain = tileAt(map, tile.x, tile.z)
    if (!isRoadTerrain(terrain)) return terrain === "bridge" || terrain === "ford" ? null : tile
  }
  return null
}

/** Move T markers after laying the road's full footprint. The reserved tile,
 * renderer, tree clearance and navigation all move with the post. */
export function offsetRoadsideSignposts(map: GameMap): void {
  if (!map.crossroads) return
  const occupied = new Set(map.crossroads.map(post => post.center.z * map.width + post.center.x))
  map.crossroads = map.crossroads.flatMap(post => {
    if (post.arms.length !== 3 || !post.junction) return [post]
    const direction = { x: -post.arms.reduce((sum, arm) => sum + arm.direction.x, 0),
      z: -post.arms.reduce((sum, arm) => sum + arm.direction.z, 0) }
    const direct = roadsideVergeTile(map, post.junction, direction)
    if (direct?.x === post.center.x && direct.z === post.center.z) return [post]
    // A winding road can also occupy the next tile straight across the fork.
    // Search reachable ground on that same side, keeping the sign near the fork.
    const queue = [post.junction], seen = new Set([post.junction.z * map.width + post.junction.x])
    const candidates: TilePos[] = []
    for (let i = 0; i < queue.length; i++) {
      const at = queue[i]
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const tile = { x: at.x + dx, z: at.z + dz }, index = tile.z * map.width + tile.x
        const terrain = tileAt(map, tile.x, tile.z)
        if (seen.has(index) || !terrain || Math.hypot(tile.x - post.junction.x, tile.z - post.junction.z) >= 4) continue
        if (!["path", "track", "grass", "clearing", "dirt", "sand", "forest"].includes(terrain)) continue
        if (map.buildings.some(b => tile.x >= b.x && tile.x < b.x + b.w && tile.z >= b.z && tile.z < b.z + b.d)) continue
        if (!Number.isFinite(elevationStep(map.elevation, at.z * map.width + at.x, index))) continue
        seen.add(index)
        if (occupied.has(index) && (tile.x !== post.center.x || tile.z !== post.center.z)) continue
        // A forest tile can be cleared for this post, but it cannot provide
        // access through an uncut belt of trees to another candidate.
        if (terrain !== "forest") queue.push(tile)
        if (isRoadTerrain(terrain) || occupied.has(index)) continue
        if ((tile.x - post.junction.x) * direction.x + (tile.z - post.junction.z) * direction.z < 1) continue
        if (map.buildings.some(b => tile.x >= b.x - 1 && tile.x <= b.x + b.w && tile.z >= b.z - 1 && tile.z <= b.z + b.d)) continue
        if (map.site?.door.x === tile.x && map.site.door.z === tile.z) continue
        candidates.push(tile)
      }
    }
    const distance = (tile: TilePos) => (tile.x - post.junction!.x) ** 2 + (tile.z - post.junction!.z) ** 2
    candidates.sort((a, b) => distance(a) - distance(b))
    const center = candidates[0]
    if (!center) return []
    const index = center.z * map.width + center.x
    occupied.add(index)
    map.tiles[index] = "clearing"
    return [{ ...post, center }]
  })
}

/** The empty side of a T faces the incoming arm, across the full through road. */
export function tJunctionVerge(map: GameMap, junction: TilePos): TilePos | null {
  const directions = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]
  const offRoad = directions.filter(d => {
    const terrain = roadTopologyTileAt(map, junction.x + d.x, junction.z + d.z)
    return !isRoadTerrain(terrain) && terrain !== "bridge"
  })
  return offRoad.length === 1 ? roadsideVergeTile(map, junction, offRoad[0]) : null
}
