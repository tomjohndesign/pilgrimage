import { buildingEntry, type BuildingRotation } from "./building-rotation"
import { describe, expect, it } from "vitest"
import { FOOD_TYPES, STOREHOUSE_FOOD_CAPACITY, depositFood, withdrawFood, storedFood, timberDestination, type FoodStock } from "./storage"
import { buildingStepAllowed } from "./building-navigation"
import { woodcutterHuts } from "./settlement"
import type { BuildingDef, GameMap } from "./map/types"
import { tileToWorldX, tileToWorldZ } from "./map/types"

const building = (id: string, x = 2, z = 2): BuildingDef => ({
  id, buildType: id === "hut" ? "workshop" : "storehouse", label: id,
  x, z, w: 2, d: 2, height: .85, color: "tan", roofColor: "brown",
})
const world = (): GameMap => ({ width: 16, depth: 16, tiles: Array(256).fill("grass"), buildings: [building("hut"), building("store", 8, 2)] })

describe("storehouse inventory", () => {
  it.each([0, 1, 2, 3] as BuildingRotation[])("delivers to rotated storehouse and fallback hut entrances at rotation %i", rotation => {
    const map = world(), from = { x: tileToWorldX(map, 7), z: tileToWorldZ(map, 8) }
    for (const b of map.buildings) b.rotation = rotation
    const [hut, store] = map.buildings
    const destination = timberDestination(map, map.buildings, hut.id, from)
    expect(destination?.building.id).toBe(store.id)
    expect(destination?.route.at(-1)).toEqual(buildingEntry(store))
    const entrance = buildingEntry(store)
    map.tiles[entrance.z * map.width + entrance.x] = "water"
    const fallback = timberDestination(map, map.buildings, hut.id, from)
    expect(fallback?.building.id).toBe(hut.id)
    expect(fallback?.route.at(-1)).toEqual(buildingEntry(hut))
  })

  it("stores every food type under one capacity and keeps buildings separate", () => {
    const stores = new Map<string, FoodStock>(), store = building("store")
    for (const type of FOOD_TYPES) expect(depositFood(stores, store, type, 40)).toBe(40)
    expect(depositFood(stores, store, "grain", 100)).toBe(40)
    expect(storedFood(stores.get(store.id)!)).toBe(STOREHOUSE_FOOD_CAPACITY)
    expect(depositFood(stores, store, "fish", 1)).toBe(0)
    expect(depositFood(stores, building("second"), "fish", 25)).toBe(25)
    expect(withdrawFood(stores, store.id, "fruit", 90)).toBe(40)
    expect(depositFood(stores, store, "vegetables", 50)).toBe(40)
    expect(stores.get("second")?.fish).toBe(25)
  })
  it("refuses invalid quantities and food deliveries to a hut", () => {
    const stores = new Map<string, FoodStock>()
    expect(depositFood(stores, building("hut"), "grain", 10)).toBe(0)
    for (const amount of [-1, 0, NaN, Infinity, 1.5]) {
      expect(depositFood(stores, building("store"), "grain", amount)).toBe(0)
      expect(withdrawFood(stores, "store", "grain", amount)).toBe(0)
    }
    expect(stores.size).toBe(0)
  })
  it("gives jobs only to huts and keeps walking out of both enclosed footprints", () => {
    const map = world()
    expect(woodcutterHuts(map).map(b => b.id)).toEqual(["hut"])
    for (const b of map.buildings)
      expect(buildingStepAllowed(map, map.buildings, { x: b.x, z: b.z + b.d }, { x: b.x, z: b.z + b.d - 1 })).toBe(false)
  })
  it("chooses the nearest reachable store, then falls back to the hut if stores are cut off", () => {
    const map = world(), from = { x: tileToWorldX(map, 7), z: tileToWorldZ(map, 8) }
    map.buildings.push(building("far", 12, 2))
    expect(timberDestination(map, map.buildings, "hut", from)?.building.id).toBe("store")
    for (const b of map.buildings.filter(b => b.buildType === "storehouse")) map.tiles[(b.z + b.d) * map.width + b.x] = "water"
    expect(timberDestination(map, map.buildings, "hut", from)?.building.id).toBe("hut")
  })
})
