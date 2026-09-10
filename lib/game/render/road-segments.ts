import { roadLanePoint } from "../map/road-lane"
import { mainRoadWidthAt } from "../map/road-width"
import { bridgeLayout } from "../map/bridges"
import { diagonalRoadBend, isRoadTerrain, roadWear, sampleRoadBend, TRAFFIC_FOR_BARE_ROAD } from "../map/road"
import { tileAt, type GameMap } from "../map/types"
import { contactAppearance } from "./path-appearance"

/** Tile-local endpoints, source (0 main, 1 branch, 2 corridor, 3 cart corner, 4 actual foot/wheel contact), optional compaction, and optional main-road width. */
export type RoadSegment = readonly [number, number, number, number, number, number?, number?]
export interface TraveledRoad { ax: number; az: number; bx: number; bz: number; wear: number; contact?: boolean }

/** Local compaction uses the same rut profile as the game, independently of global traffic. */
export function roadSegmentWear(segment: RoadSegment, traffic: number, relicTraffic: number, tier: number): [number, number, number, number] {
  if (segment[4] === 4) {
    const depth = Math.min(1, Math.max(0, segment[5] ?? 0))
    // One physical contact, at its actual lane or wheel position. Repeated
    // passage widens it; the opposing lane receives no wear until it is used.
    // Contact texels carry compaction in Y so the shader can keep early wear grassy.
    return [.42 - .1 * depth, depth, 4, contactAppearance(depth).opacity]
  }
  const local = segment[4] === 2
  const depth = Math.min(1, Math.max(0, segment[5] ?? 0))
  const wear = roadWear(local ? depth * TRAFFIC_FOR_BARE_ROAD : segment[4] === 1 ? relicTraffic : traffic, tier, segment[4] === 0 && segment[6] !== undefined)
  return [wear.edge - ((segment[6] ?? 1) - 1) / 2, wear.inner, segment[4], local ? Math.min(1, depth / .2) : segment[5] ?? 1]
}

/** Includes the widest worn verge and its noise/antialiasing fringe. */
const ROAD_REACH = 0.85

/** Actual crossings, including diagonals, overflow onto open ground but never under buildings or woods. */
export function traveledRoadSegments(map: GameMap, roads: readonly TraveledRoad[]): Map<number, RoadSegment[]> {
  const work = buildTraveledRoadSegments(map, roads)
  let step = work.next()
  while (!step.done) step = work.next()
  return step.value
}

/** Yield between small batches so a growing path network never owns a frame. */
export function* buildTraveledRoadSegments(map: GameMap, roads: readonly TraveledRoad[]): Generator<void, Map<number, RoadSegment[]>> {
  const bins = new Map<number, RoadSegment[]>(), occupied = new Set<number>()
  for (const building of map.buildings) for (let z = building.z; z < building.z + building.d; z++) for (let x = building.x; x < building.x + building.w; x++) occupied.add(z * map.width + x)
  let processed = 0
  for (const road of roads) {
    if (++processed % 64 === 0) yield
    if (!Number.isFinite(road.wear) || road.wear <= .001) continue
    if (road.contact && contactAppearance(road.wear).opacity === 0) continue
    const { ax, az, bx, bz, wear } = road
    const reach = road.contact ? .4 : ROAD_REACH
    for (let z = Math.max(0, Math.floor(Math.min(az, bz) - reach)); z <= Math.min(map.depth - 1, Math.floor(Math.max(az, bz) + reach)); z++) {
      for (let x = Math.max(0, Math.floor(Math.min(ax, bx) - reach)); x <= Math.min(map.width - 1, Math.floor(Math.max(ax, bx) + reach)); x++) {
        const i = z * map.width + x, terrain = map.tiles[i]
        if (occupied.has(i) || !(isRoadTerrain(terrain) || ["grass", "clearing", "dirt", "sand"].includes(terrain))) continue
        const segments = bins.get(i) ?? []
        segments.push([ax - x, az - z, bx - x, bz - z, road.contact ? 4 : 2, wear]); bins.set(i, segments)
      }
    }
  }
  return bins
}

/**
 * Bin diagonal centrelines into every available tile touched by their width.
 * Coordinates become tile-local here, so adjoining instances evaluate exactly
 * the same segments. One terrain fragment unions them before shading: overlaps
 * neither stack opacity nor leave a line at the original tile boundary.
 */
