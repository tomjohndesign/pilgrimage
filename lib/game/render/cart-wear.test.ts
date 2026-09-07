import { describe, expect, it } from "vitest"
import { cartCornerWear, cartWheelContacts } from "./cart-wear"
import { distanceToRoadSegments } from "./road-segments"
import { turningMap } from "../transport/turning-demo"
import { cartOffset } from "../transport/assets"
import { BASE_CHARACTER_SCALE } from "../base-person/gait"
import { cartOnRoute } from "../transport/follow"
import { cartRoutePoint } from "../transport/route"
import { roadLanePoint } from "../map/road-lane"

describe("faded cart corner wear", () => {
  it.each(["right", "left", "s_bend"] as const)("follows the inside cart shortcut for %s without changing walking lanes", scenario => {
    const map = turningMap(scenario), original = structuredClone(map)
    const lanes = map.road!.map((_, i) => roadLanePoint(map, map.road!, i, 0.24))
    const bins = cartCornerWear(map)
    expect(bins.size).toBeGreaterThan(0)
    const progress = scenario === "s_bend" ? 6 : 11
    const pose = cartOnRoute(progress, 1, -cartOffset("horse") * BASE_CHARACTER_SCALE, p => cartRoutePoint(map, p))
    const distance = (p: {x: number; z: number}) => {
      const x = p.x + map.width / 2, z = p.z + map.depth / 2, tx = Math.floor(x), tz = Math.floor(z)
      return distanceToRoadSegments(x - tx, z - tz, bins.get(tz * map.width + tx) ?? [])
    }
    for (const wheel of cartWheelContacts(pose)) expect(distance(wheel)).toBeLessThan(0.03)
    // A real pair of ruts leaves a grassy median, rather than painting the axle.
    expect(distance(pose)).toBeGreaterThan(0.2)
    expect([...bins.values()].flat().every(s => s[4] === 2)).toBe(true)
    expect(Math.max(...[...bins.values()].map(s => s.length))).toBeLessThan(160)
    expect(map).toEqual(original)
    expect(map.road!.map((_, i) => roadLanePoint(map, map.road!, i, 0.24))).toEqual(lanes)
  })
  it("keeps straight verges, bridge decks, water and excluded land clean", () => {
    expect(cartCornerWear(turningMap("reverse")).size).toBe(0)
    const map = turningMap("bridge"), blocked = new Set([11 * map.width + 11])
    for (const index of cartCornerWear(map, blocked).keys()) {
      expect(blocked.has(index)).toBe(false)
      expect(["water", "bridge"]).not.toContain(map.tiles[index])
    }
  })
})
