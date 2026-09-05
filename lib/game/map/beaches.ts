import type { ElevationInfo } from "./elevation"
import type { WaterInfo } from "./types"

/** Sand requires a gentle, low route to the water, not just proximity in plan view. */
export function beachAccess(e: ElevationInfo, width: number, depth: number, kind: Uint8Array, water: WaterInfo): Uint8Array {
  const allowed = new Uint8Array(kind.length)
  if (!water.surface) return allowed
  const { beachHeight, beachSlope } = e.settings
  const suitable = new Uint8Array(kind.length)
  for (let i = 0; i < kind.length; i++) {
    if (kind[i]) continue
    const x = i % width, z = Math.floor(i / width), corners = e.corners.slice(i * 4, i * 4 + 4)
    if (corners.length && Math.max(...corners) - Math.min(...corners) > beachSlope) continue
    suitable[i] = 1
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || !kind[n]) continue
      if (Math.abs(e.height[i] - water.surface[n]) > beachHeight) suitable[i] = 0
    }
  }
  const queue: Array<{ i: number; distance: number; level: number }> = []
  for (let i = 0; i < kind.length; i++) if (kind[i]) queue.push({ i, distance: 0, level: water.surface[i] })
  for (let q = 0; q < queue.length; q++) {
    const { i, distance, level } = queue[q], x = i % width, z = Math.floor(i / width)
    if (distance >= 2) continue
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || !suitable[n] || allowed[n]) continue
      const rise = e.height[n] - level
      if (rise < -0.01 || rise > beachHeight) continue
      if (Math.abs(e.height[n] - (kind[i] ? level : e.height[i])) > beachSlope) continue
      allowed[n] = 1; queue.push({ i: n, distance: distance + 1, level })
    }
  }
  return allowed
}
