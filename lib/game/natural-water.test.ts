import { describe, expect, it } from "vitest"
import { naturalWaterStop, WATER_DETOUR_LIMIT } from "./natural-water"
import { parseAsciiMap } from "./map/prototype-map"
import { TILE_HEIGHT } from "./map/terrain"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"

const from = (map: GameMap, x = 1, z = 2) => ({ x: tileToWorldX(map, x), y: TILE_HEIGHT, z: tileToWorldZ(map, z) })

describe("reachable drinking banks", () => {
  it("limits the actual detour, including routing around obstacles", () => {
    const map = parseAsciiMap(["............", "............", "..........~~", "............", "............"])
    expect(naturalWaterStop(map, from(map))).toBeNull()
    const stop = naturalWaterStop(map, from(map, 5))!
    expect(stop).not.toBeNull()
    let previous = from(map, 5), distance = 0
    for (const p of stop.route) { distance += Math.hypot(p.x - previous.x, p.z - previous.z); previous = p }
    expect(distance).toBeLessThanOrEqual(WATER_DETOUR_LIMIT)
  })

  it("routes around buildings and woods without entering the water", () => {
    const map = parseAsciiMap(["........", "........", ".....~~~", "........", "........"])
    map.tiles[2 * map.width + 3] = "forest"
    map.buildings.push({ id: "wall", x: 2, z: 2, w: 1, d: 1, label: "Wall", height: 1, color: "", roofColor: "" })
    const stop = naturalWaterStop(map, from(map))!
    expect(stop).not.toBeNull()
    for (const p of stop.route) {
      const x = worldToTileX(map, p.x), z = worldToTileZ(map, p.z)
      expect(tileAt(map, x, z)).not.toBe("water")
      expect(tileAt(map, x, z)).not.toBe("forest")
      expect(x === 2 && z === 2).toBe(false)
    }
    // Water is close in a straight line, but the wall makes the walk too long.
    map.buildings = [{ ...map.buildings[0], z: 0, d: map.depth }]
    expect(naturalWaterStop(map, from(map))).toBeNull()
  })

  it("rejects bridge decks, waterfalls and banks far above the surface", () => {
    const map = parseAsciiMap(["~~~~~", "~~~~~", "~~~~~", "~~~~~", "~~~~~"])
    map.tiles[2 * map.width + 1] = "bridge"
    expect(naturalWaterStop(map, from(map))).toBeNull()
    map.tiles[2 * map.width + 1] = "grass"
    expect(naturalWaterStop(map, from(map))).not.toBeNull()
    map.water = { depth: map.tiles.map(() => 1), flow: {}, surface: map.tiles.map(() => -3) }
    expect(naturalWaterStop(map, from(map))).toBeNull()
    map.water.surface = map.tiles.map(() => 0)
    map.water.motion = map.tiles.map(() => "waterfall")
    expect(naturalWaterStop(map, from(map))).toBeNull()
  })
})
