import { isComplete } from "./construction"
import { isChapel, shrineLayout, shrineSeats, shrineStations, shrinePoint, shrineViewingPlaces } from "./shrine-layout"
import { buildingStepAllowed, containsTile, shrineGates } from "./building-navigation"
import { tileToWorldX, tileToWorldZ, type GameMap, type TilePos } from "./map/types"
import { settlementRoute, shrineApproach } from "./settlement-route"
import { BASE_CHARACTER_SCALE } from "./base-person/gait"
import { PERSON_WIDTH } from "./world-scale"

/** Kept at zero for older saved economy/debug fields. Entry is always free. */
export const DEFAULT_ADMISSION_FEE = 0

/** A voluntary whole-coin gift: anyone may give nothing, and piety raises both
 * willingness and the range of gifts. Never spend coins the visitor lacks. */
export function shrineDonation(piety: number, gold: number, rng: () => number, multiplier = 1): number {
  const devotion = Math.max(0, Math.min(100, piety)) / 100
  if (rng() >= .15 + devotion * .75) return 0
  return Math.min(Math.max(0, Math.floor(gold)), Math.floor((1 + Math.floor(rng() * (1 + Math.floor(devotion * 9)))) * multiplier))
}

/** Spacing between people lined up for the relic: shoulder to shoulder with a
 * little room, scaled with the rendered character. */
export function relicQueueSpacing(characterScale = BASE_CHARACTER_SCALE): number {
  return PERSON_WIDTH * 1.2 * characterScale / BASE_CHARACTER_SCALE
}

/** Single-file places for the relic: the nave holds a few, and the line continues
 * out of the door and back along the branch, as far as the branch can hold. */
export function shrineQueuePlaces(map: GameMap): number {
  const site = map.site, shrine = map.buildings.find(b => b.id === site?.hovelId)
  if (!site || !shrine) return 0
  return shrineStations(shrine, site.door).queueCapacity + Math.floor(site.branch.length / relicQueueSpacing())
}

/** Reserve a place in the line for the relic or a private prayer spot. Companies
 * are broken apart at the enclave: every member lines up as a single visitor. */
export function shrineVisitPlan(map: GameMap, visitor: number, visits: number, occupied: ReadonlySet<string> = new Set(), from?: TilePos, prayer = false, relicShown = true) {
  const site = map.site
  const shrine = map.buildings.find(b => b.id === site?.hovelId)
  if (!site || !shrine || !isComplete(shrine)) return null
  // Nobody joins the line while no keeper shows the relic; it would only stand
  // there. Private prayer needs no keeper.
  if (!relicShown && !prayer) return null
  const gate = shrineGates(shrine, site.door)[0]
  // Only a line longer than the branch turns visitors away before any route is
  // planned for them.
  const stations = shrineStations(shrine, site.door)
  const places = prayer ? shrineSeats(shrine, site.door) : Array.from({ length: shrineQueuePlaces(map) }, (_, i) => ({ id: `queue-${i}`, tile: stations.viewing }))
  const place = places.find(p => !occupied.has(p.id))
  if (!place || !buildingStepAllowed(map, map.buildings, gate.outside, gate.inside, true)) return null
  const branch = shrineApproach(map, from)
  if (!branch.length) return null
  const inside = prayer ? settlementRoute(map, map.buildings, gate.inside, place.tile, false, true)
    : shrineViewingRoute(map, 0)
  const approach = settlementRoute(map, map.buildings, site.door, gate.outside)
  return inside && approach ? { seat: place.id, route: [...branch, ...approach.slice(1), ...inside] } : null
}

/** Continuous interior lanes join the integer approach only at the gate. */
export function shrineViewingRoute(map: GameMap, place: number): TilePos[] | null {
  const shrine = map.buildings.find(b => b.id === map.site?.hovelId)
  if (!shrine || !map.site || !isComplete(shrine)) return null
  const gate = shrineGates(shrine, map.site.door)[0]
  const places = shrineViewingPlaces(shrine, map.site.door)
  const destination = places[place]
  if (!destination) return null
  const route = isChapel(shrine) ? [gate.inside, destination]
    : [gate.inside, { x: (places[0].x + places[1].x) / 2,
      z: (places[0].z + places[1].z) / 2 }, destination]
  return route.every((p, i) => !i || buildingStepAllowed(map, map.buildings, route[i - 1], p, true)) ? route : null
}

/** Interior routes lead visitors to the offering box and back to the entrance.
 * Half-tile lanes go around the altar and church screen; endpoints may be fractional. */
