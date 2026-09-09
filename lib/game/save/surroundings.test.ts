import { describe, expect, it } from "vitest"

import { generateMap } from "../map/generate-map"
import { tileToWorldX, tileToWorldZ } from "../map/types"
import { TERRAIN } from "../map/terrain"
import { ISO_PITCH, projectGround, yawForView } from "../render/iso"
import { placeTrees } from "../trees/placement"
import { TREE_SPECIES } from "../trees/species"
import { surroundingsSchema } from "./schema"
import { captureSurroundings, surroundingsCoverage, surroundingsMap, surroundingsScenery, surroundingsTrees } from "./surroundings"

const HALF_TILE_HEIGHT = 1 / Math.sqrt(6)

describe("surroundings", () => {
  it("remembers the land around the camera focus and nothing beyond the map", () => {
    const map = generateMap({ seed: 9 })
    const focus = { x: tileToWorldX(map, 2) + .25, z: tileToWorldZ(map, 40) - .25 }
    const patch = surroundingsSchema.parse(JSON.parse(JSON.stringify(captureSurroundings(map, focus.x, focus.z, [], new Set(), 3))))
    expect([patch.x, patch.z, patch.radius]).toEqual([2, 40, 3])
    expect(patch.offsetX).toBeCloseTo(-.25)
    expect(patch.offsetZ).toBeCloseTo(.25)
    expect(patch.terrain).toHaveLength(49)
    expect(patch.corners).toHaveLength(49 * 4)
    // Columns for x = -1 lie off the west edge.
    for (let row = 0; row < 7; row++) expect(patch.terrain[row * 7]).toBeNull()
    const centre = 40 * map.width + 2
    expect(patch.terrain[3 * 7 + 3]).toBe(map.tiles[centre])
    expect(patch.height[3 * 7 + 3]).toBe(map.elevation!.height[centre])
    expect(patch.corners.slice((3 * 7 + 3) * 4, (3 * 7 + 3) * 4 + 4)).toEqual(map.elevation!.corners.slice(centre * 4, centre * 4 + 4))
    expect(patch.terrain.filter(id => id !== null).every(id => id! in TERRAIN)).toBe(true)
  })

  it("keeps standing trees and scenery inside the patch, relative to the focus", () => {
    const map = generateMap({ seed: 9 })
    const trees = placeTrees(map, TREE_SPECIES)
    const focus = { x: trees[100].x, z: trees[100].z }
    const felled = new Set([100])
    const patch = captureSurroundings(map, focus.x, focus.z, trees, felled)
    const expected = trees.filter((tree, index) => index !== 100 && Math.abs(tree.x - focus.x) <= 5.5 && Math.abs(tree.z - focus.z) <= 5.5)
    expect(patch.trees).toHaveLength(expected.length)
    expect(patch.trees.length).toBeGreaterThan(0)
    expect(patch.trees.every(tree => Math.abs(tree.x) <= 5.5 && Math.abs(tree.z) <= 5.5)).toBe(true)
    expect(patch.trees.some(tree => Math.abs(tree.x) < 1e-9 && Math.abs(tree.z) < 1e-9)).toBe(false)
    expect(patch.scenery.every(p => Math.abs(p.x) <= 5.5 && Math.abs(p.z) <= 5.5)).toBe(true)
    // Back in the patch map's frame, the centre tile's middle is the origin.
    const local = surroundingsTrees(patch)
    expect(local[0].x).toBeCloseTo(patch.trees[0].x - patch.offsetX)
    expect(surroundingsScenery(patch)).toHaveLength(patch.scenery.length)
  })

  it("builds a small map with a disc of coverage fading at the rim", () => {
    const map = generateMap({ seed: 9 })
    const patch = captureSurroundings(map, 0, 0)
    const small = surroundingsMap(patch)
    // A hidden ring repeats the rim so the outer tiles show no earth sides.
    expect([small.width, small.depth, small.tiles.length, small.elevation?.corners.length]).toEqual([13, 13, 169, 676])
    expect(small.tiles[0]).toBe(small.tiles[13 + 1])
    expect(small.elevation?.height[12]).toBe(small.elevation?.height[13 + 11])
    const coverage = surroundingsCoverage(patch)
    const alpha = (dx: number, dz: number) => coverage[((dz + 6) * 13 + dx + 6) * 4]
    expect(alpha(6, 0)).toBe(0)
    expect(alpha(0, 0)).toBe(255)
    expect(alpha(5, 0)).toBe(Math.round((6 - 5) / 1.7 * 255))
    expect(alpha(4, 4)).toBe(0)
    expect(alpha(5, 5)).toBe(0)
    expect(alpha(3, 3)).toBeGreaterThan(alpha(4, 3))
  })

  it("projects ground offsets onto the overlay's isometric grid", () => {
    const east = projectGround(1, 0, 0, yawForView(0)), south = projectGround(0, 1, 0, yawForView(0))
    expect(east.x).toBeCloseTo(Math.SQRT1_2)
    expect(east.y).toBeCloseTo(HALF_TILE_HEIGHT)
    expect(south.x).toBeCloseTo(-Math.SQRT1_2)
    expect(south.y).toBeCloseTo(HALF_TILE_HEIGHT)
    const raised = projectGround(0, 0, 1, yawForView(0))
    expect(raised.x).toBeCloseTo(0)
    expect(raised.y).toBeCloseTo(-Math.cos(ISO_PITCH))
    // A quarter turn swings east to screen left, still a half tile down.
    const turned = projectGround(1, 0, 0, yawForView(1))
    expect(turned.x).toBeCloseTo(-Math.SQRT1_2)
    expect(turned.y).toBeCloseTo(HALF_TILE_HEIGHT)
  })
})
