import { describe, expect, it } from "vitest"
import { LANDING_CHURCH, LANDING_ROUTE_LENGTH, LANDING_TERRAIN, LANDING_TILES, landingMonkPoint } from "./landing-layout"
import { worldToTileX, worldToTileZ } from "../map/types"

describe("landing church paths", () => {
  it("keeps the full monk route on drawn path tiles and outside the church walls", () => {
    const paths = new Set(LANDING_TILES.filter(tile => tile.path).map(tile => `${tile.x},${tile.z}`))
    for (let distance = 0; distance < LANDING_ROUTE_LENGTH; distance += .025) {
      const point = landingMonkPoint(distance)
      expect(paths.has(`${Math.round(point.x)},${Math.round(point.z)}`)).toBe(true)
      const x = worldToTileX(LANDING_TERRAIN, point.x), z = worldToTileZ(LANDING_TERRAIN, point.z)
      expect(LANDING_TERRAIN.tiles[z * LANDING_TERRAIN.width + x]).toBe("track")
      expect(Math.abs(point.x) >= LANDING_CHURCH.w / 2 || Math.abs(point.z) >= LANDING_CHURCH.d / 2).toBe(true)
    }
  })
  it("loops continuously and connects the path to the canonical entrance", () => {
    expect(landingMonkPoint(LANDING_ROUTE_LENGTH)).toEqual(landingMonkPoint(0))
    const before = landingMonkPoint(LANDING_ROUTE_LENGTH - .001), after = landingMonkPoint(.001)
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeCloseTo(.002)
    expect(LANDING_TILES.find(tile => tile.x === 0 && tile.z === Math.ceil(LANDING_CHURCH.d / 2))?.path).toBe(true)
  })
})
