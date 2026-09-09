import { shelterHearth } from "./building-art/furnishings"
import { rotateBuildingPoint, rotatedFootprint } from "./building-rotation"
import type { BuildingDef, TilePos } from "./map/types"

export interface TavernObstacle { id: string; x: number; z: number; w: number; d: number }
export const TAVERN_CLEARANCE = .1

/** The renderer and navigation use the same tabletops, benches, counter and hearth. */
export function tavernLayout(w: number, d: number) {
  const tables = [-1, 1].map(side => ({ id: `tavern-table-${side}-top`, side,
    x: -w * .23, z: side * d * .22, w: w * .32, d: d * .15 }))
  const benches = tables.flatMap(table => [-1, 1].map(side => ({
    id: `tavern-bench-${table.side}-${side}-seat`, x: table.x, z: table.z + side * d * .11,
    w: table.w, d: .18,
  })))
  const counter = { id: "tavern-counter-top", x: w * .2, z: -d * .14, w: w * .27 + .035, d: d * .15 }
  const hearth = shelterHearth(w, d, 0, 0)
  return { tables, benches, counter, obstacles: [...tables, ...benches, counter,
    { id: "hearth", x: hearth.x, z: hearth.z, w: .57 * hearth.scale, d: .57 * hearth.scale }] }
}

export function tavernLocalPoint(building: BuildingDef, tile: TilePos): TilePos {
  return rotateBuildingPoint(tile.x - building.x - (building.w - 1) / 2,
    tile.z - building.z - (building.d - 1) / 2, -(building.rotation ?? 0))
}

/** Swept body clearance, rather than checking only the endpoints of a move. */
export function tavernSegmentClear(obstacles: readonly TavernObstacle[], a: TilePos, b: TilePos,
  allowedBench?: string): boolean {
  return obstacles.every(rect => {
    if (rect.id === allowedBench) return true
    let low = 0, high = 1
    for (const axis of ["x", "z"] as const) {
      const half = (axis === "x" ? rect.w : rect.d) / 2 + TAVERN_CLEARANCE
      const delta = b[axis] - a[axis], start = a[axis] - rect[axis]
      if (Math.abs(delta) < 1e-8) {
        if (Math.abs(start) > half) return true
      } else {
        const u = (-half - start) / delta, v = (half - start) / delta
        low = Math.max(low, Math.min(u, v)); high = Math.min(high, Math.max(u, v))
        if (low > high) return true
      }
    }
    return false
  })
}

export function tavernFurnitureClear(building: BuildingDef, from: TilePos, to: TilePos): boolean {
  const { w, d } = rotatedFootprint(building, building.rotation)
  return tavernSegmentClear(tavernLayout(w, d).obstacles, tavernLocalPoint(building, from), tavernLocalPoint(building, to))
}

/** Pauses at the counter, in the service aisle and near the drinking tables. */
export function tavernWorkStop(slot: number, stop: number, w: number, d: number): TilePos {
  const stops = slot % 2 === 0
    ? [[.06, -.30], [0, -.39], [0, 0], [.17, .25]]
    : [[.34, -.30], [.41, -.23], [.32, .10], [.10, .36]]
  const [x, z] = stops[stop % stops.length]
  return { x: x * w, z: z * d }
}
