import { describe, expect, it } from "vitest"
import { parseAsciiMap } from "./prototype-map"
import { roadLanePoint } from "./road-lane"
import { type GameMap, type TilePos } from "./types"
import { cartOnRoute } from "../transport/follow"
import { cartOffset } from "../transport/assets"
import { BASE_CHARACTER_SCALE } from "../base-person/gait"

function fixture(diagonal: boolean) {
  const map = parseAsciiMap(diagonal
    ? [".........", "===......", "..==.....", "...==....", "....=====", "........."]
    : [".........", "=====....", "....=....", "....=....", "....=====", "........."])
  const route = (diagonal
    ? [[0, 1], [1, 1], [2, 1], [2, 2], [3, 2], [3, 3], [4, 3], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4]]
    : [[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [4, 2], [4, 3], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4]])
    .map(([x, z]) => ({ x, z }))
  return { map, route }
}

function rotate(map: GameMap, route: TilePos[]) {
  return {
    map: { ...map, width: map.depth, depth: map.width,
      tiles: Array.from({ length: map.tiles.length }, (_, i) => map.tiles[(map.depth - 1 - i % map.depth) * map.width + Math.floor(i / map.depth)]) },
    route: route.map(p => ({ x: map.depth - 1 - p.z, z: p.x })),
  }
}

describe("curved road lanes", () => {
  it.each([false, true])("joins positions and headings across every tile entrance (diagonals: %s)", diagonal => {
    let { map, route } = fixture(diagonal)
    for (let rotation = 0; rotation < 4; rotation++) {
      for (const lane of [-0.28, 0, 0.28]) {
        const point = (p: number) => roadLanePoint(map, route, p, lane)!
        for (let p = 0.5; p < route.length - 1; p++) {
          const a = point(p - 0.00001), b = point(p), c = point(p + 0.00001)
          expect(Math.hypot(c.x - a.x, c.z - a.z)).toBeLessThan(0.00004)
          const inAngle = Math.atan2(b.x - a.x, b.z - a.z), outAngle = Math.atan2(c.x - b.x, c.z - b.z)
          expect(Math.cos(outAngle - inAngle)).toBeGreaterThan(0.99999)
        }
        for (let p = 0; p < route.length - 1; p += 0.07) {
          const centre = roadLanePoint(map, route, p, 0)!, offset = point(p)
          expect(Math.hypot(offset.x - centre.x, offset.z - centre.z)).toBeCloseTo(Math.abs(lane), 8)
          expect(roadLanePoint(map, [...route].reverse(), route.length - 1 - p, -lane)!.x).toBeCloseTo(offset.x, 8)
          expect(roadLanePoint(map, [...route].reverse(), route.length - 1 - p, -lane)!.z).toBeCloseTo(offset.z, 8)
        }
      }
      ;({ map, route } = rotate(map, route))
    }
  })

  it.each([false, true])("keeps cart axles on their lane with attached drawbars through bends (diagonals: %s)", diagonal => {
    const { map, route } = fixture(diagonal)
    for (const direction of [1, -1] as const) for (const puller of ["hand", "donkey", "horse"] as const) {
      const wheelbase = -cartOffset(puller) * BASE_CHARACTER_SCALE
      const pointAt = (p: number) => roadLanePoint(map, route, p, 0.24 * direction)!
      let previous = cartOnRoute(direction === 1 ? 1 : 10, direction, wheelbase, pointAt)
      for (let step = 1; step <= 450; step++) {
        const progress = (direction === 1 ? 1 : 10) + direction * step * 0.02
        const pose = cartOnRoute(progress, direction, wheelbase, pointAt)
        expect(Math.hypot(pose.x - pose.hitch.x, pose.z - pose.hitch.z)).toBeCloseTo(wheelbase, 6)
        expect(Math.hypot(pose.x - previous.x, pose.z - previous.z)).toBeLessThan(0.1)
        expect(Math.cos(pose.heading - previous.heading)).toBeGreaterThan(0.995)
        // Independently check that the axle stays on the painted road ribbon.
        let roadDistance = Infinity
        for (let p = -2; p < route.length + 2; p += 0.025) {
          const centre = roadLanePoint(map, route, p, 0)!
          roadDistance = Math.min(roadDistance, Math.hypot(pose.x - centre.x, pose.z - centre.z))
        }
        expect(roadDistance).toBeLessThan(0.245)
        previous = pose
      }
    }
  })
})
