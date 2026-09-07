import { describe, expect, it } from "vitest"

import { generateMap, MIN_MAP_SIZE } from "./generate-map"
import { signpostPlacement, SIGNPOST_CLEARANCE, SIGNPOST_INSET } from "./signpost"
import { placeTrees } from "../trees/placement"
import { TREE_SPECIES } from "../trees/species"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "./types"

const SEEDS = Array.from({ length: 12 }, (_, i) => i * 7919 + 1)
const mapFor = (seed: number) => generateMap({ width: MIN_MAP_SIZE, depth: MIN_MAP_SIZE, seed })

/** The post's tile, plus the way its board is turned, on a real generated world. */
describe("the shrine's wayside signpost", () => {
  const maps = SEEDS.map(mapFor)

  it("stands beside the branch on every generated world, never on the way itself", () => {
    for (const map of maps) {
      const post = signpostPlacement(map)
      expect(post).not.toBeNull()
      expect(tileAt(map, post!.tile.x, post!.tile.z)).not.toBe("water")
      expect(map.site!.branch.some(p => p.x === post!.tile.x && p.z === post!.tile.z)).toBe(false)
      expect(map.road!.some(p => p.x === post!.tile.x && p.z === post!.tile.z)).toBe(false)
    }
  })

  it("stays within a couple of tiles of the fork it marks", () => {
    for (const map of maps) {
      const post = signpostPlacement(map)!
      const junction = map.site!.branch[0]
      expect(Math.abs(post.tile.x - junction.x) + Math.abs(post.tile.z - junction.z)).toBeLessThanOrEqual(4)
    }
  })

  it("leaves the post standing room, however thick the woods around it", () => {
    for (const map of maps) {
      const post = signpostPlacement(map)!
      for (const tree of placeTrees(map, TREE_SPECIES)) {
        expect(Math.hypot(tree.x - post.x, tree.z - post.z)).toBeGreaterThanOrEqual(SIGNPOST_CLEARANCE)
      }
    }
  })

  it("keeps the post inside its tile but set in toward the corner it marks", () => {
    for (const map of maps) {
      const post = signpostPlacement(map)!
      const offset = Math.hypot(post.x - tileToWorldX(map, post.tile.x), post.z - tileToWorldZ(map, post.tile.z))
      expect(offset).toBeCloseTo(SIGNPOST_INSET, 6)
    }
  })

  it("turns the pointing board onto the shrine's bearing", () => {
    for (const map of maps) {
      const post = signpostPlacement(map)!
      const hovel = map.buildings.find(b => b.id === map.site!.hovelId)!
      const shrineX = tileToWorldX(map, hovel.x) + (hovel.w - 1) / 2
      const shrineZ = tileToWorldZ(map, hovel.z) + (hovel.d - 1) / 2
      // Local +X after a yaw rotation about Y; it must lie along the shrine.
      const armX = Math.cos(post.yaw), armZ = -Math.sin(post.yaw)
      const span = Math.hypot(shrineX - post.x, shrineZ - post.z)
      expect(armX * (shrineX - post.x) / span + armZ * (shrineZ - post.z) / span).toBeCloseTo(1, 6)
    }
  })

  it("has nothing to mark on a map with no shrine branch", () => {
    const bare: GameMap = { width: 4, depth: 4, tiles: new Array(16).fill("grass"), buildings: [] }
    expect(signpostPlacement(bare)).toBeNull()
  })
})
