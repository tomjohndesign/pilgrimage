import { describe, expect, it } from "vitest"
import { assignBuildingTask, buildingEntrance, constructionStandOff, constructionStage, constructionWork, isComplete, stepBuildingTask, type Worker } from "./construction"
import { constructionParts } from "./building-art/construction"
import { structureParts } from "./building-art/structure"
import { generateMap } from "./map/generate-map"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import { monkWander } from "./monk-wander"
import { createMonkRoutine, stepMonkRoutine } from "./monk-routine"
import { createMonkNeeds, MONK_WAKE_AT, stepMonkWork } from "./monk-work"
import { settlementRoute } from "./settlement-route"
import { makeRng } from "./rng"
import { lumberCamps } from "./settlement"

function fixture(): GameMap {
  return { width: 18, depth: 18, tiles: Array(324).fill("grass"),
    buildings: [
      { id: "shrine", label: "Shrine", x: 7, z: 7, w: 3, d: 3, height: 1, color: "", roofColor: "" },
      { id: "shelter", buildType: "shelter", label: "Monk shelter", x: 7, z: 4, w: 2, d: 2, height: 0.7, color: "", roofColor: "" },
      { id: "lumberCamp-0", buildType: "lumberCamp", label: "Site", x: 2, z: 10, w: 2, d: 2, height: 0.1, color: "", roofColor: "", construction: { work: 0, required: 12 } },
    ], site: { hovelId: "shrine", door: { x: 8, z: 10 }, branch: [], junction: 0 } }
}
function worker(map: GameMap, x = 8, z = 10): Worker {
  return { x: tileToWorldX(map, x), y: 0, z: tileToWorldZ(map, z) }
}

