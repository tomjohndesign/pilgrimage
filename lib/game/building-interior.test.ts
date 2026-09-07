import { describe, expect, it } from "vitest"
import { unitInterior } from "./building-interior"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"

describe("selected unit interiors", () => {
  const map: GameMap = { width: 12, depth: 12, tiles: Array(144).fill("grass"), buildings: [
    { id: "shrine", x: 3, z: 3, w: 3, d: 5, height: 2, label: "Shrine", color: "", roofColor: "" },
    { id: "shelter", x: 7, z: 3, w: 3, d: 3, height: 1.5, label: "Shelter", color: "", roofColor: "" },
  ] }
  const unit = (x: number, z: number, y = 0) => ({ x: tileToWorldX(map, x), z: tileToWorldZ(map, z), y })
  it("follows a unit through the door, interior and exit", () => {
    expect([unit(4, 8), unit(4, 7), unit(4, 3), unit(4, 8), unit(7, 4)]
      .map(p => unitInterior(map, p))).toEqual([null, "shrine", "shrine", null, "shelter"])
  })
  it("includes raised seats but excludes flying and missing units", () => {
    expect(unitInterior(map, unit(3, 5, .15))).toBe("shrine")
    expect(unitInterior(map, unit(3, 5, 4))).toBeNull()
    expect(unitInterior(map)).toBeNull()
  })
})
