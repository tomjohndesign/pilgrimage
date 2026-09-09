import { describe, expect, it } from "vitest"
import { generateMap, MIN_MAP_SIZE } from "./generate-map"
import { signpostPlacements, SIGNPOST_CLEARANCE } from "./signpost"
import { placeTrees } from "../trees/placement"
import { TREE_SPECIES } from "../trees/species"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "./types"

describe("crossroads waymarkers", () => {
  const maps = Array.from({ length: 4 }, (_, i) => generateMap({ width: MIN_MAP_SIZE, depth: MIN_MAP_SIZE, seed: i * 7919 + 1 }))
  it("stands opposite T-junctions and on dry islands at four-way crossings", () => {
    for (const map of maps) {
      const posts = signpostPlacements(map)
      expect(posts.length).toBeGreaterThan(0)
      for (const post of posts) {
        expect(tileAt(map, post.tile.x, post.tile.z)).toBe("clearing")
        expect(post.x).toBe(tileToWorldX(map, post.tile.x)); expect(post.z).toBe(tileToWorldZ(map, post.tile.z))
        const crossroad = map.crossroads!.find(c => c.center === post.tile)!
        if (post.arms.length === 3) {
          const junction = crossroad.junction!
          expect(post.tile).toEqual({
            x: junction.x - post.arms.reduce((sum, arm) => sum + arm.direction.x, 0),
            z: junction.z - post.arms.reduce((sum, arm) => sum + arm.direction.z, 0),
          })
          expect(["path", "track"]).toContain(tileAt(map, junction.x, junction.z))
        } else {
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (dx || dz) expect(["path", "track"]).toContain(tileAt(map, post.tile.x + dx, post.tile.z + dz))
          }
        }
        expect(post.arms.length).toBeGreaterThanOrEqual(3)
      }
    }
  })
  it("leaves every post standing room in dense woods", () => {
    for (const map of maps) for (const tree of placeTrees(map, TREE_SPECIES)) for (const post of signpostPlacements(map)) {
      expect(Math.hypot(tree.x - post.x, tree.z - post.z)).toBeGreaterThanOrEqual(SIGNPOST_CLEARANCE)
    }
  })
  it("places no marker without a junction", () => {
    const bare: GameMap = { width: 4, depth: 4, tiles: new Array(16).fill("grass"), buildings: [] }
    expect(signpostPlacements(bare)).toEqual([])
  })
})
