import { describe, expect, it } from "vitest"
import { buildingDimensions } from "./dimensions"
import { buildingPreviewMap } from "./map-preview"
import { hidePreviewPaper } from "./preview-alpha"
import { DEFAULT_RECIPE } from "./style"
import { tileToWorldX, tileToWorldZ } from "../map/types"

describe("building map comparison", () => {
  it("centres every supported footprint on real tile boundaries and keeps the road outside it", () => {
    for (let width = 3; width <= 12; width++) for (let depth = 3; depth <= 12; depth++) {
      const map = buildingPreviewMap({ ...DEFAULT_RECIPE, width, depth })
      const building = map.buildings[0]
      expect(tileToWorldX(map, building.x) + (width - 1) / 2).toBe(0)
      expect(tileToWorldZ(map, building.z) + (depth - 1) / 2).toBe(0)
      const { wallWidth, wallDepth } = buildingDimensions({ ...DEFAULT_RECIPE, width, depth })
      for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
        if (Math.abs(tileToWorldX(map, x)) < wallWidth / 2 && Math.abs(tileToWorldZ(map, z)) < wallDepth / 2) expect(map.tiles[z * map.width + x]).toBe("grass")
      }
      expect(map.tiles[(building.z + depth) * map.width + Math.floor(map.width / 2)]).toBe("track")
      expect(map.road?.every(tile => tile.z >= building.z + depth)).toBe(true)
    }
  })
  it("hides border-connected paper without erasing enclosed pale plaster or dark ink", () => {
    const width = 7, pixels = new Uint8ClampedArray(width * width * 4)
    for (let y = 0; y < width; y++) for (let x = 0; x < width; x++) {
      const ink = x >= 2 && x <= 4 && y >= 2 && y <= 4 && (x === 2 || x === 4 || y === 2 || y === 4)
      pixels.set(ink ? [53, 43, 36, 255] : [243, 237, 223, 255], (y * width + x) * 4)
    }
    hidePreviewPaper(pixels, width, width)
    expect(pixels[3]).toBe(0)
    expect(pixels[(3 * width + 3) * 4 + 3]).toBe(255)
    expect(pixels[(2 * width + 3) * 4 + 3]).toBe(255)
  })
})
