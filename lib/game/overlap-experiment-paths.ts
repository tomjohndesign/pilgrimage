import type { OverlapExperiment } from "./overlap-experiments"
import type { GameMap } from "./map/types"
import type { RoadSegment } from "./render/road-segments"

/** Bin authored world-space paths into the same tile-local road segments as the game. */
export function experimentRoadSegments(map: Pick<GameMap, "width" | "depth">, paths: OverlapExperiment["paths"]) {
  const bins = new Map<number, RoadSegment[]>()
  for (const path of paths ?? []) for (let i = 1; i < path.points.length; i++) {
    const [ax, az] = path.points[i - 1], [bx, bz] = path.points[i]
    const reach = path.width / 2 + .2
    for (let z = Math.max(0, Math.floor(Math.min(az, bz) + map.depth / 2 - reach)); z <= Math.min(map.depth - 1, Math.floor(Math.max(az, bz) + map.depth / 2 + reach)); z++) {
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx) + map.width / 2 - reach)); x <= Math.min(map.width - 1, Math.floor(Math.max(ax, bx) + map.width / 2 + reach)); x++) {
        const index = z * map.width + x, segments = bins.get(index) ?? []
        segments.push([ax + map.width / 2 - x, az + map.depth / 2 - z,
          bx + map.width / 2 - x, bz + map.depth / 2 - z, 0, 1, path.width])
        bins.set(index, segments)
      }
    }
  }
  return bins
}
