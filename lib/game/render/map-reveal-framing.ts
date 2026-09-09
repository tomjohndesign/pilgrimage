import * as THREE from "three"
import { groundHeight } from "../map/elevation"
import type { GameMap } from "../map/types"

/** Find the terrain under screen centre, including raised slopes and cliffs. */
export function tileRevealFrame(map: GameMap, camera: THREE.Camera) {
  let top = 0
  for (const height of map.elevation?.corners ?? []) top = Math.max(top, height)
  for (const height of map.water?.surface ?? []) top = Math.max(top, height)
  const raycaster = new THREE.Raycaster()
  const point = new THREE.Vector3()
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0))
  raycaster.setFromCamera(new THREE.Vector2(), camera)
  const ray = raycaster.ray
  const atHeight = (height: number) => {
    plane.constant = -height
    return ray.intersectPlane(plane, point)
  }
  atHeight(0)
  const centre = new THREE.Vector2(point.x, point.z)
  // March only through the terrain's vertical range, then refine its first hit.
  const start = atHeight(top + 1)?.clone()
  if (start) {
    const clearance = (distance: number) => {
      point.copy(start).addScaledVector(ray.direction, distance)
      const x = point.x + map.width / 2 - .5, z = point.z + map.depth / 2 - .5
      if (x < -.5 || z < -.5 || x >= map.width - .5 || z >= map.depth - .5) return Infinity
      return point.y - groundHeight(map, x, z)
    }
    const limit = (top + 5) / Math.max(.01, -ray.direction.y)
    for (let distance = 0; distance <= limit; distance += .25) {
      if (clearance(distance) > 0) continue
      let low = Math.max(0, distance - .25), high = distance
      for (let i = 0; i < 12; i++) {
        const mid = (low + high) / 2
        if (clearance(mid) > 0) low = mid; else high = mid
      }
      clearance(high)
      centre.set(point.x, point.z)
      break
    }
  }
  const tile = (x: number, z: number) => new THREE.Vector2(
    THREE.MathUtils.clamp(Math.floor(x + map.width / 2), 0, map.width - 1),
    THREE.MathUtils.clamp(Math.floor(z + map.depth / 2), 0, map.depth - 1))
  const church = map.buildings.find(building => building.id === map.site?.hovelId)
  const origin = church ? new THREE.Vector2(church.x + (church.w - 1) / 2, church.z + (church.d - 1) / 2)
    : tile(centre.x, centre.y)
  let minX = origin.x, maxX = origin.x, minZ = origin.y, maxZ = origin.y
  // Include the full visible volume, from slab base to tall scenery. This keeps
  // tiles just outside the viewport from popping in at the end of the reveal.
  for (const x of [-1, 1]) for (const y of [-1, 1]) {
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera)
    for (const height of [-4, top + 12]) {
      atHeight(height)
      const corner = tile(point.x, point.z)
      minX = Math.min(minX, corner.x); maxX = Math.max(maxX, corner.x)
      minZ = Math.min(minZ, corner.y); maxZ = Math.max(maxZ, corner.y)
    }
  }
  // A conservative rectangle also covers where frustum edges cross map edges.
  const radius = Math.hypot(Math.max(origin.x - minX, maxX - origin.x), Math.max(origin.y - minZ, maxZ - origin.y))
  return { origin, radius: Math.max(1, radius + Math.SQRT2) }
}
