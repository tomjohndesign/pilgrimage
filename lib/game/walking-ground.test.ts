import { expect, it } from "vitest"
import { buildingSpatialQuery, mapBuildingQuery } from "./building-spatial"
import { createBenchmarkCity } from "./city-benchmark"
import { withTerrainCornerQueries } from "./map/cliff-corners"
import { parseAsciiMap } from "./map/prototype-map"
import { tileAt } from "./map/types"
import { walkingGroundQuery } from "./walking-ground"

it("matches full outdoor footprint scans throughout a city, including map boundaries", () => {
  const map = createBenchmarkCity({ width: 192, depth: 128, tiles: Array(192 * 128).fill("grass"), buildings: [] })
  withTerrainCornerQueries(map, () => {
    const nearby = mapBuildingQuery(map), open = walkingGroundQuery(map, nearby)
    expect(walkingGroundQuery(map, nearby)).toBe(open)
    for (let z = -1; z <= map.depth; z++) for (let x = -1; x <= map.width; x++) {
      const expected = ["grass", "clearing", "dirt", "sand", "path", "track"].includes(tileAt(map, x, z) ?? "") &&
        !map.buildings.some(b => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d)
      expect(open({ x, z })).toBe(expected)
    }
  })
})

it("observes terrain and in-place building edits between snapshots and direct calls", () => {
  const map = parseAsciiMap([".....", ".....", "....."])
  const point = { x: 1, z: 1 }
  const read = () => walkingGroundQuery(map, mapBuildingQuery(map))(point)
  expect(withTerrainCornerQueries(map, read)).toBe(true)
  map.tiles[6] = "water"
  expect(withTerrainCornerQueries(map, read)).toBe(false)
  map.tiles[6] = "grass"
  expect(read()).toBe(true)
  map.buildings.push({ id: "test", label: "Hut", height: 1, color: "#ccc", roofColor: "#999", x: 1, z: 1, w: 1, d: 1 })
  expect(withTerrainCornerQueries(map, read)).toBe(false)
  map.buildings[0].x = 3
  expect(withTerrainCornerQueries(map, read)).toBe(true)
  map.buildings[0].x = 1
  expect(read()).toBe(false)
  withTerrainCornerQueries(map, () => {
    expect(read()).toBe(false)
    expect(walkingGroundQuery(map, buildingSpatialQuery([]))(point)).toBe(true)
    expect(read()).toBe(false)
  })
})
