import { makeRng } from "../game/rng"
import { isWoods, TERRAIN, type TerrainId } from "../game/map/terrain"
import { connectPreview } from "./routes"
import { neighbors } from "../game/map/woodland-details"
import { normalizeSettings, sampleWoodland, distanceToMask, type Method, type Settings, type Clearing } from "../game/map/woodland"
export { METHODS, DEFAULT_SETTINGS, LIMITS, SEED_REGION_SIZE, normalizeSettings, seedingMethodForSeed, type Method, type Settings, type Clearing } from "../game/map/woodland"
interface Point { x: number; z: number }
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z)
export interface Preview {
  method: Method
  size: number
  tiles: TerrainId[]
  clearings: Clearing[]
  routes: number[][]
  water: Uint8Array
  church: Point
  seededTiles: TerrainId[]
  origin: Point
  darkFootprint: Uint8Array
  forestAccess: number[][]
  saplings: number[][]
  stats: { open: number; forest: number; dark: number; water: number; smallGroves: number; tinyGroves: number; largestWood: number; connected: number; nearbyTrees: number }
}
/** Crop one seeded landscape, then plan local walking access and a church.
 * Seeded terrain remains identical in overlapping windows; only the access
 * planning adapts to the destinations visible in the selected square. */
export function generatePreview(method: Method, input: Partial<Settings> = {}): Preview {
  const settings = normalizeSettings(input), { size, seed } = settings, area = size * size
  const { tiles, water, darkMask, clearings, saplings, origin: sampleOrigin } = sampleWoodland(method, settings)
  const origin = sampleOrigin.x
  const seededTiles = tiles.slice()
  if (!clearings.some(c => c.kind === "main")) {
    let best = -1, score = Infinity
    for (let i = 0; i < area; i++) if (tiles[i] === "grass" && !darkMask[i]) {
      const d = Math.hypot(i % size - size / 2, Math.floor(i / size) - size / 2)
      if (d < score) { score = d; best = i }
    }
    if (best < 0) throw new Error("No open ground in this sample")
    clearings.unshift({ x: best % size, z: Math.floor(best / size), radius: 1, kind: "main", tiles: [best] })
  }
  // Keep the first anchor on open land even when a cropped heart precedes it.
  clearings.sort((a, b) => Number(a.kind === "heart") - Number(b.kind === "heart"))
  const fromDark = distanceToMask(darkMask, size)
  const { church, lumber } = placeChurch(tiles, water, size, clearings[0])

  // Main destinations connect outside dark forests. Hearts are leaves added
  // afterwards, so they can never become a through-route between clearings.
  const routes: number[][] = [], forestAccess: number[][] = [], joined = new Set([0]), routeRng = makeRng(seed ^ 0x7843)
  const jitter = Float64Array.from({ length: area }, () => routeRng() * .6)
  const stops: Point[] = [...clearings.filter(c => c.kind === "main"), church]
  const outsideBlocked = Uint8Array.from(fromDark, d => Number(d <= Math.ceil(settings.corridor / 2)))
  // The church's entire plot already avoids darkwood, but can be close to
  // the collar. Its connection still carves ordinary woodland only.
  outsideBlocked[church.z * size + church.x] = 0
  const carve = (route: number[], darkAllowed?: Uint8Array) => {
    for (const i of route) {
      if (water[i]) { tiles[i] = "bridge"; continue }
      const p = { x: i % size, z: Math.floor(i / size) }
      const low = -Math.floor((settings.corridor - 1) / 2), high = Math.ceil((settings.corridor - 1) / 2)
      for (let dz = low; dz <= high; dz++) for (let dx = low; dx <= high; dx++) {
        const x = p.x + dx, z = p.z + dz, n = z * size + x
        // Ancient woods have narrow access tracks. Widening them near a
        // jagged inlet can accidentally open a second door, so only the
        // cardinal spine is cut inside the forest and along its outer collar.
        if (darkAllowed && n !== i && (darkMask[i] || fromDark[n] === 1)) continue
        if (x >= 0 && z >= 0 && x < size && z < size && !lumber[n] && (!darkMask[n] || (darkAllowed?.[i] && darkAllowed[n])) && isWoods(tiles[n])) tiles[n] = "clearing"
      }
    }
    routes.push(route)
  }
  while (joined.size < stops.length) {
    let from = 0, to = -1, best = Infinity
    for (const a of joined) for (let b = 0; b < stops.length; b++) {
      if (joined.has(b)) continue
      const d = distance(stops[a], stops[b])
      if (d < best) { best = d; from = a; to = b }
    }
    const route = connectPreview(stops[from].z * size + stops[from].x, stops[to].z * size + stops[to].x, tiles, water, size, jitter, lumber, { blocked: outsideBlocked })
    carve(route); joined.add(to)
  }
  const network = routes.flat().filter(i => !water[i]), visitedDark = new Uint8Array(area)
  for (const heart of clearings.filter(c => c.kind === "heart")) {
    const start = heart.z * size + heart.x
    if (visitedDark[start]) continue
    const component = [start], own = new Uint8Array(area); own[start] = 1; visitedDark[start] = 1
    for (let head = 0; head < component.length; head++) for (const n of neighbors(component[head], size)) {
      if (darkMask[n] && !own[n]) { own[n] = 1; visitedDark[n] = 1; component.push(n) }
    }
    const blocked = Uint8Array.from(darkMask, (value, i) => Number(Boolean(value) && !own[i]))
    const goal = network.reduce((best, i) => distance(heart, { x: i % size, z: Math.floor(i / size) }) < distance(heart, { x: best % size, z: Math.floor(best / size) }) ? i : best)
    const route = connectPreview(start, goal, tiles, water, size, jitter, lumber, { blocked, exitOnly: own })
    carve(route, own); forestAccess.push(route)
    // If two seeded dark forests have merged, their hearts share one outside
    // entrance. Additional hearts join the internal path without exiting.
    const insideBlocked = Uint8Array.from(own, value => Number(!value))
    for (const other of clearings.filter(c => c.kind === "heart" && c !== heart && own[c.z * size + c.x])) {
      carve(connectPreview(other.z * size + other.x, start, tiles, water, size, jitter, lumber, { blocked: insideBlocked }), own)
    }
  }
  return { method, size, tiles, clearings, routes, water, church, darkFootprint: darkMask, forestAccess, saplings, seededTiles, origin: { x: origin, z: origin }, stats: measure(tiles, size, clearings, church) }
}