export function shrineInteriorRoute(map: GameMap, from: TilePos, to: TilePos): TilePos[] | null {
  const shrine = map.buildings.find(b => b.id === map.site?.hovelId)
  if (!shrine || !isComplete(shrine) || !containsTile(shrine, from) || !containsTile(shrine, to)) return null
  const points = [from, to]
  for (let z = shrine.z; z <= shrine.z + shrine.d - 1; z += .5)
    for (let x = shrine.x; x <= shrine.x + shrine.w - 1; x += .5)
      if (buildingStepAllowed(map, map.buildings, { x, z }, { x, z }, true)) points.push({ x, z })
  const parents = new Map<number, number>([[0, -1]]), queue = [0]
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head]
    if (i === 1) {
      const path: TilePos[] = []
      for (let n = 1; n >= 0; n = parents.get(n)!) path.push(points[n])
      return path.reverse()
    }
    for (let j = 1; j < points.length; j++) if (!parents.has(j) && buildingStepAllowed(map, map.buildings, points[i], points[j], true)) {
      parents.set(j, i); queue.push(j)
    }
  }
  return null
}

/** Move back a physical distance along a route, including partial steps. */
export function shrineRouteBehind(route: readonly TilePos[], progress: number, distance: number): number {
  let cursor = Math.max(0, Math.min(route.length - 1, progress))
  for (let i = Math.min(route.length - 2, Math.ceil(cursor) - 1); i >= 0; i--) {
    const length = Math.hypot(route[i + 1].x - route[i].x, route[i + 1].z - route[i].z)
    const available = (cursor - i) * length
    if (length > 0 && distance <= available) return cursor - distance / length
    distance -= available
    cursor = i
  }
  return 0
}

/** Stop the church line four person-spaces behind the kneeling row, measured
 * along the central aisle rather than around the final turn toward a rail. */
export function shrineQueueStop(map: GameMap, route: readonly TilePos[], door: number, characterScale = BASE_CHARACTER_SCALE): number {
  const shrine = map.buildings.find(b => b.id === map.site?.hovelId)
  return !shrine || isChapel(shrine)
    ? shrineRouteBehind(route, door, relicQueueSpacing(characterScale))
    : shrineRouteBehind(route, route.length - 2, 4 * relicQueueSpacing(characterScale))
}

/** Leave a voluntary gift at the interior wall box before returning to the entrance.
 * Stored in reverse because the simulation walks departure routes backwards. */
export function shrineExitPlan(map: GameMap, from: TilePos, arrival: TilePos[]): { route: TilePos[]; offeringProgress: number } | null {
  const shrine = map.buildings.find(b => b.id === map.site?.hovelId)
  if (!shrine || !map.site) return null
  const { offering } = shrineStations(shrine, map.site.door)
  if (isChapel(shrine)) {
    const gate = shrineGates(shrine, map.site.door)[0]
    const toBox = shrineInteriorRoute(map, from, offering)
    const toDoor = shrineInteriorRoute(map, offering, gate.inside)
    const gateIndex = arrival.findIndex(p => p.x === gate.outside.x && p.z === gate.outside.z)
    if (!toBox || !toDoor || gateIndex < 0) return null
    const exit = [...toBox, ...toDoor.slice(1), ...arrival.slice(0, gateIndex + 1).reverse()]
    return { route: exit.reverse(), offeringProgress: exit.length - toBox.length }
  }
  const layout = shrineLayout(shrine, map.site.door)
  const viewing = shrineViewingPlaces(shrine, map.site.door)
  const rail = viewing.findIndex(p => Math.abs(p.x - from.x) < .001 && Math.abs(p.z - from.z) < .001)
  if (rail >= 0) {
    const front = shrinePoint(shrine, map.site.door, rail === 0 ? -1 : 1, Math.floor(layout.depth / 2))
    const sin = Math.round(Math.sin(layout.rotation)), cos = Math.round(Math.cos(layout.rotation))
    const along = { x: from.x + sin * ((front.x - from.x) * sin + (front.z - from.z) * cos),
      z: from.z + cos * ((front.x - from.x) * sin + (front.z - from.z) * cos) }
    const toBox = settlementRoute(map, map.buildings, front, offering, false, true)
    const gate = shrineGates(shrine, map.site.door)[0]
    const toDoor = settlementRoute(map, map.buildings, offering, gate.inside, false, true)
    const gateIndex = arrival.findIndex(p => p.x === gate.inside.x && p.z === gate.inside.z)
    if (!toBox || !toDoor || gateIndex < 0) return null
    const exit = [from, along, ...toBox, ...toDoor.slice(1), ...arrival.slice(0, gateIndex).reverse()]
    if (!exit.every((p, i) => !i || buildingStepAllowed(map, map.buildings, exit[i - 1], p, true))) return null
    const route = exit.reverse()
    return { route, offeringProgress: route.findIndex(p => p.x === offering.x && p.z === offering.z) }
  }
  // A chapel can be upgraded while a visitor is kneeling at its old centered
  // position. Join a clear integer lane before using the church exit planner.
  if (!Number.isInteger(from.x) || !Number.isInteger(from.z)) {
    for (const x of new Set([Math.floor(from.x), Math.ceil(from.x)])) for (const z of new Set([Math.floor(from.z), Math.ceil(from.z)])) {
      const lane = { x, z }
      if (!buildingStepAllowed(map, map.buildings, from, lane, true)) continue
      const exit = shrineExitPlan(map, lane, arrival)
      if (exit) return { ...exit, route: [...exit.route, from] }
    }
    return null
  }
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
