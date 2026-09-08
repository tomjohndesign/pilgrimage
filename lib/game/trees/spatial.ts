import { SpatialPoints } from "../spatial-points"
import type { TreePlacement } from "./placement"

const indexes = new WeakMap<readonly TreePlacement[], { count: number; index: SpatialPoints<TreePlacement> }>()

/** Local forest queries share the placement array and retain its tree IDs. */
export function treeSpatialIndex(trees: readonly TreePlacement[]): SpatialPoints<TreePlacement> {
  let cached = indexes.get(trees)
  if (!cached || cached.count !== trees.length) {
    cached = { count: trees.length, index: new SpatialPoints(trees) }
    indexes.set(trees, cached)
  }
  return cached.index
}

/** Ents mutate placements in place. Invalidate after any walk before the next query. */
export function invalidateTreeSpatialIndex(trees: readonly TreePlacement[]): void { indexes.delete(trees) }