/** Site a 5×5 starting plot beside an existing stand, then protect 24 nearby
 * normal-forest tiles from trail carving. The guarantee is in tile units so
 * a larger preview does not put starting lumber farther from the church. */
function placeChurch(tiles: TerrainId[], water: Uint8Array, size: number, clearing: Point) {
  const side = size + 1
  const treeSum = new Int32Array(side * side), blockedSum = new Int32Array(side * side)
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = z * size + x, n = (z + 1) * side + x + 1
    treeSum[n] = Number(tiles[i] === "forest") + treeSum[n - 1] + treeSum[n - side] - treeSum[n - side - 1]
    blockedSum[n] = Number(Boolean(water[i]) || tiles[i] === "darkwood") + blockedSum[n - 1] + blockedSum[n - side] - blockedSum[n - side - 1]
  }
  const count = (sum: Int32Array, x: number, z: number, r: number) => {
    const x0 = Math.max(0, x - r), z0 = Math.max(0, z - r), x1 = Math.min(size, x + r + 1), z1 = Math.min(size, z + r + 1)
    return sum[z1 * side + x1] - sum[z0 * side + x1] - sum[z1 * side + x0] + sum[z0 * side + x0]
  }
  let church: Point | undefined, best = Infinity
  for (let z = 3; z < size - 3; z++) for (let x = 3; x < size - 3; x++) {
    if (count(blockedSum, x, z, 3)) continue
    let available = count(treeSum, x, z, 8) - count(treeSum, x, z, 3)
    // Keep cardinal exits through the reserved lumber. In a dense central
    // wood, protecting the nearest trees on every side can fence in the plot.
    for (let d = -8; d <= 8; d++) if (Math.abs(d) > 3) {
      if (x + d >= 0 && x + d < size && tiles[z * size + x + d] === "forest") available--
      if (z + d >= 0 && z + d < size && tiles[(z + d) * size + x] === "forest") available--
    }
    if (available < 24) continue
    const fromCenter = Math.hypot(x - size / 2, z - size / 2)
    const score = Math.max(0, fromCenter - size * .2) * 20 + fromCenter
      + distance(clearing, { x, z }) * .1 + count(treeSum, x, z, 3) * 2
    if (score < best) { church = { x, z }; best = score }
  }
  if (!church) throw new Error("No dry church plot with nearby lumber")
  const lumber = new Uint8Array(tiles.length), candidates: number[] = []
  for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
    const x = church.x + dx, z = church.z + dz
    if (x < 0 || z < 0 || x >= size || z >= size) continue
    const i = z * size + x
    if (Math.max(Math.abs(dx), Math.abs(dz)) <= 2) tiles[i] = "grass"
    else if (dx !== 0 && dz !== 0 && tiles[i] === "forest") candidates.push(i)
  }
  candidates.sort((a, b) => distance(church!, { x: a % size, z: Math.floor(a / size) }) - distance(church!, { x: b % size, z: Math.floor(b / size) }))
  for (const i of candidates.slice(0, 24)) lumber[i] = 1
  return { church, lumber }
}

