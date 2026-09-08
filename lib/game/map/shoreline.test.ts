import { describe, expect, it } from "vitest"
import { DEFAULT_ELEVATION } from "./elevation"
import { parseAsciiMap } from "./prototype-map"
import { isWaterTile, shorelineCorners } from "./shoreline"
import type { GameMap } from "./types"

const COAST = ["~.....", "~~....", "~~~...", "~~~~..", "~~~~~."]
function raisedCoast(rows = COAST, bank = 0, surface = 0): GameMap {
  const map = parseAsciiMap(rows)
  const height = map.tiles.map(t => t === "water" ? surface : bank)
  return { ...map,
    elevation: { settings: { ...DEFAULT_ELEVATION }, height, corners: height.flatMap(h => [h, h, h, h]), slope: height.map(() => 0), cliffs: height.map(() => 0) },
    water: { depth: map.tiles.map(t => t === "water" ? 1 : 0), surface: height.map(() => surface), flow: {} },
  }
}
const flags = (map: GameMap) => map.tiles.flatMap((_, i) => shorelineCorners(map, i % map.width, Math.floor(i / map.width)))

describe("elevated shoreline corners", () => {
  it("preserves diagonal smoothing on level shores and small bank lips", () => {
    expect(flags(raisedCoast())).toEqual(flags(parseAsciiMap(COAST)))
    expect(flags(raisedCoast(COAST, .04))).toEqual(flags(parseAsciiMap(COAST)))
    expect(flags(raisedCoast()).some(Boolean)).toBe(true)
  })

  it("keeps raised-bank tops and their lower water planes separate in every orientation", () => {
    let rows = COAST
    for (let rotation = 0; rotation < 4; rotation++) {
      expect(flags(raisedCoast(rows, .8)).every(f => f === 0)).toBe(true)
      rows = Array.from({ length: rows[0].length }, (_, x) => rows.map(row => row[x]).reverse().join(""))
    }
  })

  it("checks sloping triangle edges even when their shared vertex meets the water", () => {
    const map = raisedCoast(["~~~", "~..", "~.."])
    expect(shorelineCorners(map, 1, 1)[3]).toBe(1)
    // The southwest bank vertex is level, but the edge rises sharply away from it.
    map.elevation!.corners[(1 * map.width + 1) * 4 + 1] = .8
    expect(shorelineCorners(map, 1, 1)[3]).toBe(0)
  })

  it("allows banks to rise outside the diagonal while requiring their shared water edges to meet", () => {
    const map = raisedCoast(["...", ".~~", ".~~"])
    map.elevation!.corners[1 * 4] = .8
    map.elevation!.corners[3 * 4] = .8
    expect(shorelineCorners(map, 1, 1)[3]).toBe(1)
    map.elevation!.corners[1 * 4 + 2] = .8
    expect(shorelineCorners(map, 1, 1)[3]).toBe(0)
  })

  it("rejects corner paint across waterfalls, including maps with only water-surface data", () => {
    const map = raisedCoast(["~~~", "~..", "~.."])
    const index = 1
    map.water!.surface![index] = .8
    map.elevation!.corners.splice(index * 4, 4, .8, .8, .8, .8)
    expect(shorelineCorners(map, 1, 1)[3]).toBe(0)
    expect(shorelineCorners({ ...map, elevation: undefined }, 1, 1)[3]).toBe(0)
    // The predicate still identifies the same water/navigation tiles.
    expect(isWaterTile(map, 1, 1)).toBe(false)
    expect(isWaterTile(map, 1, 0)).toBe(true)
  })
})
