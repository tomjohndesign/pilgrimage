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
export const SEAT_REST_THRESHOLD = 50
export const SEAT_STAMINA_PER_HOUR = 4
/** A short seated break, in game hours; sleep remains the main recovery. */
export const TABLE_HOURS = 2

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
  const serving = tavernLayout(local.w, local.d, building.layoutSeed, building.hearthZ).serving
  const point = localPoint(map, building, serving.x, serving.z)
  const tile = { x: worldToTileX(map, point.x), z: worldToTileZ(map, point.z) }
  return { tile, point: { ...point, y: surfaceHeight(map, tile.x, tile.z) } }
}

/** The authored chairs and benches, in the order visitors take them. */
export function tavernSeats(map: GameMap, building: BuildingDef): TavernSeat[] {
  if (building.buildType !== "tavern") return []
  return buildingSeats(map, building)
}

function buildingSeats(map: GameMap, building: BuildingDef): TavernSeat[] {
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
  /** World-space route to the counter, or directly to a seat for a free rest. */
  route: TavernWalkPoint[]
}

/**
 * Prefer a free bench, sharing an occupied one when needed. Only promise a
 * trip that can be walked: to the counter first, then on to the seat.
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
  if (building.buildType !== "tavern") return { buildingId: building.id, counter, seat: null, route }
  const seats = tavernSeats(map, building)
  const reserved = (seat: TavernSeat) => occupied.has(`${building.id}:${seat.id}`)
  for (const seat of [...seats.filter(seat => !reserved(seat)), ...seats.filter(reserved)]) {
    if (tavernWalkingRoute(map, counter.point, seat.point, seat.id)) {
      return { buildingId: building.id, counter, seat, route }
    }
  }
  return null
}

/** A free short rest uses a tavern seat or an exterior chair, without needing a keeper. */
export function seatRestPlan(map: GameMap, building: BuildingDef, from: TavernWalkPoint,
  occupied: ReadonlySet<string>): TavernPlan | null {
  if (!isComplete(building)) return null
  const seats = buildingSeats(map, building).filter(seat =>
    (building.buildType === "tavern" || seat.id.startsWith("entry-")) && !occupied.has(`${building.id}:${seat.id}`))
    .sort((a, b) => Number(b.id.startsWith("tavern-outside")) - Number(a.id.startsWith("tavern-outside")))
  for (const seat of seats) {
    const fine = tavernWalkingRoute(map, from, seat.point, seat.id)
    const route = fine === undefined ? settlementRoute(map, map.buildings,
      { x: worldToTileX(map, from.x), z: worldToTileZ(map, from.z) }, seat.tile, false, true)
      ?.map(p => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z), y: surfaceHeight(map, p.x, p.z) })) : fine
    if (route) return { buildingId: building.id, seat, counter: { tile: seat.tile, point: seat.point },
      route: [...route, seat.point] }
  }
  return null
}
