import { elevationNoise, type ElevationInfo } from "./elevation"
import { ROUTE_DIRS } from "./route"
import type { WaterInfo } from "./types"

/** Erode shores to their actual water level, leaving scattered resistant rock faces. */
export function taperRiverBanks(
  elevation: ElevationInfo, width: number, depth: number, kind: Uint8Array,
  water: WaterInfo, headings: Map<number, readonly [number, number]>, seed = 0,
): void {
  if (!water.surface) return
  const nearest = new Int32Array(kind.length).fill(-1)
  const distance = new Int32Array(kind.length).fill(-1), queue: number[] = []
  for (let i = 0; i < kind.length; i++) if (kind[i]) {
    nearest[i] = i; distance[i] = 0; queue.push(i)
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % width, z = Math.floor(i / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || distance[n] !== -1) continue
      nearest[n] = nearest[i]; distance[n] = distance[i] + 1; queue.push(n)
    }
  }
  const { settings, height } = elevation
  const grade = Math.min(settings.bankSlope, settings.cliffThreshold * 0.6)
  for (let i = 0; i < kind.length; i++) {
    const river = nearest[i], flow = headings.get(river)
    if (kind[i] || river < 0) continue
    const lake = kind[river] === 2 || !flow
    const x = i % width, z = Math.floor(i / width)
    const dx = x - (river % width), dz = z - Math.floor(river / width)
    const rock = elevationNoise(seed ^ settings.noiseSeed ^ 0x4a39b70d, x / settings.erosionScale, z / settings.erosionScale)
    const share = lake ? settings.lakeCliffs : settings.cutFrequency
    const resistant = Math.min(1, Math.max(0, (rock - (1 - share)) / 0.18))
    const preserve = lake || (flow && dx * -flow[1] + dz * flow[0] > 0)
      ? resistant * resistant * (3 - 2 * resistant) : 0
    let shore = water.surface[river] + 0.035
    // At confluences/falls, the dry lip must clear every adjoining water surface.
    for (const [sx, sz] of ROUTE_DIRS) {
      const nx = x + sx, nz = z + sz, n = nz * width + nx
      if (nx >= 0 && nz >= 0 && nx < width && nz < depth && kind[n]) shore = Math.max(shore, water.surface[n] + 0.035)
    }
    const relief = Math.max(0, height[i] - shore)
    // Deep valleys widen automatically; noise varies coves and the width of deposited shelves.
    const taper = (lake ? settings.lakeTaper : settings.bankTaper) * (0.8 + rock * 0.6)
    const reach = Math.max(taper, 1.5 * relief / grade)
    const t = Math.min(1, Math.max(0, (distance[i] - 0.5) / reach))
    const eroded = shore + relief * t * t * (3 - 2 * t)
    height[i] = height[i] * preserve + eroded * (1 - preserve)

  }
  // Sediment builds a broad shallow shelf inside lakes without moving their shoreline or level.
  const wetDistance = new Int32Array(kind.length).fill(-1), wetQueue: number[] = []
  for (let i = 0; i < kind.length; i++) if (!kind[i]) { wetDistance[i] = 0; wetQueue.push(i) }
  for (let q = 0; q < wetQueue.length; q++) {
    const i = wetQueue[q], x = i % width, z = Math.floor(i / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || wetDistance[n] !== -1) continue
      wetDistance[n] = wetDistance[i] + 1; wetQueue.push(n)
    }
    if (kind[i] !== 2) continue
    water.depth[i] = Math.min(water.depth[i], Math.max(1, Math.ceil(wetDistance[i] / settings.lakeShelf)))
    height[i] = water.surface[i] - water.depth[i] * settings.waterDepth
  }
}

/** Grade bridge footings to the deck's base, feathering cuts and fill into the valley. */
export function gradeBridgeApproaches(e: ElevationInfo, width: number, depth: number, kind: Uint8Array, footings: number[]): void {
  const grade = Math.min(0.18, e.settings.cliffThreshold * 0.6)
  const distance = new Int32Array(kind.length).fill(-1), queue: number[] = []
  for (const i of footings) {
    if (kind[i] || distance[i] !== -1) continue
    distance[i] = 0; queue.push(i)
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % width, z = Math.floor(i / width)
    e.height[i] = Math.max(-distance[i] * grade, Math.min(distance[i] * grade, e.height[i])) || 0
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || kind[n] || distance[n] !== -1) continue
      distance[n] = distance[i] + 1; queue.push(n)
    }
  }
}
