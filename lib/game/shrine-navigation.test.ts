import { describe, expect, it } from "vitest"
import { buildingStepAllowed, shrineFurnitureClear } from "./building-navigation"
import { monkWander, type WanderSpot } from "./monk-wander"
import { shrineLayout, shrineSeats, shrineStations } from "./shrine-layout"
import { shrineExitPlan, shrineQueuePlaces, shrineVisitPlan } from "./shrine-visit"
import { processionGrounds } from "./relic-procession"
import { tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./map/types"

function fixture(direction: number): GameMap {
  const sideways = direction % 2 === 1
  const door = [{ x: 5, z: 9 }, { x: 9, z: 5 }, { x: 5, z: 3 }, { x: 3, z: 5 }][direction]
  return { width: 15, depth: 15, tiles: Array(225).fill("grass"),
    buildings: [{ id: "shrine", x: 4, z: 4, w: sideways ? 5 : 3, d: sideways ? 3 : 5,
      height: 2, label: "Shrine", color: "", roofColor: "" }],
    site: { hovelId: "shrine", door, branch: [door], junction: 0 } }
}

describe("church circulation", () => {
  it.each([0, 1, 2, 3])("keeps prayer, queue and the offering-box exit reachable (view %i)", direction => {
    const map = fixture(direction), shrine = map.buildings[0], seats = shrineSeats(shrine, map.site!.door)
    const stations = shrineStations(shrine, map.site!.door)
    for (const seat of seats) {
      const plan = shrineVisitPlan(map, 0, 0, new Set(seats.filter(s => s.id !== seat.id).map(s => s.id)), undefined, true)!
      expect(plan.seat).toBe(seat.id)
      expect(plan.route.at(-1)).toEqual(seat.tile)
      const exit = shrineExitPlan(map, seat.tile, plan.route)!
      expect(exit.route[exit.offeringProgress]).toEqual(stations.offering)
      for (const route of [plan.route, exit.route]) for (let i = 1; i < route.length; i++)
        expect(buildingStepAllowed(map, map.buildings, route[i - 1], route[i], true)).toBe(true)
    }
    const queue = shrineVisitPlan(map, 0, 0)!
    expect(queue.route.at(-1)).toEqual(stations.viewing)
    const exit = shrineExitPlan(map, stations.viewing, queue.route)!
    expect(exit.route[0]).toEqual(queue.route[0])
    expect(exit.route[exit.offeringProgress]).toEqual(stations.offering)
    for (let i = 1; i < exit.route.length; i++)
      expect(buildingStepAllowed(map, map.buildings, exit.route[i - 1], exit.route[i], true)).toBe(true)
    // The line continues outside the door along the branch; only a full branch turns people away.
    const inside = new Set(Array.from({ length: stations.queueCapacity }, (_, i) => `queue-${i}`))
    expect(shrineQueuePlaces(map)).toBeGreaterThan(stations.queueCapacity)
    expect(shrineVisitPlan(map, 0, 0, inside)?.seat).toBe(`queue-${stations.queueCapacity}`)
    expect(shrineVisitPlan(map, 0, 0, new Set(Array.from({ length: shrineQueuePlaces(map) }, (_, i) => `queue-${i}`)))).toBeNull()
  })

  it.each([0, 1, 2, 3])("keeps every altar position reachable without crossing the altar (view %i)", direction => {
    const map = fixture(direction), shrine = map.buildings[0], layout = shrineLayout(shrine, map.site!.door)
    const wander = monkWander(map)
    expect(wander.prayerSpots).toHaveLength(4)
    const door = wander.spots.find(p => p.x === tileToWorldX(map, map.site!.door.x) && p.z === tileToWorldZ(map, map.site!.door.z))!
    const tile = (p: WanderSpot): TilePos => ({ x: p.x + map.width / 2 - .5, z: p.z + map.depth / 2 - .5 })
    const clear = (p: TilePos) => expect(shrineFurnitureClear(shrine, map.site!.door, p, p)).toBe(true)
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

describe("a footprint on the shrine track", () => {
  /** Shrine at the end of a five-tile track leading down from the road. */
  function approachMap(): GameMap {
    const map: GameMap = { width: 15, depth: 15, tiles: Array(225).fill("grass"),
      buildings: [{ id: "shrine", x: 4, z: 9, w: 3, d: 3, height: 2, label: "Shrine", color: "", roofColor: "" }],
      site: { hovelId: "shrine", door: { x: 5, z: 8 },
        branch: [{ x: 5, z: 4 }, { x: 5, z: 5 }, { x: 5, z: 6 }, { x: 5, z: 7 }, { x: 5, z: 8 }], junction: 5 },
      road: Array.from({ length: 15 }, (_, x) => ({ x, z: 4 })) }
    for (const p of map.road!) map.tiles[p.z * 15 + p.x] = "path"
    for (const p of map.site!.branch.slice(1)) map.tiles[p.z * 15 + p.x] = "track"
    return map
  }

  it("bends the visit route around it instead of walking the old track", () => {
    const map = approachMap()
    const straight = shrineVisitPlan(map, 0, 0)!.route
    expect(straight.slice(0, 5)).toEqual(map.site!.branch)
    const hut = { id: "hut", label: "Hut", x: 5, z: 6, w: 1, d: 1, height: 1, color: "", roofColor: "" }
    const blocked = { ...map, buildings: [...map.buildings, hut] }
    const route = shrineVisitPlan(blocked, 0, 0)!.route
    expect(route.some(p => p.x === hut.x && p.z === hut.z)).toBe(false)
    expect(route[0]).toEqual(map.site!.branch[0])
    expect(route.some(p => p.x === map.site!.door.x && p.z === map.site!.door.z)).toBe(true)
    expect(route.length).toBeGreaterThan(straight.length)
  })

  it("shares a clear road entry when the original junction is covered", () => {
    const map = approachMap()
    map.buildings.push({ id: "cross", label: "Cross", x: 5, z: 4, w: 1, d: 1, height: 1, color: "", roofColor: "" })
    const plan = shrineVisitPlan(map, 0, 0)!
    expect(plan.route[0]).toEqual({ x: 4, z: 4 })
    expect(plan.route.some(p => p.x === 5 && p.z === 4)).toBe(false)
    const procession = processionGrounds(map)!
    expect(procession.branch.at(-1)).toMatchObject({ x: tileToWorldX(map, 4), z: tileToWorldZ(map, 4) })
    const from = { x: 8, z: 4 }
    expect(shrineVisitPlan(map, 0, 0, new Set(), from)!.route[0]).toEqual(from)
  })

  it("declines a visit when the approach is sealed instead of falling back through walls", () => {
    const map = approachMap()
    for (let x = 0; x < map.width; x++) map.tiles[6 * map.width + x] = "water"
    expect(shrineVisitPlan(map, 0, 0)).toBeNull()
  })
})
