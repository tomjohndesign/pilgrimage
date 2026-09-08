import { generateMap } from "./generate-map"
import { turningMap } from "../transport/turning-demo"
import { bridgeLayout } from "./bridges"
import { insideBridgeCorner } from "./bridge-corners"
import { describe, expect, it } from "vitest"
import { parseAsciiMap } from "./prototype-map"
import { roadLanePoint } from "./road-lane"
import { diagonalRoadBend } from "./road"
import { type GameMap, type TilePos } from "./types"
import { cartOnRoute, followCart } from "../transport/follow"
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

  it.each([false, true])("lets cart axles roll inside bends with attached drawbars (diagonals: %s)", diagonal => {
    const { map, route } = fixture(diagonal)
    for (const direction of [1, -1] as const) for (const puller of ["hand", "donkey", "horse"] as const) {
      const wheelbase = -cartOffset(puller) * BASE_CHARACTER_SCALE
      const pointAt = (p: number) => roadLanePoint(map, route, p, 0.24 * direction)!
      let previous = cartOnRoute(direction === 1 ? 1 : 10, direction, wheelbase, pointAt)
      for (let step = 1; step <= 450; step++) {
        const progress = (direction === 1 ? 1 : 10) + direction * step * 0.02
        const pose = followCart(previous, pointAt(progress), wheelbase)
        expect(Math.hypot(pose.x - pose.hitch.x, pose.z - pose.hitch.z)).toBeCloseTo(wheelbase, 6)
        expect(Math.hypot(pose.x - previous.x, pose.z - previous.z)).toBeLessThan(0.1)
        expect(Math.cos(pose.heading - previous.heading)).toBeGreaterThan(0.995)
        const heading = previous.heading + Math.atan2(Math.sin(pose.heading - previous.heading), Math.cos(pose.heading - previous.heading)) / 2
        const sideways = (pose.x - previous.x) * Math.cos(heading) - (pose.z - previous.z) * Math.sin(heading)
        expect(Math.abs(sideways)).toBeLessThan(0.00001)
        previous = pose
      }
    }
  })
})

// Reproduce the staggered landings before a long river span, not just an
// isolated elbow. The support assertion measures real deck widths, not the
// nearest tile's height (which can incorrectly claim support outside a rail).
describe("bridge walking lanes", () => {
  it("joins bridge lanes without jumps on generated maps", () => {
    let crossings = 0
    for (const seed of [0,7,42,84]) {
      const map=generateMap({seed}),route=map.road!,layout=bridgeLayout(map)
      for (let i=1;i<route.length-1;i++) {
        const tile=route[i]
        if(!layout.rise[tile.z*map.width+tile.x]) continue
        crossings++
        for(const lane of [-0.28,0.28]) for(const p of [i-0.5,i+0.5]) {
          const a=roadLanePoint(map,route,p-0.00001,lane)!,b=roadLanePoint(map,route,p,lane)!,c=roadLanePoint(map,route,p+0.00001,lane)!
          expect(a).not.toBeNull();expect(c).not.toBeNull()
          expect(Math.hypot(c.x-a.x,c.z-a.z), `seed ${seed} at ${p}`).toBeLessThan(0.00004)
          expect(Math.cos(Math.atan2(b.x-a.x,b.z-a.z)-Math.atan2(c.x-b.x,c.z-b.z))).toBeGreaterThan(0.99999)
        }
      }
    }
    expect(crossings).toBeGreaterThan(20)
  })
  it("keeps both lanes on the deck through staggered landings in every direction", () => {
    let map = turningMap("compound_bridge"), route = map.road!
    for (let rotation = 0; rotation < 4; rotation++) {
      const layout = bridgeLayout(map)
      const supported = (x: number, z: number) => {
        if (layout.corners.some(c => insideBridgeCorner(c, x, z))) return true
        if (layout.connectors.some(c => Math.abs(x-c.x) <= (c.open[0] || c.open[1] ? 0.5 : 0.42)+1e-6 &&
          Math.abs(z-c.z) <= (c.open[2] || c.open[3] ? 0.5 : 0.42)+1e-6)) return true
        return [...layout.spans.flatMap(s => s.tiles.map(p => ({...p, dx:s.dx,dz:s.dz}))), ...layout.ramps].some(p =>
          Math.abs((x-p.x)*p.dx+(z-p.z)*p.dz) <= 0.500001 &&
          Math.abs((z-p.z)*p.dx-(x-p.x)*p.dz) <= 0.420001)
      }
      for (const reversed of [false,true]) for (const lane of [-0.28,0,0.28]) {
        const path = reversed ? [...route].reverse() : route
        const point = (progress: number) => roadLanePoint(map,path,progress,lane)
        for (let p = 0; p < path.length-1; p += 0.025) {
          const tile = path[Math.floor(p+0.5)]
          if (!layout.rise[tile.z*map.width+tile.x]) continue
          const pos = point(p)
          expect(pos, `bridge sample at ${p}`).not.toBeNull()
          expect(supported(pos!.x,pos!.z), `unsupported lane ${lane} at ${p}`).toBe(true)
          // Leave room for alternating planted feet, not just the body origin.
          if(layout.rise[tile.z*map.width+tile.x] > 0.3) for(let angle=0;angle<Math.PI*2;angle+=Math.PI/4)
            expect(supported(pos!.x+Math.cos(angle)*0.07,pos!.z+Math.sin(angle)*0.07), `foot contact at ${p}`).toBe(true)
          const next = point(p+0.00001)!
          expect(Math.hypot(next.x-pos!.x,next.z-pos!.z)).toBeLessThan(0.00003)
        }
        for (let p = 0.5; p < path.length-1; p++) {
          const a=point(p-0.00001)!,b=point(p)!,c=point(p+0.00001)!
          expect(Math.hypot(c.x-a.x,c.z-a.z)).toBeLessThan(0.00004)
          expect(Math.cos(Math.atan2(b.x-a.x,b.z-a.z)-Math.atan2(c.x-b.x,c.z-b.z))).toBeGreaterThan(0.99999)
        }
      }
      ;({map,route}=rotate(map,route))
    }
  })
})


it("refreshes shared road curves after any nearby terrain edit or seed change", () => {
  const { map } = fixture(true), x = 3, z = 2
  const initial = diagonalRoadBend(map, x, z)
  expect(initial).not.toBeNull()
  expect(diagonalRoadBend(map, x, z)).toBe(initial)
  for (let index = 0; index < map.tiles.length; index++) {
    const before = map.tiles[index]
    for (const terrain of ["grass", "path", "bridge"] as const) {
      map.tiles[index] = terrain
      expect(diagonalRoadBend(map, x, z)).toEqual(diagonalRoadBend({ ...map, tiles: [...map.tiles] }, x, z))
    }
    map.tiles[index] = before
  }
  for (const seed of [0, 1, 2, 7, 42, 12345]) {
    map.seed = seed
    expect(diagonalRoadBend(map, x, z)).toEqual(diagonalRoadBend({ ...map }, x, z))
  }
})
