import { describe, expect, it } from "vitest"
import { cliffCorner, cliffCornerHeight, cliffUpperHeight, inCliffCorner, terrainCorner, withTerrainCornerQueries } from "./cliff-corners"
import { DEFAULT_ELEVATION, groundHeight } from "./elevation"
import { parseAsciiMap } from "./prototype-map"
import { TILE_HEIGHT } from "./terrain"

function shelf(wet = false) {
  const map = parseAsciiMap(Array(5).fill("....."))
  const height = map.tiles.map((_, i) => i % 5 >= 2 && Math.floor(i / 5) >= 2 ? 1 : 0)
  if (wet) map.tiles = map.tiles.map((t, i) => height[i] ? t : "water")
  map.elevation = { settings: { ...DEFAULT_ELEVATION }, height, corners: height.flatMap(h => [h, h, h, h]), slope: height.map(() => 0), cliffs: height.map(() => 0) }
  return map
}

describe("diagonal cliff geometry", () => {
  it("moves a small shoreline lip onto the diagonal in both wet and dry corner tiles", () => {
    for (const rows of [["...", ".~~", ".~~"], ["~~~", "~..", "~.."]]) {
      const map = parseAsciiMap(rows)
      const height = map.tiles.map(t => t === "water" ? -.05 : -.015)
      map.elevation = { settings: { ...DEFAULT_ELEVATION }, height, corners: height.flatMap(h => [h, h, h, h]), slope: height.map(() => 0), cliffs: height.map(() => 0) }
      const cut = terrainCorner(map, 1, 1)!
      expect(cliffCorner(map, 1, 1)).toBeUndefined()
      expect(cut.corner).toBe(3)
      expect(groundHeight(map, .7, .7)).toBeCloseTo(TILE_HEIGHT + height[cut.donor])
      expect(groundHeight(map, 1.3, 1.3)).toBeCloseTo(TILE_HEIGHT + height[4])
    }
  })

  it("divides a cliff corner into two equal triangles and samples their actual heights", () => {
    const map = shelf(), before = structuredClone(map), cut = cliffCorner(map, 2, 2)!
    expect(cut.corner).toBe(3)
    expect(inCliffCorner(cut, .2, .2)).toBe(true)
    expect(inCliffCorner(cut, .8, .8)).toBe(false)
    expect(groundHeight(map, 1.7, 1.7)).toBe(TILE_HEIGHT)
    expect(groundHeight(map, 2.3, 2.3)).toBe(TILE_HEIGHT + 1)
    expect(map).toEqual(before)
  })

  it("matches all four orientations and the lower shelf at both diagonal endpoints", () => {
    const map = shelf()
    for (const corner of [3, 1, 0, 2]) {
      const cut = cliffCorner(map, 2, 2)!
      expect(cut.corner).toBe(corner)
      expect(cliffCornerHeight(cut, 0, 0)).toBe(0)
      expect(cliffUpperHeight(map, 2, 2, cut, .5, .5)).toBe(1)
      const old = map.elevation!.height
      const height = old.map((_, i) => old[(4 - i % 5) * 5 + Math.floor(i / 5)])
      map.elevation!.height = height
      map.elevation!.corners = height.flatMap(h => [h, h, h, h])
    }
  })

  it("cuts a high bank beside water without painting water on the high surface", () => {
    const map = shelf(true), cut = cliffCorner(map, 2, 2)!
    expect(map.tiles[cut.donor]).toBe("water")
    expect(groundHeight(map, 1.7, 1.7)).toBe(TILE_HEIGHT)
    expect(groundHeight(map, 2.3, 2.3)).toBe(TILE_HEIGHT + 1)
  })

  it("preserves continuous slopes on both sides of the diagonal wall", () => {
    const map = shelf()
    map.elevation!.corners = map.tiles.flatMap((_, i) => [0, 1, 2, 3].map(c =>
      map.elevation!.height[i] + (i % 5 + c % 2) * .05 + (Math.floor(i / 5) + Math.floor(c / 2)) * .03))
    expect(cliffCorner(map, 2, 2)).toBeDefined()
    expect(groundHeight(map, 1.7, 1.7)).toBeCloseTo(TILE_HEIGHT + 2.2 * .08)
    expect(groundHeight(map, 2.3, 2.3)).toBeCloseTo(TILE_HEIGHT + 1 + 2.8 * .08)
  })

  it("lets the diagonal cliff face taper down to the water level", () => {
    const map = shelf(true)
    map.elevation!.corners[12 * 4 + 1] = 0
    const cut = cliffCorner(map, 2, 2)!
    expect(cut).toBeDefined()
    expect(cliffUpperHeight(map, 2, 2, cut, 1, 0)).toBe(0)
    expect(cliffUpperHeight(map, 2, 2, cut, 0, 1)).toBe(1)
    expect(cliffCornerHeight(cut, .25, .25)).toBe(0)
  })

  it("cuts a bank beside a river that falls gently, but not beside a waterfall step", () => {
    // Water surfaces fall a little every tile downstream; the shelf still joins.
    const map = shelf(true)
    map.water = { depth: map.tiles.map(t => t === "water" ? 1 : 0), flow: {}, surface: map.tiles.map((_, i) => -0.05 - (i % 5) * 0.002 - Math.floor(i / 5) * 0.002) }
    const cut = cliffCorner(map, 2, 2)!
    expect(cut).toBeDefined()
    expect(map.tiles[cut.donor]).toBe("water")
    expect(Math.max(...cut.lower) - Math.min(...cut.lower)).toBeLessThan(0.01)
    map.water.surface![1 * 5 + 2] = -0.85
    expect(cliffCorner(map, 2, 2)).toBeUndefined()
  })

  it("preserves roads, building aprons and incompatible lower water levels", () => {
    const map = shelf()
    map.tiles[2 * 5 + 3] = "path"
    expect(cliffCorner(map, 2, 2)).toBeUndefined()
    map.tiles[2 * 5 + 3] = "grass"
    map.buildings.push({ id: "house", label: "House", x: 3, z: 3, w: 1, d: 1, height: 1, color: "brown", roofColor: "brown" })
    expect(cliffCorner(map, 2, 2)).toBeUndefined()
    const shore = shelf(true)
    shore.elevation!.corners[(1 * 5 + 2) * 4 + 2] = -.8
    expect(cliffCorner(shore, 2, 2)).toBeUndefined()
  })
})


