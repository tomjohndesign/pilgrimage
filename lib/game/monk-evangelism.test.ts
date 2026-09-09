import { afterEach, describe, expect, it } from "vitest"
import { BUILD_CATALOG } from "./balance"
import { activityClip } from "./base-person/activity"
import { generateMap, MIN_MAP_SIZE } from "./map/generate-map"

/** Floor-size worlds: which seeds have open roadside ground at the junction depends on the map size. */
const FLOOR = { width: MIN_MAP_SIZE, depth: MIN_MAP_SIZE }
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import { createMonkRoutine } from "./monk-routine"
import { monkWander } from "./monk-wander"
import { createMonkNeeds, MONK_TIRED_AT, MONK_WAKE_AT, stepMonkWork } from "./monk-work"
import { MONK_EVANGELISM, preachingRegistry, preachingSpots, roadsideEvangelism, stepMonkEvangelism, type EvangelizingMonk } from "./monk-evangelism"
import { useMonkEvangelismStore } from "./monk-evangelism-store"
import { GAME_DAY_SECONDS } from "./calendar"

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

  it.each(["preaching", "sleeping"])("stops persuasion and walks home when recalled while %s", activity => {
    const { map, monk } = fixture()
    arrive(monk, map)
    if (activity === "sleeping") {
      monk.stamina = MONK_TIRED_AT
      stepMonkEvangelism(monk, map, true, 2, .1)
      expect(monk.activity).toBe("sleeping")
    }
    expect(stepMonkEvangelism(monk, map, false, 2, .1)).toBe(false)
    expect(roadsideEvangelism(map)).toBe(0)
    expect(monk.preachingTask).toBeUndefined()
    for (let i = 0; i < 300 && monk.destination === "home"; i++) stepMonkWork(monk, map, 2, .1)
    expect(monk.x).toBeCloseTo(tileToWorldX(map, map.site!.door.x))
    expect(monk.z).toBeCloseTo(tileToWorldZ(map, map.site!.door.z))
  })

  it("uses half the ordinary stamina drain while preaching", () => {
    const { map, monk } = fixture()
    arrive(monk, map)
    const ordinary = { ...monk, activity: "resting" as const, route: [] }
    const before = monk.stamina
    stepMonkEvangelism(monk, map, true, 2, 10)
    stepMonkWork(ordinary, map, 2, 10)
    expect(before - monk.stamina).toBeCloseTo((before - ordinary.stamina) / 2)
  })

  it.each(["approaching", "preaching"])("sleeps in place when tired while %s, then resumes the assignment", phase => {
    const { map, monk } = fixture()
    if (phase === "preaching") arrive(monk, map)
    else stepMonkEvangelism(monk, map, true, 2, .1)
    const task = monk.preachingTask
    const position = { x: monk.x, y: monk.y, z: monk.z }
    const route = structuredClone(monk.route)
    monk.stamina = MONK_TIRED_AT
    expect(stepMonkEvangelism(monk, map, true, 2, .1)).toBe(true)
    expect(monk.activity).toBe("sleeping")
    expect(activityClip(monk.activity, false)).toBe("sleeping")
    expect(roadsideEvangelism(map)).toBe(0)
    const paused = structuredClone(monk)
    stepMonkEvangelism(monk, map, true, 2, 0)
    expect(monk).toEqual(paused)
    for (let i = 0; i < 200 && monk.activity === "sleeping"; i++) {
      expect(stepMonkEvangelism(monk, map, true, 2, .1)).toBe(true)
      expect({ x: monk.x, y: monk.y, z: monk.z }).toEqual(position)
      expect(monk.route).toEqual(route)
      expect(monk.buildingTask).toBeUndefined()
    }
    expect(monk.stamina).toBeGreaterThanOrEqual(MONK_WAKE_AT)
    expect(monk.preachingTask).toBe(task)
    expect(monk.activity).toBe(phase === "preaching" ? "preaching" : "toEvangelize")
    arrive(monk, map)
    expect(roadsideEvangelism(map)).toBeCloseTo(MONK_EVANGELISM)
  })

  it("finishes after three game days including travel and sleep, then walks home", () => {
    const { map, monk } = fixture()
    monk.stamina = MONK_TIRED_AT + 10
    let slept = false, resumed = false
    for (let elapsed = 1; elapsed < 3 * GAME_DAY_SECONDS; elapsed++) {
      const wasSleeping = monk.activity === "sleeping"
      expect(stepMonkEvangelism(monk, map, true, 2, 1)).toBe(true)
      slept ||= monk.activity === "sleeping"
      resumed ||= wasSleeping && monk.activity === "preaching"
    }
    expect(slept).toBe(true)
    expect(resumed).toBe(true)
    expect(stepMonkEvangelism(monk, map, true, 2, 1)).toBe(false)
    expect(monk.preachingTask).toBeUndefined()
    expect(roadsideEvangelism(map)).toBe(0)
    expect(monk.destination).toBe("home")
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
    const elapsed = monk.preachingTask!.elapsed
    stepMonkEvangelism(monk, changed, true, 2, .1)
    expect(monk.preachingTask!.tile).not.toEqual(occupied)
    expect(monk.preachingTask!.map).toBe(changed)
    expect(monk.preachingTask!.elapsed).toBeCloseTo(elapsed + .1)
  })

  it("declines orders when all shoulders are impassable", () => {
    const { map, monk } = fixture()
    for (const tile of preachingSpots(map)) map.tiles[tile.z * map.width + tile.x] = "water"
    expect(stepMonkEvangelism(monk, map, true, 2, .1)).toBe(false)
    expect(monk.preachingTask).toBeUndefined()
    expect(roadsideEvangelism(map)).toBe(0)
  })

  it.each([1, 42, 12345])("finds a reachable roadside position in generated world %i", seed => {
    const map = generateMap({ ...FLOOR, seed }), grounds = monkWander(map)
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
