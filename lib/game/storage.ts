import { buildingEntry } from "./building-rotation"
import type { BuildingDef, GameMap } from "./map/types"
import { worldToTileX, worldToTileZ } from "./map/types"
import { settlementRoute } from "./settlement-route"

export const FOOD_TYPES = ["grain", "vegetables", "fruit", "fish"] as const
export type FoodType = typeof FOOD_TYPES[number]
export type FoodStock = Record<FoodType, number>
export const STOREHOUSE_FOOD_CAPACITY = 200
export const FOOD_LABELS: Record<FoodType, string> = {
  grain: "Grain", vegetables: "Vegetables", fruit: "Fruit", fish: "Fish",
}
export const emptyFoodStock = (): FoodStock => ({ grain: 0, vegetables: 0, fruit: 0, fish: 0 })
export const storedFood = (stock: FoodStock): number => FOOD_TYPES.reduce((sum, type) => sum + stock[type], 0)

/** Shared capacity across foods. Returns the amount accepted; excess stays with the caller. */
export function depositFood(stores: Map<string, FoodStock>, building: BuildingDef, type: FoodType, amount: number): number {
  if (building.buildType !== "storehouse" || !Number.isSafeInteger(amount) || amount <= 0) return 0
  const stock = stores.get(building.id) ?? emptyFoodStock()
  const accepted = Math.min(amount, Math.max(0, STOREHOUSE_FOOD_CAPACITY - storedFood(stock)))
  if (accepted) stores.set(building.id, { ...stock, [type]: stock[type] + accepted })
  return accepted
}

export function withdrawFood(stores: Map<string, FoodStock>, id: string, type: FoodType, amount: number): number {
  const stock = stores.get(id)
  if (!stock || !Number.isSafeInteger(amount) || amount <= 0) return 0
  const taken = Math.min(amount, stock[type])
  if (taken) stores.set(id, { ...stock, [type]: stock[type] - taken })
  return taken
}

/** Prefer the closest reachable storehouse; a hut can receive its own harvest until one is built. */
export function timberDestination(map: GameMap, buildings: readonly BuildingDef[], employer: string, from: { x: number; z: number }) {
  const start = { x: worldToTileX(map, from.x), z: worldToTileZ(map, from.z) }
  const stores = buildings.filter(b => b.buildType === "storehouse")
    .flatMap(building => {
      const route = settlementRoute(map, buildings, start, buildingEntry(building), true)
      return route ? [{ building, route }] : []
    }).sort((a, b) => a.route.length - b.route.length)
  if (stores.length) return stores[0]
  const hut = buildings.find(b => b.id === employer)
  if (!hut) return null
  const route = settlementRoute(map, buildings, start, buildingEntry(hut), true)
  return route ? { building: hut, route } : null
}
