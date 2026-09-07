import { describe, expect, it } from "vitest"
import { roadSegmentWear } from "../game/render/road-segments"
import { roadWear } from "../game/map/road"
import { createTown } from "./town"
import { townRoadSegments } from "./town-roads"
import { advanceWorld, indexAt, LAB_DAY, pathEdgeIndex, recordPathEdge } from "./simulation"

describe("the village's real road surfaces", () => {
  it("renders only crossed edges, with continuous diagonal coordinates on both sides of a tile boundary", () => {
    const town = createTown(), a = indexAt(8, 8), b = indexAt(9, 9)
    town.world.wear[a] = town.world.wear[b] = .8
    expect(townRoadSegments(town.world, town.map).has(a)).toBe(false)
    recordPathEdge(town.world, a, b)
    town.world.edgeWear[pathEdgeIndex(a, b)] = .8
    const bins = townRoadSegments(town.world, town.map)
    expect(bins.get(a)).toEqual([[.5, .5, 1.5, 1.5, 2, .8]])
    expect(bins.get(b)).toEqual([[-.5, -.5, .5, .5, 2, .8]])
    town.world.blocked[indexAt(9, 8)] = 1
    expect(townRoadSegments(town.world, town.map).has(a)).toBe(false)
  })

  it("preserves per-segment wear regardless of global traffic, retaining the original road policy by default", () => {
    const shallow = [0, 0, 1, 1, 2, .04] as const, deep = [0, 0, 1, 1, 2, .9] as const
    expect(roadSegmentWear(shallow, 0, 0, 0)).toEqual(roadSegmentWear(shallow, 120, 120, 0))
    const light = roadSegmentWear(shallow, 0, 0, 0), worn = roadSegmentWear(deep, 0, 0, 0)
    expect(worn[0]).toBeLessThan(light[0]); expect(worn[1]).toBeGreaterThan(light[1]); expect(worn[3]).toBeGreaterThan(light[3])
    const main = roadWear(10), branch = roadWear(3)
    expect(roadSegmentWear([0, 0, 1, 1, 0], 10, 3, 0)).toEqual([main.edge, main.inner, 0, 1])
    expect(roadSegmentWear([0, 0, 1, 1, 1], 10, 3, 0)).toEqual([branch.edge, branch.inner, 1, 1])
  })

  it("keeps the surface off building footprints and drops fully regrown segments", () => {
    const town = createTown(), a = indexAt(4, 6), b = indexAt(4, 7)
    town.world.wear[a] = town.world.wear[b] = .5
    recordPathEdge(town.world, a, b); town.world.edgeWear[pathEdgeIndex(a, b)] = .5
    const bins = townRoadSegments(town.world, town.map)
    expect(bins.has(a)).toBe(true)
    expect(bins.has(indexAt(5, 6))).toBe(false) // Neighboring cottage.
    advanceWorld(town.world, LAB_DAY * 5, { traffic: 0, halfLife: .25, preference: .8, newPathCost: 1, turnPenalty: .4, permanentAt: .9, roadFloor: .3, wear: .04 })
    expect(townRoadSegments(town.world, town.map).has(a)).toBe(false)
  })
})
