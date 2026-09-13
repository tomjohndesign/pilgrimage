import { terrainCorner, cliffCornerHeight, cliffUpperHeight, inCliffCorner } from "./cliff-corners"
import { makeRng } from "../rng"
import { isWaterTerrain, TILE_HEIGHT } from "./terrain"
import type { BuildingDef, GameMap } from "./types"
import { ROUTE_DIRS } from "./route"

/** Independent generation and display controls; heights are in tile units. */
export const ELEVATION_CONTROLS = {
  noiseSeed: { label: "Elevation noise seed", min: 0, max: 9999, step: 1, value: 0 },
  maxHeight: { label: "Maximum height", min: 0, max: 4, step: 0.1, value: 2.4 },
  scale: { label: "Hill wavelength", min: 8, max: 96, step: 1, value: 36 },
  detail: { label: "Fine noise", min: 0, max: 0.5, step: 0.01, value: 0.12 },
  power: { label: "Lowland bias", min: 1, max: 4, step: 0.1, value: 2 },
  cliffLength: { label: "Cliff ridge length", min: 8, max: 40, step: 1, value: 20 },
  cliffRoughness: { label: "Cliff shape variation", min: 0, max: 1, step: 0.05, value: 0.7 },
  cliffDensity: { label: "Cliff ridge density", min: 0.2, max: 2, step: 0.1, value: 1 },
  bridgeSag: { label: "Rope bridge sag", min: 0.15, max: 1.2, step: 0.05, value: 0.55 },
  cliffHeight: { label: "Cliff relief", min: 0, max: 2, step: 0.1, value: 1 },
  cliffThreshold: { label: "Cliff cutoff", min: 0.25, max: 1, step: 0.05, value: 0.65 },
  slopeCost: { label: "Path slope penalty", min: 0, max: 60, step: 1, value: 24 },
  bankTaper: { label: "Valley taper width", min: 4, max: 24, step: 1, value: 10 },
  bankSlope: { label: "Valley taper grade", min: 0.05, max: 0.3, step: 0.01, value: 0.16 },
  beachHeight: { label: "Sand height above water", min: 0.05, max: 0.6, step: 0.05, value: 0.3 },
  beachSlope: { label: "Maximum sandy shore grade", min: 0.05, max: 0.4, step: 0.05, value: 0.25 },
  lakeTaper: { label: "Lake shore taper", min: 4, max: 32, step: 1, value: 14 },
  lakeCliffs: { label: "Rocky lake shore share", min: 0, max: 0.5, step: 0.05, value: 0.25 },
  lakeShelf: { label: "Lake shallows width", min: 1, max: 6, step: 1, value: 3 },
  erosionScale: { label: "Bank erosion scale", min: 3, max: 24, step: 1, value: 9 },
  bankWidth: { label: "Flat river banks", min: 3, max: 12, step: 1, value: 5 },
  riverCut: { label: "River cliff cut", min: 0, max: 1, step: 0.05, value: 0.8 },
  cutFrequency: { label: "Cut bank frequency", min: 0, max: 1, step: 0.05, value: 0.55 },
  riverDrop: { label: "River descent", min: 0, max: 0.04, step: 0.001, value: 0.002 },
  waterfallDrop: { label: "Waterfall drop", min: 0, max: 1.5, step: 0.05, value: 0.8 },
  waterfallSpacing: { label: "Falls spacing", min: 12, max: 100, step: 1, value: 90 },
  waterDepth: { label: "Water depth scale", min: 0.1, max: 1, step: 0.1, value: 0.4 },
  edgeWidth: { label: "Elevation border width", min: 0.01, max: 0.12, step: 0.005, value: 0.045 },
  edgeStrength: { label: "Elevation border shade", min: 0, max: 1, step: 0.05, value: 0.7 },
  shimmerCoverage: { label: "Shimmer coverage", min: 0, max: 1, step: 0.05, value: 0.45 },
  shimmerSize: { label: "Shimmer group size", min: 2, max: 16, step: 1, value: 6 },
  shimmerSpeed: { label: "Shimmer ebb speed", min: 0.1, max: 2, step: 0.1, value: 0.5 },
  shimmerStrength: { label: "Shimmer brightness", min: 0, max: 1, step: 0.05, value: 0.35 },
  waterfallTurbulence: { label: "Waterfall surface turbulence", min: 0, max: 1, step: 0.05, value: 0.75 },
  turbulenceReach: { label: "Waterfall turbulence reach", min: 1, max: 6, step: 1, value: 3 },
  turbulenceSpeed: { label: "Waterfall current speed", min: 0.5, max: 4, step: 0.1, value: 1.8 },
  foam: { label: "Waterfall foam", min: 0, max: 1, step: 0.05, value: 0.45 },
} as const
export type ElevationSettings = { [K in keyof typeof ELEVATION_CONTROLS]: number }
export const DEFAULT_ELEVATION = Object.fromEntries(Object.entries(ELEVATION_CONTROLS).map(([k, c]) => [k, c.value])) as ElevationSettings
export function elevationSettings(input: Partial<ElevationSettings> = {}): ElevationSettings {
  const result = { ...DEFAULT_ELEVATION }
  for (const key of Object.keys(result) as (keyof ElevationSettings)[]) {
    const c = ELEVATION_CONTROLS[key], value = input[key]
    if (value !== undefined && Number.isFinite(value)) result[key] = Math.max(c.min, Math.min(c.max, value))
  }
  return result
}
export interface ElevationInfo {
  settings: ElevationSettings
  /** Ground height relative to base; valley banks and submerged beds may lie below zero. */
  height: number[]
  /** Corner heights NW, NE, SW, SE, relative to base, for continuous slopes. */
  corners: number[]
  /** Maximum dry-neighbour height difference per tile. */
  slope: number[]
  /** Bit mask in ROUTE_DIRS order, one bit per impassable cliff edge. */
  cliffs: number[]
}

