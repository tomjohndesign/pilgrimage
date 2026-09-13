import { makeRng, DEFAULT_WORLD_SEED } from "../rng"
import { isWoods, type TerrainId } from "./terrain"
import { generateWater } from "./water"
import { growOrganicClearing, scatterSaplings } from "./woodland-details"

export const METHODS = {
  glades: { title: "Carved glades", description: "Begin with woodland; spread clearings apart and grow open space around them. A study of the original forest-first approach." },
  groves: { title: "Wind-spread groves", description: "Seeds drift downwind from parent stands, growing branching colonies with uneven edges and tapered ends." },
  noise: { title: "Warped noise", description: "Bend a smooth, multi-scale field before choosing woodland. Long, irregular forest edges alternate with broad meadows." },
  cellular: { title: "Cellular growth", description: "Seed a coarse grid, then let neighboring woodland cells reinforce each other. Rounded clumps and open channels emerge." },
} as const
export type Method = keyof typeof METHODS
/** The seed chooses one of the two accepted woodland styles on its own
 * stream. Sample size and tuning never reroll that choice. */
export function seedingMethodForSeed(seed: number): "groves" | "cellular" {
  return makeRng((seed >>> 0) ^ 0x741b)() < .5 ? "groves" : "cellular"
}
export interface Settings {
  seed: number
  size: number
  forest: number
  clearings: number
  groves: number
  darkCount: number
  darkShare: number
  heart: number
  corridor: number
  rivers: number
  lakes: number
  water: number
  wind: number
}
export const DEFAULT_SETTINGS: Settings = {
  seed: DEFAULT_WORLD_SEED, size: 192, forest: 40, clearings: 8,
  groves: 14, darkCount: 1, darkShare: 9, heart: 9, corridor: 3,
  rivers: 1, lakes: 1, water: 12, wind: 45,
}
export const LIMITS: Record<Exclude<keyof Settings, "seed">, readonly [number, number]> = {
  size: [128, 256], forest: [25, 60], clearings: [4, 14], groves: [1, 28],
  darkCount: [0, 2], darkShare: [6, 14], heart: [5, 12], corridor: [1, 5],
  rivers: [0, 2], lakes: [0, 2], water: [0, 25], wind: [0, 359],
}
export function normalizeSettings(input: Partial<Settings>): Settings {
  const result = { ...DEFAULT_SETTINGS }
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    const value = input[key]
    if (value !== undefined && Number.isFinite(value)) result[key] = Math.round(Math.max(LIMITS[key][0], Math.min(LIMITS[key][1], value)))
  }
  if (input.seed !== undefined && Number.isFinite(input.seed)) result.seed = input.seed >>> 0
  return result
}
interface Point { x: number; z: number }
export interface Clearing extends Point { radius: number; kind: "main" | "heart"; tiles: number[] }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)
const smooth = (t: number) => t * t * (3 - 2 * t)

/** Smooth seeded value field; the grid is shared across all samples. */
function field(seed: number, cells: number) {
  const rng = makeRng(seed), side = cells + 2
  const values = Float64Array.from({ length: side * side }, rng)
  return (x: number, z: number) => {
    const px = Math.max(0, Math.min(cells, x * cells)), pz = Math.max(0, Math.min(cells, z * cells))
    const ix = Math.floor(px), iz = Math.floor(pz), u = smooth(px - ix), v = smooth(pz - iz)
    const a = values[iz * side + ix] * (1 - u) + values[iz * side + ix + 1] * u
    const b = values[(iz + 1) * side + ix] * (1 - u) + values[(iz + 1) * side + ix + 1] * u
    return a * (1 - v) + b * v
  }
}

function spacedPoints(count: number, size: number, rng: () => number, avoid: (point: Point) => number = () => Infinity): Point[] {
  const points: Point[] = []
  for (let n = 0; n < count; n++) {
    let best = { x: size / 2, z: size / 2 }, score = -Infinity
    for (let attempt = 0; attempt < 80; attempt++) {
      const p = { x: Math.floor(size * (.1 + rng() * .8)), z: Math.floor(size * (.1 + rng() * .8)) }
      const nearest = Math.min(avoid(p), ...points.map(other => distance(p, other)))
      if (nearest > score) { best = p; score = nearest }
    }
    points.push(best)
  }
  return points
}

