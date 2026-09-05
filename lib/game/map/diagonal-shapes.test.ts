import { describe, expect, it } from "vitest"
import { parseAsciiMap } from "./prototype-map"
import { diagonalRoadPoint, roadDiagonals } from "./road"
import { isWaterTile, shorelineCorners, shorelineInset } from "./shoreline"

const staircase = parseAsciiMap([
  ".........",
  "===......",
  "..==.....",
  "...==....",
  "....===..",
  ".........",
])

describe("diagonal roads", () => {
  it("prefers diagonals most of the time while retaining ordinary bends across seeded worlds", () => {
    let diagonal = 0
    for (let seed = 0; seed < 1000; seed++) {
      const map = { ...staircase, seed }
      const sides = roadDiagonals(map, 3, 2)
      expect(roadDiagonals(map, 3, 2)).toEqual(sides)
      // A local stretch has one style, rather than a different roll per tile.
      expect(sides[1]).toBe(sides[2])
      expect(roadDiagonals(map, 3, 3)[3]).toBe(sides[2])
      if (sides[2]) diagonal++
      else expect(diagonalRoadPoint(map, 3, 2)).toEqual({ x: 3, z: 2, laneScale: 1 })
    }
    expect(diagonal).toBeGreaterThan(700)
    expect(diagonal).toBeLessThan(800)
  })

  it("agrees at shared entrances across style-region boundaries", () => {
    // Move the staircase over the eight-tile region boundary.
    const shifted = parseAsciiMap([
      "..................", "......===.........", "........==........",
      ".........==.......", "..........===.....", "..................",
    ])
    for (let seed = 0; seed < 40; seed++) {
      const map = { ...shifted, seed }
      for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
        const sides = roadDiagonals(map, x, z)
        expect(sides[0]).toBe(roadDiagonals(map, x + 1, z)[1])
        expect(sides[2]).toBe(roadDiagonals(map, x, z + 1)[3])
      }
    }
  })

  it("joins alternating bends into a continuous diagonal in both directions", () => {
    expect(roadDiagonals(staircase, 3, 2)).toEqual([0, 1, 1, 0])
    expect(roadDiagonals(staircase, 3, 3)).toEqual([1, 0, 0, 1])
    const a = diagonalRoadPoint(staircase, 3, 2)
    const b = diagonalRoadPoint(staircase, 3, 3)
    expect(a).toEqual({ x: 2.75, z: 2.25, laneScale: Math.SQRT1_2 })
    expect(b).toEqual({ x: 3.25, z: 2.75, laneScale: Math.SQRT1_2 })
    // The two lane centres travel diagonally instead of stepping down a column.
    expect(b.x - a.x).toBe(b.z - a.z)
  })

  it("preserves straight roads, isolated bends, junctions, plazas and bridge entries", () => {
    for (const rows of [
      [".....", "=====", "....."],
      [".....", "===..", "..=..", "..=..", "....."],
      [".....", "=====", "..=.."],
      [".....", ".===.", ".===.", "....."],
      [".....", "===..", "..#..", "..===", "....."],
    ]) {
      const map = parseAsciiMap(rows)
      expect(roadDiagonals(map, 2, 1)).toEqual([0, 0, 0, 0])
      expect(diagonalRoadPoint(map, 2, 1)).toEqual({ x: 2, z: 1, laneScale: 1 })
    }
  })

  it("agrees on shared entrances for every rotation, including tracks", () => {
    let rows = [".........", "===......", "..--.....", "...--....", "....---..", "........."]
    for (let rotation = 0; rotation < 4; rotation++) {
      const map = parseAsciiMap(rows)
      for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
        const sides = roadDiagonals(map, x, z)
        expect(sides[0]).toBe(roadDiagonals(map, x + 1, z)[1])
        expect(sides[2]).toBe(roadDiagonals(map, x, z + 1)[3])
      }
      rows = Array.from({ length: rows[0].length }, (_, x) => rows.map((row) => row[x]).reverse().join(""))
    }
  })
})

describe("diagonal shorelines", () => {
  it("turns a staircase bank into one diagonal through tile edge midpoints", () => {
    const map = parseAsciiMap(["~.....", "~~....", "~~~...", "~~~~..", "~~~~~."])
    const coverage = (x: number, z: number, px: number, pz: number) => {
      const wet = isWaterTile(map, x, z)
      const triangle = shorelineInset(px, pz, shorelineCorners(map, x, z)) > 0
      return triangle ? !wet : wet
    }
    // Wet convex corner and dry concave corner meet without a square seam.
    for (const t of [0.1, 0.3, 0.7, 0.9]) {
      expect(coverage(2, 1, t, 1)).toBe(coverage(2, 2, t, 0))
      expect(coverage(1, 1, 1, t)).toBe(coverage(2, 1, 0, t))
    }
    expect(coverage(2, 2, 0.9, 0.1)).toBe(false)
    expect(coverage(2, 1, 0.1, 0.9)).toBe(true)
  })

  it("keeps narrow channels, separate diagonal ponds and all tile centres intact", () => {
    const map = parseAsciiMap(["......", ".~~...", "...~..", "...~..", "......"])
    expect(shorelineCorners(map, 3, 1)).toEqual([0, 0, 0, 0])
    for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
      expect(shorelineInset(0.5, 0.5, shorelineCorners(map, x, z))).toBeLessThan(0)
    }
  })

  it("preserves bridges, paths, occupied building tiles and straight banks at map edges", () => {
    for (const terrain of ["#", "=", "-"]) {
      const map = parseAsciiMap(["~~~", `~${terrain}~`, "~~~"])
      expect(shorelineCorners(map, 1, 1)).toEqual([0, 0, 0, 0])
    }
    const map = parseAsciiMap(["~~~", "~.~", "~~~"])
    map.buildings.push({ id: "house", label: "House", x: 1, z: 1, w: 1, d: 1, height: 1, color: "brown", roofColor: "brown" })
    expect(shorelineCorners(map, 1, 1)).toEqual([0, 0, 0, 0])
    const coast = parseAsciiMap(["~~..", "~~..", "~~.."])
    for (let z = 0; z < coast.depth; z++) for (let x = 0; x < coast.width; x++) {
      expect(shorelineCorners(coast, x, z)).toEqual([0, 0, 0, 0])
    }
  })
})
