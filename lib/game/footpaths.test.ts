import { describe, expect, it } from "vitest"
import { buildFootpathRoadSegments, compactFootpathContacts, createFootpaths, FOOTPATH_HALF_LIFE, HEAVY_PATH_WEAR, FOUNDING_ROAD_WEAR, foundingRoadStrength, foundingRoadTraffic, FOOTPATH_WEAR, footpathRoadSegments, recordCartPath, recordWalkingPath, regrowFootpaths } from "./footpaths"
import { tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./map/types"
import { settlementRoute } from "./settlement-route"
import { monkWander } from "./monk-wander"
import { alignCart } from "./transport/follow"
import { BASE_CHARACTER_SCALE } from "./base-person/gait"

const fixture = (): GameMap => ({ width: 12, depth: 12, tiles: Array(144).fill("grass"), buildings: [], footpaths: createFootpaths() })
const point = (map: GameMap, x: number, z: number) => ({ x: tileToWorldX(map, x), y: .2, z: tileToWorldZ(map, z) })
function walk(map: GameMap, route: TilePos[], passes = 1, frames = 1) {
  for (let pass = 0; pass < passes; pass++) for (let i = 1; i < route.length; i++) {
    const a = point(map, route[i - 1].x, route[i - 1].z), b = point(map, route[i].x, route[i].z)
    let from = a
    for (let frame = 1; frame <= frames; frame++) {
      const t = frame / frames, to = { x: a.x + (b.x - a.x) * t, y: .2, z: a.z + (b.z - a.z) * t }
      recordWalkingPath(map.footpaths!, map, from, to)
      from = to
    }
  }
}

describe("walking paths in the game", () => {
  it("can finish a city path snapshot over several frames while live contacts keep changing", () => {
    const map: GameMap = { width: 64, depth: 64, tiles: Array(64 * 64).fill("grass"), buildings: [], footpaths: createFootpaths() }
    for (let z = 3; z < 30; z += 2) walk(map, Array.from({ length: 40 }, (_, x) => ({ x: x + 2, z })), 16)
    const paths = map.footpaths!, expected = footpathRoadSegments(map, paths)
    const work = buildFootpathRoadSegments(map, paths)
    let next = work.next(), yields = 0
    expect(next.done).toBe(false)
    // A sampled contact must not move or disappear from the in-flight snapshot
    // when the next simulation tick changes its live record.
    const first = paths.contacts.values().next().value!
    first.wear = 0; first.ax = first.bx = 60
    while (!next.done) { yields++; next = work.next() }
    expect(yields).toBeGreaterThan(1)
    expect(next.value).toEqual(expected)
    // The subsequent snapshot observes the new ground contact.
    expect(footpathRoadSegments(map, paths)).not.toEqual(expected)
  })
  it("compacts established collinear marks without joining different lanes or changing simulation contacts", () => {
    const map = fixture(), paths = map.footpaths!
    walk(map, Array.from({ length: 9 }, (_, i) => ({ x: i + 1, z: 3.25 })), 20)
    walk(map, Array.from({ length: 9 }, (_, i) => ({ x: i + 1, z: 2.75 })), 20)
    const before = structuredClone(paths.contacts)
    const roads = compactFootpathContacts(paths.contacts)
    expect(roads).toHaveLength(2)
    expect(roads.map(r => r.bx - r.ax)).toEqual([8, 8])
    expect(new Set(roads.map(r => r.az))).toEqual(new Set([3.75, 3.25]))
    expect(paths.contacts).toEqual(before)
    const first = [...paths.contacts.keys()][0]
    paths.contacts.delete(first)
    expect(compactFootpathContacts(paths.contacts).reduce((n, r) => n + r.bx - r.ax, 0)).toBe(15.5)
  })
  it("lets an unused founding road fade and lose its routing advantage", () => {
    const map = fixture()
    for (let x = 1; x < 10; x++) map.tiles[3 * map.width + x] = "path"
    map.footpaths = createFootpaths(map)
    const paths = map.footpaths, quiet = 3 * map.width + 8, busy = 3 * map.width + 3
    expect(paths.founding.get(quiet)).toBe(FOUNDING_ROAD_WEAR)
    regrowFootpaths(paths, 30)
    expect(foundingRoadStrength(map, quiet)).toBe(1)
    // Nearby foot traffic alone does not count as bypassing the road.
    walk(map, [{ x: 6, z: 4 }, { x: 7, z: 4 }], 15)
    regrowFootpaths(paths, FOOTPATH_HALF_LIFE)
    expect(foundingRoadStrength(map, quiet)).toBe(1)
    // Completion of an established shortcut marks only the stretch it bypasses.
    paths.rerouted.add(quiet); paths.rerouted.add(busy)
    regrowFootpaths(paths, FOOTPATH_HALF_LIFE)
    expect(foundingRoadStrength(map, quiet)).toBeCloseTo(.5)
    walk(map, [{ x: 2, z: 3 }, { x: 3, z: 3 }], 20)
    expect(foundingRoadStrength(map, busy)).toBeGreaterThan(foundingRoadStrength(map, quiet))
    regrowFootpaths(paths, 100)
    expect(foundingRoadStrength(map, quiet)).toBe(0)
    expect(foundingRoadStrength(map, busy)).toBe(0)
    // Explicit paving is maintained separately from emergent dirt paths.
    paths.paved = true
    expect(foundingRoadStrength(map, quiet)).toBe(1)
  })
  it("wears only the walked lane, then adds the opposing lane when used", () => {
    const map = fixture(), paths = map.footpaths!
    const east = [{ x: 2, z: 3.25 }, { x: 3, z: 3.25 }]
    walk(map, east)
    expect(new Set([...paths.contacts.values()].map(s => s.az))).toEqual(new Set([3.75]))
    const first = structuredClone(paths.contacts)
    walk(map, [{ x: 3, z: 2.75 }, { x: 2, z: 2.75 }])
    expect(new Set([...paths.contacts.values()].map(s => s.az))).toEqual(new Set([3.25, 3.75]))
    for (const [key, track] of first) expect(paths.contacts.get(key)).toEqual(track)
    // A return over the exact same ground deepens that track without duplicating it.
    const count = paths.contacts.size
    walk(map, [...east].reverse())
    expect(paths.contacts.size).toBe(count)
    for (const [key, track] of first) expect(paths.contacts.get(key)!.wear).toBeCloseTo(track.wear * 2)
  })

  it("records both cart wheels on a single pass, with no mark between them", () => {
    const map = fixture(), paths = map.footpaths!
    const a = point(map, 2, 3), b = point(map, 3, 3)
    recordCartPath(paths, map, alignCart(a, Math.PI / 2, 0), alignCart(b, Math.PI / 2, 0), BASE_CHARACTER_SCALE)
    expect(Math.max(...[...paths.contacts.values()].map(c => c.wear))).toBeCloseTo(FOOTPATH_WEAR * HEAVY_PATH_WEAR)
    const lanes = [...new Set([...paths.contacts.values()].map(s => s.az))].sort()
    expect(lanes).toHaveLength(2)
    expect(lanes[0]).toBeLessThan(3.5)
    expect(lanes[1]).toBeGreaterThan(3.5)
    expect(lanes[1] - lanes[0]).toBeGreaterThan(.4)
  })

  it("combines ordinary lane variation into a visible trail without mirroring it", () => {
    const map = fixture()
    for (let pass = 0; pass < 10; pass++) walk(map, [{ x: 2, z: 3 + .18 + pass * .01 }, { x: 3, z: 3 + .18 + pass * .01 }], 1, 60)
    expect(map.footpaths!.contacts.size).toBe(2)
    expect([...map.footpaths!.contacts.values()].every(c => c.wear > .39)).toBe(true)
    expect(footpathRoadSegments(map, map.footpaths!).size).toBeGreaterThan(0)
  })

  it("gives horses twice the compaction and widens busy inherited roads locally", () => {
    const person = fixture(), horse = fixture(), a = point(person, 2, 3), b = point(person, 3, 3)
    recordWalkingPath(person.footpaths!, person, a, b)
    recordWalkingPath(horse.footpaths!, horse, a, b, HEAVY_PATH_WEAR)
    for (const [key, track] of person.footpaths!.contacts) expect(horse.footpaths!.contacts.get(key)!.wear).toBeCloseTo(track.wear * 2)
    person.tiles[3 * person.width + 2] = person.tiles[3 * person.width + 3] = "path"
    person.footpaths = createFootpaths(person)
    const initial = foundingRoadTraffic(person, 3 * person.width + 3, 100)
    walk(person, [{ x: 2, z: 3 }, { x: 3, z: 3 }], 8)
    expect(foundingRoadTraffic(person, 3 * person.width + 3, 0)).toBeGreaterThan(initial)
    expect(foundingRoadTraffic(person, 4 * person.width + 3, 0)).toBe(foundingRoadTraffic(person, 3 * person.width + 3, 0))
  })

  it("integrates lane wear by distance across frame rates and compacts repeated passes", () => {
    const route = [{ x: 2, z: 3.25 }, { x: 3, z: 3.25 }], coarse = fixture(), fine = fixture()
    walk(coarse, route, 8); walk(fine, route, 8, 60)
    expect(fine.footpaths!.contacts.size).toBe(coarse.footpaths!.contacts.size)
    for (const [key, track] of coarse.footpaths!.contacts) {
      const other = fine.footpaths!.contacts.get(key)!
      expect(other.wear).toBeCloseTo(track.wear)
      expect(other.ax).toBeCloseTo(track.ax); expect(other.bx).toBeCloseTo(track.bx)
      expect(other.az).toBe(track.az); expect(other.bz).toBe(track.bz)
    }
  })

  it("shares actual crossings in both directions, independently of frame rate", () => {
    const route = [{ x: 2, z: 3 }, { x: 3, z: 3 }, { x: 4, z: 4 }]
    const coarse = fixture(), fine = fixture()
    walk(coarse, route); walk(coarse, [...route].reverse())
    walk(fine, route, 1, 60); walk(fine, [...route].reverse(), 1, 60)
    expect(fine.footpaths!.edges).toEqual(coarse.footpaths!.edges)
    expect(fine.footpaths!.edges.size).toBe(2)
    for (const edge of fine.footpaths!.edges.values()) expect(edge.wear).toBe(FOOTPATH_WEAR * 2)
    expect(footpathRoadSegments(fine, fine.footpaths!).size).toBeGreaterThan(0)
    const segments = [...footpathRoadSegments(fine, fine.footpaths!).values()].flat()
    expect(segments.every(s => s[4] === 4 && s[5]! > 0 && s[5]! <= FOOTPATH_WEAR * 2 + 1e-8)).toBe(true)
  })

  it("does not mark stationary characters, teleports, or destinations ahead of a walker", () => {
    const map = fixture(), paths = map.footpaths!
    recordWalkingPath(paths, map, point(map, 2, 2), point(map, 2, 2))
    recordWalkingPath(paths, map, point(map, 1, 1), point(map, 10, 10))
    expect(paths.edges.size).toBe(0)
    walk(map, [{ x: 2, z: 2 }, { x: 3, z: 2 }])
    expect([...paths.edges.values()].map(e => [e.from, e.to])).toEqual([[26, 27]])
  })

  it.each(["water", "bridge", "forest", "darkwood"] as const)("does not cut a path through %s", terrain => {
    const map = fixture()
    map.tiles[3 * map.width + 3] = terrain
    walk(map, [{ x: 2, z: 3 }, { x: 3, z: 3 }, { x: 4, z: 3 }])
    expect(map.footpaths!.edges.size).toBe(0)
  })

  it("keeps buildings and diagonal blocked corners clean, including newly built footprints", () => {
    const map = fixture(), route = [{ x: 2, z: 3 }, { x: 3, z: 3 }]
    walk(map, route, 3)
    map.buildings.push({ id: "hut", x: 3, z: 3, w: 1, d: 1, label: "Hut", height: 1, color: "", roofColor: "" })
    expect(footpathRoadSegments(map, map.footpaths!).size).toBe(0)
    const size = map.footpaths!.edges.size
    walk(map, [{ x: 2, z: 3 }, { x: 3, z: 4 }])
    expect(map.footpaths!.edges.size).toBe(size)
  })

  it("regrows unused trails in game time, including formerly established corridors", () => {
    const map = fixture(), paths = map.footpaths!, route = [{ x: 2, z: 3 }, { x: 3, z: 3 }]
    walk(map, route)
    regrowFootpaths(paths, 0)
    expect([...paths.edges.values()][0].wear).toBe(FOOTPATH_WEAR)
    regrowFootpaths(paths, FOOTPATH_HALF_LIFE)
    expect([...paths.edges.values()][0].wear).toBeCloseTo(FOOTPATH_WEAR / 2)
    regrowFootpaths(paths, 30)
    expect(paths.edges.size).toBe(0)
    walk(map, route, 30)
    regrowFootpaths(paths, 100)
    expect(paths.edges.size).toBe(0)
    expect(paths.contacts.size).toBe(0)
  })

  it("lets workers and wandering monks follow a repeatedly walked corridor", () => {
    const map = fixture(), start = { x: 2, z: 6 }, goal = { x: 8, z: 6 }
    map.buildings = [{ id: "hovel", x: 5, z: 4, w: 1, d: 1, height: 1, label: "Hovel", color: "", roofColor: "" }]
    map.site = { hovelId: "hovel", door: { x: 5, z: 5 }, junction: 0, branch: [] }
    const corridor = [start, ...Array.from({ length: 7 }, (_, i) => ({ x: i + 2, z: 7 })), goal]
    // Keep the existing navigation object: its costs must see live traffic.
    const grounds = monkWander(map)
    walk(map, corridor)
    expect(settlementRoute(map, map.buildings, start, goal)).toHaveLength(7)
    walk(map, corridor, 20)
    expect(settlementRoute(map, map.buildings, start, goal)).toEqual(corridor)
    expect(grounds.route(point(map, start.x, start.z), point(map, goal.x, goal.z)).map(p => p.z))
      .toEqual(corridor.map(p => point(map, p.x, p.z).z))
    map.tiles[7 * map.width + 5] = "water"
    expect(settlementRoute(map, map.buildings, start, goal)!.some(p => p.x === 5 && p.z === 7)).toBe(false)
  })
})