/** Eight-neighbor distance keeps a full woodland belt even at diagonal tips. */
export function distanceToMask(mask: Uint8Array, width: number, depth = width): Int32Array {
  const distances = new Int32Array(mask.length).fill(width + depth), queue: number[] = []
  for (let i = 0; i < mask.length; i++) if (mask[i]) { distances[i] = 0; queue.push(i) }
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % width, z = Math.floor(i / width)
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, nz = z + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      const n = nz * width + nx
      if (distances[n] > distances[i] + 1) { distances[n] = distances[i] + 1; queue.push(n) }
    }
  }
  return distances
}

/** Linear angular segments produce pointed lobes and deep notches. Broad
 * lobes vary the silhouette; finer seeded teeth break up the old smooth rim. */
function jaggedProfile(rng: () => number): number[] {
  const phase = rng() * Math.PI * 2
  const radii = Array.from({ length: 48 }, (_, i) => {
    const angle = i / 48 * Math.PI * 2
    return 1 + .12 * Math.sin(angle * 3 + phase) + .08 * Math.sin(angle * 5 - phase) + (rng() - .5) * .42
  })
  // Exact mean squared radius for linear segments keeps footprint comparisons
  // stable as the outline changes, rather than silently shrinking the forest.
  const meanSquare = radii.reduce((sum, r, i) => {
    const next = radii[(i + 1) % radii.length]
    return sum + (r * r + r * next + next * next) / 3
  }, 0) / radii.length
  return radii.map(r => r / Math.sqrt(meanSquare))
}

function cellularField(seed: number, size: number) {
  const side = Math.round(size / 6), rng = makeRng(seed)
  let cells = Float64Array.from({ length: side * side }, () => rng() < .47 ? 1 : 0)
  for (let pass = 0; pass < 4; pass++) {
    const next = new Float64Array(cells.length)
    for (let z = 0; z < side; z++) for (let x = 0; x < side; x++) {
      let count = 0
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        count += cells[Math.max(0, Math.min(side - 1, z + dz)) * side + Math.max(0, Math.min(side - 1, x + dx))]
      }
      next[z * side + x] = count >= 5 ? 1 : 0
    }
    cells = next
  }
  return (x: number, z: number) => {
    const px = x * (side - 1), pz = z * (side - 1), ix = Math.floor(px), iz = Math.floor(pz)
    const u = smooth(px - ix), v = smooth(pz - iz), nx = Math.min(side - 1, ix + 1), nz = Math.min(side - 1, iz + 1)
    return (cells[iz * side + ix] * (1 - u) + cells[iz * side + nx] * u) * (1 - v)
      + (cells[nz * side + ix] * (1 - u) + cells[nz * side + nx] * u) * v
  }
}

// A fixed surrounding region is sampled at different window sizes. Generation
// density and feature dimensions never depend on the selected preview size.
export const SEED_REGION_SIZE = 384
export const PLAYABLE_SEED_REGION_SIZE = 576
const REFERENCE_SIZE = 192
interface SeedRegion {
  tiles: TerrainId[]; water: Uint8Array; darkMask: Uint8Array
  clearings: Clearing[]; saplings: number[][]
}
const regionCache = new Map<string, SeedRegion>()

