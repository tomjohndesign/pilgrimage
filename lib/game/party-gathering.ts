import { buildingApproaches, buildingEntry, wellApproaches } from "./building-rotation"
import { isComplete } from "./construction"
import { tileAt, tileToWorldX, tileToWorldZ, worldToTileX, worldToTileZ, type GameMap } from "./map/types"
import { walkingSurface } from "./map/walking-surface"
import { roadLanePoint } from "./map/road-lane"
import { mainRoadWidthAt } from "./map/road-width"
import { SpatialPoints } from "./spatial-points"
import { buildingAt } from "./settlement"
import { settlementRoute } from "./settlement-route"
import { isWaterSource } from "./water-sources/navigation"
import { deriveSeed, makeRng } from "./rng"
import type { SimTraveler } from "./sim"

type Point = { x: number; z: number }
type GroundPoint = Point & { y: number }
export interface GatheringPlace {
  label: string
  spots: GroundPoint[]
}

export const GATHERING_ROUTE_LIMIT = 1500
const SPACING = .95
const REACH = 3
const WAYPOINT_REACH = 18
const MAX_WALK = 36
const ROAD_MARGIN = .45
const roadBuffers = new WeakMap<GameMap, SpatialPoints<Point & { radius: number }>>()

/** Road art extends into grass tiles. Follow the same curved centreline and
 * local width as walkers, leaving room for the waiting person's whole body. */
export function gatheringClearOfRoad(map: GameMap, point: Point): boolean {
  let buffer = roadBuffers.get(map)
  if (!buffer) {
    buffer = new SpatialPoints([])
    const road = map.road ?? []
    for (let progress = 0; progress <= road.length - 1; progress += .25) {
      const i = Math.floor(progress), a = road[i], b = road[Math.min(i + 1, road.length - 1)]
      const t = progress - i
      const centre = roadLanePoint(map, road, progress, 0) ?? { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }
      buffer.add({ x: tileToWorldX(map, centre.x), z: tileToWorldZ(map, centre.z),
        radius: mainRoadWidthAt(map, progress) / 2 + ROAD_MARGIN })
    }
    roadBuffers.set(map, buffer)
  }
  return !buffer.firstWithin(point.x, point.z, (map.mainRoadWidth ?? 1) / 2 + ROAD_MARGIN,
    p => Math.hypot(point.x - p.x, point.z - p.z) < p.radius)
}

function excludedGround(map: GameMap): Set<number> {
  const key = (p: Point) => p.z * map.width + p.x
  const blocked = new Set<number>()
  for (const p of map.road ?? []) blocked.add(key(p))
  for (const p of map.site?.branch ?? []) blocked.add(key(p))
  for (const b of map.buildings) for (const p of isWaterSource(b) ? wellApproaches(b) : buildingApproaches(map, b)) blocked.add(key(p))
  return blocked
}

function openGround(map: GameMap, x: number, z: number, blocked: ReadonlySet<number>): boolean {
  return !blocked.has(z * map.width + x) && ["grass", "dirt", "clearing"].includes(tileAt(map, x, z) ?? "") && !buildingAt(map, x, z)
}

/** Recheck after building placement, including new doors and outdoor benches. */
export function gatheringPlaceOpen(map: GameMap, place: GatheringPlace): boolean {
  const blocked = excludedGround(map)
  return place.spots.every(p => openGround(map, worldToTileX(map, p.x), worldToTileZ(map, p.z), blocked) && gatheringClearOfRoad(map, p))
}

/** Reserve enough reachable outdoor space for the whole company. A tavern's
 * yard is preferred, followed by public meeting places and nearby clearings.
 * Doorways, benches, water access and through paths remain available to others. */
