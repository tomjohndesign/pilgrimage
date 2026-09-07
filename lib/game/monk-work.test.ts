import { describe, expect, it } from "vitest"
import { monkWander } from "./monk-wander"
import { createMonkRoutine } from "./monk-routine"
import { replanMonkAfterMapChange } from "./monk-work"
import { makeRng } from "./rng"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "./map/types"

function shrineMap(): GameMap {
  return {
    width: 11, depth: 11, tiles: Array(121).fill("grass"),
    buildings: [{ id: "shrine", x: 4, z: 4, w: 3, d: 3, height: 1, label: "Shrine", color: "", roofColor: "" }],
    site: { hovelId: "shrine", door: { x: 5, z: 7 }, junction: 0, branch: [] },
  }
}

function site(id: string, x: number, z: number): BuildingDef {
  return { id, x, z, w: 1, d: 1, height: 1, label: "Hut", color: "", roofColor: "",
    construction: { work: 0, required: 10, cost: { gold: 0, wood: 0 } } }
}

const spot = (map: GameMap, x: number, z: number) => ({ x: tileToWorldX(map, x), y: 0, z: tileToWorldZ(map, z) })
const inside = (map: GameMap, p: { x: number; z: number }, b: BuildingDef) =>
  Math.floor(p.x + map.width / 2) === b.x && Math.floor(p.z + map.depth / 2) === b.z

describe("replanning brothers after the map changes", () => {
  it("leaves a brother alone when the new building is off his route", () => {
    const map = shrineMap(), wander = monkWander(map)
    const monk = createMonkRoutine(wander, 0, makeRng(1))
    Object.assign(monk, spot(map, 2, 8), { route: [3, 4, 5, 6, 7, 8].map(x => spot(map, x, 8)), activity: "walking", pause: 0, destination: "grounds" })
    const route = monk.route, placed = { ...map, buildings: [...map.buildings, site("settlement-0", 2, 2)] }
    replanMonkAfterMapChange(monk, placed, monkWander(placed))
    expect(monk.route).toBe(route)
    expect(monk.activity).toBe("walking")
    expect(monk.destination).toBe("grounds")
    expect(monk.x).toBe(spot(map, 2, 8).x)
  })

  it("re-plans around a footprint placed across the route, keeping the goal", () => {
    const map = shrineMap(), wander = monkWander(map)
    const monk = createMonkRoutine(wander, 0, makeRng(1))
    Object.assign(monk, spot(map, 2, 8), { route: [3, 4, 5, 6, 7, 8].map(x => spot(map, x, 8)), activity: "walking", pause: 0, destination: "grounds" })
    const hut = site("settlement-0", 5, 8), placed = { ...map, buildings: [...map.buildings, hut] }
    replanMonkAfterMapChange(monk, placed, monkWander(placed))
    expect(monk.route.length).toBeGreaterThan(0)
    expect(monk.route.some(p => inside(placed, p, hut))).toBe(false)
    expect(monk.route[monk.route.length - 1]).toMatchObject({ x: spot(map, 8, 8).x, z: spot(map, 8, 8).z })
    expect(monk.destination).toBe("grounds")
    expect(monk.x).toBe(spot(map, 2, 8).x)
  })

  it("walks a resting brother out from under a fresh footprint", () => {
    const map = shrineMap(), wander = monkWander(map)
    const monk = createMonkRoutine(wander, 0, makeRng(1))
    Object.assign(monk, spot(map, 5, 8), { route: [], activity: "resting", pause: 3, destination: "grounds" })
    const placed = { ...map, buildings: [...map.buildings, site("settlement-0", 5, 8)] }
    replanMonkAfterMapChange(monk, placed, monkWander(placed))
    expect(monk.destination).toBe("home")
    expect(monk.pause).toBe(0)
    expect(monk.route[monk.route.length - 1]).toMatchObject({ x: spot(map, 5, 7).x, z: spot(map, 5, 7).z })
  })
})
