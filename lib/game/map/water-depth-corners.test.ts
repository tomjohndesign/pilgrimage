import { describe, expect, it } from "vitest"
import { parseAsciiMap } from "./prototype-map"
import { SHORE_CORNERS } from "./shoreline"
import { waterDepthCorners } from "./water-depth-corners"

function water(rows: string[]) {
  const map = parseAsciiMap(rows.map(row => row.replace(/[123]/g, "~")))
  map.water = { depth: rows.flatMap(row => [...row].map(c => Number(c) || 0)), surface: map.tiles.map(() => -.05), flow: {} }
  return map
}

describe("water depth corners", () => {
  it("splits deeper water corners into equal halves in every orientation", () => {
    let rows = ["111", "122", "122"]
    for (const corner of [3, 1, 0, 2]) {
      const map = water(rows)
      expect(waterDepthCorners(map)[4]).toBe(corner)
      rows = rows[0].split("").map((_, x) => rows.map(row => row[x]).reverse().join(""))
    }
  })

  it("keeps shared edges consistent across all three depth bands", () => {
    const map = water(["1111111", "1122111", "1222211", "1223321", "1233321", "1222221", "1111111"])
    const corners = waterDepthCorners(map), before = structuredClone(map)
    const sample = (x: number, z: number, u: number, v: number) => {
      const index = z * map.width + x, corner = corners[index]
      if (corner >= 0) {
        const [dx, dz] = SHORE_CORNERS[corner]
        if ((u - .5) * dx + (v - .5) * dz > 0) return map.water!.depth[index + dx]
      }
      return map.water!.depth[index]
    }
    expect([...corners].some(c => c >= 0)).toBe(true)
    for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
      for (const t of [.1, .5, .9]) {
        if (x + 1 < map.width && map.water!.depth[z * map.width + x] === map.water!.depth[z * map.width + x + 1])
          expect(sample(x, z, 1, t)).toBe(sample(x + 1, z, 0, t))
        if (z + 1 < map.depth && map.water!.depth[z * map.width + x] === map.water!.depth[(z + 1) * map.width + x])
          expect(sample(x, z, t, 1)).toBe(sample(x, z + 1, t, 0))
      }
    }
    expect(map).toEqual(before)
  })

  it("keeps depth transitions out of land and across separate waterfall levels", () => {
    const map = water(["111", "122", "122"])
    map.tiles[1] = "grass"
    expect(waterDepthCorners(map)[4]).toBe(-1)
    map.tiles[1] = "water"
    map.water!.surface![1] = .8
    expect(waterDepthCorners(map)[4]).toBe(-1)
    expect([...waterDepthCorners(parseAsciiMap(["~~~", "~~~", "~~~"]))].every(c => c === -1)).toBe(true)
  })
})