export function findGatheringPlace(map: GameMap, origin: Point, fallback: Point, count: number,
  occupied: (point: Point) => boolean): GatheringPlace | undefined {
  const world = (p: Point) => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z) })
  const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)
  const start = { x: worldToTileX(map, origin.x), z: worldToTileZ(map, origin.z) }
  const candidates: { anchor: Point; label: string; priority: number; reach?: number }[] = []
  for (const b of map.buildings) {
    if (!isComplete(b) || b.supportId || b.churchId) continue
    const priority = b.buildType === "tavern" ? 0 : b.buildType === "market" || isWaterSource(b) ? 1
      : b.buildType === "cross" || b.id === map.site?.hovelId ? 2 : -1
    if (priority < 0) continue
    const anchor = world(b.id === map.site?.hovelId ? map.site.door : buildingEntry(b))
    if (distance(anchor, origin) <= WAYPOINT_REACH) candidates.push({ anchor, label: b.label, priority })
  }
  candidates.sort((a, b) => a.priority - b.priority || distance(a.anchor, origin) - distance(b.anchor, origin))
  // Keep searches bounded even in a dense town; a useful break is a short walk.
  candidates.splice(6)
  for (const clearing of map.mainClearings ?? []) {
    const anchor = world(clearing)
    if (distance(anchor, origin) <= 8) candidates.push({ anchor, label: "Clearing", priority: 3 })
  }
  candidates.push({ anchor: fallback, label: "Open ground", priority: 4 })
  // Search both sides of the road and beyond the first crowded patch. This
  // also covers a company whose last members are well behind its road head.
  candidates.push({ anchor: origin, label: "Open ground", priority: 4, reach: 7 })
  const key = (p: Point) => p.z * map.width + p.x
  const blocked = excludedGround(map)
  let partial: GatheringPlace | undefined
  const reachable = new Map<number, boolean>()
  for (const { anchor, label, reach = REACH } of candidates) {
    const points: Point[] = []
    const ax = worldToTileX(map, anchor.x), az = worldToTileZ(map, anchor.z)
    for (let dz = -reach; dz <= reach; dz++) for (let dx = -reach; dx <= reach; dx++) {
      const x = ax + dx, z = az + dz
      if (!openGround(map, x, z, blocked)) continue
      const rng = makeRng(deriveSeed(map.seed ?? 0, key({ x, z })))
      for (const [ox, oz] of [[-.25, -.25], [.25, -.25], [-.25, .25], [.25, .25]]) {
        const p = { x: tileToWorldX(map, x) + ox + (rng() - .5) * .18, z: tileToWorldZ(map, z) + oz + (rng() - .5) * .18 }
        if (distance(p, anchor) <= reach + .5 && gatheringClearOfRoad(map, p) && !occupied(p)) points.push(p)
      }
    }
    points.sort((a, b) => distance(a, anchor) - distance(b, anchor))
    const spots: GroundPoint[] = []
    for (const point of points) {
      if (spots.some(spot => distance(spot, point) < SPACING)) continue
      const tile = { x: worldToTileX(map, point.x), z: worldToTileZ(map, point.z) }, id = key(tile)
      if (!reachable.has(id)) {
        const route = settlementRoute(map, map.buildings, start, tile, false, false, undefined, GATHERING_ROUTE_LIMIT)
        reachable.set(id, !!route && route.length <= MAX_WALK)
      }
      if (!reachable.get(id)) continue
      spots.push({ ...point, y: walkingSurface(map, point.x, point.z).height })
      if (spots.length >= count) return { label, spots }
    }
    // If nowhere fits everyone, use one shared place with the most space.
    if (spots.length && (!partial || spots.length > partial.spots.length)) partial = { label, spots }
  }
  return partial
}

/** A few companions stay on their feet; the others settle at different times.
 * This is a visual rest, leaving the party's errands and shared needs intact. */
export function gatheringSitting(s: SimTraveler): boolean {
  const gathering = s.partyGathering
  return !!(s.partyWaiting && s.activity === "walking" && gathering?.arrived && !gathering.back
    && s.id % 3 !== 0 && (gathering.waited ?? 0) >= 10 + (s.id * 7 % 13))
}

/** Face a nearby companion, with occasional, staggered looks towards the
 * entrance. Sitting people keep their heading instead of spinning on the grass. */
export function gatheringHeading(s: SimTraveler, members: readonly SimTraveler[], entrance: Point): number | undefined {
  const gathering = s.partyGathering
  if (!s.partyWaiting || s.activity !== "walking" || !gathering?.arrived || gathering.back) return undefined
  if (gatheringSitting(s) && gathering.heading !== undefined) return gathering.heading
  const waited = gathering.waited ?? 0
  let target = entrance, nearest = Infinity
  if ((waited + s.id * 3) % 23 >= 3) for (const other of members) {
    if (other === s || !other.partyWaiting || other.activity !== "walking" || !other.partyGathering?.arrived) continue
    const distance = Math.hypot(s.x - other.x, s.z - other.z)
    if (distance > .1 && distance < nearest) { nearest = distance; target = other }
  }
  return Math.atan2(target.x - s.x, target.z - s.z)
}
