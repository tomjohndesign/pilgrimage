import { describe, expect, it } from "vitest"
import { alignCart, followCart } from "./follow"
import { roadsideManeuver, roadsideStall, routeLength, routePoint } from "./roadside"
import { BASE_CHARACTER_SCALE, personWalkStride } from "../base-person/gait"
import { cartOffset, merchantWalkSpeed, pullingDesign, animalStride } from "./assets"
import { advanceWalkPhase } from "../motion"
import { tileAt, worldToTileX, worldToTileZ, type GameMap } from "../map/types"
import { roadLanePoint } from "../map/road-lane"
import { advanceCartProgress, cartRoutePoint } from "./route"
import { roadCartPose } from "./bridge-guide"

const stride = personWalkStride(pullingDesign(0)) * BASE_CHARACTER_SCALE
function roadMap(): GameMap {
  return { width: 20, depth: 9, buildings: [], road: Array.from({ length: 20 }, (_, x) => ({ x, z: 4 })), tiles: Array.from({ length: 180 }, (_, i) => Math.floor(i / 20) === 4 ? "path" : "grass") }
}
describe("shared merchant movement", () => {
  it.each([[1, 1], [-1, 1], [1, -1], [-1, -1]])("keeps animals on the direct diagonal at a constant physical speed (%i, %i)", (sx, sz) => {
    const width = 64, road = [], tiles: GameMap["tiles"] = Array(width * width).fill("grass")
    let x = sx > 0 ? 8 : 55, z = sz > 0 ? 8 : 55
    road.push({ x, z })
    for (let i = 0; i < 40; i++) { x += sx; road.push({ x, z }); z += sz; road.push({ x, z }) }
    for (const p of road) tiles[p.z * width + p.x] = "path"
    const map: GameMap = { width, depth: width, road, tiles, buildings: [] }
    for (const direction of [1, -1] as const) {
      let progress = direction === 1 ? 8 : 64
      const start = cartRoutePoint(map, progress)
      let previous = start, distance = 0
      for (let step = 0; step < 100; step++) {
        progress = advanceCartProgress(map, progress, direction * .05)
        const pose = roadCartPose(map, progress, direction, 0, BASE_CHARACTER_SCALE)
        const lane = roadLanePoint(map, road, progress, 0)!
        expect(pose.hitch.x + (width - 1) / 2).toBeCloseTo(lane.x, 8)
        expect(pose.hitch.z + (width - 1) / 2).toBeCloseTo(lane.z, 8)
        const dx = pose.hitch.x - previous.x, dz = pose.hitch.z - previous.z
        expect(Math.hypot(dx, dz)).toBeCloseTo(.05, 8)
        expect(dx * sx * direction).toBeCloseTo(dz * sz * direction, 8)
        distance += Math.hypot(dx, dz); previous = pose.hitch
      }
      expect(Math.hypot(previous.x - start.x, previous.z - start.z)).toBeCloseTo(distance, 8)
    }
  })

  it("uses actual distance at every frame rate, playback rate, and authored stride", () => {
    for (const fps of [15, 30, 60, 144]) for (const rate of [1, 2, 4]) for (const reach of [stride, animalStride("donkey", 1.5), animalStride("horse", 1.5)]) {
      let phase = 0
      for (let i = 0; i < fps; i++) phase = advanceWalkPhase(phase, 0.13 * rate / fps, 1 / fps, 20, 18, reach)
      expect(phase).toBeCloseTo((0.13 * rate / reach) % 1, 9)
      expect(advanceWalkPhase(phase, 0, 1, 20, 18, reach)).toBe(phase)
    }
    for (const puller of ["hand", "horse", "donkey"] as const) expect(merchantWalkSpeed(puller, 1.5, stride)).toBeLessThanOrEqual(stride)
  })
  it("parks behind the first adjacent grass row, mirrors the display for a blocked verge, and rejoins forward", () => {
    for (const direction of [1, -1] as const) for (const side of [1, -1] as const) {
      const map = roadMap()
      // Block the opposite verge; the entire shop must fit on the available side.
      const blockedRow = 4 + direction * side
      for (let x = 0; x < map.width; x++) map.tiles[blockedRow * map.width + x] = "forest"
      const progress = direction === 1 ? 3 : 16, from = { x: progress - 9.5, z: -0.2 * direction }
      const plan = roadsideStall(map, from, progress, direction, 1.3)!
      expect(plan).not.toBeNull(); expect(plan.side).toBe(side)
      expect(Math.abs(worldToTileZ(map, plan.park.z) - 4)).toBe(2)
      expect((plan.returnProgress - progress) * direction).toBeGreaterThan(0)
      expect(plan.exit.at(-1)!.z).toBeCloseTo(from.z)
      const dx = plan.exit.at(-1)!.x - plan.entry[0].x
      expect(dx).toBeCloseTo(plan.returnProgress - progress)
      for (const route of [plan.entry, plan.exit]) {
        for (let d = 0; d < routeLength(route); d += 0.03) {
          const p = routePoint(route, d)
          expect(["grass", "path"]).toContain(tileAt(map, worldToTileX(map, p.x), worldToTileZ(map, p.z)))
          expect(Math.cos(p.heading - plan.heading)).toBeGreaterThanOrEqual(Math.SQRT1_2 - 1e-8)
        }
        expect(route.some((p, i) => i && Math.abs(Math.abs(p.x - route[i - 1].x) - Math.abs(p.z - route[i - 1].z)) < 1e-8 && Math.abs(p.x - route[i - 1].x) > 0.1)).toBe(true)
      }
    }
  })
  it("declines blocked ground, bends and the map edge", () => {
    const map = roadMap()
    expect(roadsideStall(map, { x: 8, z: 0 }, 17.5, 1, 1.3)).toBeNull()
    map.tiles = map.tiles.map(t => t === "grass" ? "forest" : t)
    expect(roadsideStall(map, { x: -6.5, z: 0 }, 3, 1, 1.3)).toBeNull()
    const bent = roadMap(); bent.road![6].z++
    expect(roadsideStall(bent, { x: -6.5, z: 0 }, 3, 1, 1.3)).toBeNull()
  })
  it("keeps the hitch attached while the axle turns gradually, independent of render rate", () => {
    for (const puller of ["hand", "donkey", "horse"] as const) {
      const length = -cartOffset(puller) * 1.5
      const plan = roadsideManeuver({ x: -3, z: 2 }, { x: 1, z: 0 }, 0, 1, length)
      const final = []
      for (const fps of [15, 60, 144]) {
        let pose = alignCart(plan.entry[0], Math.PI / 2, length), maxLag = 0
        const total = routeLength(plan.entry), speed = 0.2
        for (let d = speed / fps; d < total + speed / fps; d += speed / fps) {
          const hitch = routePoint(plan.entry, d), next = followCart(pose, hitch, length)
          expect(Math.hypot(next.x - hitch.x, next.z - hitch.z)).toBeCloseTo(length, 9)
          expect(Math.abs(next.heading - pose.heading)).toBeLessThan(0.03)
          expect(next.distance).toBeLessThanOrEqual(speed / fps + 1e-8)
          maxLag = Math.max(maxLag, Math.abs(next.heading - hitch.heading)); pose = next
        }
        expect(maxLag).toBeGreaterThan(0.25)
        expect(Math.abs(pose.z - plan.park.z)).toBeLessThan(0.16)
        expect(followCart(pose, plan.park, length).distance).toBe(0)
        final.push(pose)
      }
      expect(Math.hypot(final[0].x - final[2].x, final[0].z - final[2].z)).toBeLessThan(0.002)
    }
  })
})
