import { describe, expect, it } from "vitest"

import { computeForestShade, FOREST_SHADE_RADIUS } from "./forest-field"
import { generateMap } from "./generate-map"
import type { TerrainId } from "./terrain"
import type { GameMap } from "./types"

/** A width×depth map whose left `forestCols` columns are forest, rest grass. */
function splitMap(width: number, depth: number, forestCols: number): GameMap {
  const tiles: TerrainId[] = []
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      tiles.push(x < forestCols ? "forest" : "grass")
    }
  }
  return { width, depth, tiles, buildings: [] }
}

describe("computeForestShade", () => {
  it("stays within 0–1 and matches the map size", () => {
    const map = generateMap({ seed: 42 })
    const shade = computeForestShade(map)
    expect(shade).toHaveLength(map.width * map.depth)
    for (const v of shade) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it("reads 1 deep in the woods and 0 in open land beyond the fade", () => {
    const map = splitMap(32, 8, 16)
    const shade = computeForestShade(map)
    const mid = 4
    // Column well inside the forest half, farther than the window reaches.
    expect(shade[mid * 32 + 4]).toBe(1)
    // Column well into the grass half.
    expect(shade[mid * 32 + 28]).toBe(0)
  })

  it("ramps down monotonically across the tree line", () => {
    const map = splitMap(32, 8, 16)
    const shade = computeForestShade(map)
    const mid = 4
    for (let x = 16 - FOREST_SHADE_RADIUS; x < 16 + FOREST_SHADE_RADIUS; x++) {
      expect(shade[mid * 32 + x]).toBeGreaterThan(shade[mid * 32 + x + 1])
    }
  })

  it("is not skewed open at the map border", () => {
    // All-forest map: even corner tiles, whose blur window is clipped, read 1.
    const tiles: TerrainId[] = new Array<TerrainId>(16 * 16).fill("forest")
    const shade = computeForestShade({ width: 16, depth: 16, tiles, buildings: [] })
    expect(shade[0]).toBe(1)
    expect(shade[shade.length - 1]).toBe(1)
  })
})