function seedRegion(method: Method, settings: Settings, size: number): SeedRegion {
  const seed = settings.seed, area = size * size, scale = 1
  const density = (size / REFERENCE_SIZE) ** 2
  const edge = field(seed ^ 0x1539, size / 384 * 36), broad = field(seed ^ 0x7231, size / 384 * 12)
  const warpX = field(seed ^ 0x1193, size / 384 * 8), warpZ = field(seed ^ 0x9381, size / 384 * 8)
  const water = generateWater({ rng: makeRng(seed ^ 0x94d049bb), width: size, depth: size,
    coverage: settings.water / 100, riverCount: settings.rivers * density, lakeCount: settings.lakes * density, pondCount: 0, landmarkArea: REFERENCE_SIZE ** 2 }).kind
  const fromWater = distanceToMask(water, size)
  const radius = REFERENCE_SIZE * Math.sqrt(settings.darkShare / 100 / Math.PI)
  const belt = Math.max(3, Math.round(5 * scale))
  const darkRng = makeRng(seed ^ 0x8731)
  const flip = darkRng() < .5
  const dark = Array.from({ length: settings.darkCount * density }, (_, n) => {
    const cell = Math.floor(n / settings.darkCount), within = n % settings.darkCount
    // One ancient stand per region leaves room in the canopy budget for
    // ordinary woods. Vary its corner without shrinking its mature footprint.
    const corner = settings.darkCount === 1 ? Number(darkRng() < .5) : within
    return {
      x: Math.round((cell % (size / REFERENCE_SIZE)) * REFERENCE_SIZE + REFERENCE_SIZE * ((corner === 0 ? .27 : .73) + (darkRng() - .5) * .025)),
      z: Math.round(Math.floor(cell / (size / REFERENCE_SIZE)) * REFERENCE_SIZE + REFERENCE_SIZE * (((corner === 0) !== flip ? .27 : .73) + (darkRng() - .5) * .025)),
      profile: jaggedProfile(darkRng),
    }
  })
  for (const d of dark) {
    const margin = Math.ceil(radius * Math.max(...d.profile)) + belt + Math.ceil(4 * scale) + 2
    d.x = Math.max(margin, Math.min(size - 1 - margin, d.x))
    d.z = Math.max(margin, Math.min(size - 1 - margin, d.z))
    // Move the heart onto dry ground; the eventual forest edge can follow a
    // riverbank, but water must never erase the heart or its enclosing canopy.
    if (fromWater[d.z * size + d.x] >= settings.heart * scale + belt + 6 * scale
      && Math.min(d.x, d.z, size - 1 - d.x, size - 1 - d.z) >= radius * .8) continue
    let best = Infinity, at = { x: d.x, z: d.z }
    for (let z = belt + 2; z < size - belt - 2; z++) for (let x = belt + 2; x < size - belt - 2; x++) {
      const i = z * size + x
      if (water[i]) continue
      const score = distance(d, { x, z }) + Math.max(0, settings.heart * scale + belt + 6 * scale - fromWater[i]) * 30
        + Math.max(0, radius * .8 - Math.min(x, z, size - 1 - x, size - 1 - z)) * 10
      if (score < best) { best = score; at = { x, z } }
    }
    d.x = at.x; d.z = at.z
  }
  const tiles: TerrainId[] = new Array(area).fill("grass")
  const reserved = new Uint8Array(area), darkMask = new Uint8Array(area)
  for (const d of dark) {
    const reach = Math.ceil(radius * Math.max(...d.profile))
    for (let z = Math.max(0, d.z - reach); z <= Math.min(size - 1, d.z + reach); z++) for (let x = Math.max(0, d.x - reach); x <= Math.min(size - 1, d.x + reach); x++) {
      const angle = (Math.atan2(z - d.z, x - d.x) + Math.PI * 2) % (Math.PI * 2)
      const sample = angle / (Math.PI * 2) * d.profile.length, index = Math.floor(sample), t = sample - index
      const rim = radius * (d.profile[index] * (1 - t) + d.profile[(index + 1) % d.profile.length] * t)
      if (distance(d, { x, z }) <= rim && fromWater[z * size + x] > belt + 1
        && Math.min(x, z, size - 1 - x, size - 1 - z) > belt + 1) darkMask[z * size + x] = 1
    }
  }
  const fromDark = distanceToMask(darkMask, size)
  for (let i = 0; i < area; i++) {
    const thickness = belt + Math.floor(edge((i % size) / size, Math.floor(i / size) / size) * 4 * scale)
    if (water[i]) { reserved[i] = 1; tiles[i] = "water" }
    else if (fromDark[i] <= thickness) { reserved[i] = 1; tiles[i] = darkMask[i] ? "darkwood" : "forest" }
  }
  // Main glades and detached grove buffers must fit outside the enclosing
  // woodland. Only forest hearts and their access trails can cut into it.
  const fromWoodland = distanceToMask(reserved, size)
  const main = spacedPoints(settings.clearings * density, size, makeRng(seed ^ 0x3137), p => fromWoodland[p.z * size + p.x])
  const clearingRng = makeRng(seed ^ 0x2937)
  const clearings: Clearing[] = [
    ...main.map(p => ({ ...p, radius: Math.min(scale * (8 + clearingRng() * 5), Math.max(1, fromWoodland[p.z * size + p.x] - 1) / 1.15), kind: "main" as const, tiles: [] })),
    ...dark.map(p => ({ x: p.x, z: p.z, radius: Math.min(settings.heart * scale, (fromWater[p.z * size + p.x] - 2) / 1.15), kind: "heart" as const, tiles: [] })),
  ]
  const groveRng = makeRng(seed ^ 0x9371)
  const wind = settings.wind / 180 * Math.PI, windCos = Math.cos(wind), windSin = Math.sin(wind)
  // Several generations of seeds drift from each parent, with crosswind
  // scatter and uneven germination. No circular groves or cleared halos are
  // stamped into meadows; every colony competes in the same cover field.
  const parents = spacedPoints(settings.groves * density, size, groveRng)
  const outsideRng = makeRng(seed ^ 0x9417)
  // The square crops a larger woodland: parent stands also live beyond every
  // edge, so their wind-blown descendants can cross the map boundary.
  for (let side = 0; side < 4; side++) for (let n = 0; n < 3; n++) {
    const along = size * ((n + .3 + outsideRng() * .4) / 3), outside = (3 + outsideRng() * 7) * scale
    parents.push(side === 0 ? { x: -outside, z: along } : side === 1 ? { x: size + outside, z: along }
      : side === 2 ? { x: along, z: -outside } : { x: along, z: size + outside })
  }
  const nuclei = parents.flatMap(p => {
    const length = scale * (12 + groveRng() * 18), width = scale * (4 + groveRng() * 7)
    return Array.from({ length: 5 }, (_, generation) => {
      const drift = generation * length * .3, scatter = (groveRng() - .5) * width * 2
      return { x: p.x + Math.cos(wind) * drift - Math.sin(wind) * scatter,
        z: p.z + Math.sin(wind) * drift + Math.cos(wind) * scatter,
        length: length * (.7 + groveRng() * .5), width: width * (.5 + groveRng() * .6), strength: 1 - generation * .08 }
    })
  })
  const bucketSize = 48, bucketSide = Math.ceil(size / bucketSize)
  const buckets = Array.from({ length: bucketSide ** 2 }, () => [] as typeof nuclei)
  for (const c of nuclei) {
    const reach = Math.max(c.length, c.width) * 3 + 14
    for (let bz = Math.max(0, Math.floor((c.z - reach) / bucketSize)); bz <= Math.min(bucketSide - 1, Math.floor((c.z + reach) / bucketSize)); bz++)
      for (let bx = Math.max(0, Math.floor((c.x - reach) / bucketSize)); bx <= Math.min(bucketSide - 1, Math.floor((c.x + reach) / bucketSize)); bx++) buckets[bz * bucketSide + bx].push(c)
  }
  const cells = method === "cellular" ? cellularField(seed ^ 0x5613, size) : null
  const scores = new Float64Array(area)
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = z * size + x, u = x / size, v = z / size
    const ragged = edge(u, v)
    if (method === "glades") scores[i] = Math.min(...clearings.filter(c => c.kind === "main").map(c => distance(c, { x, z }) / c.radius)) + ragged * .8
    else if (method === "groves") {
      const px = x + (warpX(u, v) - .5) * 18 * scale, pz = z + (warpZ(u, v) - .5) * 18 * scale
      let strongest = -3
      const along = px * windCos + pz * windSin, across = -px * windSin + pz * windCos
      for (const c of buckets[Math.floor(z / bucketSize) * bucketSide + Math.floor(x / bucketSize)]) {
        const dx = (along - (c.x * windCos + c.z * windSin)) / c.length
        const dz = (across - (-c.x * windSin + c.z * windCos)) / c.width
        strongest = Math.max(strongest, c.strength - Math.sqrt(dx * dx + dz * dz))
      }
      scores[i] = strongest + ragged * .65
    }
    else if (method === "noise") scores[i] = broad(u + (warpX(u, v) - .5) * .25, v + (warpZ(u, v) - .5) * .25) * .8 + ragged * .2
    else scores[i] = cells!(u, v) * .8 + broad(u, v) * .15 + ragged * .05
  }
  const darkInterior = distanceToMask(Uint8Array.from(darkMask, value => Number(!value)), size)
  const heartNoise = field(seed ^ 0x7653, 64)
  clearings.forEach((c, index) => {
    // Main meadows need the same irregular growth as ancient forest hearts.
    // Radius sets area only; no circle is stamped into the canopy.
    c.tiles = growOrganicClearing(c, size, seed ^ (0x3321 + index), c.kind === "heart" ? darkInterior : fromWoodland, heartNoise)
    for (const i of c.tiles) { tiles[i] = "grass"; reserved[i] = 1 }
  })
  // Rank only unreserved land; all methods receive the same total tree budget,
  // including dark forest. Actual post-route coverage is reported separately.
  const candidates: number[] = []
  let trees = 0
  for (let i = 0; i < area; i++) { if (!reserved[i]) candidates.push(i); else if (isWoods(tiles[i])) trees++ }
  candidates.sort((a, b) => scores[b] - scores[a] || a - b)
  const dryLand = water.reduce((sum, kind) => sum + Number(kind === 0), 0)
  const budget = Math.max(0, Math.round(dryLand * settings.forest / 100) - trees)
  for (const i of candidates.slice(0, budget)) tiles[i] = "forest"

  // Remove incidental tiny islands of trees in open meadows. Larger stands
  // remain; their outlines still come entirely from the selected growth field.
  removeTinyGroves(tiles, size, Math.round(55 * scale * scale))
  const saplings = scatterSaplings(tiles, reserved, size, seed ^ 0x1329, method === "groves" ? settings.wind : 45)
  return { tiles, water, darkMask, clearings, saplings }
}

