import { describe, expect, it } from "vitest"
import { advanceWorld, createPathWorld, DEFAULT_PATH_SETTINGS as defaults, edgeLength, indexAt, LAB_DAY, pathEdgeIndex, recurringRoute, sharedTrailStrength, walkJourney, worldStats, type PathWorld } from "./simulation"
import { DEFAULT_PERMUTATION } from "./permutations"

function emptyWorld() {
  const world = createPathWorld("routes")
  for (const field of [world.wear, world.edgeWear, world.edgeUsers, world.pathLinks, world.blocked, world.terrainCost]) field.fill(0)
  return world
}
function walk(world: PathWorld, route: number[], id: number) {
  walkJourney(world, { id, route, edge: 0, progress: 0, returning: false, through: false }, 100, defaults.wear, 0)
}
function overlap(route: number[], other: number[]) {
  const edges = new Set(other.slice(1).map((to, n) => pathEdgeIndex(other[n], to)))
  return route.slice(1).reduce((sum, to, n) => sum + (edges.has(pathEdgeIndex(route[n], to)) ? edgeLength(route[n], to) : 0), 0)
}

describe("commuters sharing paths", () => {
  it("joins another commuter's repeated route despite having different endpoints and a remembered route", () => {
    const policy = { ...defaults, turnPenalty: 0 }
    const world = emptyWorld()
    const leader = recurringRoute(world, indexAt(4, 5), indexAt(24, 10), policy, 0)!
    const start = indexAt(4, 6), end = indexAt(24, 11)
    const original = recurringRoute(world, start, end, policy, 1)!
    walk(world, leader, 0)
    expect(recurringRoute(world, start, end, policy, 1)).toEqual(original)
    for (let i = 0; i < 19; i++) walk(world, leader, 0)
    const follower = recurringRoute(world, start, end, policy, 1)!
    expect(overlap(follower, leader)).toBeGreaterThan(overlap(original, leader) + 10)
    expect(overlap(recurringRoute(world, end, start, policy, 2)!, leader)).toBeGreaterThan(10)
    world.shared = false
    expect(recurringRoute(world, start, end, policy, 1)).toEqual(original)
  })

  it("reinforces gradually through walking and counts other commuters in either direction", () => {
    const world = emptyWorld(), route = [indexAt(4, 4), indexAt(5, 5), indexAt(6, 6)]
    recurringRoute(world, route[0], route[2], defaults, 0)
    expect(world.edgeWear.every(wear => wear === 0)).toBe(true)
    walk(world, route, 0)
    expect(sharedTrailStrength(world, route[0], route[1])).toBe(0)
    for (let i = 0; i < 6; i++) walk(world, route, 0)
    const shallow = sharedTrailStrength(world, route[0], route[1])
    expect(shallow).toBeGreaterThan(0)
    expect(shallow).toBeLessThan(.5)
    walk(world, [...route].reverse(), 12) // Same repeating commuter returning.
    expect(worldStats(world).sharedTravel).toBe(0)
    walk(world, [...route].reverse(), 1)
    expect(worldStats(world).sharedTravel).toBeCloseTo(1 / 9)
    for (let i = 0; i < 20; i++) walk(world, route, 0)
    expect(sharedTrailStrength(world, route[0], route[1])).toBe(1)
  })

  it("loses attraction on an abandoned segment even when crossing traffic keeps its endpoints worn", () => {
    const world = emptyWorld(), route = [indexAt(4, 4), indexAt(5, 5)]
    for (let i = 0; i < 40; i++) walk(world, route, 0)
    expect(sharedTrailStrength(world, ...route as [number, number])).toBe(1)
    advanceWorld(world, LAB_DAY * 6, { ...defaults, traffic: 0, halfLife: 1 })
    route.forEach(i => { world.wear[i] = 1 })
    expect(sharedTrailStrength(world, ...route as [number, number])).toBe(0)
  })

  it.each([1, 2, 17])("increases shared travel across local destinations on scattered seed %i", seed => {
    const permutation = { ...DEFAULT_PERMUTATION, seed, sources: "local" as const, destinations: 8 }
    const independent = createPathWorld("routes", defaults, false, permutation)
    const shared = createPathWorld("routes", defaults, true, permutation)
    advanceWorld(independent, LAB_DAY * 5, defaults)
    advanceWorld(shared, LAB_DAY * 5, defaults)
    expect(shared.serial).toBe(independent.serial)
    expect(worldStats(shared).sharedTravel).toBeGreaterThan(worldStats(independent).sharedTravel)
  })
})
