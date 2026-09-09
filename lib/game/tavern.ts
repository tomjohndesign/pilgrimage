import { tavernWalkingRoute, type TavernWalkPoint } from "./tavern-navigation"
import { tavernLayout } from "./tavern-layout"
import { rotateBuildingPoint, rotatedFootprint, buildingEntry } from "./building-rotation"
import { buildingSupports, placedSupport } from "./character-support"
import { isComplete } from "./construction"
import { surfaceHeight } from "./map/bridges"
import { settlementRoute } from "./settlement-route"
import { tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type BuildingDef, type GameMap, type TilePos } from "./map/types"

/**
 * Where the settlement sells food and drink. The shrine no longer feeds anyone:
 * a meal and a cup are bought with coin at a counter, and the takings belong to
 * the settlement (see `SimState.tradeGold`). Independent roadside towns run
 * their own counters and retain all their takings.
 *
 * Two counters exist. The tavern serves inside, and its customers carry the
 * cup to a table and sit down. A market stall kept by a settled vendor serves
 * over its frontage, and its customers drink standing and walk on.
 */

export const MEAL_PRICE = 2
export const DRINK_PRICE = 1
/** A counter only tops up a meter this low; a cup is not also half a dinner. */
export const SERVING_THRESHOLD = 60

export interface TavernSeat {
  id: string
  tile: TilePos
  point: { x: number; y: number; z: number }
  heading: number
}

/** All counters, including town taverns, require a keeper at their post. */
export function servingHouses(map: GameMap, staffed: (building: BuildingDef) => boolean): BuildingDef[] {
  return map.buildings.filter(b => isComplete(b)
    && (b.buildType === "tavern" || b.buildType === "market") && staffed(b))
}

function localPoint(map: GameMap, building: BuildingDef, x: number, z: number) {
  const offset = rotateBuildingPoint(x, z, building.rotation)
  return {
    x: tileToWorldX(map, building.x) + (building.w - 1) / 2 + offset.x,
    z: tileToWorldZ(map, building.z) + (building.d - 1) / 2 + offset.z,
  }
}

/**
 * The customers' side of the counter: inside the tavern, facing the servers
 * across it, or on the stall's own approach tile out in the open.
 */
export function servingCounter(map: GameMap, building: BuildingDef): { tile: TilePos; point: { x: number; y: number; z: number } } {
  if (building.buildType !== "tavern") {
    const tile = buildingEntry(building)
    return { tile, point: { x: tileToWorldX(map, tile.x), y: surfaceHeight(map, tile.x, tile.z), z: tileToWorldZ(map, tile.z) } }
  }
  const local = rotatedFootprint(building, building.rotation)
  const counter = tavernLayout(local.w, local.d).counter
  const point = localPoint(map, building, counter.x, counter.z + counter.d / 2 + .16)
  const tile = { x: worldToTileX(map, point.x), z: worldToTileZ(map, point.z) }
  return { tile, point: { ...point, y: surfaceHeight(map, tile.x, tile.z) } }
}

/** The authored bench places, in the order visitors take them. */
export function tavernSeats(map: GameMap, building: BuildingDef): TavernSeat[] {
  if (building.buildType !== "tavern") return []
  return buildingSupports(building, map)
    .filter(support => support.clips.includes("sitting"))
    .map(support => {
      const placed = placedSupport(map, building, support)
      const tile = { x: worldToTileX(map, placed.anchor.x), z: worldToTileZ(map, placed.anchor.z) }
      return { id: support.id, tile, heading: placed.heading,
        point: { x: placed.anchor.x, y: surfaceHeight(map, tile.x, tile.z), z: placed.anchor.z } }
    })
}

export interface TavernPlan {
  buildingId: string
  counter: { tile: TilePos; point: { x: number; y: number; z: number } }
  seat: TavernSeat | null
  /** World-space aisle route from the customer to the counter. */
  route: TavernWalkPoint[]
}

/**
 * Reserve a table before setting out, and only promise a trip that can actually
 * be walked: to the counter first, and on to the seat afterwards.
 */
export function tavernVisitPlan(
  map: GameMap,
  building: BuildingDef,
  from: TilePos,
  occupied: ReadonlySet<string> = new Set(),
  fromWorld?: TavernWalkPoint,
): TavernPlan | null {
  const counter = servingCounter(map, building)
  const start = fromWorld ?? { x: tileToWorldX(map, from.x), z: tileToWorldZ(map, from.z), y: surfaceHeight(map, from.x, from.z) }
  const fine = tavernWalkingRoute(map, start, counter.point)
  const route = fine === undefined ? settlementRoute(map, map.buildings, from, counter.tile, false, true)
    ?.map(p => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z), y: surfaceHeight(map, p.x, p.z) })) : fine
  if (!route) return null
  const seats = tavernSeats(map, building).filter(seat => !occupied.has(`${building.id}:${seat.id}`))
  if (building.buildType !== "tavern") return { buildingId: building.id, counter, seat: null, route }
  for (const seat of seats) {
    if (tavernWalkingRoute(map, counter.point, seat.point, seat.id)) {
      return { buildingId: building.id, counter, seat, route }
    }
  }
  return null
}