describe("resident construction", () => {
  it("makes small sites quick and large footprints disproportionately slower", () => {
    expect(constructionWork(1, 1)).toBe(12)
    expect(constructionWork(2, 2)).toBe(96)
    expect(constructionWork(3, 2)).toBe(216)
    expect(constructionWork(4, 3)).toBe(864)
  })

  it.each([false, true])("keeps the current job when another site is placed (at work: %s)", atWork => {
    const map = fixture(), actor = worker(map), site = map.buildings[2]
    assignBuildingTask(actor, map, "build")
    if (atWork) while (actor.buildingTask!.route.length) stepBuildingTask(actor, map, 1, 0.1)
    const task = actor.buildingTask!, route = task.route, position = { x: actor.x, z: actor.z }
    map.buildings = [...map.buildings, { ...site, id: "new-site", x: 12, z: 12, construction: { work: 0, required: 96 } }]
    expect(stepBuildingTask(actor, map, 1, 0.1)).toBe(atWork ? "building" : "walking")
    expect(actor.buildingTask).toBe(task)
    expect(actor.buildingTask!.route).toBe(route)
    expect(actor.buildingTask!.buildingId).toBe(site.id)
    if (atWork) {
      expect({ x: actor.x, z: actor.z }).toEqual(position)
      expect(site.construction!.work).toBeCloseTo(0.1)
    }
    expect(map.buildings.at(-1)!.construction!.work).toBe(0)
  })

  it("reserves sites without jobs and only advances after a worker arrives", () => {
    const map = fixture(), site = map.buildings[2], actor = worker(map)
    expect(lumberCamps(map)).toHaveLength(0)
    expect(assignBuildingTask(actor, map, "build")).toBe(true)
    stepBuildingTask(actor, map, 1, 0)
    expect(site.construction!.work).toBe(0)
    expect(stepBuildingTask(actor, map, 1, 0.1)).toBe("walking")
    expect(site.construction!.work).toBe(0)
    for (let i = 0; i < 400; i++) stepBuildingTask(actor, map, 1, 0.1)
    expect(isComplete(site)).toBe(true)
    expect(site.construction!.work).toBe(12)
    expect(actor.buildingTask).toBeUndefined()
    expect(lumberCamps(map)).toHaveLength(1)
  })

  it("lets a resident step out of a newly placed footprint to build it", () => {
    const map = fixture(), site = map.buildings[2], actor = worker(map, site.x, site.z)
    expect(assignBuildingTask(actor, map, "build")).toBe(true)
    for (let i = 0; i < 200; i++) stepBuildingTask(actor, map, 1, 0.1)
    expect(isComplete(site)).toBe(true)
    expect(actor.z).toBeCloseTo(tileToWorldZ(map, site.z + site.d) - 0.555 + constructionStandOff())
  })

  it("adds cooperative work without crediting absent or paused workers", () => {
    const map = fixture(), site = map.buildings[2], a = worker(map, 2, 12), b = worker(map, 2, 12)
    for (const actor of [a, b]) {
      assignBuildingTask(actor, map, "build")
      while (actor.buildingTask!.route.length) stepBuildingTask(actor, map, 1, 0.1)
    }
    for (let i = 0; i < 10; i++) for (const actor of [a, b]) stepBuildingTask(actor, map, 1, 0.1)
    expect(site.construction!.work).toBeCloseTo(2)
    stepBuildingTask(a, map, 1, 0)
    expect(site.construction!.work).toBeCloseTo(2)
  })

  it("rejects unreachable sites and releases jobs if placement blocks the route", () => {
    const map = fixture(), actor = worker(map)
    expect(assignBuildingTask(actor, map, "build")).toBe(true)
    map.tiles[12 * map.width + 2] = map.tiles[12 * map.width + 3] = "water"
    map.buildings = [...map.buildings, { ...map.buildings[0], id: "new-wall", x: 2, z: 12, w: 2, d: 1 }]
    expect(stepBuildingTask(actor, map, 1, 0.1)).toBeNull()
    expect(actor.buildingTask).toBeUndefined()
    expect(assignBuildingTask(actor, map, "build")).toBe(false)
  })

  it("routes around a new obstruction while remaining focused on the original site", () => {
    const map = fixture(), actor = worker(map), site = map.buildings[2]
    assignBuildingTask(actor, map, "build")
    const oldRoute = actor.buildingTask!.route
    const point = oldRoute[Math.floor(oldRoute.length / 2)]
    map.buildings = [...map.buildings, { ...site, id: "route-obstacle", x: worldToTileX(map, point.x), z: worldToTileZ(map, point.z), w: 1, d: 1,
      construction: { work: 0, required: 96 } }]
    expect(stepBuildingTask(actor, map, 1, 0.1)).toBe("walking")
    expect(actor.buildingTask!.buildingId).toBe(site.id)
    expect(actor.buildingTask!.route).not.toBe(oldRoute)
    for (let i = 0; i < 400; i++) stepBuildingTask(actor, map, 1, 0.1)
    expect(isComplete(site)).toBe(true)
    expect(map.buildings.at(-1)!.construction!.work).toBe(0)
  })

  it.each([0.5, 1.5, 4])("stands at mallet reach from the wall at character scale %s", scale => {
    const map = fixture(), site = map.buildings[2]
    const actors = Array.from({ length: 4 }, (_, workSlot) => ({ ...worker(map), workSlot, workScale: scale }))
    for (const actor of actors) {
      assignBuildingTask(actor, map, "build")
      while (actor.buildingTask!.route.length) stepBuildingTask(actor, map, 1, 0.1)
      const front = tileToWorldZ(map, site.z + site.d) - 0.555
      expect(actor.z - front).toBeCloseTo(constructionStandOff(scale))
      expect(site.construction!.work).toBe(0)
    }
    expect(new Set(actors.map(a => a.x)).size).toBe(4)
  })

  it("keeps builders at the wall when a visual stage republishes the map", () => {
    const map = fixture(), actor = worker(map)
    assignBuildingTask(actor, map, "build")
    while (actor.buildingTask!.route.length) stepBuildingTask(actor, map, 1, 0.1)
    const before = { x: actor.x, z: actor.z }
    map.buildings = [...map.buildings]
    expect(stepBuildingTask(actor, map, 1, 0.1)).toBe("building")
    expect({ x: actor.x, z: actor.z }).toEqual(before)
  })

  it("walks back into reach before working if a builder has been moved away", () => {
    const map = fixture(), actor = worker(map), site = map.buildings[2]
    assignBuildingTask(actor, map, "build")
    while (actor.buildingTask!.route.length) stepBuildingTask(actor, map, 1, 0.1)
    actor.z += 2
    expect(stepBuildingTask(actor, map, 1, 0.1)).toBe("walking")
    expect(site.construction!.work).toBe(0)
  })

  it("shows foundations, scaffolding, walls, then the complete building", () => {
    const site = fixture().buildings[1]
    site.construction = { work: 0, required: 30 }
    expect(constructionStage(site)).toBe(0)
    expect(constructionParts(site).some(p => p.layer === "roof")).toBe(false)
    site.construction.work = 10
    expect(constructionParts(site).some(p => p.name.startsWith("construction-platform"))).toBe(true)
    site.construction.work = 20
    expect(constructionStage(site)).toBe(2)
    expect(constructionParts(site).some(p => p.layer === "roof")).toBe(false)
    site.construction.work = 30
    expect(constructionParts(site)).toEqual(structureParts(site))
  })
})