describe("terrain query scopes", () => {
  it("shares a read-only query batch and observes in-place edits in the next batch", () => {
    const map = shelf(), samples = [[1.7, 1.7], [2.3, 2.3], [1.5, 2.5]]
    const expected = samples.map(([x, z]) => groundHeight(map, x, z))
    withTerrainCornerQueries(map, () => {
      expect(samples.map(([x, z]) => groundHeight(map, x, z))).toEqual(expected)
      const cut = terrainCorner(map, 2, 2)
      withTerrainCornerQueries(map, () => expect(terrainCorner(map, 2, 2)).toBe(cut))
    })
    map.elevation!.corners.fill(0)
    expect(withTerrainCornerQueries(map, () => groundHeight(map, 2.3, 2.3))).toBe(TILE_HEIGHT)
    expect(terrainCorner(map, 2, 2)).toBeUndefined()
  })
  it("closes a batch after an exception so later queries see new terrain", () => {
    const map = shelf()
    expect(() => withTerrainCornerQueries(map, () => {
      expect(terrainCorner(map, 2, 2)).toBeDefined()
      throw new Error("cancel query")
    })).toThrow("cancel query")
    map.elevation!.corners.fill(0)
    expect(terrainCorner(map, 2, 2)).toBeUndefined()
  })
})

it("shares terrain between synchronous pose callbacks but refreshes at frame and canvas boundaries", () => {
  const map = shelf(), frame = { elapsedTime: 1 }
  const first = withTerrainCornerQueries(map, () => terrainCorner(map, 2, 2), frame)
  expect(withTerrainCornerQueries(map, () => terrainCorner(map, 2, 2), frame)).toBe(first)
  const otherCanvas = { elapsedTime: 1 }
  expect(withTerrainCornerQueries(map, () => terrainCorner(map, 2, 2), otherCanvas)).not.toBe(first)
  map.elevation!.corners.fill(0); frame.elapsedTime++
  expect(withTerrainCornerQueries(map, () => terrainCorner(map, 2, 2), frame)).toBeUndefined()
})
