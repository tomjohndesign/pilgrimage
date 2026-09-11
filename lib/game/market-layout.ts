import { layoutHand } from "./building-layout"
import { rotateBuildingPoint, rotatedFootprint } from "./building-rotation"
import type { BuildingDef, TilePos } from "./map/types"

export const MARKET_WIDTH = 3
export const MARKET_DEPTH = 2
export const MARKET_STALL_WIDTH = 2

/** The stall keeps its original two columns; whatever width remains beside it
 * is the open cart bay, on the layout's own hand. Old two-column stalls have no
 * bay, so no vendor can settle there. Offsets are in the placed local frame,
 * measured from the footprint centre. */
export function marketLayout(width: number, depth: number, layoutSeed?: number) {
  const hand = layoutHand("market", layoutSeed)
  const stallWidth = Math.min(width, MARKET_STALL_WIDTH), bayWidth = width - stallWidth
  return { hand, stallWidth, stallX: bayWidth ? -bayWidth / 2 * hand : 0, depth, bayWidth, bayX: stallWidth / 2 * hand }
}

/** The bay tiles are open ground: walkers and carts cross them, buildings do not. */
export function marketBayContains(building: BuildingDef, point: TilePos): boolean {
  if (building.buildType !== "market") return false
  const size = rotatedFootprint(building, building.rotation), layout = marketLayout(size.w, size.d, building.layoutSeed)
  if (!layout.bayWidth) return false
  const p = rotateBuildingPoint(point.x - building.x - (building.w - 1) / 2,
    point.z - building.z - (building.d - 1) / 2, -(building.rotation ?? 0))
  return Math.abs(p.z) < size.d / 2 && Math.abs(p.x) < size.w / 2 && p.x * layout.hand >= size.w / 2 - layout.bayWidth
}
