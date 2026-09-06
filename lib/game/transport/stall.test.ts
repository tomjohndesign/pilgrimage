import { describe, expect, it } from "vitest"
import { STALL, stallPoint, stallObstacles, pastureSegmentClear, animalClearance } from "./stall"
import { createPasture, stepPasture } from "./pasture"
import { cartOffset, RIG_TO_WORLD } from "./assets"
import type { GameMap } from "../map/types"

describe("road-facing stalls and animal clearance", () => {
  it("places the long display parallel to the road, with the seller behind it and customers in front", () => {
    for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const side of [1, -1]) {
      const axle = { x: 0, z: 0 }, scale = 1.5
      const [cart, display, sign] = stallObstacles(axle, heading, side, scale)
      expect(display.halfLength).toBeGreaterThan(display.halfWidth * 3)
      const roadward = (p: { x: number; z: number }) => -(p.x * Math.cos(heading) - p.z * Math.sin(heading)) * side
      const merchant = stallPoint(axle, heading, side, scale, STALL.merchant)
      const customer = stallPoint(axle, heading, side, scale, STALL.customer)
      expect(roadward(merchant)).toBeGreaterThan(cart.halfWidth)
      expect(roadward(merchant)).toBeLessThan(roadward(display) - display.halfWidth)
      expect(roadward(customer)).toBeGreaterThan(roadward(display) + display.halfWidth)
      // The site is three tiles along the path and two tiles deep.
      expect(2 * display.halfLength + 0.8 * RIG_TO_WORLD * scale).toBeLessThan(3)
      expect(roadward(sign) + sign.halfWidth + cart.halfWidth).toBeLessThan(2)
    }
  })
  it("rejects a route through an asset even when both endpoints are clear", () => {
    const obstacles = [{ x: 0, z: 0, heading: Math.PI / 4, halfWidth: 0.3, halfLength: 0.6 }]
    expect(pastureSegmentClear({ x: -2, z: 0 }, { x: 2, z: 0 }, obstacles, 0.4)).toBe(false)
    expect(pastureSegmentClear({ x: -2, z: 2 }, { x: 2, z: 2 }, obstacles, 0.4)).toBe(true)
  })
  it("keeps the entire grazing animal clear of cart, wares and sign through wandering and recall", () => {
    for (const kind of ["horse", "donkey"] as const) for (const side of [1, -1]) {
      const map: GameMap = { width: 11, depth: 9, buildings: [], tiles: Array.from({ length: 99 }, (_, i) => Math.floor(i / 11) === 4 ? "path" : "grass") }
      const heading = Math.PI / 2, home = { x: 0.2, z: -2 * side }, length = -cartOffset(kind) * 1.5
      const obstacles = stallObstacles({ x: home.x - length, z: home.z }, heading, side, 1.5)
      const animal = createPasture(home, obstacles, animalClearance(kind, 1.5))
      let walked = 0
      for (let i = 0; i < 1800; i++) {
        const before = { x: animal.x, z: animal.z }
        stepPasture(map, animal, 0.1, 0.3, i >= 1500)
        expect(pastureSegmentClear(before, animal, obstacles, animal.clearance)).toBe(true)
        if (animal.moving) walked++
      }
      expect(walked).toBeGreaterThan(100)
      expect(animal.ready).toBe(true)
      expect([animal.x, animal.z]).toEqual([home.x, home.z])
    }
  })
})
