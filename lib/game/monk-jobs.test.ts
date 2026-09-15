import { describe, expect, it } from "vitest"
import { chooseRelicKeeper, stepRelicKeeper, stopKeepingRelic, type WorkingMonk } from "./monk-jobs"
import { createMonkNeeds, MONK_TIRED_AT, MONK_WAKE_AT, stepMonkWork } from "./monk-work"
import { createMonkRoutine } from "./monk-routine"
import { monkWander } from "./monk-wander"
import { shrineLayout, shrineStations } from "./shrine-layout"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"
import { walkingSurface } from "./map/walking-surface"

function fixture(buildType = "enclosure") {
  const small = buildType === "chapel", size = small ? 2 : 3
  const map: GameMap = { width: 20, depth: 20, tiles: Array(400).fill("grass"),
    buildings: [{ id: "shrine", buildType, x: 8, z: 10, w: size, d: size, height: 1, label: "Shrine", color: "tan", roofColor: "brown" }],
    road: Array.from({ length: 20 }, (_, x) => ({ x, z: 4 })),
    site: { hovelId: "shrine", junction: 9, door: { x: 9, z: 10 + size }, branch: Array.from({ length: 9 }, (_, i) => ({ x: 9, z: 4 + i })) } }
  const grounds = monkWander(map), building = map.buildings[0]
  const { keeper } = shrineStations(building, map.site!.door), { altar } = shrineLayout(building, map.site!.door)
  const x = tileToWorldX(map, keeper.x), z = tileToWorldZ(map, keeper.z)
  const station = { x, z, y: walkingSurface(map, x, z).height, heading: Math.atan2(altar.x - keeper.x, altar.z - keeper.z) }
  const monks: WorkingMonk[] = [0, 1, 2].map(i => ({ ...createMonkRoutine(grounds, i, () => .5), ...createMonkNeeds(i),
    x: tileToWorldX(map, map.site!.door.x), y: 0, z: tileToWorldZ(map, map.site!.door.z), activity: "walking" }))
  return { map, grounds, station, monks }
}

describe("assignable monk jobs and relief", () => {
  it("prefers an assigned keeper, covers his rest, and excludes other jobs and missions", () => {
    const { monks } = fixture(), jobs = ["auto", "keeper", "builder"] as const
    expect(chooseRelicKeeper(monks, jobs, new Set(), 0)).toBe(1)
    monks[1].stamina = MONK_TIRED_AT
    expect(chooseRelicKeeper(monks, jobs, new Set(), 1)).toBe(0)
    expect(chooseRelicKeeper(monks, jobs, new Set([0]), 1)).toBeNull()
    monks[1].stamina = MONK_WAKE_AT
    expect(chooseRelicKeeper(monks, jobs, new Set(), 0)).toBe(1)
  })

  it.each(["enclosure", "chapel", "church"])("walks a replacement to the %s altar without teleporting, then allows rest", buildType => {
    const { map, grounds, station, monks } = fixture(buildType), monk = monks[0]
    const before = { x: monk.x, z: monk.z }
    expect(stepRelicKeeper(monk, map, grounds, station, 1, .1, false)).toBe(true)
    expect(Math.hypot(monk.x - before.x, monk.z - before.z)).toBeLessThanOrEqual(.10001)
    expect(monk.activity).toBe("toKeepRelic")
    for (let i = 0; i < 500 && monk.activity !== "keepingRelic"; i++) stepRelicKeeper(monk, map, grounds, station, 1, .1, false)
    expect(monk.activity).toBe("keepingRelic")
    expect(Math.hypot(monk.x - station.x, monk.z - station.z)).toBeLessThan(.01)
    stepRelicKeeper(monk, map, grounds, station, 1, 1, true)
    expect(monk.activity).toBe("showingRelic")
    monk.stamina = MONK_TIRED_AT
    stopKeepingRelic(monk, map, grounds)
    for (let i = 0; i < 100 && monk.activity !== "resting"; i++) stepMonkWork(monk, map, 1, 1, false)
    expect(Math.hypot(monk.x - station.x, monk.z - station.z)).toBeGreaterThan(.5)
    expect(monk.keeperDuty).toBeUndefined()
    expect(monk.activity).toBe("resting")
    expect(monk.stamina).toBeGreaterThan(MONK_TIRED_AT)
  })

  it("does not interrupt a sleeping monk before he has recovered", () => {
    const { monks } = fixture()
    monks[0].outdoorRest = true; monks[0].stamina = 60
    expect(chooseRelicKeeper(monks, ["keeper", "auto", "auto"], new Set(), null)).toBe(1)
  })

  it("lets an exhausted builder leave unfinished work for another brother", () => {
    const { map, monks } = fixture(), monk = monks[0]
    map.buildings.push({ id: "table", buildType: "alms-table", x: 14, z: 10, w: 1, d: 1,
      label: "Alms table", height: .65, color: "tan", roofColor: "tan", construction: { work: 0, required: 100 } })
    stepMonkWork(monk, map, 1, .1)
    expect(monk.buildingTask?.purpose).toBe("build")
    monk.stamina = MONK_TIRED_AT
    stepMonkWork(monk, map, 1, .1)
    expect(monk.buildingTask?.purpose).not.toBe("build")
    expect(map.buildings[1].construction!.work).toBeLessThan(100)
  })
})