describe("monk fatigue and rest", () => {
  it("leaves work when tired, walks to shelter, sleeps, then resumes work and prayer", () => {
    const map = fixture(), grounds = monkWander(map), rng = makeRng(1)
    const monk = { ...createMonkRoutine(grounds, 0, rng), ...createMonkNeeds(0), stamina: 26 }
    map.buildings[2].construction!.required = 30
    let slept = false, woke = false, built = false, prayed = false
    for (let i = 0; i < 4000; i++) {
      if (!stepMonkWork(monk, map, 1, 0.1)) stepMonkRoutine(monk, grounds, rng, 1, 0.1)
      if (monk.activity === "sleeping") {
        slept = true
        expect(monk.x).toBe(tileToWorldX(map, 7))
        expect(monk.z).toBeCloseTo(tileToWorldZ(map, 4) + 0.5 - 0.16)
      }
      if (slept && monk.stamina >= MONK_WAKE_AT) woke = true
      if (woke && monk.activity === "building") built = true
      if (built && monk.activity === "praying") prayed = true
    }
    expect({ slept, woke, built, prayed }).toEqual({ slept: true, woke: true, built: true, prayed: true })
    expect(isComplete(map.buildings[2])).toBe(true)
  })

  it("does not regenerate stamina while walking or paused, or use an unfinished shelter", () => {
    const map = fixture(), rng = makeRng(2), monk = { ...createMonkRoutine(monkWander(map), 0, rng), ...createMonkNeeds(0), stamina: 10 }
    stepMonkWork(monk, map, 1, 0.1)
    expect(monk.activity).toBe("toShelter")
    expect(monk.stamina).toBeLessThan(10)
    const stamina = monk.stamina, x = monk.x, z = monk.z
    stepMonkWork(monk, map, 1, 0)
    expect([monk.stamina, monk.x, monk.z]).toEqual([stamina, x, z])
    map.buildings[1].construction = { work: 0, required: 10 }
    monk.buildingTask = undefined
    expect(assignBuildingTask(monk, map, "rest")).toBe(false)
  })

  it.each([1, 42, 12345, 99817])("connects the founding shelter to shrine gates on seed %s", seed => {
    const map = generateMap({ seed }), shelter = map.buildings.find(b => b.id === "founding-shelter")!
    expect(shelter).toBeDefined()
    expect(isComplete(shelter)).toBe(true)
    expect(settlementRoute(map, map.buildings, map.site!.door, buildingEntrance(shelter), false, true)).not.toBeNull()
  })
})
