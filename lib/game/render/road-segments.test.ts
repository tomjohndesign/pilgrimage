import { describe, expect, it } from "vitest"
import { parseAsciiMap } from "../map/prototype-map"
import { diagonalRoadSegments, distanceToRoadSegments, roadSegmentWear } from "./road-segments"

describe("individual foot and wheel tracks", () => {
  it("fades inherited roads and cart corners without fading a newly walked shortcut", () => {
    for (const source of [0, 1, 3]) {
      expect(roadSegmentWear([0, 0, 1, 0, source, .25], 100, 100, 0)[3]).toBe(.25)
      expect(roadSegmentWear([0, 0, 1, 0, source, 0], 100, 100, 0)[3]).toBe(0)
    }
    expect(roadSegmentWear([0, 0, 1, 0, 4, .45], 0, 0, 0)[3]).toBe(1)
  })
  it("keeps one contact narrower than the gap between opposing walking lanes", () => {
    for (const depth of [.08, .2, .6, 1]) {
      const [edge, compaction, , opacity] = roadSegmentWear([0, 0, 1, 0, 4, depth], 100, 100, 0)
      expect(.5 - edge).toBeLessThan(.2)
      expect(compaction).toBe(depth) // The shader shades early compaction as grass.
      expect(opacity).toBeGreaterThan(0)
    }
    expect(roadSegmentWear([0, 0, 1, 0, 4, 0], 100, 100, 0)[3]).toBe(0)
    // Existing two-track corridors retain the median between their lanes.
    expect(roadSegmentWear([0, 0, 1, 0, 2, .04], 100, 100, 0)[1]).toBeLessThan(.5)
  })
})

const rows = [".........", "===......", "..==.....", "...==....", "....===..", "........."]

describe("constant-width diagonal paths", () => {
  it("keeps the same physical half-width on both sides, including the adjacent grass tile", () => {
    const map = parseAsciiMap(rows)
    const bins = diagonalRoadSegments(map)
    for (const side of [-1, 1]) for (const width of [0.2, 0.3, 0.49, 0.51]) {
      // This centre lies beside the shared corner where the old tile clipping
      // narrowed the road. The outside verge now extends into tile (4, 2).
      const x = 3.75 + side * width * Math.SQRT1_2
      const z = 3.25 - side * width * Math.SQRT1_2
      const tx = Math.floor(x)
      const tz = Math.floor(z)
      const distance = distanceToRoadSegments(x - tx, z - tz, bins.get(tz * map.width + tx) ?? [])
      expect(distance).toBeCloseTo(width, 6)
      expect(distance < 0.5).toBe(width < 0.5)
    }
    expect(map.tiles[2 * map.width + 4]).toBe("grass")
    expect(distanceToRoadSegments(0.05, 0.95, bins.get(2 * map.width + 4)!)).toBeLessThan(0.5)
  })

  it("evaluates one continuous surface across overlapping tile edges", () => {
    const map = parseAsciiMap(rows)
    const bins = diagonalRoadSegments(map)
    for (const z of [0.7, 0.8, 0.9, 1]) {
      const left = distanceToRoadSegments(1, z, bins.get(2 * map.width + 3)!)
      const right = distanceToRoadSegments(0, z, bins.get(2 * map.width + 4)!)
      expect(left).toBeCloseTo(right, 6)
    }
  })

  it("retains the source road type for overflow wear", () => {
    const map = parseAsciiMap(rows.map(row => row.replaceAll("=", "-")))
    const segments = diagonalRoadSegments(map).get(2 * map.width + 4)!
    expect(segments.length).toBeGreaterThan(0)
    expect(segments.every(segment => segment[4] === 1)).toBe(true)
  })

  it("keeps overflow off water, bridge approaches and occupied footprints", () => {
    for (const terrain of ["water", "bridge", "forest"] as const) {
      const map = parseAsciiMap(rows)
      map.tiles[2 * map.width + 4] = terrain
      expect(diagonalRoadSegments(map).has(2 * map.width + 4)).toBe(false)
    }
    const map = parseAsciiMap(rows)
    const index = 2 * map.width + 4
    expect(diagonalRoadSegments(map, new Set([index])).has(index)).toBe(false)
    map.buildings.push({ id: "house", label: "House", x: 4, z: 2, w: 1, d: 1, height: 1, color: "brown", roofColor: "brown" })
    expect(diagonalRoadSegments(map).has(index)).toBe(false)
  })
})
