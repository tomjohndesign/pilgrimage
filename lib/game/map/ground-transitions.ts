import { isWaterTerrain } from "./terrain"
import type { GameMap } from "./types"
import type { TerrainId } from "./terrain"
import { SHORE_CORNERS, shorelineCorners } from "./shoreline"

/** Roads sit over turf; wooded ground shares its sprite library but keeps its tint. */
export function groundMaterial(terrain: TerrainId): number {
  return terrain === "sand" ? 3 : terrain === "hills" ? 2 : terrain === "dirt" ? 1 : 0
}

/**
 * Four tiles surround each candidate corner. Their shared edges must meet
 * geometrically: continuous slopes can share paint, but cliff faces cannot. Corner
 * indices are NW, NE, SW, SE, matching the terrain's elevation attributes.
 */
export function groundQuadConnected(map: GameMap, x: number, z: number): boolean {
  const height = (tx: number, tz: number, corner: number) => {
    tx = Math.max(0, Math.min(map.width - 1, tx))
    tz = Math.max(0, Math.min(map.depth - 1, tz))
    const i = tz * map.width + tx
    if ((isWaterTerrain(map.tiles[i])) && map.water?.surface) return map.water.surface[i]
    return map.elevation?.corners[i * 4 + corner] ?? 0
  }
  const meet = (ax: number, az: number, ac: number, bx: number, bz: number, bc: number) =>
    Math.abs(height(ax, az, ac) - height(bx, bz, bc)) <= .06
  for (let offset = 0; offset <= 1; offset++) {
    if (x + 1 < map.width) for (const c of [1, 3]) if (!meet(x, z + offset, c, x + 1, z + offset, c - 1)) return false
    if (z + 1 < map.depth) for (const c of [2, 3]) if (!meet(x + offset, z, c, x + offset, z + 1, c - 2)) return false
  }
  return true
}

/**
 * Choose at most one half-tile diagonal per cell. Both adjoining sides must
 * have the same donor material. Resolve opposing edits before rendering so
 * neighbouring halves agree along their entire shared edge. Higher material
 * IDs get first choice; scan order only breaks ties within the same material.
 */
export function groundCornerTiles(map: GameMap, terrain: readonly TerrainId[] = map.tiles): Int8Array {
  const kinds = terrain.map(groundMaterial)
  const protectedTiles = new Set<number>()
  for (const b of map.buildings) for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) {
    protectedTiles.add(z * map.width + x)
  }
  const candidates: { index: number; corner: number }[] = []
  for (let z = 0; z < map.depth; z++) for (let x = 0; x < map.width; x++) {
    const index = z * map.width + x
    if (protectedTiles.has(index) || ["water", "bridge", "path", "track"].includes(map.tiles[index])) continue
    if (shorelineCorners(map, x, z).some(Boolean)) continue
    SHORE_CORNERS.forEach(([dx, dz], corner) => {
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nx >= map.width || nz < 0 || nz >= map.depth) return
      const donor = kinds[z * map.width + nx]
      if (donor === kinds[index] || kinds[nz * map.width + x] !== donor || kinds[nz * map.width + nx] !== donor) return
      // Water has its own shoreline geometry and depth; never extend ground
      // halves through a wet neighbour merely because its bank has this colour.
      if ([z * map.width + nx, nz * map.width + x, nz * map.width + nx].some(i =>
        protectedTiles.has(i) || isWaterTerrain(map.tiles[i]))) return
      if (groundQuadConnected(map, Math.min(x, nx), Math.min(z, nz))) candidates.push({ index, corner })
    })
  }
  return resolveCornerTiles(map.width, kinds, candidates)
}

/** Shared edge arbitration for both ground materials and water depth bands. */
export function resolveCornerTiles(width: number, kinds: readonly number[], candidates: { index: number; corner: number }[]): Int8Array {
  const corners = new Int8Array(kinds.length).fill(-1)
  candidates.sort((a, b) => kinds[b.index] - kinds[a.index] || a.index - b.index || a.corner - b.corner)
  for (const { index, corner } of candidates) {
    if (corners[index] !== -1) continue
    const [dx, dz] = SHORE_CORNERS[corner]
    const acrossX = corners[index + dx], acrossZ = corners[index + dz * width]
    if (acrossX >= 0 && SHORE_CORNERS[acrossX][0] === -dx) continue
    if (acrossZ >= 0 && SHORE_CORNERS[acrossZ][1] === -dz) continue
    corners[index] = corner
  }
  return corners
}

/** Palette alpha packs the material and one of four diagonal orientations. */
export function groundPaintCode(terrain: TerrainId, corner: number): number {
  return groundMaterial(terrain) + 8 * (corner + 1)
}
