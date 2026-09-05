import type { GameMap } from "./types"

/**
 * Forest shade: a smooth 0–1 field over the map measuring how deep in the
 * woods each tile sits. 1 is the heart of a forest cluster, 0 is open land far
 * from any tree. It is the fraction of forest tiles in a square window around
 * the tile, pushed through a smoothstep so both ends of the ramp ease out.
 *
 * Pure data — no three.js, no React — and a single source of truth: tile
 * colours and tree placement both read it, so the ground gradient and the
 * thinning tree line fade in lockstep and the forest edge never looks like a
 * wall. Computed with a summed-area table, so cost is linear in map size and
 * independent of the radius.
 */

/**
 * Window half-width in tiles. The visible gradient spans roughly twice this,
 * so 4 gives a fade about 8 tiles wide — wide enough to read across a glade,
 * narrow enough that big glades still reach fully open meadow in the middle.
 */
export const FOREST_SHADE_RADIUS = 4

export function computeForestShade(
  map: GameMap,
  radius: number = FOREST_SHADE_RADIUS,
): Float32Array {
  const { width, depth, tiles } = map
  const stride = width + 1

  // sat[(z+1)*stride + (x+1)] = count of forest tiles in the rect [0..x, 0..z].
  const sat = new Float64Array(stride * (depth + 1))
  for (let z = 0; z < depth; z++) {
    for (let x = 0; x < width; x++) {
      const forest = tiles[z * width + x] === "forest" ? 1 : 0
      sat[(z + 1) * stride + (x + 1)] =
        forest + sat[z * stride + (x + 1)] + sat[(z + 1) * stride + x] - sat[z * stride + x]
    }
  }

  const shade = new Float32Array(width * depth)
  for (let z = 0; z < depth; z++) {
    const z0 = Math.max(0, z - radius)
    const z1 = Math.min(depth - 1, z + radius)
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(width - 1, x + radius)
      const sum =
        sat[(z1 + 1) * stride + (x1 + 1)] -
        sat[z0 * stride + (x1 + 1)] -
        sat[(z1 + 1) * stride + x0] +
        sat[z0 * stride + x0]
      // Normalise by the clamped window's real area so edge-of-map tiles
      // aren't read as artificially open.
      const density = sum / ((x1 - x0 + 1) * (z1 - z0 + 1))
      shade[z * width + x] = density * density * (3 - 2 * density)
    }
  }
  return shade
}
