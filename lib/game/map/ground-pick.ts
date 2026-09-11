import type * as THREE from "three"
import { groundHeight } from "./elevation"
import { ropeHeightAt, surfaceHeight } from "./bridges"
import type { GameMap } from "./types"

/** Ray-march step in world units; the binary refinement below lands within a texel. */
const STEP = 0.15

/**
 * Walk a pick ray down onto the terrain, or onto a bridge deck riding above
 * it, from `start` along `direction`. Returns the surface point, or null once
 * the ray drops below `minY` without touching the map. Terrain heights vary
 * across every tile, so a flat picking plane would misplace slopes and decks.
 */
export function marchToGround(map: GameMap, start: THREE.Vector3, direction: THREE.Vector3, minY: number, hit: THREE.Vector3): THREE.Vector3 | null {
  const clearance = (p: THREE.Vector3) => {
    const x = p.x + map.width / 2 - 0.5, z = p.z + map.depth / 2 - 0.5
    const tx = Math.floor(x + 0.5), tz = Math.floor(z + 0.5)
    if (tx < 0 || tz < 0 || tx >= map.width || tz >= map.depth) return Infinity
    const y = ropeHeightAt(map, x, z) ?? surfaceHeight(map, tx, tz)
    const ground = groundHeight(map, tx, tz)
    return p.y - (Math.abs(y - ground) > 0.001 ? y : groundHeight(map, x, z))
  }
  for (let distance = 0; start.y + direction.y * distance >= minY; distance += STEP) {
    hit.copy(start).addScaledVector(direction, distance)
    if (clearance(hit) > 0) continue
    let lo = Math.max(0, distance - STEP), hi = distance
    for (let k = 0; k < 10; k++) {
      const mid = (lo + hi) / 2
      hit.copy(start).addScaledVector(direction, mid)
      if (clearance(hit) > 0) lo = mid; else hi = mid
    }
    return hit.copy(start).addScaledVector(direction, hi)
  }
  return null
}
