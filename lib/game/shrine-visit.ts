import { shrineLayout, shrineSeats, shrineStations, shrinePoint } from "./shrine-layout"
import { buildingStepAllowed, shrineGates } from "./building-navigation"
import { tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./map/types"
import { settlementRoute, shrineApproach } from "./settlement-route"

/** Kept at zero for older saved economy/debug fields. Entry is always free. */
export const DEFAULT_ADMISSION_FEE = 0

/** A voluntary whole-coin gift: anyone may give nothing, and piety raises both
 * willingness and the range of gifts. Never spend coins the visitor lacks. */
export function shrineDonation(piety: number, gold: number, rng: () => number): number {
  const devotion = Math.max(0, Math.min(100, piety)) / 100
  if (rng() >= .15 + devotion * .75) return 0
  return Math.min(Math.max(0, Math.floor(gold)), 1 + Math.floor(rng() * (1 + Math.floor(devotion * 9))))
}

/** Reserve an aisle queue place or an open floor space for private prayer. */
export function shrineVisitPlan(map: GameMap, visitor: number, visits: number, occupied: ReadonlySet<string> = new Set(), from?: TilePos, prayer = (visitor + visits) % 4 === 3) {
  const site = map.site
  const shrine = map.buildings.find(b => b.id === site?.hovelId)
  if (!site || !shrine) return null
  const gate = shrineGates(shrine, site.door)[0]
  const branch = shrineApproach(map, from)
  if (!branch.length || !buildingStepAllowed(map, map.buildings, gate.outside, gate.inside, true)) return null
  const stations = shrineStations(shrine, site.door)
  const places = prayer ? shrineSeats(shrine, site.door) : Array.from({ length: stations.queueCapacity }, (_, i) => ({ id: `queue-${i}`, tile: stations.viewing }))
  const place = places.find(p => !occupied.has(p.id))
  if (!place) return null
  const inside = settlementRoute(map, map.buildings, gate.inside, place.tile, false, true)
  const approach = settlementRoute(map, map.buildings, site.door, gate.outside)
  return inside && approach ? { seat: place.id, route: [...branch, ...approach.slice(1), ...inside] } : null
}

/** Exit by the side of the nave, visiting the wall box before the single door.
 * Stored in reverse because the simulation walks departure routes backwards. */
export function shrineExitPlan(map: GameMap, from: TilePos, arrival: TilePos[]) {
  const shrine = map.buildings.find(b => b.id === map.site?.hovelId)
  if (!shrine || !map.site) return null
  const { offering } = shrineStations(shrine, map.site.door)
  const layout = shrineLayout(shrine, map.site.door)
  const dx = from.x - shrine.x - Math.floor(shrine.w / 2), dz = from.z - shrine.z - Math.floor(shrine.d / 2)
  const localZ = dx * Math.round(Math.sin(layout.rotation)) + dz * Math.round(Math.cos(layout.rotation))
  const side = shrinePoint(shrine, map.site.door, 1, localZ)
  const sideways = settlementRoute(map, map.buildings, from, side, false, true)
  const toBox = settlementRoute(map, map.buildings, side, offering, false, true)
  const gate = shrineGates(shrine, map.site.door)[0]
  const toDoor = settlementRoute(map, map.buildings, offering, gate.inside, false, true)
  const gateIndex = arrival.findIndex(p => p.x === gate.inside.x && p.z === gate.inside.z)
  // Parked visitors have their own approach, so route back to their hitch.
  const outside = gateIndex >= 0 ? arrival.slice(0, gateIndex + 1).reverse()
    : settlementRoute(map, map.buildings, gate.inside, arrival[0], false, true)
  if (!sideways || !toBox || !toDoor || !outside) return null
  const exit = [...sideways, ...toBox.slice(1), ...toDoor.slice(1), ...outside.slice(1)]
  const route = exit.reverse()
  return { route, offeringProgress: route.findIndex(p => p.x === offering.x && p.z === offering.z) }
}

export function shrineVisitRoute(map: GameMap, visitor: number, visits: number): TilePos[] | null {
  return shrineVisitPlan(map,visitor,visits)?.route ?? null
}

/** Face the relic beneath the altar towards the rear. */
export function relicHeading(map: GameMap, visitor: { x: number; z: number }): number | null {
  const shrine = map.buildings.find(b => b.id === map.site?.hovelId)
  if (!shrine) return null
  const { altar } = shrineLayout(shrine, map.site?.door)
  return Math.atan2(tileToWorldX(map, altar.x) - visitor.x, tileToWorldZ(map, altar.z) - visitor.z)
}
