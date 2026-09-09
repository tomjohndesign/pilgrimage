import { generateMap, MIN_MAP_SIZE } from "./generate-map"
import { forestTrackTiles } from "./forest-entrances"
import { createFootpaths, foundingRoadTraffic, foundingRoadStrength } from "../footpaths"
import { describe, expect, it } from "vitest"
import { createCrossroads, crossroadIslandAt } from "./crossroads"
import { type GameMap, type TilePos, tileToWorldX, tileToWorldZ } from "./types"
import { settlementRoute } from "../settlement-route"
import { shortcutCost } from "../walking-shortcuts"
import { cartRoute } from "../transport/route"
import { crossroadSignpostParts } from "../building-art/structure"

function fixture(): GameMap {
  const road = Array.from({ length: 15 }, (_, x) => ({ x, z: 7 }))
  const branch = Array.from({ length: 6 }, (_, i) => ({ x: 7, z: 7 + i }))
  const approach = Array.from({ length: 6 }, (_, i) => ({ x: 7, z: 7 - i }))
  const map: GameMap = { width: 15, depth: 15, tiles: new Array(225).fill("grass"), buildings: [], road,
    site: { junction: 7, branch, door: branch.at(-1)!, hovelId: "shrine" },
    darkForests: [{ center: approach.at(-1)!, approach, clearing: [approach.at(-1)!] }] }
  for (const p of [...branch, ...approach]) map.tiles[p.z * 15 + p.x] = "track"
  for (const p of road) map.tiles[p.z * 15 + p.x] = "path"
  return map
}
function continuous(route: TilePos[]) {
  for (let i = 1; i < route.length; i++) expect(Math.abs(route[i].x - route[i - 1].x) + Math.abs(route[i].z - route[i - 1].z)).toBe(1)
}

describe("crossroads network", () => {
  it("shares one marked island between the church, continuing road and dark forest", () => {
    const map = fixture(); createCrossroads(map)
    expect(map.crossroads).toHaveLength(1)
    expect(map.crossroads![0].center).toEqual({ x: 7, z: 7 })
    expect(map.crossroads![0].arms.find(a => a.direction.z === 1)?.mark).toBe("shrine")
    expect(map.crossroads![0].arms.find(a => a.direction.z === -1)?.mark).toBe("trail")
    expect(map.crossroads![0].arms.filter(a => a.mark === "road")).toHaveLength(2)
    for (const route of [map.road!, map.site!.branch, map.darkForests![0].approach]) {
      continuous(route); expect(route).not.toContainEqual({ x: 7, z: 7 })
    }
    expect(map.site!.branch[0]).toEqual(map.road![map.site!.junction])
    const snapshot = JSON.stringify(map); createCrossroads(map); expect(JSON.stringify(map)).toBe(snapshot)
  })
  it("keeps pathfinding, walking shortcuts and cart turns outside the island", () => {
    const map = fixture(); createCrossroads(map)
    const route = settlementRoute(map, [], { x: 5, z: 7 }, { x: 9, z: 7 })!
    expect(route.length).toBeGreaterThan(0)
    expect(route.some(p => crossroadIslandAt(map, p.x, p.z))).toBe(false)
    const world = (x: number, z: number) => ({ x: tileToWorldX(map, x), z: tileToWorldZ(map, z) })
    expect(shortcutCost(map, world(5, 7), world(9, 7), true)).toBe(Infinity)
    for (const p of cartRoute(map)) expect(Math.hypot(p.x, p.z)).toBeGreaterThan(.65)
  })
  it("preserves shortcut endpoints when the main road gains a detour", () => {
    const map = fixture()
    map.shortcuts = [{ entry: 7, exit: 12, tiles: [...map.darkForests![0].approach,
      ...Array.from({ length: 5 }, (_, i) => ({ x: 8 + i, z: 2 })),
      ...Array.from({ length: 5 }, (_, i) => ({ x: 12, z: 3 + i }))] }]
    for (const p of map.shortcuts[0].tiles) if (map.tiles[p.z * 15 + p.x] !== "path") map.tiles[p.z * 15 + p.x] = "track"
    createCrossroads(map)
    const shortcut = map.shortcuts[0]; continuous(shortcut.tiles)
    expect(shortcut.tiles[0]).toEqual(map.road![shortcut.entry])
    expect(shortcut.tiles.at(-1)).toEqual(map.road![shortcut.exit])
  })
  it("keeps a roadside town anchored after an earlier crossroads lengthens the road", () => {
    const map = fixture(), entrance = map.road![12]
    map.towns = [{ id: "town", name: "Alderford", junction: 12, tavernId: "tavern", buildingIds: [] }]
    createCrossroads(map)
    expect(map.towns[0].junction).toBeGreaterThan(12)
    expect(map.road![map.towns[0].junction]).toEqual(entrance)
  })
  it("never carves islands through water or building entrances", () => {
    const map = fixture(); map.tiles[6 * 15 + 6] = "water"; createCrossroads(map)
    expect(map.crossroads).toHaveLength(1); expect(map.tiles[6 * 15 + 6]).toBe("water")
    expect(map.crossroads![0].center).not.toEqual({ x: 7, z: 7 })
  })
  it("marks boundary forks using an island on the inward side", () => {
    const map = fixture()
    map.tiles.fill("grass")
    map.road = Array.from({ length: 15 }, (_, x) => ({ x, z: 0 }))
    map.site!.junction = 7
    map.site!.branch = Array.from({ length: 6 }, (_, z) => ({ x: 7, z }))
    map.site!.door = { x: 7, z: 5 }
    map.darkForests = []
    for (const p of map.site!.branch) map.tiles[p.z * 15 + p.x] = "track"
    for (const p of map.road) map.tiles[p.z * 15 + p.x] = "path"
    createCrossroads(map)
    expect(map.crossroads).toHaveLength(1)
    expect(map.crossroads![0].center).toEqual({ x: 7, z: 1 })
    expect(map.site!.branch[0]).toEqual(map.road[map.site!.junction])
    continuous(map.road); continuous(map.site!.branch)
    for (const p of [...map.road, ...map.site!.branch]) expect(crossroadIslandAt(map, p.x, p.z)).toBe(false)
  })
  it("recognizes a bridge as a road arm and fits the island beside its landing", () => {
    const map = fixture()
    map.tiles[7 * 15 + 6] = "bridge"
    for (let x = 4; x < 11; x++) map.tiles[6 * 15 + x] = "water"
    map.darkForests = []
    createCrossroads(map)
    expect(map.crossroads).toHaveLength(1)
    expect(map.crossroads![0].arms.filter(a => a.mark === "road")).toHaveLength(2)
    expect(map.tiles[7 * 15 + 6]).toBe("bridge")
    expect(map.site!.branch[0]).toEqual(map.road![map.site!.junction])
    continuous(map.road!); continuous(map.site!.branch)
  })
  it("gives each exit a pointed board with its marking on both faces", () => {
    const map = fixture(); createCrossroads(map)
    const parts = crossroadSignpostParts(1, map.crossroads![0].arms)
    expect(parts.filter(p => p.name.endsWith("signpost-board"))).toHaveLength(4)
    for (const mark of ["shrine", "trail", "road"]) for (const side of [-1, 1]) {
      expect(parts.some(p => p.name.includes(`mark-${mark}-`) && p.name.endsWith(`-${side}`))).toBe(true)
    }
  })
})