function removeTinyGroves(tiles: TerrainId[], size: number, minimum: number) {
  const seen = new Uint8Array(tiles.length)
  for (let start = 0; start < tiles.length; start++) {
    if (seen[start] || !isWoods(tiles[start])) continue
    const queue = [start]; seen[start] = 1
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head], x = i % size, z = Math.floor(i / size)
      for (const n of [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, z > 0 ? i - size : -1, z < size - 1 ? i + size : -1]) {
        if (n >= 0 && !seen[n] && isWoods(tiles[n])) { seen[n] = 1; queue.push(n) }
      }
    }
    if (queue.length < minimum && queue.every(i => tiles[i] === "forest")) for (const i of queue) tiles[i] = "grass"
  }
}

/** Sample fixed tile-scale woodland. Larger maps reveal more of the same region.
 * Water and access planning are supplied by the caller; no preview routes enter gameplay. */
export function sampleWoodland(method: Method, settings: Settings, width = settings.size, depth = width, regionSize = SEED_REGION_SIZE) {
  if (width > regionSize || depth > regionSize) throw new Error("Woodland sample exceeds its seed region")
  const key = JSON.stringify({ method, ...settings, size: regionSize, corridor: 0 })
  let region = regionCache.get(key)
  if (!region) {
    region = seedRegion(method, settings, regionSize)
    if (regionCache.size >= 4) regionCache.delete(regionCache.keys().next().value!)
    regionCache.set(key, region)
  }
  const ox = Math.floor((regionSize - width) / 2), oz = Math.floor((regionSize - depth) / 2)
  const localIndex = (i: number) => {
    const x = i % regionSize - ox, z = Math.floor(i / regionSize) - oz
    return x >= 0 && z >= 0 && x < width && z < depth ? z * width + x : -1
  }
  const tiles: TerrainId[] = new Array(width * depth), water = new Uint8Array(tiles.length), darkMask = new Uint8Array(tiles.length)
  for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
    const i = z * width + x, source = (z + oz) * regionSize + x + ox
    tiles[i] = region.tiles[source]; water[i] = region.water[source]; darkMask[i] = region.darkMask[source]
  }
  const clearings = region.clearings.filter(c => c.x >= ox + 3 && c.z >= oz + 3 && c.x < ox + width - 3 && c.z < oz + depth - 3)
    .map(c => ({ ...c, x: c.x - ox, z: c.z - oz, tiles: c.tiles.map(localIndex).filter(i => i >= 0) }))
  const saplings = region.saplings.map(c => c.map(localIndex).filter(i => i >= 0)).filter(c => c.length)
  return { tiles, water, darkMask, clearings, saplings, origin: { x: ox, z: oz } }
}
