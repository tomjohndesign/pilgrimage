import { shrineLayout, shrineSeats, shrineStations, shrinePoint } from "./shrine-layout"
import { buildingStepAllowed, shrineFurnitureClear, shrineGates } from "./building-navigation"
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

/** Spacing along the approach between people lined up for the relic, in route steps. */
export const QUEUE_SPACING = .75

/** Single-file places for the relic: the nave holds a few, and the line continues
 * out of the door and back along the branch, as far as the branch can hold. */
export function shrineQueuePlaces(map: GameMap): number {
  const site = map.site, shrine = map.buildings.find(b => b.id === site?.hovelId)
  if (!site || !shrine) return 0
  return shrineStations(shrine, site.door).queueCapacity + Math.floor(site.branch.length / QUEUE_SPACING)
}

/** Reserve a queue place, private prayer spot, or place in a company’s shared viewing. */
export function shrineVisitPlan(map: GameMap, visitor: number, visits: number, occupied: ReadonlySet<string> = new Set(), from?: TilePos, prayer = (visitor + visits) % 4 === 3, group = false, relicShown = true) {
  const site = map.site
  const shrine = map.buildings.find(b => b.id === site?.hovelId)
  if (!site || !shrine) return null
  // Nobody joins the line while no keeper shows the relic; it would only stand
  // there. Private prayer needs no keeper.
  if (!relicShown && (group || !prayer)) return null
  const gate = shrineGates(shrine, site.door)[0]
  // Only a line longer than the branch turns visitors away before any route is
  // planned for them. Companies and single visitors take the nave in turns,
  // waiting outside the door for each other; see the relic approach in the sim.
  const stations = shrineStations(shrine, site.door)
  // One company occupies the nave together. Subtile places keep the largest
  // twenty-person companies inside even the small founding church.
  const groupPlaces: { id: string; tile: TilePos; point: TilePos }[] = []
  if (group) for (let z = shrine.z; z < shrine.z + shrine.d; z++) for (let x = shrine.x; x < shrine.x + shrine.w; x++) {
    const tile = { x, z }
    if (!buildingStepAllowed(map, map.buildings, tile, tile, true) || (x === stations.keeper.x && z === stations.keeper.z)) continue
    for (const dx of [-.2, .2]) for (const dz of [-.2, .2]) {
      const point = { x: x + dx, z: z + dz }
      if (shrineFurnitureClear(shrine, site.door, tile, point)) groupPlaces.push({ id: `group-${x}-${z}-${dx}-${dz}`, tile, point })
    }
  }
  groupPlaces.sort((a, b) => Math.hypot(a.point.x - stations.viewing.x, a.point.z - stations.viewing.z)
    - Math.hypot(b.point.x - stations.viewing.x, b.point.z - stations.viewing.z))
  const places = group ? groupPlaces : prayer ? shrineSeats(shrine, site.door) : Array.from({ length: shrineQueuePlaces(map) }, (_, i) => ({ id: `queue-${i}`, tile: stations.viewing }))
  const place = places.find(p => !occupied.has(p.id))
  if (!place || !buildingStepAllowed(map, map.buildings, gate.outside, gate.inside, true)) return null
  const branch = shrineApproach(map, from)
  if (!branch.length) return null
  const inside = settlementRoute(map, map.buildings, gate.inside, place.tile, false, true)
  const approach = settlementRoute(map, map.buildings, site.door, gate.outside)
  return inside && approach ? { seat: place.id, point: group ? groupPlaces.find(p => p.id === place.id)!.point : undefined, route: [...branch, ...approach.slice(1), ...inside] } : null
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
