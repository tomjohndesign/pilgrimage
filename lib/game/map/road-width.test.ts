import { turningMap } from "../transport/turning-demo"
import { cartTrafficPoint } from "../transport/route"
import { roadCartPose, cartGroundContacts, onBridgeDeck } from "../transport/bridge-guide"
import { cartOffset } from "../transport/assets"
import { BASE_CHARACTER_SCALE } from "../base-person/gait"
import { tileToWorldZ } from "./types"
import { describe, expect, it } from "vitest"
import { bridgeLayout } from "./bridges"
import { mainRoadWidthAt, clearMainRoadVerge } from "./road-width"
import { roadLanePoint } from "./road-lane"
import { diagonalRoadSegments, distanceToRoadSegments, roadSegmentWear } from "../render/road-segments"
import type { GameMap } from "./types"

function fixture(): GameMap {
  const map: GameMap = { width: 40, depth: 16, tiles: Array(640).fill("grass"), buildings: [], mainRoadWidth: 2,
    road: Array.from({ length: 40 }, (_, x) => ({ x, z: 8 })) }
  for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
  return map
}

describe("two-tile main road", () => {
  it("retains a grassy centre at heavy traffic on dirt and gravel, while paving remains solid", () => {
    for (const traffic of [0, 30, 3000]) for (const tier of [0, 1]) {
      const [, inner] = roadSegmentWear([0, 0, 1, 0, 0, 1, 2], traffic, traffic, tier)
      expect(.5 - inner).toBeGreaterThanOrEqual(.17)
    }
    expect(roadSegmentWear([0, 0, 1, 0, 0, 1, 2], 3000, 3000, 2)[1]).toBe(1)
  })

  it("puts opposing carts on opposite sides and keeps their wheels on narrow bridge decks", () => {
    const map = fixture(), centre = tileToWorldZ(map, 8)
    for (let z = 0; z < map.depth; z++) for (let x = 19; x <= 21; x++) map.tiles[z * map.width + x] = "water"
    for (let x = 19; x <= 21; x++) map.tiles[8 * map.width + x] = "bridge"
    const layout = bridgeLayout(map), scale = BASE_CHARACTER_SCALE, wheelbase = -cartOffset("horse") * scale
    for (const direction of [1, -1] as const) {
      const at = cartTrafficPoint(map, 8, direction)
      expect((centre - at.z) * direction).toBeCloseTo(.5)
      expect(cartTrafficPoint(map, 20, direction).z).toBeCloseTo(centre)
      let previous = roadCartPose(map, direction === 1 ? 8 : 31, direction, wheelbase, scale)
      for (let distance = .025; distance < 23; distance += .025) {
        const progress = (direction === 1 ? 8 : 31) + direction * distance
        const pose = roadCartPose(map, progress, direction, wheelbase, scale, previous)
        expect(Math.hypot(pose.x - previous.x, pose.z - previous.z)).toBeLessThan(.06)
        for (const wheel of cartGroundContacts(pose, scale)) {
          const tx = Math.round(wheel.x + (map.width - 1) / 2)
          if (layout.rise[8 * map.width + tx] > 0) expect(onBridgeDeck(map, wheel.x, wheel.z)).toBe(true)
        }
        previous = pose
      }
    }
  })

  it.each(["right", "left", "s_bend", "compound_bridge"] as const)("keeps cart motion continuous through a wide %s approach", scenario => {
    const map = turningMap(scenario)
    map.mainRoadWidth = 2
    const scale = BASE_CHARACTER_SCALE, wheelbase = -cartOffset("horse") * scale
    for (const direction of [1, -1] as const) {
      const start = direction === 1 ? 0 : map.road!.length - 1
      let previous = roadCartPose(map, start, direction, wheelbase, scale)
      for (let d = .025; d < map.road!.length - 1; d += .025) {
        const pose = roadCartPose(map, start + direction * d, direction, wheelbase, scale, previous)
        expect(Math.hypot(pose.x - previous.x, pose.z - previous.z)).toBeLessThan(.1)
        expect(Math.hypot(pose.x - pose.hitch.x, pose.z - pose.hitch.z)).toBeLessThanOrEqual(wheelbase + 1e-7)
        previous = pose
      }
    }
  })

  it("covers both verges with one continuous surface and leaves tracks at their own width", () => {
    const map = fixture(), bins = diagonalRoadSegments(map)
    for (const z of [7.55, 9.45]) {
      const row = Math.floor(z), segments = bins.get(row * map.width + 10)!
      expect(distanceToRoadSegments(.5, z - row, segments)).toBeCloseTo(.95)
      const main = segments.find(s => s[4] === 0)!
      expect(.5 - roadSegmentWear(main, 100, 100, 2)[0]).toBe(1)
    }
    expect(.5 - roadSegmentWear([0, 0, 1, 0, 1], 100, 100, 2)[0]).toBe(.5)
    const p = roadLanePoint(map, map.road!, 10, .25)!
    expect(p.z).toBe(7.5)
  })

  it("tapers before the bridge ramp and keeps walkers within the original deck", () => {
    const map = fixture()
    for (let z = 0; z < map.depth; z++) for (let x = 19; x <= 21; x++) map.tiles[z * map.width + x] = "water"
    for (let x = 19; x <= 21; x++) map.tiles[8 * map.width + x] = "bridge"
    const layout = bridgeLayout(map)
    expect(mainRoadWidthAt(map, 8)).toBe(2)
    expect(mainRoadWidthAt(map, 20)).toBe(1)
    const bins = diagonalRoadSegments(map)
    for (const p of map.road!) if (layout.rise[p.z * map.width + p.x] > 0) {
      expect(bins.has(p.z * map.width + p.x)).toBe(false)
      for (const lane of [-.28, .28]) {
        const at = roadLanePoint(map, map.road!, p.x, lane)!
        expect(Math.abs(at.z - p.z)).toBeCloseTo(.28)
      }
    }
    for (let p = 10; p < 29; p += .01) {
      const a = roadLanePoint(map, map.road!, p, .28)!, b = roadLanePoint(map, map.road!, p + .001, .28)!
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(.002)
    }
  })

  it("tightens walking lanes through turns without folding the inside lane backwards", () => {
    const map = fixture()
    map.road = [...Array.from({ length: 16 }, (_, x) => ({ x, z: 8 })), ...Array.from({ length: 7 }, (_, i) => ({ x: 15, z: 9 + i }))]
    for (const p of map.road) map.tiles[p.z * map.width + p.x] = "path"
    for (const lane of [-.41, .41]) for (let p = 13; p < 17; p += .01) {
      const a = roadLanePoint(map, map.road, p, lane)!, b = roadLanePoint(map, map.road, p + .001, lane)!
      const c = roadLanePoint(map, map.road, p, 0)!, d = roadLanePoint(map, map.road, p + .001, 0)!
      expect((b.x - a.x) * (d.x - c.x) + (b.z - a.z) * (d.z - c.z), `lane ${lane}, progress ${p}`).toBeGreaterThan(0)
      expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(.004)
    }
  })

  it("clears trees beside the route without changing its centreline, water, or bridge tiles", () => {
    const map = fixture(), road = map.road!.map(p => ({ ...p }))
    map.tiles[7 * map.width + 10] = "forest"
    map.tiles[7 * map.width + 11] = "water"
    map.tiles[8 * map.width + 11] = "bridge"
    clearMainRoadVerge(map)
    expect(map.tiles[7 * map.width + 10]).toBe("clearing")
    expect(map.tiles[7 * map.width + 11]).toBe("water")
    expect(map.tiles[8 * map.width + 11]).toBe("bridge")
    expect(map.road).toEqual(road)
  })
})