const smooth = (t: number) => t * t * (3 - 2 * t)
export function elevationNoise(seed: number, x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z), fx = smooth(x - ix), fz = smooth(z - iz)
  const hash = (a: number, b: number) => makeRng(seed ^ Math.imul(a, 374761393) ^ Math.imul(b, 668265263))()
  return (hash(ix, iz) * (1 - fx) + hash(ix + 1, iz) * fx) * (1 - fz)
    + (hash(ix, iz + 1) * (1 - fx) + hash(ix + 1, iz + 1) * fx) * fz
}

export function generateElevation(seed: number, width: number, depth: number, water: Uint8Array, input?: Partial<ElevationSettings>, flow: Map<number, readonly [number, number]> = new Map()): ElevationInfo {
  const settings = elevationSettings(input), height = new Array<number>(width * depth)
  seed ^= Math.imul(settings.noiseSeed, 0x5be0cd19)
  const nearestWater = new Int32Array(height.length).fill(-1)
  const distance = new Int32Array(height.length).fill(width + depth), queue: number[] = []
  for (let i = 0; i < height.length; i++) if (water[i]) { distance[i] = 0; nearestWater[i] = i; queue.push(i) }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % width, z = Math.floor(i / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || distance[n] <= distance[i] + 1) continue
      distance[n] = distance[i] + 1; nearestWater[n] = nearestWater[i]; queue.push(n)
    }
  }
  const rng = makeRng(seed ^ 0x6a09e667)
  // Rotated, warped escarpments: broken ridgelines with broad backs and tapered ends.
  const ridges = Array.from({ length: Math.ceil(width * depth / 2200 * settings.cliffDensity) }, () => {
    const angle = rng() * Math.PI * 2
    return { x: rng() * width, z: rng() * depth, c: Math.cos(angle), s: Math.sin(angle),
      length: settings.cliffLength * (0.5 + rng()), breadth: 4 + rng() * 8,
      bend: (rng() - 0.5) * 0.8, phase: rng() * 100, relief: 0.7 + rng() * 0.6 }
  })
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x
    const broad = elevationNoise(seed ^ 0x510e527f, x / settings.scale, z / settings.scale)
    const fine = elevationNoise(seed ^ 0x9b05688c, x / 7, z / 7) - 0.5
    let h = Math.pow(Math.max(0, broad + fine * settings.detail), settings.power) * Math.max(0, settings.maxHeight - settings.cliffHeight)
    for (const ridge of ridges) {
      const dx = x - ridge.x, dz = z - ridge.z
      const u = (dx * ridge.c + dz * ridge.s) / ridge.length
      if (Math.abs(u) >= 1) continue
      const warp = (elevationNoise(seed ^ 0xa54ff53a, u * 3 + ridge.phase, ridge.phase) - 0.5) * settings.cliffRoughness
      const v = (-dx * ridge.s + dz * ridge.c) / ridge.breadth - ridge.bend * u * u - warp
      const rim = 0.35 + (elevationNoise(seed ^ 0x3c6ef372, u * 7 + ridge.phase, 11) - 0.5) * settings.cliffRoughness * 0.65
      if (v < -1 || v >= rim) continue
      const end = smooth(Math.min(1, (1 - Math.abs(u)) / 0.28))
      const back = smooth(Math.min(1, (v + 1) / (rim + 0.6)))
      h += settings.cliffHeight * ridge.relief * end * back
    }
    let bank = smooth(Math.min(1, Math.max(0, (distance[i] - settings.bankWidth) / 6)))
    const river = nearestWater[i], heading = flow.get(river)
    if (heading && !water[i]) {
      const rx = river % width, rz = Math.floor(river / width)
      const side = (x - rx) * -heading[1] + (z - rz) * heading[0]
      const cutNoise = elevationNoise(seed ^ 0x1f83d9ab, rx / 16, rz / 16)
      // Outside bends expose high ground; the opposite bank retains a floodplain.
      // Gaps in the cut bank leave level crossings for roads and bridges.
      const cut = smooth(Math.min(1, Math.max(0, (settings.cutFrequency - cutNoise) * 8)))
      if (side > 0) bank = Math.max(bank, settings.riverCut * cut)
    }
    const edge = smooth(Math.min(1, Math.min(x, z, width - 1 - x, depth - 1 - z) / 6))
    height[i] = Math.min(settings.maxHeight, h) * bank * edge
  }
  return { settings, height, corners: [], slope: [], cliffs: [] }
}

