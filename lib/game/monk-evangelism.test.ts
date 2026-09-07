import { afterEach, describe, expect, it } from "vitest"
import { BUILD_CATALOG } from "./balance"
import { activityClip } from "./base-person/activity"
import { generateMap } from "./map/generate-map"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import { createMonkRoutine } from "./monk-routine"
import { monkWander } from "./monk-wander"
import { createMonkNeeds, stepMonkWork } from "./monk-work"
import { MONK_EVANGELISM, preachingRegistry, preachingSpots, roadsideEvangelism, stepMonkEvangelism, type EvangelizingMonk } from "./monk-evangelism"
import { useMonkEvangelismStore } from "./monk-evangelism-store"

function fixture() {
  const map: GameMap = { width: 20, depth: 20, tiles: Array(400).fill("grass"),
    buildings: [{ id: "shrine", x: 8, z: 10, w: 3, d: 3, height: 1, label: "Shrine", color: "", roofColor: "" }],
    road: Array.from({ length: 20 }, (_, x) => ({ x, z: 4 })),
    site: { hovelId: "shrine", junction: 9, door: { x: 9, z: 9 }, branch: Array.from({ length: 6 }, (_, i) => ({ x: 9, z: 4 + i })) } }
  for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
  for (const p of map.site!.branch.slice(1)) map.tiles[p.z * map.width + p.x] = "track"
  const monk: EvangelizingMonk = { ...createMonkRoutine(monkWander(map), 0, () => .5), ...createMonkNeeds(0),
    x: tileToWorldX(map, 9), z: tileToWorldZ(map, 9) }
  preachingRegistry.current = { road: map.road, monks: [monk] }
  return { map, monk }
}
function arrive(monk: EvangelizingMonk, map: GameMap) {
  for (let tick = 0; tick < 1500 && monk.activity !== "preaching"; tick++) stepMonkEvangelism(monk, map, true, 2, .1)
  expect(monk.activity).toBe("preaching")
}
afterEach(() => { preachingRegistry.current = null; useMonkEvangelismStore.setState({ available: false, assigned: new Set() }) })

describe("roadside preaching", () => {
  it("walks to a shoulder, faces the road and only persuades after arrival", () => {
    const { map, monk } = fixture()
    stepMonkEvangelism(monk, map, true, 2, .1)
    expect(monk.activity).toBe("toEvangelize")
    expect(roadsideEvangelism(map)).toBe(0)
    arrive(monk, map)
    const tile = { x: worldToTileX(map, monk.x), z: worldToTileZ(map, monk.z) }
    expect(map.road).not.toContainEqual(tile)
    expect(map.site!.branch).not.toContainEqual(tile)
    expect(map.road!.some(p => Math.abs(p.x - tile.x) + Math.abs(p.z - tile.z) === 1)).toBe(true)
    expect(monk.preachingTask!.heading).toBe(Math.atan2(0, 1))
    expect(activityClip(monk.activity, false)).toBe("preaching")
    expect(roadsideEvangelism(map)).toBeCloseTo(MONK_EVANGELISM)
    const before = { x: monk.x, z: monk.z }
    stepMonkEvangelism(monk, map, true, 2, 1)
    expect({ x: monk.x, z: monk.z }).toEqual(before)
  })

  it("combines with a cross, without stacking extra monks or affecting a different world", () => {
    const { map, monk } = fixture()
    arrive(monk, map)
    preachingRegistry.current!.monks.push({ ...monk })
    expect(roadsideEvangelism(map)).toBeCloseTo(.05)
    map.buildings.push({ ...BUILD_CATALOG.find(b => b.id === "cross")!, id: "cross", buildType: "cross", x: 14, z: 10 })
    expect(roadsideEvangelism(map)).toBeCloseTo(.0975)
    expect(roadsideEvangelism({ ...map, road: [...map.road!] })).toBe(.05)
  })

  it.each(["recall", "tired"])("stops persuasion and walks home on %s", reason => {
    const { map, monk } = fixture()
    arrive(monk, map)
    if (reason === "tired") monk.stamina = 25
    expect(stepMonkEvangelism(monk, map, reason !== "recall", 2, .1)).toBe(false)
    expect(roadsideEvangelism(map)).toBe(0)
    expect(monk.preachingTask).toBeUndefined()
    for (let i = 0; i < 300 && monk.destination === "home"; i++) stepMonkWork(monk, map, 2, .1)
    expect(monk.x).toBeCloseTo(tileToWorldX(map, map.site!.door.x))
    expect(monk.z).toBeCloseTo(tileToWorldZ(map, map.site!.door.z))
  })

  it("freezes an approach while paused and cancels before arrival", () => {
    const { map, monk } = fixture()
    stepMonkEvangelism(monk, map, true, 2, .1)
    const before = structuredClone(monk)
    stepMonkEvangelism(monk, map, false, 2, 0)
    expect(monk).toEqual(before)
    stepMonkEvangelism(monk, map, false, 2, .1)
    expect(monk.preachingTask).toBeUndefined()
    expect(monk.destination).toBe("home")
  })

  it("reserves different shoulders and replans when construction blocks a preacher", () => {
    const { map, monk } = fixture()
    arrive(monk, map)
    const occupied = monk.preachingTask!.tile
    const other: EvangelizingMonk = { ...monk, preachingTask: undefined, route: [] }
    stepMonkEvangelism(other, map, true, 2, .1, [occupied])
    expect(other.preachingTask!.tile).not.toEqual(occupied)
    const changed = { ...map, buildings: [...map.buildings, { ...map.buildings[0], ...occupied, w: 1, d: 1, id: "new", construction: { work: 0, required: 12 } }] }
    stepMonkEvangelism(monk, changed, true, 2, .1)
    expect(monk.preachingTask!.tile).not.toEqual(occupied)
    expect(monk.preachingTask!.map).toBe(changed)
  })

  it("declines orders when all shoulders are impassable", () => {
    const { map, monk } = fixture()
    for (const tile of preachingSpots(map)) map.tiles[tile.z * map.width + tile.x] = "water"
    expect(stepMonkEvangelism(monk, map, true, 2, .1)).toBe(false)
    expect(monk.preachingTask).toBeUndefined()
    expect(roadsideEvangelism(map)).toBe(0)
  })

  it.each([1, 42, 12345])("finds a reachable roadside position in generated world %i", seed => {
    const map = generateMap({ seed }), grounds = monkWander(map)
    const monk = { ...createMonkRoutine(grounds, 0, () => .5), ...createMonkNeeds(0) }
    expect(stepMonkEvangelism(monk, map, true, 2, .1)).toBe(true)
    arrive(monk, map)
  })

  it("keeps individual orders independent and recalls them", () => {
    const controls = useMonkEvangelismStore.getState()
    controls.request(0)
    expect(useMonkEvangelismStore.getState().assigned.size).toBe(0)
    useMonkEvangelismStore.setState({ available: true })
    controls.request(0); controls.request(1); controls.recall(0)
    expect([...useMonkEvangelismStore.getState().assigned]).toEqual([1])
  })
})
