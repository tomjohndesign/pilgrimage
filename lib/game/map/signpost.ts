import { isRoadTerrain } from "./road"
import type { CrossroadArm } from "./crossroads"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./types"

/** Keep crowns, rocks and ground plants clear of every marked island. */
export const SIGNPOST_CLEARANCE = 0.85
export interface SignpostPlacement {
  tile: TilePos
  x: number
  z: number
  yaw: number
}

/** The post stands at the centre of the ground its paths circle. */
export function signpostPlacements(map: GameMap): (Omit<SignpostPlacement, "yaw"> & { arms: CrossroadArm[] })[] {
  return (map.crossroads ?? []).map(({ center, arms }) => ({
    tile: center, x: tileToWorldX(map, center.x), z: tileToWorldZ(map, center.z), arms,
  }))
}

/** The empty side of a T faces the incoming arm, across the through road. */
export function tJunctionVerge(map: GameMap, junction: TilePos): TilePos | null {
  const neighbors = [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]
    .map(d => ({ x: junction.x + d.x, z: junction.z + d.z }))
  const offRoad = neighbors.filter(p => {
    const terrain = tileAt(map, p.x, p.z)
    return !isRoadTerrain(terrain) && terrain !== "bridge"
  })
  return offRoad.length === 1 ? offRoad[0] : null
}