/** Visit every in-bounds edge of a tile with its height difference, water measured at its surface. */
function forEachEdge(
  e: ElevationInfo, width: number, depth: number, water: Uint8Array, surface: number[], i: number,
  visit: (n: number, side: number, delta: number) => void,
): void {
  const x = i % width, z = Math.floor(i / width), h = water[i] ? surface[i] : e.height[i]
  ROUTE_DIRS.forEach(([dx, dz], side) => {
    const nx = x + dx, nz = z + dz, n = nz * width + nx
    if (nx < 0 || nz < 0 || nx >= width || nz >= depth) return
    visit(n, side, Math.abs(h - (water[n] ? surface[n] : e.height[n])))
  })
}

function updateElevationEdges(e: ElevationInfo, width: number, depth: number, water: Uint8Array, surface: number[]): void {
  e.slope = e.height.map(() => 0); e.cliffs = e.height.map(() => 0)
  for (let i = 0; i < e.height.length; i++) {
    forEachEdge(e, width, depth, water, surface, i, (n, side, delta) => {
      if (!water[i] && !water[n]) e.slope[i] = Math.max(e.slope[i], delta)
      if (delta >= e.settings.cliffThreshold) e.cliffs[i] |= 1 << side
    })
  }
}

/**
 * Tiles with at least one cliff edge, by the same cutoff `cliffs` uses once
 * the map is finished. Usable before then — founding sites are chosen while
 * the edge masks are still empty.
 */
