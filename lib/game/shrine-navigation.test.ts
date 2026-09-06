import { describe, expect, it } from "vitest"
import { buildingStepAllowed } from "./building-navigation"
import { monkWander, type WanderSpot } from "./monk-wander"
import { shrineLayout, shrineKneelers, shrineSeats } from "./shrine-layout"
import { shrineVisitPlan } from "./shrine-visit"
import { tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./map/types"

function fixture(direction: number): GameMap {
  const sideways = direction % 2 === 1
  const door = [{ x: 5, z: 9 }, { x: 9, z: 5 }, { x: 5, z: 3 }, { x: 3, z: 5 }][direction]
  return { width: 15, depth: 15, tiles: Array(225).fill("grass"),
    buildings: [{ id: "shrine", x: 4, z: 4, w: sideways ? 5 : 3, d: sideways ? 3 : 5,
      height: 2, label: "Shrine", color: "", roofColor: "" }],
    site: { hovelId: "shrine", door, branch: [door], junction: 0 } }
}

describe("walking around shrine kneelers", () => {
  it.each([0, 1, 2, 3])("blocks kneeler shortcuts but admits the reserved visitor (view %i)", direction => {
    const map = fixture(direction), shrine = map.buildings[0], seats = shrineSeats(shrine, map.site!.door)
    for (const seat of seats) {
      const plan = shrineVisitPlan(map, 0, 0, new Set(seats.filter(s => s.id !== seat.id).map(s => s.id)))!
      expect(plan.seat).toBe(seat.id)
      expect(plan.route.at(-1)).toEqual(seat.tile)
      for (let i = 1; i < plan.route.length; i++) {
        const from = plan.route[i - 1], to = plan.route[i], last = i === plan.route.length - 1
        expect(buildingStepAllowed(map, map.buildings, from, to, true)).toBe(!last)
        expect(buildingStepAllowed(map, map.buildings, from, to, true, seat.id)).toBe(true)
        expect(buildingStepAllowed(map, map.buildings, to, from, true, seat.id)).toBe(true)
      }
      const dx = Math.round(Math.sin(seat.heading)), dz = Math.round(Math.cos(seat.heading))
      expect(buildingStepAllowed(map, map.buildings,
        { x: seat.tile.x - dx, z: seat.tile.z - dz }, { x: seat.tile.x + dx, z: seat.tile.z + dz }, true)).toBe(false)
    }
  })

  it.each([0, 1, 2, 3])("keeps every altar position reachable without crossing a kneeler (view %i)", direction => {
    const map = fixture(direction), shrine = map.buildings[0], layout = shrineLayout(shrine, map.site!.door)
    const wander = monkWander(map)
    expect(wander.prayerSpots).toHaveLength(4)
    const door = wander.spots.find(p => p.x === tileToWorldX(map, map.site!.door.x) && p.z === tileToWorldZ(map, map.site!.door.z))!
    const tile = (p: WanderSpot): TilePos => ({ x: p.x + map.width / 2 - .5, z: p.z + map.depth / 2 - .5 })
    const clear = (p: TilePos) => {
      const x = p.x - shrine.x - Math.floor(shrine.w / 2), z = p.z - shrine.z - Math.floor(shrine.d / 2)
      const localX = x * Math.cos(layout.rotation) - z * Math.sin(layout.rotation)
      const localZ = x * Math.sin(layout.rotation) + z * Math.cos(layout.rotation)
      for (const kneeler of shrineKneelers(layout.width, layout.depth)) {
        expect(Math.abs(localX - kneeler.x) < kneeler.length / 2 + .08 && Math.abs(localZ - (kneeler.z - .1)) < .32).toBe(false)
      }
    }
    for (const from of [door, ...wander.prayerSpots]) for (const to of [door, ...wander.prayerSpots]) {
      const route = wander.route(from, to)
      expect(route.at(-1)).toEqual(to)
      for (let i = 1; i < route.length; i++) {
        const a = tile(route[i - 1]), b = tile(route[i])
        expect(buildingStepAllowed(map, map.buildings, a, b, true)).toBe(true)
        for (let t = 0; t <= 1; t += .05) clear({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })
        // Returning the relic can replan from any point along an interior step.
        const mid = { x: (route[i - 1].x + route[i].x) / 2, y: route[i].y, z: (route[i - 1].z + route[i].z) / 2 }
        const back = wander.route(mid, door)
        expect(back.at(-1)).toEqual(door)
        const first = tile(back[0]), start = tile(mid)
        for (let t = 0; t <= 1; t += .05) clear({ x: start.x + (first.x - start.x) * t, z: start.z + (first.z - start.z) * t })
      }
    }
  })
})
