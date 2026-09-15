import { describe, expect, it } from "vitest"
import { generateMap, MIN_MAP_SIZE } from "./generate-map"
import { createCrossroads, crossroadIslandAt } from "./crossroads"
import { layMainRoadTiles } from "./road-footprint"
import { diagonalRoadSegments, distanceToRoadSegments } from "../render/road-segments"
import { signpostPlacements, tJunctionVerge, SIGNPOST_CLEARANCE } from "./signpost"
import { placeTrees } from "../trees/placement"
import { TREE_SPECIES } from "../trees/species"
import { tileAt, tileToWorldX, tileToWorldZ, type GameMap } from "./types"

describe("crossroads waymarkers", () => {
  const maps = Array.from({ length: 4 }, (_, i) => generateMap({ width: MIN_MAP_SIZE, depth: MIN_MAP_SIZE, seed: i * 7919 + 1 }))
  it("stands opposite T-junctions and on dry islands at four-way crossings", () => {
    for (const map of maps) {
      const posts = signpostPlacements(map), roads = diagonalRoadSegments(map)
      expect(posts.length).toBeGreaterThan(0)
      for (const post of posts) {
        expect(tileAt(map, post.tile.x, post.tile.z)).toBe("clearing")
        expect(post.x).toBe(tileToWorldX(map, post.tile.x)); expect(post.z).toBe(tileToWorldZ(map, post.tile.z))
        const crossroad = map.crossroads!.find(c => c.center === post.tile)!
        if (post.arms.length === 3) {
          const junction = crossroad.junction!
          const dx = -post.arms.reduce((sum, arm) => sum + arm.direction.x, 0)
          const dz = -post.arms.reduce((sum, arm) => sum + arm.direction.z, 0)
          const distance = Math.abs(post.tile.x - junction.x) + Math.abs(post.tile.z - junction.z)
          expect(distance).toBeGreaterThanOrEqual(1)
          expect(distance).toBeLessThanOrEqual(4)
          expect((post.tile.x - junction.x) * dx + (post.tile.z - junction.z) * dz).toBeGreaterThanOrEqual(1)
          expect(["path", "track"]).toContain(tileAt(map, junction.x, junction.z))
        } else {
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (dx || dz) expect(["path", "track"]).toContain(tileAt(map, post.tile.x + dx, post.tile.z + dz))
          }
        }
        // Check the painted ribbon too: an excluded clearing tile alone does
        // not stop a wide road segment from drawing underneath a post.
        for (const segment of roads.get(post.tile.z * map.width + post.tile.x) ?? []) {
          expect(distanceToRoadSegments(.5, .5, [segment]), `post ${JSON.stringify(post.tile)}`)
            .toBeGreaterThan((segment[6] ?? 1) / 2 + .1)
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


describe("signposts beside tile-owned roads", () => {
  it.each([[1, 0], [-1, 0], [0, 1], [0, -1]])("moves posts and reservations outside both sides of a widened road (%i, %i)", (dx, dz) => {
    for (const side of [-1, 1]) {
      const map: GameMap = { width: 25, depth: 25, tiles: Array(625).fill("grass"), buildings: [], mainRoadWidth: 2,
        road: Array.from({ length: 25 }, (_, i) => ({ x: 12 + dx * (i - 12), z: 12 + dz * (i - 12) })) }
      for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
      const missing = { x: dz * side, z: -dx * side }
      for (let step = 1; step < 7; step++) map.tiles[(12 - missing.z * step) * map.width + 12 - missing.x * step] = "track"
      createCrossroads(map)
      const before = map.crossroads![0].center
      expect(crossroadIslandAt(map, before.x, before.z)).toBe(true)
      layMainRoadTiles(map)
      const post = signpostPlacements(map)[0], distance = side === 1 ? 2 : 1
      expect(post.tile).toEqual({ x: 12 + missing.x * distance, z: 12 + missing.z * distance })
      expect(tileAt(map, post.tile.x, post.tile.z)).toBe("clearing")
      expect(tJunctionVerge(map, { x: 12, z: 12 })).toEqual(post.tile)
      expect(crossroadIslandAt(map, post.tile.x, post.tile.z)).toBe(true)
      if (side === 1) {
        expect(crossroadIslandAt(map, before.x, before.z)).toBe(false)
        expect(tileAt(map, before.x, before.z)).toBe("path")
      }
      const segments = diagonalRoadSegments(map).get(post.tile.z * map.width + post.tile.x) ?? []
      expect(distanceToRoadSegments(.5, .5, segments)).toBeGreaterThanOrEqual(1.49)
    }
  })

  it("leaves no post in the road when the new verge is blocked", () => {
    const map: GameMap = { width: 25, depth: 25, tiles: Array(625).fill("grass"), buildings: [], mainRoadWidth: 2,
      road: Array.from({ length: 25 }, (_, x) => ({ x, z: 12 })) }
    for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
    for (let z = 13; z < 20; z++) map.tiles[z * map.width + 12] = "track"
    createCrossroads(map)
    // A building at the new position cannot be hidden by moving only the mesh.
    map.buildings.push({ id: "blocked", label: "Blocked", x: 12, z: 10, w: 1, d: 1, height: 1, color: "#888", roofColor: "#888" })
    layMainRoadTiles(map)
    for (const post of signpostPlacements(map)) {
      expect(tileAt(map, post.tile.x, post.tile.z)).toBe("clearing")
      expect(post.tile).not.toEqual({ x: 12, z: 10 })
    }
  })
})
