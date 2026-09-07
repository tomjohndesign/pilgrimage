import { describe, expect, it } from "vitest"
import { contactAppearance } from "./path-appearance"
import { createFootpaths, footpathRoadSegments, recordWalkingPath } from "../footpaths"
import { tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"

describe("gradual visibility of walking traffic", () => {
  it("remembers a first passage for navigation without adding visible terrain", () => {
    const map: GameMap = { width: 8, depth: 8, tiles: Array(64).fill("grass"), buildings: [] }
    const paths = createFootpaths(map)
    recordWalkingPath(paths, map, { x: tileToWorldX(map, 2), z: tileToWorldZ(map, 3) }, { x: tileToWorldX(map, 3), z: tileToWorldZ(map, 3) })
    expect(paths.edges.size).toBeGreaterThan(0)
    expect(paths.contacts.size).toBeGreaterThan(0)
    expect(footpathRoadSegments(map, paths).size).toBe(0)
    expect(contactAppearance(.04 + 1e-9).opacity).toBe(0)
  })

  it("shows a second passage only as faint grass discoloration", () => {
    const second = contactAppearance(.08)
    expect(second.grass).toBeGreaterThan(0)
    expect(second.grass).toBeLessThan(.1)
    expect(second.dirt).toBe(0)
    expect(contactAppearance(.16).dirt).toBe(0)
  })

  it("gradually reveals dirt through sustained use and hides regrown tracks again", () => {
    const early = contactAppearance(.2), established = contactAppearance(.3), busy = contactAppearance(.4)
    expect(early.dirt).toBeGreaterThan(0)
    expect(established.dirt).toBeGreaterThan(early.dirt)
    expect(busy.dirt).toBe(1)
    expect(busy.grass).toBe(0)
    expect(contactAppearance(.03).opacity).toBe(0)
  })
})