export function diagonalRoadSegments(map: GameMap, excluded: ReadonlySet<number> = new Set()): Map<number, RoadSegment[]> {
  const bins = new Map<number, RoadSegment[]>()
  const blocked = new Set(excluded)
  for (const b of map.buildings) {
    for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) blocked.add(z * map.width + x)
  }
  const available = (x: number, z: number) => {
    if (blocked.has(z * map.width + x)) return false
    const terrain = tileAt(map, x, z)
    return isRoadTerrain(terrain) || terrain === "grass" || terrain === "clearing" || terrain === "dirt" || terrain === "sand"
  }
  if ((map.mainRoadWidth ?? 1) > 1 && map.road) {
    const road = map.road, bridges = bridgeLayout(map)
    for (let i = 0; i < road.length; i++) {
      const p = road[i]
      if (bridges.rise[p.z * map.width + p.x] > 0 || tileAt(map, p.x, p.z) === "bridge") continue
      const from = Math.max(0, i - .5), to = Math.min(road.length - 1, i + .5)
      const previous = road[Math.max(0, i - 1)], next = road[Math.min(road.length - 1, i + 1)]
      const straight = previous.x === next.x || previous.z === next.z
      const steps = straight && mainRoadWidthAt(map, from) === mainRoadWidthAt(map, to) ? 1 : 8
      let a = roadLanePoint(map, road, from, 0)
      if (!a) continue
      for (let step = 1; step <= steps; step++) {
        const progress = from + (to - from) * step / steps
        const b = roadLanePoint(map, road, progress, 0)
        if (!b) continue
        const width = mainRoadWidthAt(map, progress - (to - from) / steps / 2)
        const reach = width / 2 + .2
        for (let z = Math.max(0, Math.floor(Math.min(a.z, b.z) + .5 - reach)); z <= Math.min(map.depth - 1, Math.floor(Math.max(a.z, b.z) + .5 + reach)); z++) {
          for (let x = Math.max(0, Math.floor(Math.min(a.x, b.x) + .5 - reach)); x <= Math.min(map.width - 1, Math.floor(Math.max(a.x, b.x) + .5 + reach)); x++) {
            if (!available(x, z) || bridges.rise[z * map.width + x] > 0) continue
            const index = z * map.width + x, segments = bins.get(index) ?? []
            segments.push([a.x + .5 - x, a.z + .5 - z, b.x + .5 - x, b.z + .5 - z, 0, 1, width])
            bins.set(index, segments)
          }
        }
        a = b
      }
    }
  }
  const main = (map.mainRoadWidth ?? 1) > 1 ? new Set(map.road?.map(p => p.z * map.width + p.x)) : new Set<number>()
  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      if (blocked.has(z * map.width + x) || main.has(z * map.width + x)) continue
      const bend = diagonalRoadBend(map, x, z)
      if (!bend) continue
      const steps = bend.straight ? 1 : 12
      let a = bend.a
      for (let step = 1; step <= steps; step++) {
        const b = sampleRoadBend(bend, step / steps)
        const minX = Math.max(0, Math.floor(Math.min(a.x, b.x) - ROAD_REACH))
        const maxX = Math.min(map.width - 1, Math.floor(Math.max(a.x, b.x) + ROAD_REACH))
        const minZ = Math.max(0, Math.floor(Math.min(a.z, b.z) - ROAD_REACH))
        const maxZ = Math.min(map.depth - 1, Math.floor(Math.max(a.z, b.z) + ROAD_REACH))
        for (let tz = minZ; tz <= maxZ; tz++) {
          for (let tx = minX; tx <= maxX; tx++) {
            if (!available(tx, tz)) continue
            const index = tz * map.width + tx
            const segments = bins.get(index) ?? []
            segments.push([a.x - tx, a.z - tz, b.x - tx, b.z - tz, tileAt(map, x, z) === "track" ? 1 : 0])
            bins.set(index, segments)
          }
        }
        a = b
      }
    }
  }
  return bins
}

/** Physical distance, in world units, independent of the centreline's angle. */
export function distanceToRoadSegments(x: number, z: number, segments: readonly RoadSegment[]): number {
  let distance = Infinity
  for (const [ax, az, bx, bz] of segments) {
    const dx = bx - ax
    const dz = bz - az
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / Math.max(dx * dx + dz * dz, 0.000001)))
    distance = Math.min(distance, Math.hypot(x - ax - dx * t, z - az - dz * t))
  }
  return distance
}
