import { expect, it } from "vitest"
import { workerRoute } from "./construction"
import { createFootpaths } from "./footpaths"
import { tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./map/types"
import { exploresWorkerShortcut } from "./walking-shortcuts"
import { rememberedWorkerCorridor, rememberedWorkerRoute, withWorkerRouteMemory, workerRouteMemoryStats } from "./worker-route-memory"
import { settlementRoute } from "./settlement-route"

function fixture() {
  const map: GameMap = { width: 16, depth: 16, seed: 42, tiles: Array(256).fill("grass"), buildings: [] }
  for (let x = 2; x <= 10; x++) map.tiles[2 * 16 + x] = "path"
  map.footpaths = createFootpaths(map)
  const start = { x: 2, z: 2 }, goal = { x: 10, z: 2 }
  const actor = { id: 1, x: tileToWorldX(map, 2), y: .2, z: tileToWorldZ(map, 2) }
  return { map, start, goal, actor }
}

it("shares a route while each NPC consumes an independent waypoint array", () => {
  const { map, actor, goal } = fixture()
  const expected = workerRoute(map, actor, goal)!
  withWorkerRouteMemory(map, 0, () => {
    expect(workerRoute(map, actor, goal)).toEqual(expected)
    const route = workerRoute(map, actor, goal)!
    route.shift(); route[0].x = 1000
    expect(workerRoute(map, actor, goal)).toEqual(expected)
  })
  expect(workerRouteMemoryStats(map)).toMatchObject({ routes: 1, planned: 1, reused: 2 })
})

it("rejects a remembered path through a newly placed wall without waiting for refresh", () => {
  const { map, actor, goal } = fixture()
  withWorkerRouteMemory(map, 0, () => workerRoute(map, actor, goal))
  map.buildings.push({ id: "wall", label: "Wall", x: 6, z: 2, w: 1, d: 1, height: 1, color: "", roofColor: "" })
  const expected = workerRoute(structuredClone(map), actor, goal)
  expect(withWorkerRouteMemory(map, 1, () => workerRoute(map, actor, goal))).toEqual(expected)
  expect(workerRouteMemoryStats(map).invalidated).toBe(1)
})

it("checks changed ground and shortcut clearance before reuse", () => {
  const { map, start, actor } = fixture(), goal = { x: 8, z: 8 }
  actor.id = Array.from({ length: 32 }, (_, id) => id).find(id => exploresWorkerShortcut(map, id, start, goal))!
  withWorkerRouteMemory(map, 0, () => workerRoute(map, actor, goal))
  for (let z = 3; z < 7; z++) map.tiles[z * 16 + 5] = "water"
  const expected = workerRoute(structuredClone(map), actor, goal)
  expect(withWorkerRouteMemory(map, 1, () => workerRoute(map, actor, goal))).toEqual(expected)
  expect(workerRouteMemoryStats(map).invalidated).toBe(1)
})

it("refreshes in game time, separates preferences, and releases its scope after failure", () => {
  const { map, start, goal, actor } = fixture(), points = workerRoute(map, actor, goal)!
  let plans = 0
  const route = (exploring = false) => rememberedWorkerRoute(map, start, goal, exploring, () => { plans++; return points.map(p => ({ ...p })) })
  withWorkerRouteMemory(map, 0, () => { route(); route(true) })
  expect(plans).toBe(2)
  withWorkerRouteMemory(map, 29, () => route())
  expect(plans).toBe(2)
  withWorkerRouteMemory(map, 30, () => route())
  expect(plans).toBe(3)
  expect(() => withWorkerRouteMemory(map, 31, () => { throw new Error("cancelled") })).toThrow("cancelled")
  route() // Direct/editor calls always replan, even while memory is warm.
  expect(plans).toBe(4)
  withWorkerRouteMemory(map, 0, () => route()) // A rewound clock cannot reuse the future.
  expect(plans).toBe(5)
})

it("reuses learned suffixes for different starts and refreshes a newly blocked destination tree", () => {
  const { map, start, goal } = fixture()
  let searches = 0
  const from = (point: TilePos) => rememberedWorkerCorridor(map, point, goal, () => {
    searches++; return settlementRoute(map, map.buildings, point, goal, false, true)
  })
  withWorkerRouteMemory(map, 0, () => {
    const route = from(start)!
    expect(searches).toBe(1)
    for (let i = 1; i < route.length; i++) expect(from(route[i])).toEqual(route.slice(i))
    expect(searches).toBe(1)
    const own = from(route[3])!; own[0].x = 1000
    expect(from(route[3])).toEqual(route.slice(3))
  })
  map.tiles[2 * 16 + 6] = "water"
  const mid = { x: 4, z: 2 }
  const expected = settlementRoute(map, map.buildings, mid, goal, false, true)
  expect(withWorkerRouteMemory(map, 1, () => from(mid))).toEqual(expected)
  expect(searches).toBe(2)
})

it("attaches intersecting learned branches without loops or shared mutable output", () => {
  const { map, goal } = fixture()
  withWorkerRouteMemory(map, 0, () => {
    for (let x = 1; x < 15; x++) for (let z = 1; z < 15; z++) {
      const start = { x, z }
      const route = rememberedWorkerCorridor(map, start, goal,
        () => settlementRoute(map, map.buildings, start, goal, false, true))!
      expect(route[0]).toEqual(start); expect(route.at(-1)).toEqual(goal)
      expect(new Set(route.map(p => p.z * map.width + p.x)).size).toBe(route.length)
      for (let i = 1; i < route.length; i++) expect(Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].z - route[i - 1].z)).toBe(1)
    }
  })
  expect(workerRouteMemoryStats(map).corridorReused).toBeGreaterThan(0)
})

it("does not renew the age of a learned corridor when caching a new worker's smoothed route", () => {
  const { map, actor, goal } = fixture()
  withWorkerRouteMemory(map, 0, () => workerRoute(map, actor, goal))
  const other = { ...actor, x: tileToWorldX(map, 4) }
  withWorkerRouteMemory(map, 29, () => workerRoute(map, other, goal))
  expect(workerRouteMemoryStats(map).corridorReused).toBe(1)
  expect(workerRouteMemoryStats(map).corridorPlanned).toBe(1)
  withWorkerRouteMemory(map, 30, () => workerRoute(map, other, goal))
  expect(workerRouteMemoryStats(map).corridorPlanned).toBe(2)
})
