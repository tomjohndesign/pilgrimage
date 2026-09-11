import type { ElevationInfo } from "./elevation"
import { isRoadTerrain } from "./road"
import { ROUTE_DIRS } from "./route"
import type { TerrainId } from "./terrain"
import type { BuildingDef } from "./types"

/** Tiles of cliff-free ground kept on either side of every road and track. */
export const CLIFF_CLEARANCE = 2
/** Route cost per tile within the clearance of a cliff; comparable to solid forest. */
export const CLIFF_VERGE_COST = 4
/** Lowest a cut bank may sit above its water, in tile heights. */
const BANK_LIP = 0.15

/** Land tiles whose dry neighbours drop or rise a full cliff step. Bank cliffs to water are bank shaping, not cliffs. */
function dryCliffTiles(e: ElevationInfo, width: number, depth: number, kind: Uint8Array): Uint8Array {
  const cliff = new Uint8Array(kind.length)
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x
    if (kind[i]) continue
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || kind[n]) continue
      if (Math.abs(e.height[i] - e.height[n]) >= e.settings.cliffThreshold) { cliff[i] = 1; break }
    }
  }
  return cliff
}

/** Breadth-first land distance from the seed tiles, up to `limit`; -1 beyond. */
function landDistance(seeds: Uint8Array, width: number, depth: number, kind: Uint8Array, limit: number): Int32Array {
  const distance = new Int32Array(kind.length).fill(-1), queue: number[] = []
  for (let i = 0; i < seeds.length; i++) if (seeds[i] && !kind[i]) { distance[i] = 0; queue.push(i) }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % width, z = Math.floor(i / width)
    if (distance[i] >= limit) continue
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || kind[n] || distance[n] !== -1) continue
      distance[n] = distance[i] + 1; queue.push(n)
    }
  }
  return distance
}

/** Extra routing cost that steers roads and tracks a clearance away from cliff faces. */
export function cliffVergeCost(e: ElevationInfo, width: number, depth: number, kind: Uint8Array, clearance = CLIFF_CLEARANCE): Float64Array {
  const cost = new Float64Array(kind.length)
  const distance = landDistance(dryCliffTiles(e, width, depth, kind), width, depth, kind, clearance)
  for (let i = 0; i < cost.length; i++) if (distance[i] >= 0) cost[i] = CLIFF_VERGE_COST
  return cost
}

/**
 * Regrade the ground so no dry cliff face remains within the clearance of any
 * road or track tile. Cliffs are cut back from the high side, so the road keeps
 * its level, and each cut feathers outward below the cliff threshold until it
 * meets the untouched hillside. Bridge and ford footings and building pads keep
 * their graded heights, and a bank never sinks below its water; a cliff against
 * one of those is filled from below instead.
 * Cliffs beyond the clearance are left alone.
 */
export function clearCliffsBesideRoads(e: ElevationInfo, width: number, depth: number, kind: Uint8Array, tiles: readonly TerrainId[],
  buildings: readonly Pick<BuildingDef, "x" | "z" | "w" | "d">[] = [], surface?: readonly number[], clearance = CLIFF_CLEARANCE): number {
  const threshold = e.settings.cliffThreshold, grade = threshold * 0.8
  const road = new Uint8Array(kind.length)
  for (let i = 0; i < road.length; i++) if (isRoadTerrain(tiles[i])) road[i] = 1
  const near = landDistance(road, width, depth, kind, clearance)
  // Footings are graded to their deck and pads to their floor. A bank can be
  // cut down to a low shelf, but never below its water.
  const frozen = new Uint8Array(kind.length), floor = new Float64Array(kind.length).fill(-Infinity)
  // A pad's ring meets its floor when the footprint is re-levelled, so it is part of the pad here.
  for (const b of buildings) for (let z = b.z - 1; z <= b.z + b.d; z++) for (let x = b.x - 1; x <= b.x + b.w; x++)
    if (x >= 0 && z >= 0 && x < width && z < depth) frozen[z * width + x] = 1
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x
    if (kind[i]) continue
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || !kind[n]) continue
      floor[i] = Math.max(floor[i], (surface?.[n] ?? e.height[n]) + BANK_LIP)
      if (tiles[n] === "bridge" || tiles[n] === "ford") frozen[i] = 1
    }
  }
  const dirty = new Uint8Array(kind.length)
  let changed = 0
  // Cut first, then fill: each phase only ever moves ground one way, so it
  // converges instead of trading a fill against the road for a cut against the
  // hillside behind it.
  for (const phase of ["cut", "fill"] as const) for (let pass = 0; pass < 512; pass++) {
    let moved = false
    for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
      const i = z * width + x
      if (kind[i]) continue
      for (const [dx, dz] of [[1, 0], [0, 1]] as const) {
        const nx = x + dx, nz = z + dz, n = nz * width + nx
        if (nx >= width || nz >= depth || kind[n]) continue
        if (near[i] < 0 && near[n] < 0 && !dirty[i] && !dirty[n]) continue
        const high = e.height[i] >= e.height[n] ? i : n, low = high === i ? n : i
        if (e.height[high] - e.height[low] < threshold) continue
        if (phase === "cut") {
          // Cut the high side unless it is a footing or a pad. The road itself
          // keeps its level, except that it descends to meet a pad.
          if (frozen[high] || (road[high] && !frozen[low])) continue
          const target = Math.max(e.height[low] + grade, floor[high])
          if (target >= e.height[high]) continue
          e.height[high] = target
          dirty[high] = 1
        } else {
          if (frozen[low]) continue
          e.height[low] = e.height[high] - grade
          dirty[low] = 1
        }
        moved = true; changed++
      }
    }
    if (!moved) break
  }
  return changed
}
