import type { CrossroadArm } from "./crossroads"
import { tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./types"

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
