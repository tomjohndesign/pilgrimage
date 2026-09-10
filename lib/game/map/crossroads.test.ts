import { generateMap, MIN_MAP_SIZE } from "./generate-map"
import { forestTrackTiles } from "./forest-entrances"
import { createFootpaths, foundingRoadTraffic, foundingRoadStrength } from "../footpaths"
import { describe, expect, it } from "vitest"
import { createCrossroads, crossroadIslandAt } from "./crossroads"
import { type GameMap, type TilePos, tileAt, tileToWorldX, tileToWorldZ } from "./types"
import { settlementRoute } from "../settlement-route"
import { shortcutCost } from "../walking-shortcuts"
import { cartRoute } from "../transport/route"
import { crossroadSignpostParts } from "../building-art/structure"
import { addRoadsideTowns } from "./roadside-towns"
import { tJunctionVerge } from "./signpost"
import { elevationStep } from "./elevation"

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
  it("preserves stony shallows when rerouting the road around a junction", () => {
    const map = fixture()
    map.tiles[7 * map.width + 2] = "ford"
    createCrossroads(map)
    expect(map.crossroads).toHaveLength(1)
    expect(map.tiles[7 * map.width + 2]).toBe("ford")
    continuous(map.road!)
  })

  it("does not put a roadside post in natural shallows", () => {
    const map = fixture()
    for (const p of map.darkForests![0].approach.slice(1)) map.tiles[p.z * map.width + p.x] = "grass"
    map.darkForests = []
    map.tiles[6 * map.width + 7] = "ford"
    createCrossroads(map)
    expect(map.tiles[6 * map.width + 7]).toBe("ford")
    expect(map.crossroads?.some(c => c.center.x === 7 && c.center.z === 6)).toBe(false)
  })

  it("leaves a well access spur as a simple path without a marked island", () => {
    const map = fixture()
    for (const p of map.site!.branch.slice(1)) map.tiles[p.z * map.width + p.x] = "grass"
    map.site = undefined
    map.buildingAccessTiles = map.darkForests![0].approach.slice(1)
    map.darkForests = []
    const tiles = [...map.tiles], road = [...map.road!]
    createCrossroads(map)
    expect(map.crossroads).toEqual([])
    expect(map.tiles).toEqual(tiles)
    expect(map.road).toEqual(road)
    expect(settlementRoute(map, [], road[7], map.buildingAccessTiles.at(-1)!)).not.toBeNull()
  })
  it("keeps a genuine shrine crossroads while omitting its well spur from the signs", () => {
    const map = fixture()
    for (const p of map.darkForests![0].approach.slice(1)) map.tiles[p.z * map.width + p.x] = "grass"
    // Leave the T's opposite verge free for main's roadside marker; the well
    // branches from the continuing road a few tiles beyond the shrine fork.
    map.buildingAccessTiles = Array.from({ length: 4 }, (_, i) => ({ x: 11, z: 6 - i }))
    for (const p of map.buildingAccessTiles) map.tiles[p.z * map.width + p.x] = "track"
    map.darkForests = []
    createCrossroads(map)
    expect(map.crossroads).toHaveLength(1)
    expect(map.crossroads![0].arms).toHaveLength(3)
    expect(map.crossroads![0].arms.some(a => a.direction.z === -1)).toBe(false)
    expect(map.crossroads![0].arms.some(a => a.mark === "shrine")).toBe(true)
  })
  it.each([[1, 0], [-1, 0], [0, 1], [0, -1]])("puts a T marker on the missing (%i, %i) arm without changing paths", (dx, dz) => {
    const map = fixture()
    map.site = undefined; map.darkForests = []; map.road = []
    map.tiles.fill("grass")
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (x === dx && z === dz) continue
      for (let i = 0; i <= 5; i++) map.tiles[(7 + z * i) * map.width + 7 + x * i] = "path"
    }
    const before = [...map.tiles]
    createCrossroads(map)
    const center = { x: 7 + dx, z: 7 + dz }
    expect(map.crossroads).toHaveLength(1)
    expect(map.crossroads![0].center).toEqual(center)
    expect(map.crossroads![0].arms).toHaveLength(3)
    expect(crossroadIslandAt(map, 7, 7)).toBe(false)
    for (let i = 0; i < before.length; i++) {
      expect(map.tiles[i]).toBe(i === center.z * map.width + center.x ? "clearing" : before[i])
    }
  })
  it("keeps T-junction road and shrine routes unchanged", () => {
    const map = fixture()
    for (const p of map.darkForests![0].approach.slice(1)) map.tiles[p.z * map.width + p.x] = "grass"
    map.darkForests = []
    const before = JSON.stringify({ road: map.road, site: map.site })
    createCrossroads(map)
    expect(map.crossroads![0].center).toEqual({ x: 7, z: 6 })
    expect(JSON.stringify({ road: map.road, site: map.site })).toBe(before)
  })
  it.each(["water", "darkwood"] as const)("omits a T marker when the opposite verge is %s", terrain => {
    const map = fixture()
    for (const p of map.darkForests![0].approach.slice(1)) map.tiles[p.z * map.width + p.x] = "grass"
    map.darkForests = []
    map.tiles[6 * map.width + 7] = terrain
    const before = [...map.tiles]
    createCrossroads(map)
    expect(map.crossroads).toEqual([])
    expect(map.tiles).toEqual(before)
  })
  it("leaves tavern approach junctions unmarked and their paths unchanged", () => {
    const map: GameMap = { width: 400, depth: 34, tiles: Array(13600).fill("grass"), buildings: [],
      road: Array.from({ length: 400 }, (_, x) => ({ x, z: 17 })) }
    for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
    addRoadsideTowns(map)
    expect(map.towns!.length).toBeGreaterThan(0)
    const before = JSON.stringify({ tiles: map.tiles, road: map.road, towns: map.towns })
    createCrossroads(map)
    expect(map.crossroads).toEqual([])
    expect(JSON.stringify({ tiles: map.tiles, road: map.road, towns: map.towns })).toBe(before)
  })
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
  it("omits boundary T markers when the opposite verge is outside the map", () => {
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
    expect(map.crossroads).toHaveLength(0)
    expect(map.site!.branch[0]).toEqual(map.road[map.site!.junction])
    continuous(map.road); continuous(map.site!.branch)
    for (const p of [...map.road, ...map.site!.branch]) expect(crossroadIslandAt(map, p.x, p.z)).toBe(false)
  })
  it.each(["bridge", "ford"] as const)("recognizes a road %s as a T arm and places the post across from the incoming path", crossing => {
    const map = fixture()
    map.tiles[7 * 15 + 6] = crossing
    for (const p of map.darkForests![0].approach.slice(1)) map.tiles[p.z * map.width + p.x] = "grass"
    map.darkForests = []
    createCrossroads(map)
    expect(map.crossroads).toHaveLength(1)
    expect(map.crossroads![0].arms.filter(a => a.mark === "road")).toHaveLength(2)
    expect(map.tiles[7 * 15 + 6]).toBe(crossing)
    expect(map.crossroads![0].center).toEqual({ x: 7, z: 6 })
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
    "marks the shrine junction when its verge is usable on a $size-tile world, seed $seed", ({ size, seed }) => {
      const map = generateMap({ width: size, depth: size, seed })
      const fork = map.site!.branch[0]
      expect(map.road!.length).toBeGreaterThan(0)
      if (!map.crossroads!.some(c => Math.hypot(c.center.x - fork.x, c.center.z - fork.z) <= 4)) {
        // A T beside water, the map edge or a cliff has no safe opposite verge.
        const verge = tJunctionVerge(map, fork)
        expect(verge).not.toBeNull()
        const terrain = tileAt(map, verge!.x, verge!.z)
        expect(!terrain || ["water", "bridge", "darkwood"].includes(terrain)
          || !Number.isFinite(elevationStep(map.elevation, fork.z * size + fork.x, verge!.z * size + verge!.x))).toBe(true)
      }
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
