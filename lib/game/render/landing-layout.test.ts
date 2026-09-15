import { describe, expect, it } from "vitest"
import { LANDING_CHAPEL, LANDING_CHAPEL_CENTER, LANDING_CHAPEL_LAYOUT, LANDING_ROUTE_LENGTH, LANDING_TERRAIN, LANDING_TILES, landingMonkPoint } from "./landing-layout"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ } from "../map/types"

describe("landing chapel paths", () => {
  it("places the chapel on whole terrain cells and its doorway on the approach path", () => {
    const building = LANDING_TERRAIN.buildings[0]
    expect(Number.isInteger(building.x)).toBe(true)
    expect(Number.isInteger(building.z)).toBe(true)
    expect(LANDING_CHAPEL_CENTER).toEqual({
      x: tileToWorldX(LANDING_TERRAIN, building.x + (building.w - 1) / 2),
      z: tileToWorldZ(LANDING_TERRAIN, building.z + (building.d - 1) / 2),
    })
    const door = LANDING_TERRAIN.site!.door
    expect(LANDING_CHAPEL_LAYOUT.rotation).toBe(0)
    expect(LANDING_CHAPEL_CENTER.x + LANDING_CHAPEL_LAYOUT.entranceX).toBe(tileToWorldX(LANDING_TERRAIN, door.x))
    expect(LANDING_TILES.find(tile => tile.x === tileToWorldX(LANDING_TERRAIN, door.x)
      && tile.z === tileToWorldZ(LANDING_TERRAIN, door.z))?.path).toBe(true)
  })
  it("keeps the full monk route on drawn path tiles and outside the chapel walls", () => {
    const paths = new Set(LANDING_TILES.filter(tile => tile.path).map(tile => `${tile.x},${tile.z}`))
    for (let distance = 0; distance < LANDING_ROUTE_LENGTH; distance += .025) {
      const point = landingMonkPoint(distance)
      expect(paths.has(`${Math.round(point.x)},${Math.round(point.z)}`)).toBe(true)
      const x = worldToTileX(LANDING_TERRAIN, point.x), z = worldToTileZ(LANDING_TERRAIN, point.z)
      expect(LANDING_TERRAIN.tiles[z * LANDING_TERRAIN.width + x]).toBe("track")
      expect(Math.abs(point.x - LANDING_CHAPEL_CENTER.x) >= LANDING_CHAPEL.w / 2
        || Math.abs(point.z - LANDING_CHAPEL_CENTER.z) >= LANDING_CHAPEL.d / 2).toBe(true)
    }
  })
  it("loops continuously and connects the path to the canonical entrance", () => {
    expect(landingMonkPoint(LANDING_ROUTE_LENGTH)).toEqual(landingMonkPoint(0))
    const before = landingMonkPoint(LANDING_ROUTE_LENGTH - .001), after = landingMonkPoint(.001)
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeCloseTo(.002)
    expect(LANDING_TILES.find(tile => tile.x === 0 && tile.z === Math.ceil(LANDING_CHAPEL.d / 2))?.path).toBe(true)
  })
})
