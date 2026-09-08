import { describe, expect, it } from "vitest"
import { DEFAULT_ELEVATION } from "./elevation"
import { groundCornerTiles, groundMaterial, groundPaintCode, groundQuadConnected } from "./ground-transitions"
import { parseAsciiMap } from "./prototype-map"
import { SHORE_CORNERS, shorelineCorners } from "./shoreline"
import type { GameMap } from "./types"

function terrainMap(rows = [".%", ",^"]): GameMap {
  const map = parseAsciiMap(rows), height = map.tiles.map(() => 0)
  return { ...map, elevation: { settings: { ...DEFAULT_ELEVATION }, height,
    corners: height.flatMap(h => [h, h, h, h]), slope: [...height], cliffs: [...height] } }
}

describe("ground material transitions", () => {
  it("joins all natural ground families without changing the navigable tiles", () => {
    const map = terrainMap(), before = structuredClone(map)
    expect(["grass", "sand", "dirt", "hills"].map(t => groundMaterial(t as GameMap["tiles"][number]))).toEqual([0, 3, 1, 2])
    expect(groundMaterial("forest")).toBe(groundMaterial("grass"))
    expect(groundMaterial("darkwood")).toBe(groundMaterial("clearing"))
    expect(groundQuadConnected(map, 0, 0)).toBe(true)
    expect(groundPaintCode("sand", -1)).toBe(3)
    expect(map).toEqual(before)
  })

  it("allows corners on continuous slopes, including the outer map edge", () => {
    const map = terrainMap()
    // A strong continuous slope, with matching endpoints across every edge.
    map.elevation!.corners = [0, .5, .3, .8, .5, 1, .8, 1.3, .3, .8, .6, 1.1, .8, 1.3, 1.1, 1.6]
    for (let z = 0; z < 2; z++) for (let x = 0; x < 2; x++) expect(groundQuadConnected(map, x, z)).toBe(true)
  })

  it("rejects a cliff in any corner of the blend patch", () => {
    for (let tile = 0; tile < 4; tile++) {
      const map = terrainMap()
      map.elevation!.corners.splice(tile * 4, 4, .8, .8, .8, .8)
      expect(groundQuadConnected(map, 0, 0)).toBe(false)
      expect(groundCornerTiles(map)[tile]).toBe(-1)
    }
  })

  it("checks the whole shared edge even when its central vertex lines up", () => {
    const map = terrainMap()
    map.elevation!.corners[1] = .8
    expect(groundQuadConnected(map, 0, 0)).toBe(false)
  })

  it("keeps high banks separate from a lower water surface", () => {
    const map = terrainMap(["%~", "%~"])
    map.water = { depth: [0, 1, 0, 1], surface: [0, -.8, 0, -.8], flow: {} }
    expect(groundQuadConnected(map, 0, 0)).toBe(false)
  })

  it("cuts a solid half-tile diagonal in all four orientations", () => {
    let rows = ["...", ".%%", ".%%"]
    for (const corner of [3, 1, 0, 2]) {
      const map = terrainMap(rows), before = structuredClone(map)
      const corners = groundCornerTiles(map)
      expect(corners[4]).toBe(corner)
      expect(groundPaintCode("sand", corners[4])).toBe(3 + 8 * (corner + 1))
      expect(map).toEqual(before)
      rows = Array.from({ length: 3 }, (_, x) => rows.map(row => row[x]).reverse().join(""))
    }
  })

  it("fills a concave corner but leaves straight borders and isolated diagonal contacts alone", () => {
    expect(groundCornerTiles(terrainMap(["%%%", "%..", "%.."]))[4]).toBe(3)
    expect([...groundCornerTiles(terrainMap([".%", ".%", ".%"]))].every(c => c === -1)).toBe(true)
    expect([...groundCornerTiles(terrainMap(["%.", ".%"]))].every(c => c === -1)).toBe(true)
  })

  it("keeps the materials on neighbouring half-tile edges in agreement", () => {
    const map = terrainMap(["%.....", "%%....", "%%%...", "%%%%..", "%%%%%.", "%%%%%%"])
    const corners = groundCornerTiles(map)
    expect([...corners].some(c => c >= 0)).toBe(true)
    const edge = (index: number, dx: number, dz: number) => {
      const c = corners[index]
      if (c >= 0) {
        const [cx, cz] = SHORE_CORNERS[c]
        if (cx === dx || cz === dz) return groundMaterial(map.tiles[index + cx])
      }
      return groundMaterial(map.tiles[index])
    }
    const check = (a: number, b: number, dx: number, dz: number) => {
      const fromA = edge(a, dx, dz), fromB = edge(b, -dx, -dz)
      // Ordinary square borders may separate two materials. A substituted
      // triangle must join the material on the far side of either changed edge.
      if (fromA !== groundMaterial(map.tiles[a]) || fromB !== groundMaterial(map.tiles[b])) expect(fromA).toBe(fromB)
    }
    for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
      const i = z * map.width + x
      if (x + 1 < map.width) check(i, i + 1, 1, 0)
      if (z + 1 < map.depth) check(i, i + map.width, 0, 1)
    }
  })

  it("keeps half-tile substitutions off buildings, roads, water and cliffs", () => {
    const map = terrainMap(["...", ".%%", ".%%"])
    map.elevation!.corners.splice(4 * 4, 4, .8, .8, .8, .8)
    expect(groundCornerTiles(map)[4]).toBe(-1)
    map.elevation = undefined
    map.buildings.push({ id: "test", label: "Plot", x: 1, z: 1, w: 1, d: 1, height: 1, color: "#aaaaaa", roofColor: "#aaaaaa" })
    expect(groundCornerTiles(map)[4]).toBe(-1)
    map.buildings = []
    for (const terrain of ["water", "bridge", "path", "track"] as const) {
      map.tiles[4] = terrain
      expect(groundCornerTiles(map)[4]).toBe(-1)
    }
  })

  it("gives every natural bank type the existing shoreline corners", () => {
    for (const terrain of ["grass", "sand", "dirt", "hills", "forest", "darkwood", "clearing"] as const) {
      const map = parseAsciiMap([".~~", "~~~", "~~~"])
      map.tiles[0] = terrain
      expect(shorelineCorners(map, 0, 0)[0]).toBe(1)
    }
  })
})