describe("generated crossroads", () => {
  it("keeps every authored route connected, its endpoints intact, and the shrine fork marked", () => {
    for (const seed of [1, 7920, 15839, 23758, 39596, 12345, 213814]) {
      const map = generateMap({ width: MIN_MAP_SIZE, depth: MIN_MAP_SIZE, seed })
      const site = map.site!, road = map.road!
      expect(map.crossroads!.some(c => Math.hypot(c.center.x - site.branch[0].x, c.center.z - site.branch[0].z) < 4), `shrine marker seed ${seed}`).toBe(true)
      expect(site.branch[0]).toEqual(road[site.junction])
      expect(site.branch.at(-1)).toEqual(site.door)
      for (const shortcut of map.shortcuts ?? []) {
        expect(shortcut.entry).toBeLessThan(shortcut.exit)
        expect(shortcut.tiles[0]).toEqual(road[shortcut.entry])
        expect(shortcut.tiles.at(-1)).toEqual(road[shortcut.exit])
      }
      for (const grove of map.darkForests ?? []) expect(grove.approach.at(-1)).toEqual(grove.center)
      for (const route of [road, site.branch, ...(map.shortcuts ?? []).map(s => s.tiles), ...(map.darkForests ?? []).map(f => f.approach)]) {
        continuous(route)
        for (const p of route) expect(crossroadIslandAt(map, p.x, p.z), `island crossing seed ${seed}`).toBe(false)
      }
    }
  })
  it.each([128, 192, 256].flatMap(size => [0, 2, 3, 4, 5, 20260908].map(seed => ({ size, seed }))))(
    "marks the shrine junction on a fresh $size-tile world, seed $seed", ({ size, seed }) => {
      const map = generateMap({ width: size, depth: size, seed })
      const fork = map.site!.branch[0]
      expect(map.road!.length).toBeGreaterThan(0)
      expect(map.crossroads!.some(c => Math.hypot(c.center.x - fork.x, c.center.z - fork.z) <= 4)).toBe(true)
    }, 30000)
  it("retains lightly worn forest approaches outside the canopy without marking forests at the crossroads", () => {
    const map = fixture(); createCrossroads(map); map.footpaths = createFootpaths(map)
    const approach = map.darkForests![0].approach
    for (const p of approach) {
      const i = p.z * map.width + p.x
      if (map.tiles[i] !== "track") continue
      expect(forestTrackTiles(map).has(i)).toBe(true)
      map.footpaths.founding.set(i, 5)
      expect(foundingRoadTraffic(map, i, 200)).toBe(2)
      expect(foundingRoadStrength(map, i)).toBe(.48)
    }
    const shrineIndex = map.site!.door.z * map.width + map.site!.door.x
    expect(foundingRoadStrength(map, shrineIndex)).toBe(1)
    expect(map.crossroads![0].arms.map(a => a.mark)).not.toContain("forest")

  })
})
