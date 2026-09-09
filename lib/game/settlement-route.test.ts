import { describe, expect, it, vi } from "vitest"
import * as footpaths from "./footpaths"
import { settlementRoute } from "./settlement-route"
import { workerRoute } from "./construction"
import { monkWander } from "./monk-wander"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap, type TilePos } from "./map/types"
import type { TerrainId } from "./map/terrain"
import { surfaceHeight } from "./map/bridges"

function fixture(surface: TerrainId = "path"): GameMap {
  const map: GameMap = { width: 12, depth: 12, tiles: Array(144).fill("grass"), buildings: [] }
  for (let x = 2; x <= 8; x++) map.tiles[7 * map.width + x] = surface
  return map
}
const start = { x: 2, z: 6 }, goal = { x: 8, z: 6 }
function world(map: GameMap, p: TilePos) {
  return { x: tileToWorldX(map, p.x), y: surfaceHeight(map, p.x, p.z), z: tileToWorldZ(map, p.z) }
}

describe("characters prefer paths", () => {
  it("reuses a proven shortest route while observing new obstacles and terrain costs", () => {
    const map: GameMap = { width: 24, depth: 24, tiles: Array(576).fill("path"), buildings: [] }
    const start = { x: 2, z: 2 }, goal = { x: 20, z: 20 }
    const first = settlementRoute(map, map.buildings, start, goal)!
    const costs = vi.spyOn(footpaths, "footpathRouteCost")
    try {
      expect(settlementRoute(map, map.buildings, start, goal)).toEqual(first)
      expect(costs.mock.calls.length).toBe(first.length - 1)
      const blocked = first[3]
      map.tiles[blocked.z * map.width + blocked.x] = "water"
      const diverted = settlementRoute(map, map.buildings, start, goal)!
      expect(diverted).not.toContainEqual(blocked)
      const costly = diverted[4]
      map.tiles[costly.z * map.width + costly.x] = "grass"
      const cheaper = settlementRoute(map, map.buildings, start, goal)!
      expect(cheaper).not.toContainEqual(costly)
      const b = cheaper[5]
      map.buildings.push({ id: "hut", label: "Hut", x: b.x, z: b.z, w: 1, d: 1, height: 1, color: "#ccc", roofColor: "#999" })
      expect(settlementRoute(map, map.buildings, start, goal)).not.toContainEqual(b)
      first[0].x = 1000
      expect(settlementRoute(map, map.buildings, start, goal)?.[0]).toEqual(start)
    } finally { costs.mockRestore() }
  })
  it("rejects an isolated nearby destination without searching the largest map", () => {
    const map: GameMap = { width: 512, depth: 512, tiles: Array(512 * 512).fill("grass"), buildings: [] }
    const goal = { x: 258, z: 256 }, start = { x: 254, z: 256 }
    for (let z = 255; z <= 257; z++) for (let x = 257; x <= 259; x++) {
      if (x !== goal.x || z !== goal.z) map.tiles[z * map.width + x] = "water"
    }
    const costs = vi.spyOn(footpaths, "footpathRouteCost")
    try {
      expect(settlementRoute(map, [], start, goal)).toBeNull()
      expect(costs.mock.calls.length).toBeLessThan(1200)
      // Reusing the search storage must still see a newly opened approach.
      map.tiles[256 * map.width + 257] = "grass"
      expect(settlementRoute(map, [], start, goal)).toHaveLength(5)
      expect(settlementRoute(map, [], goal, start)).toHaveLength(5)
    } finally { costs.mockRestore() }
  })

  it("rejects a larger disconnected clearing before a map-wide search", () => {
    const map: GameMap = { width: 512, depth: 512, tiles: Array(512 * 512).fill("grass"), buildings: [] }
    for (let z = 240; z <= 274; z++) for (let x = 240; x <= 274; x++) {
      if (x === 240 || x === 274 || z === 240 || z === 274) map.tiles[z * 512 + x] = "water"
    }
    const costs = vi.spyOn(footpaths, "footpathRouteCost")
    try {
      expect(settlementRoute(map, [], { x: 239, z: 257 }, { x: 257, z: 257 })).toBeNull()
      expect(costs.mock.calls.length).toBeLessThan(1200)
      map.tiles[257 * 512 + 240] = "grass"
      expect(settlementRoute(map, [], { x: 239, z: 257 }, { x: 257, z: 257 })).toHaveLength(19)
    } finally { costs.mockRestore() }
  })

  it("keeps reachable long detours, including leaving impassable starting ground", () => {
    const map: GameMap = { width: 80, depth: 80, tiles: Array(80 * 80).fill("grass"), buildings: [] }
    for (let z = 1; z < 80; z++) map.tiles[z * 80 + 40] = "water"
    const start = { x: 39, z: 70 }, goal = { x: 41, z: 70 }
    map.tiles[start.z * 80 + start.x] = "forest"
    const route = settlementRoute(map, [], start, goal)!
    expect(route).toHaveLength(143)
    expect(route[0]).toEqual(start)
    expect(route.at(-1)).toEqual(goal)
    expect(route.slice(1).every(p => tileAt(map, p.x, p.z) === "grass")).toBe(true)
    expect(settlementRoute(map, [], start, goal)).toEqual(route)
  })

  it.each(["path", "track", "bridge"] as TerrainId[])("takes a modest %s detour instead of cutting across grass", surface => {
    const map = fixture(surface)
    const route = settlementRoute(map, [], start, goal)!
    expect(route).toHaveLength(9)
    expect(route.filter(p => tileAt(map, p.x, p.z) === surface)).toHaveLength(7)
    expect(route.at(-1)).toEqual(goal)
    const worker = workerRoute(map, world(map, start), goal)!
    expect(worker.map(p => ({ x: worldToTileX(map, p.x), z: worldToTileZ(map, p.z) }))).toEqual(route)
  })

  it("crosses open ground when there is no useful path", () => {
    const map = fixture()
    for (let x = 2; x <= 8; x++) { map.tiles[7 * map.width + x] = "grass"; map.tiles[x] = "path" }
    const route = settlementRoute(map, [], start, goal)!
    expect(route).toHaveLength(7)
    expect(route.every(p => p.z === 6)).toBe(true)
  })

  it("does not let a preferred path bypass water or building obstacles", () => {
    const map = fixture()
    map.tiles[7 * map.width + 5] = "water"
    map.buildings.push({ id: "wall", x: 4, z: 7, w: 1, d: 1, height: 1, label: "Wall", color: "", roofColor: "" })
    const route = settlementRoute(map, map.buildings, start, goal)!
    expect(route.at(-1)).toEqual(goal)
    expect(route.some(p => p.z === 7 && (p.x === 4 || p.x === 5))).toBe(false)
    for (let z = 0; z < map.depth; z++) map.tiles[z * map.width + 5] = "water"
    expect(settlementRoute(map, map.buildings, start, goal)).toBeNull()
  })

  it("uses the same path preference while monks wander the grounds", () => {
    const map = fixture()
    map.buildings = [{ id: "hovel", x: 5, z: 4, w: 1, d: 1, height: 1, label: "Hovel", color: "", roofColor: "" }]
    map.site = { hovelId: "hovel", door: { x: 5, z: 5 }, junction: 0, branch: [] }
    const route = monkWander(map).route(world(map, start), world(map, goal))
    expect(route.at(-1)).toEqual(world(map, goal))
    expect(route.filter(p => worldToTileZ(map, p.z) === 7)).toHaveLength(7)
  })
})