export function cliffMask(e: ElevationInfo, width: number, depth: number, water: Uint8Array, surface: number[]): Uint8Array {
  const mask = new Uint8Array(e.height.length)
  for (let i = 0; i < mask.length; i++) {
    forEachEdge(e, width, depth, water, surface, i, (_n, _side, delta) => {
      if (delta >= e.settings.cliffThreshold) mask[i] = 1
    })
  }
  return mask
}

/** Rebuild after grading a founding footprint. Water corners retain their channel levels. */
export function finishElevation(e: ElevationInfo, width: number, depth: number, water: Uint8Array, surface: number[]): void {
  updateElevationEdges(e, width, depth, water, surface)
  e.corners = new Array(e.height.length * 4)
  // At each lattice vertex, connected dry tiles share one corner height.
  // Group by walkable edges, so a slope never develops a crack beside a cliff.
  for (let vz = 0; vz <= depth; vz++) for (let vx = 0; vx <= width; vx++) {
    const touching: Array<{ i: number; corner: number; x: number; z: number }> = []
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
      const x = vx + dx, z = vz + dz
      if (x < 0 || z < 0 || x >= width || z >= depth) continue
      touching.push({ i: z * width + x, corner: (dx === -1 ? 1 : 0) + (dz === -1 ? 2 : 0), x, z })
    }
    const seen = new Set<number>()
    for (const tile of touching) {
      if (seen.has(tile.i)) continue
      seen.add(tile.i)
      if (water[tile.i]) {
        e.corners[tile.i * 4 + tile.corner] = surface[tile.i]
        continue
      }
      const group = [tile]
      for (let q = 0; q < group.length; q++) for (const n of touching) {
        const at = group[q]
        if (seen.has(n.i) || water[n.i] || Math.abs(at.x - n.x) + Math.abs(at.z - n.z) !== 1) continue
        if (Math.abs(e.height[at.i] - e.height[n.i]) >= e.settings.cliffThreshold) continue
        seen.add(n.i); group.push(n)
      }
      const h = group.reduce((sum, p) => sum + e.height[p.i], 0) / group.length
      for (const p of group) e.corners[p.i * 4 + p.corner] = h
    }
  }
}

/**
 * Cut and fill any building footprint at its current ground-centre height
 * (the placement ghost's height for purchases).
 * Pin every corner, including the perimeter: averaging tile heights alone would
 * let the surrounding slope poke back through the floor. Unoccupied dry tiles
 * sharing those corners meet the pad; existing foundations and water stay put.
 * Adjacent buildings at different heights retain a small terrace between them.
 */
