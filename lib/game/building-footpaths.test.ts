import { describe, expect, it } from "vitest"
import { syncBuildingFootpaths } from "./building-footpaths"
import { buildingEntry } from "./building-rotation"
import { createFootpaths, footpathEdgeKey, footpathRoadSegments, footpathRouteCost, recordWalkingPath, regrowFootpaths } from "./footpaths"
import { settlementRoute } from "./settlement-route"
import { workerRoute } from "./construction"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap, type TilePos } from "./map/types"

function fixture() {
  const building: BuildingDef = { id: "house", buildType: "house", label: "House", x: 8, z: 7, w: 2, d: 2, height: 1, color: "tan", roofColor: "brown",
    construction: { work: 0, required: 10 } }
  const map: GameMap = { width: 16, depth: 16, tiles: Array(256).fill("grass"), buildings: [building],
    site: { hovelId: "shrine", junction: 0, branch: [], door: { x: 2, z: 2 } }, footpaths: createFootpaths() }
  return { map, building, paths: map.footpaths! }
}
const world = (map: GameMap, p: TilePos) => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z), y: .2 })

describe("invisible building paths", () => {
  it("joins every well side with an invisible loop that foot traffic wears into a path", () => {
    const { map, building, paths } = fixture()
    building.buildType = "well"
    syncBuildingFootpaths(map)
    expect(footpathRoadSegments(map, paths).size).toBe(0)
    expect(paths.edges.size).toBe(0)
    const corners = [{ x: 7, z: 6 }, { x: 10, z: 6 }, { x: 10, z: 9 }, { x: 7, z: 9 }]
    for (let side = 0; side < 4; side++) {
      const start = corners[side], end = corners[(side + 1) % 4]
      const route = settlementRoute(map, map.buildings, start, end)!
      expect(route).toHaveLength(4)
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i]
        expect(footpathRouteCost(map, a, b)).toBe(1)
        expect(footpathRouteCost(map, b, a)).toBe(1)
        for (let pass = 0; pass < 30; pass++) recordWalkingPath(paths, map, world(map, a), world(map, b))
        expect(paths.edges.get(footpathEdgeKey(a.z * map.width + a.x, b.z * map.width + b.x))?.wear).toBe(1)
      }
    }
    expect(footpathRoadSegments(map, paths).size).toBeGreaterThan(0)
  })

  it("leaves blocked perimeter stretches out while keeping the other well sides connected", () => {
    const { map, building, paths } = fixture()
    building.buildType = "well"
    // Isolate perimeter planning from the settlement's connecting route.
    map.site = undefined
    map.tiles[6 * map.width + 8] = "water"
    map.buildings = [...map.buildings, { ...building, id: "neighbor", buildType: "house", x: 10, z: 7, w: 1, d: 1 }]
    syncBuildingFootpaths(map)
    for (const [a, b] of [
      [{ x: 7, z: 6 }, { x: 8, z: 6 }],
      [{ x: 8, z: 6 }, { x: 9, z: 6 }],
      [{ x: 10, z: 6 }, { x: 10, z: 7 }],
      [{ x: 10, z: 7 }, { x: 10, z: 8 }],
    ]) expect(paths.planned.has(footpathEdgeKey(a.z * map.width + a.x, b.z * map.width + b.x))).toBe(false)
    expect(footpathRouteCost(map, { x: 8, z: 9 }, { x: 9, z: 9 })).toBe(1)
    expect(footpathRouteCost(map, { x: 7, z: 7 }, { x: 7, z: 8 })).toBe(1)
    expect(paths.contacts.size).toBe(0)
  })

  it("guides NPCs from placement, stays invisible until walked, and wears into dirt", () => {
    const { map, building, paths } = fixture(), tiles = [...map.tiles]
    syncBuildingFootpaths(map)
    expect(paths.planned.size).toBeGreaterThan(0)
    expect(paths.contacts.size).toBe(0)
    expect(paths.edges.size).toBe(0)
    expect(footpathRoadSegments(map, paths).size).toBe(0)
    expect(map.tiles).toEqual(tiles)
    const route = settlementRoute(map, map.buildings, map.site!.door, buildingEntry(building))!
    for (let i = 1; i < route.length; i++) expect(footpathRouteCost(map, route[i - 1], route[i])).toBe(1)
    const walking = workerRoute(map, world(map, map.site!.door), buildingEntry(building))!
    expect(walking).not.toBeNull()
    for (let pass = 0; pass < 30; pass++) {
      let from = world(map, map.site!.door)
      for (const to of walking) {
        const start = from, steps = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / .2)
        for (let step = 1; step <= steps; step++) {
          const next = { x: start.x + (to.x - start.x) * step / steps, z: start.z + (to.z - start.z) * step / steps }
          recordWalkingPath(paths, map, from, next)
          from = { ...next, y: .2 }
        }
      }
    }
    expect(footpathRoadSegments(map, paths).size).toBeGreaterThan(0)
    expect([...paths.contacts.values()].some(contact => contact.wear > .8)).toBe(true)
    regrowFootpaths(paths, 100)
    expect(paths.contacts.size).toBe(0)
    expect(paths.planned.size).toBeGreaterThan(0)
  })

  it("reroutes around a new footprint and drops demolished connections without erasing wear", () => {
    const { map, paths, building } = fixture()
    syncBuildingFootpaths(map)
    const old = settlementRoute(map, map.buildings, map.site!.door, buildingEntry(building))!
    const blocked = old[Math.floor(old.length / 2)]
    map.buildings = [...map.buildings, { ...building, ...blocked, id: "obstacle", w: 1, d: 1 }]
    syncBuildingFootpaths(map)
    const route = settlementRoute(map, map.buildings, map.site!.door, buildingEntry(building))!
    expect(route).not.toContainEqual(blocked)
    for (const neighbor of old) expect(paths.planned.has(footpathEdgeKey(blocked.z * map.width + blocked.x, neighbor.z * map.width + neighbor.x))).toBe(false)
    recordWalkingPath(paths, map, world(map, route[0]), world(map, route[1]))
    const wear = structuredClone(paths.contacts)
    map.buildings = []
    syncBuildingFootpaths(map)
    expect(paths.planned.size).toBe(0)
    expect(paths.contacts).toEqual(wear)
  })

  it("does not invent a crossing through water to an unreachable building", () => {
    const { map, paths } = fixture()
    for (let x = 0; x < map.width; x++) map.tiles[5 * map.width + x] = "water"
    syncBuildingFootpaths(map)
    expect(paths.planned.size).toBe(0)
  })
})
