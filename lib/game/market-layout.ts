import { rotateBuildingPoint, rotatedFootprint } from "./building-rotation"
import type { BuildingDef, TilePos } from "./map/types"

export const MARKET_WIDTH = 4
export const MARKET_DEPTH = 4
export const MARKET_STALL_DEPTH = 2

/** The front two rows hold the stall; the remaining plot is an open cart yard.
 * Old two-row stalls retain their original footprint and have no parking bay. */
export function marketLayout(width: number, depth: number) {
  const stallDepth = Math.min(depth, MARKET_STALL_DEPTH)
  return { width, stallDepth, stallZ: (depth - stallDepth) / 2,
    yardDepth: depth - stallDepth, yardZ: -stallDepth / 2 }
}

export function marketYardContains(building: BuildingDef, point: TilePos): boolean {
  if (building.buildType !== "market") return false
  const size = rotatedFootprint(building, building.rotation)
  const p = rotateBuildingPoint(point.x - building.x - (building.w - 1) / 2,
    point.z - building.z - (building.d - 1) / 2, -(building.rotation ?? 0))
  return Math.abs(p.x) < size.w / 2 && p.z >= -size.d / 2 && p.z < size.d / 2 - MARKET_STALL_DEPTH
}
