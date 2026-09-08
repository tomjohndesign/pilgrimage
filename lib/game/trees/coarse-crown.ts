import type { CrownPart } from "./species"

/** A distant tree keeps its height, spread and species silhouette, with one
 * canopy instead of individually drawn lobes. No placement or gameplay changes. */
export function coarseCrown(parts: readonly CrownPart[]): CrownPart {
  if (parts.length === 1) return { ...parts[0] }
  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity
  for (const part of parts) {
    const c = Math.cos(part.yaw), s = Math.sin(part.yaw)
    const rx = Math.hypot(part.rx * c, part.rz * s), rz = Math.hypot(part.rx * s, part.rz * c)
    minX = Math.min(minX, part.x - rx); maxX = Math.max(maxX, part.x + rx)
    minY = Math.min(minY, part.y - part.ry); maxY = Math.max(maxY, part.y + part.ry)
    minZ = Math.min(minZ, part.z - rz); maxZ = Math.max(maxZ, part.z + rz)
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2,
    rx: (maxX - minX) / 2, ry: (maxY - minY) / 2, rz: (maxZ - minZ) / 2, yaw: 0 }
}
