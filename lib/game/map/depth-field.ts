import { groundQuadConnected, resolveCornerTiles } from "./ground-transitions"
import { SHORE_CORNERS } from "./shoreline"
import type { GameMap } from "./types"

const DEPTH_DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const

/** Distance inside a covered region, capped at three bands. Map borders are cropped interiors. */
export function inwardTileDepth(kind: Uint8Array, width: number, depth: number): Uint8Array {
  const out = new Uint8Array(kind.length)
  const queue: number[] = []
  for (let i = 0; i < kind.length; i++) {
    if (kind[i] === 0) continue
    const x = i % width
    const z = Math.floor(i / width)
    for (const [dx, dz] of DEPTH_DIRECTIONS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      if (kind[nz * width + nx] === 0) {
        out[i] = 1
        queue.push(i)
        break
      }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const x = queue[q] % width
    const z = Math.floor(queue[q] / width)
    for (const [dx, dz] of DEPTH_DIRECTIONS) {
      const nx = x + dx
      const nz = z + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      const n = nz * width + nx
      if (kind[n] !== 0 && out[n] === 0) {
        out[n] = Math.min(3, out[queue[q]] + 1)
        queue.push(n)
      }
    }
  }
  // A fully covered map has no open edge and uses the deepest band.
  for (let i = 0; i < kind.length; i++) if (kind[i] !== 0 && out[i] === 0) out[i] = 3
  return out
}

/** Shared crisp half-tile joins for water depth and canopy depth. */
export function depthBandCorners(map: GameMap, depths: readonly number[], openEdges = false): Int8Array {
  const candidates: { index: number; corner: number }[] = []
  for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
    const index = z * map.width + x
    if (!depths[index]) continue
    SHORE_CORNERS.forEach(([dx, dz], corner) => {
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nx >= map.width || nz < 0 || nz >= map.depth) return
      const donor = depths[z * map.width + nx]
      if ((!donor && !openEdges) || donor === depths[index] || depths[nz * map.width + x] !== donor || depths[nz * map.width + nx] !== donor) return
      if (groundQuadConnected(map, Math.min(x, nx), Math.min(z, nz))) candidates.push({ index, corner })
    })
  }
  return resolveCornerTiles(map.width, depths, candidates)
}
