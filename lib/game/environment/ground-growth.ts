import { computeForestShade } from "../map/forest-field"
import { isWoods } from "../map/terrain"
import type { GameMap } from "../map/types"
import { CHARACTER_PIXEL_SIZE } from "../render/pixel-scale"
import { deriveSeed, SEED_STREAM } from "../rng"

/** A stamp can overlap its placement cell and terrain tiles; neither clips its art. */
export const GROWTH_CELL_PIXELS = 24
export const GROWTH_SPRITE_PIXELS = 32
export const GROWTH_CELL_SIZE = GROWTH_CELL_PIXELS * CHARACTER_PIXEL_SIZE
export const GROWTH_SPRITE_SIZE = GROWTH_SPRITE_PIXELS * CHARACTER_PIXEL_SIZE
export const GROWTH_ATLAS_COLUMNS = 12
export const GROWTH_ATLAS_ROWS = 4

/** Habitat weights combine with a continuous colony field, never a tile variant roll. */
export const GROUND_GROWTH_RULES = [
  { kind: "meadow", base: 1, woodland: -.7, waterside: .05 },
  { kind: "groundcover", base: .15, woodland: 1.4, waterside: .9 },
  { kind: "flowers", base: .6, woodland: -.6, waterside: -.3 },
] as const

export interface GroundGrowthField {
  data: Uint8Array
  width: number
  height: number
  /** Origin in placement cells, aligned to the same native pixel grid as sprites. */
  origin: [number, number]
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))
function smooth(a: number, b: number, n: number) { const t = clamp((n - a) / (b - a)); return t * t * (3 - 2 * t) }
function hash(x: number, z: number, seed: number) {
  let n = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ seed
  n = Math.imul(n ^ n >>> 13, 1274126177)
  return ((n ^ n >>> 16) >>> 0) / 4294967296
}
function noise(x: number, z: number, seed: number) {
  const ix = Math.floor(x), iz = Math.floor(z), u = smooth(0, 1, x - ix), v = smooth(0, 1, z - iz)
  const a = hash(ix, iz, seed) * (1 - u) + hash(ix + 1, iz, seed) * u
  const b = hash(ix, iz + 1, seed) * (1 - u) + hash(ix + 1, iz + 1, seed) * u
  return a * (1 - v) + b * v
}

/** One small RGBA record per potential plant, not a map-sized raster texture. */
export function groundGrowthField(map: GameMap): GroundGrowthField {
  const seed = deriveSeed(map.seed ?? 0, SEED_STREAM.environmentShapes)
  const origin: [number, number] = [Math.floor(-map.width / 2 / GROWTH_CELL_SIZE), Math.floor(-map.depth / 2 / GROWTH_CELL_SIZE)]
  const width = Math.ceil(map.width / 2 / GROWTH_CELL_SIZE) - origin[0]
  const height = Math.ceil(map.depth / 2 / GROWTH_CELL_SIZE) - origin[1]
  const data = new Uint8Array(width * height * 4)
  const woods = computeForestShade(map)
  const water = computeForestShade(map, 3, t => t === "water" || t === "bridge")
  const blocked = new Uint8Array(map.tiles.length)
  for (const b of map.buildings) for (let z = b.z; z < b.z + b.d; z++) for (let x = b.x; x < b.x + b.w; x++) {
    if (x >= 0 && z >= 0 && x < map.width && z < map.depth) blocked[z * map.width + x] = 1
  }
  const eligible = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= map.width || z >= map.depth) return false
    const i = z * map.width + x, terrain = map.tiles[i]
    return !blocked[i] && (terrain === "grass" || terrain === "clearing" || isWoods(terrain))
  }
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const cx = x + origin[0], cz = z + origin[1]
    const dx = Math.floor(hash(cx, cz, seed) * GROWTH_CELL_PIXELS)
    const dz = Math.floor(hash(cx, cz, seed ^ 0x61ad) * GROWTH_CELL_PIXELS)
    const wx = (cx * GROWTH_CELL_PIXELS + dx) * CHARACTER_PIXEL_SIZE
    const wz = (cz * GROWTH_CELL_PIXELS + dz) * CHARACTER_PIXEL_SIZE
    const tx = Math.floor(wx + map.width / 2), tz = Math.floor(wz + map.depth / 2)
    if (!eligible(tx, tz)) continue
    const index = tz * map.width + tx
    // Different wavelengths give colonies ragged margins and broad quiet intervals.
    const colony = smooth(.35, .68, noise(wx / 5.5, wz / 5.5, seed ^ 0x417) * .72 + noise(wx / 1.8, wz / 1.8, seed ^ 0x915) * .28)
    let family = 0
    if (hash(cx, cz, seed ^ 0x1eaf) < colony * .9) {
      const weights = GROUND_GROWTH_RULES.map(rule => Math.max(.01, rule.base + rule.woodland * woods[index] + rule.waterside * Math.min(1, water[index] * 8)))
      let pick = noise(wx / 7, wz / 7, seed ^ 0xf10) * weights.reduce((a, b) => a + b, 0)
      for (let i = 0; i < weights.length; i++) { pick -= weights[i]; if (pick <= 0) { family = i + 1; break } }
    } else if (hash(cx, cz, seed ^ 0x75f) > .52) continue
    // Meadow colonies carry a few flowering companions even when the broad
    // habitat field favours grass. Keep shaded woodland predominantly leafy.
    if (family === 1 && hash(cx, cz, seed ^ 0xb100) < .2 * (1 - woods[index])) family = 3
    // Whole rich sprites respect neighbouring roads, banks and buildings. Short
    // turf needs only its tiny footprint. A valid plant can straddle several tiles.
    const radius = (family ? GROWTH_SPRITE_SIZE : CHARACTER_PIXEL_SIZE * 6) / 2
    let fits = true
    for (let az = Math.floor(wz + map.depth / 2 - radius); az <= Math.floor(wz + map.depth / 2 + radius); az++) {
      for (let ax = Math.floor(wx + map.width / 2 - radius); ax <= Math.floor(wx + map.width / 2 + radius); ax++) {
        if (!eligible(ax, az)) fits = false
      }
    }
    if (!fits) continue
    const frame = family * GROWTH_ATLAS_COLUMNS + Math.floor(hash(cx, cz, seed ^ 0xabc) * GROWTH_ATLAS_COLUMNS)
    data.set([dx, dz, frame, 255], (z * width + x) * 4)
  }
  return { data, width, height, origin }
}
