import { describe, expect, it } from "vitest"
import { bridgeLayout, BRIDGE_RISE } from "./bridges"
import { straightenRoad } from "./straighten-road"
import { DEFAULT_ELEVATION } from "./elevation"
import type { GameMap } from "./types"

const fixture = (): GameMap => ({ width: 12, depth: 12, tiles: Array(144).fill("grass"), buildings: [] })
const index = (x: number, z: number) => z * 12 + x
const detour = [index(2, 5), index(3, 5), index(3, 4), index(4, 4), index(5, 4), index(5, 5), index(6, 5), index(7, 5)]

describe("initial roads through open land", () => {
  it("draws a straight line across a clear glade instead of inheriting zigzags", () => {
    expect(straightenRoad(fixture(), detour)).toEqual(Array.from({ length: 6 }, (_, i) => index(i + 2, 5)))
  })
  it("regularizes equal-length grid routes and shares their four-connected layout", () => {
    const route = [index(2, 2), index(3, 2), index(4, 2), index(5, 2), index(5, 3), index(5, 4), index(5, 5)]
    const line = straightenRoad(fixture(), route)
    expect(line).not.toEqual(route)
    expect(line).toHaveLength(route.length)
    expect(line[0]).toBe(route[0]); expect(line.at(-1)).toBe(route.at(-1))
    for (let i = 1; i < line.length; i++) {
      expect([1, 12]).toContain(Math.abs(line[i] - line[i - 1]))
      expect(Math.abs(line[i] % 12 - Math.floor(line[i] / 12))).toBeLessThanOrEqual(1)
    }
  })
  it.each(["forest", "darkwood", "water", "bridge"] as const)("keeps a reason to bend around %s", terrain => {
    const map = fixture(); map.tiles[index(4, 5)] = terrain
    const line = straightenRoad(map, detour)
    expect(line).not.toContain(index(4, 5))
    expect(line[0]).toBe(detour[0]); expect(line.at(-1)).toBe(detour.at(-1))
  })
  it("respects buildings and cliff edges", () => {
    const map = fixture()
    map.buildings.push({ id: "rock", x: 4, z: 5, w: 1, d: 1, height: 1, label: "Obstacle", color: "", roofColor: "" })
    expect(straightenRoad(map, detour)).not.toContain(index(4, 5))
    map.buildings = []
    map.elevation = { settings: DEFAULT_ELEVATION, height: Array(144).fill(0), corners: [], cliffs: [], slope: [] }
    map.elevation.height[index(4, 5)] = 3
    expect(straightenRoad(map, detour)).not.toContain(index(4, 5))
  })
  it.each([{ reverse: false, woods: false }, { reverse: true, woods: false }, { reverse: false, woods: true }])("ends a bridge at the bank instead of extending decking along a staircase (%j)", ({ reverse, woods }) => {
    const map = fixture()
    const route = [index(0, 4), index(1, 4), index(2, 4), index(2, 5), index(3, 5), index(3, 6), index(4, 6), index(4, 7), index(5, 7), index(6, 7)]
    map.tiles[index(1, 4)] = "water"
    if (woods) map.tiles[index(2, 4)] = map.tiles[index(3, 4)] = "forest"
    const corrected = straightenRoad(map, reverse ? [...route].reverse() : route)
    for (const i of corrected) map.tiles[i] = map.tiles[i] === "water" ? "bridge" : "path"
    const layout = bridgeLayout(map)
    expect(layout.spans[0].tiles).toEqual([{ x: 1, z: 4 }])
    expect(layout.rise[index(2, 4)]).toBeCloseTo(BRIDGE_RISE / 2)
    expect(layout.rise[index(3, 4)]).toBe(0)
    expect(layout.connectors).toHaveLength(0)
    expect(corrected).toContain(index(3, 4))
  })

  it("retains bridge approaches inside the original route", () => {
    const map = fixture(); map.tiles[detour[3]] = "bridge"
    expect(straightenRoad(map, detour)).toContain(detour[3])
  })

  it.each([false, true])("joins nearby perpendicular crossings without a deck U-turn (reversed: %s)", (reversed) => {
    const map = fixture()
    const route = [[2, 2], [2, 3], [2, 4], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5]]
      .map(([x, z]) => index(x, z))
    const crossings = [index(2, 3), index(2, 4), index(4, 5), index(5, 5)]
    for (const i of crossings) map.tiles[i] = "water"
    if (reversed) route.reverse()
    const line = straightenRoad(map, route)
    expect(new Set(line).size).toBe(line.length)
    expect(line[0]).toBe(route[0]); expect(line.at(-1)).toBe(route.at(-1))
    for (const i of crossings) expect(line).toContain(i)
    for (let i = 1; i < line.length; i++) {
      expect(Math.abs(line[i] % 12 - line[i - 1] % 12)
        + Math.abs(Math.floor(line[i] / 12) - Math.floor(line[i - 1] / 12))).toBe(1)
    }
  })
})
