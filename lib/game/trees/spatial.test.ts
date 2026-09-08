import { expect, it } from "vitest"
import { invalidateTreeSpatialIndex, treeSpatialIndex } from "./spatial"
import type { TreePlacement } from "./placement"

it("keeps placement IDs when felled trees are excluded and refreshes after Ent movement", () => {
  const trees: TreePlacement[] = [{ species: "oak", x: 0, y: 0, z: 0 }, { species: "oak", x: .5, y: 0, z: 0 }]
  expect(treeSpatialIndex(trees).firstWithin(0, 0, .8, (_, index) => index !== 0)).toBe(trees[1])
  trees[0].x = 20
  invalidateTreeSpatialIndex(trees)
  expect(treeSpatialIndex(trees).firstWithin(20, 0, .8)).toBe(trees[0])
  const nearby: TreePlacement[] = []
  treeSpatialIndex(trees).forEachWithin(0, 0, 1, tree => nearby.push(tree))
  expect(nearby).toEqual([trees[1]])
})
