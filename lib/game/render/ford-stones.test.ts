import { describe, expect, it } from "vitest"
import { fordStones } from "./ford-stones"
import { parseAsciiMap } from "../map/prototype-map"
import { TILE_HEIGHT } from "../map/terrain"
import { worldToTileX, worldToTileZ } from "../map/types"

describe("stones in walkable shallows", () => {
  it("keeps low exposed crowns within the shallows and leaves water between them", () => {
    const map = parseAsciiMap(["~:::~~", "~~:::~"])
    map.seed = 7919
    map.water = { depth: map.tiles.map(() => 1), flow: {}, surface: map.tiles.map(() => -0.4) }
    const before = structuredClone(map), stones = fordStones(map)
    expect(stones.length).toBeGreaterThan(6)
    expect(stones.length).toBeLessThan(6 * 9)
    for (const stone of stones) {
      const x = worldToTileX(map, stone.x), z = worldToTileZ(map, stone.z), waterline = TILE_HEIGHT - 0.4
      expect(map.tiles[z * map.width + x]).toBe("ford")
      expect(stone.y - stone.sy).toBeLessThan(waterline)
      expect(stone.y + stone.sy).toBeGreaterThan(waterline)
      expect(stone.y + stone.sy - waterline).toBeLessThan(0.08)
    }
    expect(map).toEqual(before)
    expect(fordStones(map)).toEqual(stones)
  })

  it("keeps stone placement stable when terrain is split into render blocks", () => {
    const map = parseAsciiMap(["::::::"])
    const left = fordStones(map, { id: 0, x: 0, z: 0, endX: 3, endZ: 1 })
    const right = fordStones(map, { id: 1, x: 3, z: 0, endX: 6, endZ: 1 })
    expect([...left, ...right]).toEqual(fordStones(map))
    expect(fordStones(parseAsciiMap(["~~##.."]))).toEqual([])
  })
})
