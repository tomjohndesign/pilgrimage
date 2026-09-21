import { buildingEntry, rotatedFootprint } from "./building-rotation"
import { coopLayout } from "./coop-layout"
import { coopPoint } from "./chicken-coop"
import { isComplete, walkWorker, workerRoute } from "./construction"
import { walkingSurface } from "./map/walking-surface"
import type { GameMap } from "./map/types"
import type { WanderSpot } from "./monk-wander"
import { penGate } from "./pen-gate"
import type { SimTraveler } from "./sim"
import { depositFood, emptyFoodStock, storedFood, STOREHOUSE_FOOD_CAPACITY, withdrawFood, type FoodStock } from "./storage"
import type { WildlifeWorld } from "./wildlife/simulation"

export interface CoopEggTask {
  coopId: string; storeId: string; route: WanderSpot[]; deliveryRoute: WanderSpot[]
  stage: "approach" | "opening" | "collecting" | "closing" | "delivery"
  timer: number; heading: number; amount: number
  buildings: GameMap["buildings"]
}
export function releaseCoopEggs(actor: SimTraveler, world?: WildlifeWorld | null) {
  if (actor.coopEggs && world?.coopKeepers?.get(actor.coopEggs.coopId) === actor.id) world.coopKeepers.delete(actor.coopEggs.coopId)
  actor.coopEggs = undefined
}

/** A keeper uses the reserved rear approach; the small henhouse is never a human walking route. */
export function seekCoopEggs(actor: SimTraveler, world: WildlifeWorld | null | undefined, map: GameMap, stores: Map<string, FoodStock>) {
  if (!world || actor.coopEggs) return false
  const coop = map.buildings.find(b => b.id === actor.employer && b.buildType === "chicken-coop" && isComplete(b))
  if (!coop || !(stores.get(coop.id)?.eggs ?? 0) || world.coopKeepers?.has(coop.id)) return false
  const { w, d } = rotatedFootprint(coop, coop.rotation), layout = coopLayout(w, d)
  const at = coopPoint(map, coop, layout.keeper.x, layout.keeper.z), stand = { ...at, y: walkingSurface(map, at.x, at.z).height }
  const route = workerRoute(map, actor, buildingEntry(coop, false, -1))
  if (!route) return false
  route.push(stand)
  const store = map.buildings.filter(b => b.buildType === "storehouse" && isComplete(b) && storedFood(stores.get(b.id) ?? emptyFoodStock()) < STOREHOUSE_FOOD_CAPACITY)
    .flatMap(building => { const route = workerRoute(map, stand, buildingEntry(building)); return route ? [{ building, route }] : [] })
    .sort((a, b) => a.route.length - b.route.length)[0]
  if (!store) return false
  const hatch = coopPoint(map, coop, layout.keeper.x, layout.back)
  world.coopKeepers ??= new Map(); world.coopKeepers.set(coop.id, actor.id)
  actor.coopEggs = { coopId: coop.id, storeId: store.building.id, route, deliveryRoute: store.route,
    stage: "approach", timer: 3, heading: Math.atan2(hatch.x - stand.x, hatch.z - stand.z), amount: 0, buildings: map.buildings }
  actor.buildingTask = undefined; actor.activity = "collectingEggs"
  return true
}

/** Egg counts stay at the coop until delivery succeeds, so interruption or saving cannot lose a basket. */
export function stepCoopKeeper(actor: SimTraveler, world: WildlifeWorld | null | undefined, map: GameMap, speed: number, dt: number, stores: Map<string, FoodStock>) {
  const task = actor.coopEggs
  if (!world || !task) return false
  const coop = map.buildings.find(b => b.id === task.coopId && b.id === actor.employer && isComplete(b))
  const store = map.buildings.find(b => b.id === task.storeId && isComplete(b))
  if (!coop || !store || map.buildings !== task.buildings) { releaseCoopEggs(actor, world); return false }
  if (dt <= 0) return true
  if (task.route.length) {
    const goal = task.route[0]
    // Retain the final hatch-facing heading during the collecting action.
    if (task.stage === "delivery") task.heading = Math.atan2(goal.x - actor.x, goal.z - actor.z)
    walkWorker(actor, task.route, speed, dt, true)
    return true
  }
  const hatch = penGate(world, coop.id)
  if (task.stage === "approach") task.stage = "opening"
  if (task.stage === "opening" || task.stage === "collecting") hatch.holdUntil = hatch.clock + 1
  if (task.stage === "opening") {
    if (hatch.open >= .98) task.stage = "collecting"
    return true
  }
  if (task.stage === "collecting") {
    task.timer -= dt
    if (task.timer > 0) return true
    task.amount = Math.min(6, stores.get(coop.id)?.eggs ?? 0)
    task.stage = "closing"; hatch.holdUntil = hatch.clock
    return true
  }
  if (task.stage === "closing") {
    if (hatch.open > .02) return true
    task.stage = "delivery"; task.route = task.deliveryRoute; actor.activity = "deliveringEggs"
    return true
  }
  const accepted = depositFood(stores, store, "eggs", Math.min(task.amount, stores.get(coop.id)?.eggs ?? 0))
  withdrawFood(stores, coop.id, "eggs", accepted)
  releaseCoopEggs(actor, world)
  return false
}
