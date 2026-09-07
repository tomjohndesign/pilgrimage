import { describe, expect, it } from "vitest"
import { convoyClear, convoyPoint, shrineParking } from "./navigation"
import { cartOffset } from "./assets"
import { cartOnRoute, followCart } from "./follow"
import { createSim, stepSim } from "../sim"
import { generateTravelers, TRAVELER_TYPES } from "../travelers"
import { DEFAULT_ELEVATION } from "../map/elevation"
import { tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"

function fixture(): GameMap {
  const width = 30, depth = 18
  return { width, depth, tiles: Array.from({ length: width * depth }, (_, i) => Math.floor(i / width) === 4 ? "path" : "grass"),
    road: Array.from({ length: width }, (_, x) => ({ x, z: 4 })),
    buildings: [{ id: "shrine", label: "Shrine", x: 12, z: 10, w: 3, d: 3, height: 1, color: "#888", roofColor: "#888" }],
    site: { hovelId: "shrine", junction: 10, branch: Array.from({ length: 6 }, (_, i) => ({ x: 10, z: 4 + i })), door: { x: 10, z: 9 } } }
}

describe("merchant shrine parking", () => {
  it.each(["hand", "donkey", "horse"] as const)("finds grass for the whole %s convoy in both directions", puller => {
    for (const direction of [1, -1] as const) {
      const map = fixture(), plan = shrineParking(map, 10, direction, -cartOffset(puller) * 1.5, puller, 1.5)
      expect(plan).not.toBeNull()
      expect(convoyClear(map, plan!.parked, puller, 1.5, true)).toBe(true)
      expect((plan!.returnProgress - 10) * direction).toBeGreaterThan(0)
    }
  })
  it("declines parking when the verge is water or buildings", () => {
    const map = fixture(); map.tiles = map.tiles.map(t => t === "grass" ? "water" : t)
    expect(shrineParking(map, 10, 1, -cartOffset("horse") * 1.5, "horse", 1.5)).toBeNull()
  })
  it.each([0, 4, 8])("parks, visits alone, recovers its convoy and continues (vendor %s)", id => {
    const map = fixture(), t = generateTravelers(1, 1)[0]
    t.id = id; t.type = TRAVELER_TYPES.vendor; t.offset = 9.9 / 29; t.direction = 1; t.pace = 1
    t.attributes.piety = 100; t.attributes.hunger = 0; t.attributes.gold = 100
    const sim = createSim([t], map), s = sim.travelers.get(id)!
    s.timer = 10000
    let parked: unknown, sawVisit = false, sawReturn = false
    for (let i = 0; i < 4000; i++) {
      stepSim(sim, [t], map, 1, 0.1)
      if (s.shrineParking?.walking) {
        parked ??= structuredClone(s.shrineParking.pose)
        expect(s.shrineParking.pose).toEqual(parked)
        expect(convoyClear(map, s.shrineParking.pose, id === 0 ? "hand" : id === 4 ? "donkey" : "horse", 1.5, true)).toBe(true)
      }
      if (s.activity === "visiting") {
        sawVisit = true
        expect(s.x).toBeGreaterThanOrEqual(tileToWorldX(map, 12))
        expect(s.z).toBeGreaterThanOrEqual(tileToWorldZ(map, 10))
      }
      sawReturn ||= s.activity === "fromParking"
      if (sawReturn && s.activity === "walking") break
    }
    expect({ sawVisit, sawReturn, visits: s.visits, parked: !!s.shrineParking }).toEqual({ sawVisit: true, sawReturn: true, visits: 1, parked: false })
  })
})

describe("convoy corner routes", () => {
  function bend() {
    const map = fixture(); map.buildings = []; map.site = undefined
    map.tiles.fill("grass")
    map.road = [...Array.from({ length: 9 }, (_, x) => ({ x: x + 4, z: 4 })), ...Array.from({ length: 10 }, (_, i) => ({ x: 12, z: 5 + i }))]
    for (const p of map.road) map.tiles[p.z * map.width + p.x] = "path"
    return map
  }
  it("cuts across the grassy inside of a bend and lets the axle roll through", () => {
    const map = bend(), wheelbase = -cartOffset("horse") * 1.5
    const corner = convoyPoint(map, 8)
    expect(corner.x).toBeLessThan(tileToWorldX(map, 12) - 0.3)
    expect(corner.z).toBeGreaterThan(tileToWorldZ(map, 4) + 0.3)
    for (const direction of [1, -1] as const) {
      let before = cartOnRoute(direction === 1 ? 2 : 15, direction, wheelbase, p => convoyPoint(map, p))
      for (let i = 1; i <= 1200; i++) {
        const progress = (direction === 1 ? 2 : 15) + direction * i * 0.01
        const pose = followCart(before, convoyPoint(map, progress), wheelbase)
        const heading = before.heading + Math.atan2(Math.sin(pose.heading - before.heading), Math.cos(pose.heading - before.heading)) / 2
        const lateral = (pose.x - before.x) * Math.cos(heading) - (pose.z - before.z) * Math.sin(heading)
        expect(Math.abs(lateral)).toBeLessThan(1e-6)
        expect(Math.hypot(pose.x - pose.hitch.x, pose.z - pose.hitch.z)).toBeCloseTo(wheelbase, 9)
        expect(convoyClear(map, pose, "horse", 1.5)).toBe(true)
        before = pose
      }
    }
  })
  it.each(["water", "forest", "building", "ledge"] as const)("does not shortcut through %s", obstacle => {
    const map = bend()
    for (let z = 5; z <= 9; z++) for (let x = 7; x <= 11; x++) {
      if (obstacle === "building") map.buildings.push({ id: `${x}:${z}`, label: "Wall", x, z, w: 1, d: 1, height: 1, color: "#888", roofColor: "#888" })
      else if (obstacle === "ledge") { map.elevation ??= { settings: DEFAULT_ELEVATION, height: Array(map.width * map.depth).fill(0), corners: Array(map.width * map.depth * 4).fill(0), slope: [], cliffs: [] }; map.elevation.height[z * map.width + x] = 2; map.elevation.corners.fill(2, (z * map.width + x) * 4, (z * map.width + x + 1) * 4) }
      else map.tiles[z * map.width + x] = obstacle
    }
    for (let progress = 3; progress < 14; progress += 0.05) {
      const p = convoyPoint(map, progress)
      expect(p.x < tileToWorldX(map, 11) + 0.49 && p.x > tileToWorldX(map, 7) - 0.49 &&
        p.z > tileToWorldZ(map, 5) - 0.49 && p.z < tileToWorldZ(map, 9) + 0.49).toBe(false)
    }
  })
})
