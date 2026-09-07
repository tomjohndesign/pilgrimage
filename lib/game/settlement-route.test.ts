import { describe, expect, it } from "vitest"
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
