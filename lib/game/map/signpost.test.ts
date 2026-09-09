import { describe, expect, it } from "vitest"

import { generateMap, MIN_MAP_SIZE } from "./generate-map"
import { signpostPlacement, tJunctionVerge, SIGNPOST_CLEARANCE, SIGNPOST_INSET } from "./signpost"
import { placeTrees } from "../trees/placement"
import { TREE_SPECIES } from "../trees/species"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "./types"

const SEEDS = Array.from({ length: 12 }, (_, i) => i * 7919 + 1)
const mapFor = (seed: number) => generateMap({ width: MIN_MAP_SIZE, depth: MIN_MAP_SIZE, seed })

/** The post's tile, plus the way its board is turned, on a real generated world. */
describe("the shrine's wayside signpost", () => {
  const maps = SEEDS.map(mapFor)

  it.each([{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }])(
    "stands across the through road from the incoming arm %j", step => {
      const junction = { x: 6, z: 6 }, side = { x: step.z, z: -step.x }
      const branch = Array.from({ length: 4 }, (_, i) => ({ x: 6 + step.x * i, z: 6 + step.z * i }))
      const road = Array.from({ length: 9 }, (_, i) => ({ x: 6 + side.x * (i - 4), z: 6 + side.z * (i - 4) }))
      const map: GameMap = { width: 13, depth: 13, tiles: Array(169).fill("grass"), road,
        buildings: [{ id: "shrine", x: branch[3].x + step.x, z: branch[3].z + step.z,
          w: 1, d: 1, label: "Shrine", height: 1, color: "tan", roofColor: "brown" }],
        site: { junction: 4, branch, door: branch[3], hovelId: "shrine" } }
      for (const p of road) map.tiles[p.z * map.width + p.x] = "path"
      for (const p of branch.slice(1)) map.tiles[p.z * map.width + p.x] = "track"
      const opposite = { x: junction.x - step.x, z: junction.z - step.z }
      const post = signpostPlacement(map)!
      expect(post.tile).toEqual(opposite)
      expect(post.x).toBeCloseTo(tileToWorldX(map, junction.x) - step.x * (1 - SIGNPOST_INSET))
      expect(post.z).toBeCloseTo(tileToWorldZ(map, junction.z) - step.z * (1 - SIGNPOST_INSET))

      // A blocked verge uses dry ground beside it, never the incoming lane.
      map.tiles[opposite.z * map.width + opposite.x] = "water"
      const fallback = signpostPlacement(map)!
      expect((fallback.tile.x - junction.x) * step.x + (fallback.tile.z - junction.z) * step.z).toBe(-1)

      // A fourth arm is a crossroads: leave every approach clear.
      map.tiles[opposite.z * map.width + opposite.x] = "track"
      expect(tJunctionVerge(map, junction)).toBeNull()
      const cross = signpostPlacement(map)!
      expect(["path", "track"]).not.toContain(tileAt(map, cross.tile.x, cross.tile.z))
    },
  )

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
