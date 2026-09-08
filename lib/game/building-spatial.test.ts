import { expect, it } from "vitest"
import { buildingSpatialQuery } from "./building-spatial"
import { containsTile } from "./building-navigation"
import { createBenchmarkCity } from "./city-benchmark"
import { buildingDistance } from "./wildlife/habitat"

it("local footprint queries agree with a complete scan, including bucket boundaries and edits", () => {
  const map = createBenchmarkCity({ width: 192, depth: 128, tiles: Array(192 * 128).fill("grass"), buildings: [] })
  const query = buildingSpatialQuery(map.buildings)
  for (let z = 0; z < 128; z += .5) for (let x = 0; x < 192; x += .5) {
    const p = { x, z }
    expect(query(p).filter(b => containsTile(b, p))).toEqual(map.buildings.filter(b => containsTile(b, p)))
  }
  const b = map.buildings[0]
  b.x = 0; b.z = 0; b.w = 10
  expect(buildingSpatialQuery(map.buildings)({ x: 8, z: 0 })).toContain(b)
  const replacement = { ...b, id: "replacement" }
  map.buildings[0] = replacement
  expect(buildingSpatialQuery(map.buildings)({ x: 8, z: 0 })).toContain(replacement)
})

it("preserves wildlife clearance and signed distances inside a dense city", () => {
  const map = createBenchmarkCity({ width: 192, depth: 128, tiles: Array(192 * 128).fill("grass"), buildings: [] })
  for (const clearance of [.55, 3, 8]) {
    const query = buildingSpatialQuery(map.buildings, clearance)
    for (let z = -64; z <= 64; z += 3.5) for (let x = -96; x <= 96; x += 3.5) {
      const point = { x, z }
      expect(buildingDistance(map, point, clearance, query)).toBeCloseTo(Math.min(clearance, buildingDistance(map, point)), 12)
    }
  }
  const b = map.buildings[0]
  b.x = 0; b.z = 0; b.w = 12
  const point = { x: -84.5, z: -63 }
  expect(buildingDistance(map, point, 3, buildingSpatialQuery(map.buildings, 3))).toBe(buildingDistance(map, point))
})
