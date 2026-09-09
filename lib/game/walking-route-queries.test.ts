import { describe, expect, it } from "vitest"
import { workerRoute } from "./construction"
import { createFootpaths, footpathEdgeKey, footpathRouteCost } from "./footpaths"
import { withWalkingRouteQueries, walkingRouteQueries } from "./walking-route-queries"
import { exploresWorkerShortcut } from "./walking-shortcuts"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"

function fixture(): GameMap {
  const map: GameMap = { width: 16, depth: 16, seed: 42, tiles: Array(256).fill("grass"), buildings: [] }
  for (let z = 2; z <= 8; z++) map.tiles[z * 16 + 2] = "path"
  for (let x = 2; x <= 8; x++) map.tiles[8 * 16 + x] = "path"
  map.footpaths = createFootpaths(map)
  return map
}

describe("individual journeys with shared route facts", () => {
  it("keeps all nine directed neighbours exact across cost blocks and fresh wear snapshots", () => {
    const map: GameMap = { width: 64, depth: 40, tiles: Array.from({ length: 2560 }, (_, i) => i % 3 ? "grass" : "path"), buildings: [] }
    map.footpaths = createFootpaths(map)
    for (const wear of [.1, .4, .9]) {
      for (let i = 1; i < map.tiles.length; i++) map.footpaths.edges.set(footpathEdgeKey(i - 1, i), { from: i - 1, to: i, wear })
      withWalkingRouteQueries(map, () => {
        const cost = walkingRouteQueries(map)!.edgeCost
        for (let z = 1; z < 39; z++) for (let x = 1; x < 63; x++) {
          const from = { x, z }
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const to = { x: x + dx, z: z + dz }, expected = footpathRouteCost(map, from, to)
            expect(cost(map, from, to)).toBe(expected)
            expect(cost(map, from, to)).toBe(expected)
          }
        }
        const other = fixture(), from = { x: 2, z: 2 }, to = { x: 3, z: 2 }
        expect(cost(other, from, to)).toBe(footpathRouteCost(other, from, to))
      })
    }
  })
  it("gives people on the same journey repeatable choices about pioneering shortcuts", () => {
    const map = fixture(), start = { x: 2, z: 2 }, goal = { x: 8, z: 8 }
    const actor = { x: tileToWorldX(map, 2), y: .2, z: tileToWorldZ(map, 2) }
    const routes = Array.from({ length: 32 }, (_, id) => workerRoute(map, { ...actor, id }, goal)!)
    const explorers = routes.map((_, id) => exploresWorkerShortcut(map, id, start, goal))
    expect(explorers.filter(Boolean)).toHaveLength(4)
    const length = (route: typeof routes[number]) => route.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - route[i].x, p.z - route[i].z), 0)
    for (let id = 0; id < routes.length; id++) {
      expect(workerRoute(map, { ...actor, id }, goal)).toEqual(routes[id])
      if (explorers[id]) expect(length(routes[id])).toBeLessThan(11)
      else expect(length(routes[id])).toBeGreaterThan(11)
    }
    expect(new Set(routes.map(route => JSON.stringify(route))).size).toBeGreaterThan(1)
  })

  it("shares departure calculations without sharing mutable routes or personal choices", () => {
    const map = fixture(), actor = { x: tileToWorldX(map, 2), y: .2, z: tileToWorldZ(map, 2) }, goal = { x: 8, z: 8 }
    const expected = Array.from({ length: 32 }, (_, id) => workerRoute(structuredClone(map), { ...actor, id }, goal))
    withWalkingRouteQueries(map, () => {
      const snapshot = walkingRouteQueries(map)!
      withWalkingRouteQueries(map, () => expect(walkingRouteQueries(map)).toBe(snapshot))
      for (let id = 0; id < 32; id++) expect(workerRoute(map, { ...actor, id }, goal)).toEqual(expected[id])
      const sizes = snapshot.segments.map(entries => entries.size)
      expect(sizes.every(size => size > 0)).toBe(true)
      const route = workerRoute(map, { ...actor, id: 1 }, goal)!
      route.shift(); route[0].x = 1000
      expect(workerRoute(map, { ...actor, id: 1 }, goal)).toEqual(expected[1])
      expect(snapshot.segments.map(entries => entries.size)).toEqual(sizes)
    })
    expect(walkingRouteQueries(map)).toBeUndefined()
  })

  it("discards all answers on exit or failure and reads live changes in the next departure group", () => {
    const map = fixture(), a = { x: 3, z: 8 }, b = { x: 4, z: 8 }
    withWalkingRouteQueries(map, () => expect(walkingRouteQueries(map)!.edgeCost(map, a, b)).toBe(1))
    map.tiles[b.z * 16 + b.x] = "grass"
    withWalkingRouteQueries(map, () => expect(walkingRouteQueries(map)!.edgeCost(map, a, b)).toBe(footpathRouteCost(map, a, b)))
    expect(() => withWalkingRouteQueries(map, () => { throw new Error("cancelled") })).toThrow("cancelled")
    expect(walkingRouteQueries(map)).toBeUndefined()
    const actor = { id: 1, x: tileToWorldX(map, 2), y: .2, z: tileToWorldZ(map, 2) }, goal = { x: 8, z: 8 }
    withWalkingRouteQueries(map, () => workerRoute(map, actor, goal))
    map.buildings.push({ id: "wall", label: "Wall", x: 4, z: 4, w: 3, d: 3, height: 1, color: "", roofColor: "" })
    withWalkingRouteQueries(map, () => expect(workerRoute(map, actor, goal)).toEqual(workerRoute(structuredClone(map), actor, goal)))
  })
})