export function levelBuildingGround(map: GameMap, building: Pick<BuildingDef, "x" | "z" | "w" | "d">): ElevationInfo | undefined {
  const original = map.elevation
  if (!original) return undefined
  const { x, z, w, d } = building
  let foundation = groundHeight(map, x + (w - 1) / 2, z + (d - 1) / 2) - TILE_HEIGHT
  const corner = original.corners[(z * map.width + x) * 4]
  // Adding/subtracting TILE_HEIGHT can round an already flat foundation.
  if (Math.abs(foundation - corner) < 1e-12) foundation = corner
  // Most shrine plots are already level. Keep their buffers (and all readers'
  // caches) intact; copy only the arrays that grading actually changes.
  const elevation = { ...original }
  const write = (field: "height" | "corners", index: number) => {
    if (elevation[field][index] === foundation) return
    if (elevation[field] === original[field]) elevation[field] = [...original[field]]
    elevation[field][index] = foundation
  }
  const inside = (tx: number, tz: number) => tx >= x && tx < x + w && tz >= z && tz < z + d
  const wet = (i: number) => map.water ? map.water.depth[i] > 0 : isWaterTerrain(map.tiles[i])
  for (let tz = z; tz < z + d; tz++) for (let tx = x; tx < x + w; tx++) {
    write("height", tz * map.width + tx)
  }
  for (let vz = z; vz <= z + d; vz++) for (let vx = x; vx <= x + w; vx++) {
    const touching: Array<{ x: number; z: number; i: number; corner: number }> = []
    for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
      const tx = vx + dx, tz = vz + dz
      if (tx < 0 || tz < 0 || tx >= map.width || tz >= map.depth) continue
      touching.push({ x: tx, z: tz, i: tz * map.width + tx, corner: (dx === -1 ? 1 : 0) + (dz === -1 ? 2 : 0) })
    }
    const sharedHeights = touching.filter((t) => inside(t.x, t.z)).map((t) => original.corners[t.i * 4 + t.corner])
    for (const t of touching) {
      if (wet(t.i)) continue
      if (!inside(t.x, t.z)) {
        if (!sharedHeights.includes(original.corners[t.i * 4 + t.corner])) continue
        if (map.buildings.some((b) => t.x >= b.x && t.x < b.x + b.w && t.z >= b.z && t.z < b.z + b.d)) continue
      }
      write("corners", t.i * 4 + t.corner)
    }
  }
  if (elevation.height === original.height && elevation.corners === original.corners) return original
  if (elevation.height !== original.height) {
    elevation.slope = [...original.slope]; elevation.cliffs = [...original.cliffs]
    const height = (i: number) => wet(i) ? (map.water?.surface ?? original.height)[i] : elevation.height[i]
    // Only edges touching the footprint can have changed, including the
    // reverse edge on its neighbours. Corner smoothing does not change them.
    for (let tz = Math.max(0, z - 1); tz < Math.min(map.depth, z + d + 1); tz++) {
      for (let tx = Math.max(0, x - 1); tx < Math.min(map.width, x + w + 1); tx++) {
        const i = tz * map.width + tx
        elevation.slope[i] = 0; elevation.cliffs[i] = 0
        ROUTE_DIRS.forEach(([dx, dz], side) => {
          const nx = tx + dx, nz = tz + dz, n = nz * map.width + nx
          if (nx < 0 || nz < 0 || nx >= map.width || nz >= map.depth) return
          const delta = Math.abs(height(i) - height(n))
          if (!wet(i) && !wet(n)) elevation.slope[i] = Math.max(elevation.slope[i], delta)
          if (delta >= elevation.settings.cliffThreshold) elevation.cliffs[i] |= 1 << side
        })
      }
    }
  }
  return elevation
}

export function elevationStep(e: ElevationInfo | undefined, a: number, b: number): number {
  if (!e) return 0
  const delta = Math.abs(e.height[a] - e.height[b])
  return delta >= e.settings.cliffThreshold ? Infinity : delta * e.settings.slopeCost
}

/** Sample the same two triangles as the rendered tile top, including off-centre props. */
export function groundHeight(map: GameMap, x: number, z: number): number {
  if (!map.elevation) return TILE_HEIGHT
  const tx = Math.max(0, Math.min(map.width - 1, Math.floor(x + 0.5)))
  const tz = Math.max(0, Math.min(map.depth - 1, Math.floor(z + 0.5)))
  const i = (tz * map.width + tx) * 4, c = map.elevation.corners
  const u = Math.max(0, Math.min(1, x - tx + 0.5)), v = Math.max(0, Math.min(1, z - tz + 0.5))
  const cut = terrainCorner(map, tx, tz)
  if (cut) return TILE_HEIGHT + (inCliffCorner(cut, u, v) ? cliffCornerHeight(cut, u, v) : cliffUpperHeight(map, tx, tz, cut, u, v))
  return TILE_HEIGHT + (u + v <= 1
    ? c[i] + u * (c[i + 1] - c[i]) + v * (c[i + 2] - c[i])
    : c[i + 3] + (1 - u) * (c[i + 2] - c[i + 3]) + (1 - v) * (c[i + 1] - c[i + 3]))
}
