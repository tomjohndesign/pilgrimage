import { describe, expect, it } from "vitest"
import { routeBounds, ROUTE_EDGE_INSET } from "./route-bounds"
import { routeBlind, eraseRouteLoops } from "./route"
import { straightenRoad } from "./straighten-road"
import type { GameMap } from "./types"

const width = 32, depth = 24
const start = { x: 0, z: 8 }, goal = { x: width - 1, z: 15 }

describe("inland path routing", () => {
  it("reserves an inset and opens only short inward approaches at the endpoints", () => {
    const allowed = routeBounds(start, goal, width, depth)
    for (let x = 0; x < width; x++) expect(allowed(x, 0)).toBe(false)
    for (let z = 0; z < depth; z++) {
      expect(allowed(0, z)).toBe(z === start.z)
      expect(allowed(width - 1, z)).toBe(z === goal.z)
    }
    for (let x = 0; x <= ROUTE_EDGE_INSET; x++) expect(allowed(x, start.z)).toBe(true)
  })
  it("keeps even the fallback and diagonal simplification inland when the border is much cheaper", () => {
    const allowed = routeBounds(start, goal, width, depth)
    const wander = Float64Array.from({ length: width * depth }, (_, i) => i < width * 2 ? 0 : 50)
    const route = routeBlind(start, goal, width, depth, wander, undefined, allowed)
    const map: GameMap = { width, depth, buildings: [], tiles: new Array(width * depth).fill("grass") }
    const straight = straightenRoad(map, route, allowed)
    expect(straight.length).toBeGreaterThan(0)
    expect(straight[0]).toBe(start.z * width + start.x)
    expect(straight.at(-1)).toBe(goal.z * width + goal.x)
    for (const i of straight) expect(allowed(i % width, Math.floor(i / width))).toBe(true)
  })
  it("removes doubled-back bridge spurs before a shrine can be placed at their dead end", () => {
    expect(eraseRouteLoops([1, 2, 3, 4, 5, 4, 3, 2, 6, 7])).toEqual([1, 2, 6, 7])
    expect(eraseRouteLoops([1, 2, 3, 2, 4, 5, 4, 6])).toEqual([1, 2, 4, 6])
  })
  it("does not join two edge destinations by following their shared border", () => {
    const a = { x: 10, z: 0 }, b = { x: 21, z: 0 }, allowed = routeBounds(a, b, width, depth)
    const route = routeBlind(a, b, width, depth, new Float64Array(width * depth), undefined, allowed)
    expect(route.length).toBeGreaterThan(22)
    expect(route.some(i => Math.floor(i / width) >= ROUTE_EDGE_INSET)).toBe(true)
    for (const i of route) if (Math.floor(i / width) < ROUTE_EDGE_INSET) expect([a.x, b.x]).toContain(i % width)
  })
})
