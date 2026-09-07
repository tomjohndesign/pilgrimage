import { describe, expect, it } from "vitest"
import { createPathWorld, DEFAULT_PATH_SETTINGS, edgeLength, findRoute, indexAt, journeyPosition, labBuilding, placementIssue, pathEdgeIndex, recordPathEdge, recurringRoute, ROAD_Z, routeClear, stepAllowed, updateNetwork, walkJourney, type Journey } from "./simulation"
import { pathCoverage, SURFACE_WIDTH } from "./road-surface"

const settings = { ...DEFAULT_PATH_SETTINGS, traffic: 0, preference: 0 }
function emptyWorld() {
  const world = createPathWorld("routes", settings)
  world.blocked.fill(0); world.wear.fill(0); world.pathLinks.fill(0); world.edgeWear.fill(0); world.edgeUsers.fill(0); world.terrainCost.fill(0)
  world.buildings = []; updateNetwork(world)
  return world
}
const journey = (route: number[]): Journey => ({ id: 0, route, edge: 0, progress: 0, returning: false, through: false })

describe("diagonal paths", () => {
  it("takes a direct diagonal with its real distance", () => {
    const world = emptyWorld()
    const route = findRoute(world, indexAt(4, 4), indexAt(8, 8), settings)!
    expect(route).toEqual([4, 5, 6, 7, 8].map(n => indexAt(n, n)))
    expect(route.slice(1).reduce((distance, i, n) => distance + edgeLength(route[n], i), 0)).toBeCloseTo(4 * Math.SQRT2)
  })

  it.each([indexAt(5, 4), indexAt(4, 5)])("does not cut the corner of obstacle %i", obstacle => {
    const world = emptyWorld(), start = indexAt(4, 4), end = indexAt(5, 5)
    world.blocked[obstacle] = 1
    expect(stepAllowed(world.blocked, start, end)).toBe(false)
    const route = findRoute(world, start, end, settings)!
    expect(route).toHaveLength(3)
    expect(routeClear(route, world.blocked)).toBe(true)
  })

  it("preserves physical speed and deposits wear only along the diagonal crossing", () => {
    const world = emptyWorld(), start = indexAt(4, 4), end = indexAt(5, 5), j = journey([start, end])
    expect(walkJourney(world, j, 1, .1)).toBe(false)
    expect(j.progress).toBeCloseTo(1 / Math.SQRT2)
    expect(journeyPosition(j)).toEqual({ x: 4 + j.progress, z: 4 + j.progress })
    expect(world.wear[start] + world.wear[end]).toBeCloseTo(.1)
    expect(world.wear[indexAt(5, 4)]).toBe(0)
    expect(world.wear[indexAt(4, 5)]).toBe(0)
    expect(walkJourney(world, j, Math.SQRT2 - 1, .1)).toBe(true)
    expect(world.wear[start]).toBeCloseTo(Math.SQRT2 * .05)
    expect(world.wear[end]).toBeCloseTo(Math.SQRT2 * .05)
  })

  it("connects established diagonal trails, except through blocked corners", () => {
    const world = emptyWorld()
    const a = indexAt(4, ROAD_Z), b = indexAt(5, ROAD_Z - 1), c = indexAt(6, ROAD_Z - 2)
    for (const i of [a, b, c]) world.wear[i] = .8
    updateNetwork(world)
    expect(world.connected[c]).toBe(1)
    world.blocked[indexAt(6, ROAD_Z - 1)] = 2
    updateNetwork(world)
    expect(world.connected[c]).toBe(0)
  })

  it("invalidates a remembered diagonal when its side tile becomes blocked", () => {
    const world = emptyWorld(), start = indexAt(4, 4), end = indexAt(6, 6)
    expect(recurringRoute(world, start, end, settings, 0)).toHaveLength(3)
    world.blocked[indexAt(5, 4)] = 1
    const rerouted = recurringRoute(world, start, end, settings, 0)!
    expect(rerouted.length).toBeGreaterThan(3)
    expect(routeClear(rerouted, world.blocked)).toBe(true)
  })

  it("protects both a live diagonal step and an established trail during placement", () => {
    const world = emptyWorld(), a = indexAt(5, 5), b = indexAt(6, 6)
    // Neither footprint contains the endpoints; it covers the southeast flank of the step.
    const building = labBuilding(6, 4, "workshop", 3, 0)
    world.journeys.push(journey([a, b]))
    expect(placementIssue(world, building, settings)).toMatch(/corner/)
    world.journeys = []
    world.wear[a] = world.wear[b] = .8
    recordPathEdge(world, a, b); updateNetwork(world)
    expect(placementIssue(world, building, settings)).toMatch(/diagonal/)
  })

  it("renders a continuous diagonal only after the edge has been crossed", () => {
    const world = emptyWorld(), a = indexAt(4, 4), b = indexAt(5, 5)
    world.wear[a] = world.wear[b] = .8
    // Pixel at the shared corner, well away from either tile centre.
    const corner = 60 * SURFACE_WIDTH + 60
    expect(pathCoverage(world)[corner]).toBe(0)
    recordPathEdge(world, a, b); world.edgeWear[pathEdgeIndex(a, b)] = .8
    expect(pathCoverage(world)[corner]).toBeCloseTo(.8)
    world.blocked[indexAt(5, 4)] = 1
    expect(pathCoverage(world)[corner]).toBe(0)
  })
})
