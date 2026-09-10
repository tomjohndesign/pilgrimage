import { describe, expect, it } from "vitest"
import { createSim, stepSim } from "../sim"
import { generateTravelers, TRAVELER_TYPES } from "../travelers"
import { worldToTileX, worldToTileZ, type GameMap } from "../map/types"
import { cartOffset } from "./assets"
import { roadCartPose } from "./bridge-guide"
import { driveSegment } from "./building-parking"
import { convoyBuildingsClear, convoyPoint, parkingClear, stallParking } from "./navigation"
import { recoverCart } from "./recovery"

function fixture() {
  const map: GameMap = { width: 40, depth: 20, tiles: Array(800).fill("grass"), buildings: [],
    road: Array.from({ length: 40 }, (_, x) => ({ x, z: 10 })) }
  for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
  return map
}

describe("interrupted cart journeys", () => {
  it("leaves room for the unfolded stall beside another grazing animal", () => {
    const map = fixture(), progress = 8, scale = 1.5, wheelbase = -cartOffset("horse") * scale
    const from = convoyPoint(map, progress, scale, 1)
    const original = stallParking(map, from, progress, 1, wheelbase, scale, "horse", { trees: [] })!
    expect(original).not.toBeNull()
    const display = original.obstacles[1]
    const occupied = { x: display.x, z: display.z, heading: 0, halfWidth: .2, halfLength: .2 }
    const next = stallParking(map, from, progress, 1, wheelbase, scale, "horse", { trees: [], obstacles: [occupied] })
    expect(next?.side).not.toBe(original.side)
  })

  it.each([.1, 1.25])("replaces an active route blocked by a new wall with dt %s", dt => {
    const map = fixture(), traveler = generateTravelers(1, 1)[0]
    Object.assign(traveler, { id: 8, type: TRAVELER_TYPES.vendor, direction: 1, offset: 12 / 39, pace: 1 })
    Object.assign(traveler.attributes, { piety: 0, hunger: 100, thirst: 100, stamina: 100 })
    const sim = createSim([traveler], map), s = sim.travelers.get(8)!
    s.timer = 10000
    const from = convoyPoint(map, 12), to = convoyPoint(map, 25)
    s.roadShortcut = { from, to, start: 12, end: 25, length: 13, distance: 0 }
    map.buildings = [{ id: "wall", label: "Wall", x: 18, z: 9, w: 2, d: 3, height: 1, color: "", roofColor: "" }]
    let recovered = false
    for (let i = 0; i < Math.ceil(50 / dt) && s.progress < 25; i++) {
      stepSim(sim, [traveler], map, 1, dt)
      recovered ||= !!s.cartRecovery
      expect(convoyBuildingsClear(map, s.cartPose!, "horse", 1.5)).toBe(true)
    }
    expect(recovered).toBe(true)
    expect(s.progress).toBeGreaterThanOrEqual(25)
  })

  it.each([1, -1] as const)("resumes after construction appears under the convoy in direction %s", direction => {
    const map = fixture(), traveler = generateTravelers(1, 1)[0]
    Object.assign(traveler, { id: 8, type: TRAVELER_TYPES.vendor, direction, offset: .5, pace: 1 })
    Object.assign(traveler.attributes, { piety: 0, hunger: 100, thirst: 100, stamina: 100 })
    const sim = createSim([traveler], map), s = sim.travelers.get(8)!
    s.timer = 10000
    stepSim(sim, [traveler], map, 1, .1)
    const start = s.progress
    map.buildings = [{ id: "new", label: "New", x: worldToTileX(map, s.x), z: worldToTileZ(map, s.z),
      w: 2, d: 2, height: 1, color: "", roofColor: "", construction: { work: 0, required: 10 } }]
    expect(convoyBuildingsClear(map, s.cartPose!, "horse", 1.5)).toBe(false)
    for (let i = 0; i < 100; i++) {
      map.buildings[0].construction!.work = Math.min(10, i)
      stepSim(sim, [traveler], map, 1, .1)
      if (i > 1) expect(convoyBuildingsClear(map, s.cartPose!, "horse", 1.5)).toBe(true)
    }
    expect(s.cartRecovery).toBe(false)
    expect(Math.abs(s.progress - start)).toBeGreaterThan(2)
    expect(s.moveSpeed).toBeGreaterThan(0)
  })

  it("replans around a new wall from the current clear pose without snapping to the road", () => {
    const map = fixture(), progress = 15, scale = 1.5, wheelbase = -cartOffset("horse") * scale
    const initial = roadCartPose(map, progress, 1, wheelbase, scale)
    map.buildings = [{ id: "wall", label: "Wall", x: 18, z: 9, w: 2, d: 3, height: 1, color: "", roofColor: "" }]
    const recovery = recoverCart(map, initial, progress, 1, "horse", scale, { trees: [] })!
    expect(recovery).not.toBeNull()
    expect(recovery.pose).toBe(initial)
    expect(recovery.route).toBeDefined()
    const route = recovery.route!
    let pose = initial
    for (const point of [...(route.via ?? []), route.to]) {
      const next = driveSegment(pose, point, wheelbase, (p, heading) => parkingClear(map, p, "horse", scale, { trees: [] }, false, heading))
      expect(next).not.toBeNull()
      pose = next!
    }
  })

  it("does not recover onto water or another reserved cart", () => {
    const map = fixture(), initial = roadCartPose(map, 15, 1, -cartOffset("horse") * 1.5, 1.5)
    map.buildings = [{ id: "new", label: "New", x: 15, z: 10, w: 1, d: 1, height: 1, color: "", roofColor: "" }]
    const context = { trees: [], obstacles: [{ x: 0, z: 0, heading: 0, halfWidth: 40, halfLength: 20 }] }
    expect(recoverCart(map, initial, 15, 1, "horse", 1.5, context)).toBeNull()
    map.tiles.fill("water")
    expect(recoverCart(map, initial, 15, 1, "horse", 1.5, { trees: [] })).toBeNull()
  })
})
