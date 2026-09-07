import { describe, expect, it } from "vitest"
import { advanceWorld, createPathWorld, DEFAULT_PATH_SETTINGS as defaults, edgeLength, ESTABLISH, findRoute, indexAt, LAB_DAY, pathEdgeIndex, recurringRoute, ROAD_Z, routeClear, routeCost, walkJourney, type PathWorld } from "./simulation"

const settings = { ...defaults, traffic: 0, preference: 0, turnPenalty: 0, newPathCost: 0, permanentAt: 0 }
function emptyWorld() {
  const world = createPathWorld("routes", settings)
  for (const field of [world.wear, world.edgeWear, world.pathLinks, world.blocked, world.terrainCost]) field.fill(0)
  return world
}
function walk(world: PathWorld, route: number[], repetitions: number, permanentAt = 0) {
  for (let id = 0; id < repetitions; id++) walkJourney(world, { id, route, edge: 0, progress: 0, returning: false, through: false }, 100, .1, permanentAt)
}
function turns(route: number[]) {
  return route.slice(2).filter((to, n) => to - route[n + 1] !== route[n + 1] - route[n]).length
}

describe("new ground and turns", () => {
  it("favors a modest existing detour independently of deep-path preference, then releases it after regrowth", () => {
    const world = emptyWorld(), start = indexAt(4, 4), end = indexAt(10, 4)
    const trail = [start, ...Array.from({ length: 7 }, (_, x) => indexAt(x + 4, 5)), end]
    walk(world, trail, 6)
    const direct = recurringRoute(world, start, end, settings, 0)!
    expect(direct).toHaveLength(7)
    const penalty = { ...settings, newPathCost: 1 }
    const preferred = recurringRoute(world, start, end, penalty, 0)!
    expect(preferred.some(i => Math.floor(i / 34) === 5)).toBe(true)
    expect(routeCost(world, preferred, penalty)).toBeLessThan(routeCost(world, direct, penalty))
    expect(findRoute(world, start, indexAt(13, 4), penalty)?.at(-1)).toBe(indexAt(13, 4))
    world.shared = false
    expect(findRoute(world, start, end, penalty)).toEqual(direct)
    world.shared = true
    advanceWorld(world, LAB_DAY * 6, { ...penalty, halfLife: .5 })
    expect(recurringRoute(world, start, end, penalty, 0)).toEqual(direct)
  })

  it.each([0, 1, 7])("reduces commuter %i's bends while retaining diagonal distance and updating memory", commuter => {
    const world = emptyWorld(), start = indexAt(4, 4), end = indexAt(20, 10)
    const before = recurringRoute(world, start, end, settings, commuter)!
    const smooth = { ...settings, turnPenalty: 1 }
    const after = recurringRoute(world, start, end, smooth, commuter)!
    expect(turns(after)).toBe(1)
    expect(turns(after)).toBeLessThan(turns(before))
    expect(after.slice(1).reduce((distance, to, n) => distance + edgeLength(after[n], to), 0)).toBeCloseTo(10 + 6 * Math.SQRT2)
    expect(routeCost(world, after, smooth, commuter)).toBeLessThan(routeCost(world, before, smooth, commuter))
    world.blocked[after[5]] = 1
    expect(routeClear(recurringRoute(world, start, end, smooth, commuter)!, world.blocked)).toBe(true)
  })
})

describe("permanent paths", () => {
  it("earns permanence only through actual segment traffic and keeps diagonal frontage after abandonment", () => {
    const world = emptyWorld(), route = [indexAt(4, ROAD_Z), indexAt(5, ROAD_Z - 1), indexAt(6, ROAD_Z - 2)]
    const edge = pathEdgeIndex(route[0], route[1]), policy = { ...settings, permanentAt: .75 }
    findRoute(world, route[0], route[2], policy)
    expect(world.permanentEdges[edge]).toBe(0)
    walk(world, route, 7, policy.permanentAt)
    expect(world.permanentEdges[edge]).toBe(0)
    walk(world, route, 1, policy.permanentAt)
    expect(world.permanentEdges[edge]).toBe(1)
    // A later threshold change (even Never) does not revoke earned permanence.
    advanceWorld(world, LAB_DAY * 10, { ...settings, halfLife: .25 })
    expect(world.edgeWear[edge]).toBeCloseTo(ESTABLISH)
    expect(world.wear[route[2]]).toBeCloseTo(ESTABLISH)
    expect(world.connected[route[2]]).toBe(1)
    const fresh = createPathWorld("routes", settings)
    expect(fresh.permanentEdges.every(value => !value)).toBe(true)
  })

  it("lets both light traces and fully worn paths without permanence disappear", () => {
    const world = emptyWorld(), light = [indexAt(4, 4), indexAt(5, 4)], disabled = [indexAt(10, 10), indexAt(11, 10)]
    walk(world, light, 2, .9)
    walk(world, disabled, 30)
    advanceWorld(world, LAB_DAY * 6, { ...settings, halfLife: .25 })
    for (const route of [light, disabled]) {
      expect(world.edgeWear[pathEdgeIndex(route[0], route[1])]).toBe(0)
      expect(world.wear[route[0]]).toBe(0)
    }
    expect(world.permanentEdges.every(value => !value)).toBe(true)
  })
})
