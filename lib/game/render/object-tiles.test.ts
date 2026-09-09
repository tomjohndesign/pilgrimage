import { describe, expect, it } from "vitest"

import { buildingObjectId, encodeObjectId, RELIC_OBJECT_ID, treeObjectId } from "./outline"
import { objectTileDistance, texelObjectId } from "./object-tiles"

const map = {
  width: 64, depth: 64,
  buildings: [
    { x: 30, z: 30, w: 2, d: 3 },
    { x: 40, z: 10, w: 1, d: 1 },
  ] as never[],
}
// Tree world coordinates are tile minus half the map: tile (33, 31) and tile (20, 20).
const trees = [{ x: 33.4 - 32, z: 31.2 - 32 }, { x: 20.7 - 32, z: 20.1 - 32 }]

describe("object tiles", () => {
  it("measures a building by its nearest footprint tile centre", () => {
    expect(objectTileDistance(buildingObjectId(0), 31.5, 31.5, map, trees)).toBe(0)
    expect(objectTileDistance(buildingObjectId(0), 28.5, 31.5, map, trees)).toBe(2)
    expect(objectTileDistance(buildingObjectId(0), 34.5, 35.5, map, trees)).toBe(Math.hypot(3, 3))
    expect(objectTileDistance(buildingObjectId(1), 40.5, 12.5, map, trees)).toBe(2)
    expect(objectTileDistance(buildingObjectId(1), 40, 10.5, map, trees)).toBe(.5)
  })

  it("measures a tree by the centre of the tile its trunk stands on", () => {
    expect(objectTileDistance(treeObjectId(map.buildings.length, 0), 31.5, 31.5, map, trees)).toBe(2)
    expect(objectTileDistance(treeObjectId(map.buildings.length, 1), 20.5, 20.5, map, trees)).toBe(0)
  })

  it("leaves ground, unknown trees and the relic block to the ground under them", () => {
    expect(objectTileDistance(0, 31.5, 31.5, map, trees)).toBeNull()
    expect(objectTileDistance(treeObjectId(map.buildings.length, 5), 31.5, 31.5, map, trees)).toBeNull()
    expect(objectTileDistance(RELIC_OBJECT_ID, 31.5, 31.5, map, trees)).toBeNull()
  })

  it("decodes the ID a texel carries", () => {
    const [r, g, b] = encodeObjectId(treeObjectId(2, 70000))
    const pixels = new Uint8Array([0, 0, 0, 255, Math.round(r * 255), Math.round(g * 255), Math.round(b * 255), 255])
    expect(texelObjectId(pixels, 0)).toBe(0)
    expect(texelObjectId(pixels, 4)).toBe(treeObjectId(2, 70000))
  })
})