/** Measure the final raster, not the proposed graph: cardinal flood fill uses
 * the game's terrain passability, so diagonal corner contacts never count. */
function measure(tiles: TerrainId[], size: number, clearings: Clearing[], church: Point): Preview["stats"] {
  const labels = new Int32Array(tiles.length).fill(-1), woods: number[] = []
  let component = 0
  for (let start = 0; start < tiles.length; start++) {
    if (labels[start] !== -1) continue
    const wooded = isWoods(tiles[start]), queue = [start]
    labels[start] = component
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head], x = i % size, z = Math.floor(i / size)
      const neighbors = [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, z > 0 ? i - size : -1, z < size - 1 ? i + size : -1]
      for (const n of neighbors) if (n >= 0 && labels[n] === -1 && (wooded ? isWoods(tiles[n]) : TERRAIN[tiles[n]].passable === TERRAIN[tiles[start]].passable && !isWoods(tiles[n]))) {
        labels[n] = component; queue.push(n)
      }
    }
    if (wooded) woods.push(queue.length)
    component++
  }
  const forest = tiles.filter(t => t === "forest").length, dark = tiles.filter(t => t === "darkwood").length
  const water = tiles.filter(t => t === "water" || t === "bridge").length
  let nearbyTrees = 0
  for (let dz = -8; dz <= 8; dz++) for (let dx = -8; dx <= 8; dx++) {
    const x = church.x + dx, z = church.z + dz
    if (x >= 0 && z >= 0 && x < size && z < size && tiles[z * size + x] === "forest") nearbyTrees++
  }
  const origin = labels[clearings[0].z * size + clearings[0].x]
  return {
    open: (tiles.length - water - forest - dark) / tiles.length * 100,
    forest: forest / tiles.length * 100, dark: dark / tiles.length * 100,
    water: water / tiles.length * 100, nearbyTrees,
    smallGroves: woods.filter(n => n > 8 && n <= 120).length,
    tinyGroves: woods.filter(n => n >= 1 && n <= 8).length,
    largestWood: Math.max(0, ...woods),
    connected: clearings.filter(c => labels[c.z * size + c.x] === origin).length,
  }
}
