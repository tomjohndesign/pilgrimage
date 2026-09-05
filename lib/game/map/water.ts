import { routeBlind } from "./route"

/**
 * Seeded water: lakes, ponds, and rivers, generated before everything else so
 * forests and the road can react to them.
 *
 * The rules, in short:
 *  - Not every map has water. The layout (0–2 rivers, 0–1 lakes, 0–2 ponds) is
 *    rolled from the water RNG stream, and a coverage budget keeps water from
 *    dominating the map.
 *  - Rivers are 2–8 tiles wide, never dead-end inland — every end is a map
 *    edge or a lake — may branch, and carry a flow direction (into or out of
 *    their lake; edge-to-edge rivers just flow one way).
 *  - Every river is pinched to a narrow width at regular intervals so the road
 *    can always find a short bridge crossing.
 *  - Wide stretches (≥ ISLAND_MIN_WIDTH) may hold small islands; narrow ones
 *    never do.
 *  - Any water body that ends up smaller than MIN_WATER_BODY tiles is removed.
 *  - Depth is distance from the nearest shore, capped at MAX depth 3.
 */

/** `kind` values. 0 is land. */
export const WATER_KIND_RIVER = 1
export const WATER_KIND_LAKE = 2

export const MIN_WATER_BODY = 10
export const MIN_RIVER_WIDTH = 2
export const MAX_RIVER_WIDTH = 8

/** Rivers this wide (or wider) may carry small islands. */
export const ISLAND_MIN_WIDTH = 6

/**
 * Every river gets pinched to at most NARROW_WIDTH tiles at least once every
 * NARROW_INTERVAL centerline steps, so a legal bridge crossing always exists
 * within a short deflection of wherever the road wants to cross.
 */
const NARROW_WIDTH = 3
const NARROW_INTERVAL = 16

/** Per-tile random surcharge on river routing, same spirit as the road's. */
const RIVER_WANDER = 2.5

export interface WaterField {
  /** Row-major: 0 land, WATER_KIND_RIVER, or WATER_KIND_LAKE. */
  kind: Uint8Array
  /** Row-major: 0 on land, 1–3 on water (distance from shore, capped). */
  depth: Uint8Array
  /** Flow direction per river-water tile index. Lake tiles never flow. */
  flow: Map<number, readonly [number, number]>
  /**
   * Land tiles on the inside bank of river bends — point bars, where a real
   * river drops its sediment. The map generator turns these into sand.
   */
  bars: Set<number>
}

export interface GenerateWaterOptions {
  rng: () => number
  width: number
  depth: number
  /** Max fraction of the map under water. */
  coverage: number
  /** Overrides for the seeded layout roll (tests and tuning). */
  riverCount?: number
  lakeCount?: number
  pondCount?: number
}

const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

export function generateWater(options: GenerateWaterOptions): WaterField {
  const { rng, width, depth: mapDepth } = options
  const area = width * mapDepth
  const budget = Math.floor(options.coverage * area)

  const kind = new Uint8Array(area)
  const flow = new Map<number, readonly [number, number]>()
  const bars = new Set<number>()

  // Roll the layout up front (even when overridden, so overrides never shift
  // the rest of the stream): most maps get a river, many a lake, some neither.
  const riverRoll = rng()
  const rolledRivers = riverRoll < 0.25 ? 0 : riverRoll < 0.75 ? 1 : 2
  const rolledLakes = rng() < 0.6 ? 1 : 0
  const rolledPonds = Math.floor(rng() * 3)

  let rivers = options.riverCount ?? rolledRivers
  let lakes = options.lakeCount ?? rolledLakes
  let ponds = options.pondCount ?? rolledPonds
  if (budget < MIN_WATER_BODY) {
    rivers = 0
    lakes = 0
    ponds = 0
  }

  let waterCount = 0
  const lakeCenters: Array<{ x: number; z: number }> = []

  // --- Lakes and ponds -------------------------------------------------------
  // Lakes are meant to be landmarks: 2.5–4.5% of the map each, capped at a
  // share of the budget so rivers still get theirs. Ponds are just small
  // lakes. Both may sit anywhere, edges included.
  for (let l = 0; l < lakes; l++) {
    const target = Math.max(
      30,
      Math.min(Math.round(area * (0.025 + rng() * 0.02)), Math.floor(budget * 0.6)),
    )
    if (waterCount + target > budget * 1.1) break
    const blob = growWaterBlob(kind, width, mapDepth, target, rng)
    if (blob) {
      lakeCenters.push(blob.center)
      waterCount += blob.added
    }
  }
  for (let p = 0; p < ponds; p++) {
    const target = MIN_WATER_BODY + Math.floor(rng() * 8)
    if (waterCount + target > budget * 1.1) break
    const blob = growWaterBlob(kind, width, mapDepth, target, rng)
    if (blob) waterCount += blob.added
  }

  // --- Rivers ----------------------------------------------------------------
  const wander = new Float64Array(area)
  for (let i = 0; i < wander.length; i++) wander[i] = rng() * RIVER_WANDER

  for (let r = 0; r < rivers; r++) {
    // Split the remaining budget across the remaining rivers; when it can't
    // sustain even a minimum-width river, stop making them.
    const estLength = Math.max(width, mapDepth) * 1.2
    const avgWidth = (budget - waterCount) / ((rivers - r) * estLength)
    if (avgWidth < MIN_RIVER_WIDTH) break
    const maxWidth = Math.min(
      MAX_RIVER_WIDTH,
      Math.max(NARROW_WIDTH, Math.round(avgWidth + 1 + rng() * 2)),
    )

    waterCount += carveRiver({
      kind,
      flow,
      bars,
      width,
      mapDepth,
      wander,
      rng,
      maxWidth,
      lakeCenters,
      allowBranch: true,
    })
  }

  removeSmallBodies(kind, flow, width, mapDepth)

  return { kind, depth: computeDepth(kind, width, mapDepth), flow, bars }
}

/**
 * Grow one organic lake blob from a random centre, like forest blobs but on
 * the water mask and biased toward compact growth: expansion into a tile with
 * few water neighbours (a thin finger) is usually rejected, so the same tile
 * count fills out into a round lake instead of a sprawl. No edge margin —
 * lakes may touch the map border.
 */
function growWaterBlob(
  kind: Uint8Array,
  width: number,
  depth: number,
  target: number,
  rng: () => number,
): { center: { x: number; z: number }; added: number } | null {
  if (target <= 0) return null
  const cx = Math.floor(rng() * width)
  const cz = Math.floor(rng() * depth)

  const blob = [cz * width + cx]
  const inBlob = new Set(blob)
  let added = 0
  if (kind[blob[0]] === 0) {
    kind[blob[0]] = WATER_KIND_LAKE
    added++
  }

  // The roundness rejection eats attempts, so the cap is generous.
  let attempts = target * 60
  while (added < target && attempts-- > 0) {
    const from = blob[Math.floor(rng() * blob.length)]
    const [dx, dz] = DIRS[Math.floor(rng() * 4)]
    const nx = (from % width) + dx
    const nz = Math.floor(from / width) + dz
    if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
    const n = nz * width + nx
    if (inBlob.has(n)) continue
    let wetNeighbours = 0
    for (const [ax, az] of DIRS) {
      const wx = nx + ax
      const wz = nz + az
      if (wx < 0 || wz < 0 || wx >= width || wz >= depth) continue
      if (kind[wz * width + wx] !== 0) wetNeighbours++
    }
    if (wetNeighbours < 2 && rng() < 0.6) continue
    inBlob.add(n)
    blob.push(n)
    if (kind[n] === 0) {
      kind[n] = WATER_KIND_LAKE
      added++
    }
  }
  return { center: { x: cx, z: cz }, added }
}

/** Direction of one step between two 4-adjacent tile indices. */
function stepDir(from: number, to: number, width: number): readonly [number, number] {
  return [(to % width) - (from % width), Math.floor(to / width) - Math.floor(from / width)]
}

/** A random point on one of the four map edges, clear of the corners. */
function edgePoint(
  side: number,
  width: number,
  depth: number,
  rng: () => number,
): { x: number; z: number } {
  const m = 2
  switch (side & 3) {
    case 0:
      return { x: 0, z: m + Math.floor(rng() * (depth - m * 2)) }
    case 1:
      return { x: width - 1, z: m + Math.floor(rng() * (depth - m * 2)) }
    case 2:
      return { x: m + Math.floor(rng() * (width - m * 2)), z: 0 }
    default:
      return { x: m + Math.floor(rng() * (width - m * 2)), z: depth - 1 }
  }
}

/**
 * Route and carve one river (and possibly one branch). Returns how many tiles
 * were newly converted to water.
 */
function carveRiver(args: {
  kind: Uint8Array
  flow: Map<number, readonly [number, number]>
  bars: Set<number>
  width: number
  mapDepth: number
  wander: Float64Array
  rng: () => number
  maxWidth: number
  lakeCenters: Array<{ x: number; z: number }>
  allowBranch: boolean
  /** When set, the river starts here (branches) instead of at a map edge. */
  from?: { x: number; z: number }
  /** When set, flow directions are flipped (inherited by branches). */
  reversedFlow?: boolean
  startWidth?: number
}): number {
  const { kind, flow, bars, width, mapDepth, wander, rng, maxWidth, lakeCenters } = args

  // Endpoints: from a map edge (or the branch point) to a lake or another edge.
  const toLake = lakeCenters.length > 0 && rng() < 0.6
  const startSide = Math.floor(rng() * 4)
  const start = args.from ?? edgePoint(startSide, width, mapDepth, rng)
  const goal = toLake
    ? lakeCenters[Math.floor(rng() * lakeCenters.length)]
    : edgePoint(startSide + 1 + Math.floor(rng() * 3), width, mapDepth, rng)

  let line = routeBlind(start, goal, width, mapDepth, wander)
  // A river ending in a lake stops at the first lake tile it meets — the strip
  // carved around the previous step already touches the lake water.
  if (toLake) {
    const enter = line.findIndex((i) => kind[i] === WATER_KIND_LAKE)
    if (enter >= 0) line = line.slice(0, enter + 1)
  }
  if (line.length < 2) return 0

  // Rivers into a lake flow downstream as routed; rivers out of it (and half of
  // the edge-to-edge ones, since routing direction is an artifact) run reversed.
  const reversed = args.reversedFlow ?? (toLake ? rng() < 0.5 : rng() < 0.5)

  const widths = widthProfile(line.length, maxWidth, args.startWidth, rng)
  let added = 0

  for (let i = 0; i < line.length; i++) {
    const cur = line[i]
    const nxt = line[Math.min(i + 1, line.length - 1)]
    const ref = i + 1 < line.length ? nxt : line[i - 1]
    let dx = (nxt % width) - (cur % width)
    let dz = Math.floor(nxt / width) - Math.floor(cur / width)
    if (i + 1 >= line.length) {
      dx = (cur % width) - (ref % width)
      dz = Math.floor(cur / width) - Math.floor(ref / width)
    }
    if (dx === 0 && dz === 0) continue
    // Perpendicular strip of `widths[i]` tiles centred on the centerline.
    const px = -dz
    const pz = dx
    const w = widths[i]
    const lo = -Math.floor((w - 1) / 2)
    const hi = Math.ceil((w - 1) / 2)
    for (let o = lo; o <= hi; o++) {
      const x = (cur % width) + px * o
      const z = Math.floor(cur / width) + pz * o
      if (x < 0 || z < 0 || x >= width || z >= mapDepth) continue
      const t = z * width + x
      if (kind[t] === 0) {
        kind[t] = WATER_KIND_RIVER
        added++
      }
      if (kind[t] === WATER_KIND_RIVER) {
        flow.set(t, reversed ? [-dx, -dz] : [dx, dz])
      }
    }
  }

  // Islands: only where the river is wide. Reverting the centerline tile (and
  // sometimes its successor) leaves at least two water tiles on each side.
  let sinceIsland = 0
  for (let i = 5; i < line.length - 5; i++) {
    sinceIsland++
    if (widths[i] < ISLAND_MIN_WIDTH || sinceIsland < 8 || rng() >= 0.15) continue
    sinceIsland = 0
    const tiles = [line[i]]
    if (widths[i + 1] >= ISLAND_MIN_WIDTH && rng() < 0.6) tiles.push(line[i + 1])
    for (const t of tiles) {
      if (kind[t] === WATER_KIND_RIVER) {
        kind[t] = 0
        flow.delete(t)
        added--
      }
    }
  }

  // Point bars: a river drops sediment on the inside of its bends, so mark
  // the first land tile inward of every clean corner. "Clean" means the
  // direction holds for two steps on both sides — the wander's per-step
  // zigzag would otherwise sand the entire bank.
  for (let i = 2; i < line.length - 2; i++) {
    const into = stepDir(line[i - 1], line[i], width)
    const out = stepDir(line[i], line[i + 1], width)
    if (into[0] === out[0] && into[1] === out[1]) continue
    const before = stepDir(line[i - 2], line[i - 1], width)
    const after = stepDir(line[i + 1], line[i + 2], width)
    if (before[0] !== into[0] || before[1] !== into[1]) continue
    if (after[0] !== out[0] || after[1] !== out[1]) continue
    // The two step directions sum to a diagonal pointing into the bend.
    const ix = into[0] + out[0]
    const iz = into[1] + out[1]
    let x = line[i] % width
    let z = Math.floor(line[i] / width)
    for (let step = 0; step <= MAX_RIVER_WIDTH; step++) {
      x += ix
      z += iz
      if (x < 0 || z < 0 || x >= width || z >= mapDepth) break
      const t = z * width + x
      if (kind[t] === WATER_KIND_LAKE) break
      if (kind[t] === 0) {
        bars.add(t)
        break
      }
    }
  }

  // One optional branch, splitting off mid-river toward a lake or an edge, so
  // branches obey the same "end at an edge or a lake" rule as their parent.
  if (args.allowBranch && line.length >= 30 && rng() < 0.45) {
    const j = Math.floor(line.length * (0.3 + rng() * 0.4))
    const at = { x: line[j] % width, z: Math.floor(line[j] / width) }
    added += carveRiver({
      ...args,
      allowBranch: false,
      from: at,
      reversedFlow: reversed,
      maxWidth: Math.max(MIN_RIVER_WIDTH, Math.min(maxWidth, widths[j])),
      startWidth: Math.max(MIN_RIVER_WIDTH, Math.min(widths[j], 4)),
    })
  }

  return added
}

/**
 * Width along the centerline: a slow random walk in [MIN_RIVER_WIDTH, maxWidth],
 * then pinched so every NARROW_INTERVAL-step window has a stretch of at most
 * NARROW_WIDTH — the guarantee that a short bridge crossing always exists.
 */
function widthProfile(
  length: number,
  maxWidth: number,
  startWidth: number | undefined,
  rng: () => number,
): number[] {
  const widths = new Array<number>(length)
  let cur = startWidth ?? MIN_RIVER_WIDTH + rng() * (maxWidth - MIN_RIVER_WIDTH)
  for (let i = 0; i < length; i++) {
    cur = Math.min(maxWidth, Math.max(MIN_RIVER_WIDTH, cur + (rng() - 0.5) * 0.9))
    widths[i] = Math.round(cur)
  }
  for (let s = 0; s < length; s += NARROW_INTERVAL) {
    const e = Math.min(length, s + NARROW_INTERVAL)
    let pinch = s
    for (let i = s; i < e; i++) if (widths[i] < widths[pinch]) pinch = i
    if (widths[pinch] <= NARROW_WIDTH) continue
    // Ramp down to the pinch at one tile per step so the banks stay smooth.
    for (let i = 0; i < length; i++) {
      widths[i] = Math.min(widths[i], NARROW_WIDTH + Math.abs(i - pinch))
    }
  }
  return widths
}

/** Delete any 4-connected water body smaller than MIN_WATER_BODY tiles. */
function removeSmallBodies(
  kind: Uint8Array,
  flow: Map<number, readonly [number, number]>,
  width: number,
  depth: number,
): void {
  const seen = new Uint8Array(kind.length)
  for (let i = 0; i < kind.length; i++) {
    if (kind[i] === 0 || seen[i]) continue
    const body = [i]
    seen[i] = 1
    for (let q = 0; q < body.length; q++) {
      const x = body[q] % width
      const z = Math.floor(body[q] / width)
      for (const [dx, dz] of DIRS) {
        const nx = x + dx
        const nz = z + dz
        if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
        const n = nz * width + nx
        if (kind[n] !== 0 && !seen[n]) {
          seen[n] = 1
          body.push(n)
        }
      }
    }
    if (body.length < MIN_WATER_BODY) {
      for (const t of body) {
        kind[t] = 0
        flow.delete(t)
      }
    }
  }
}

/** Depth = BFS distance from the nearest land tile, capped at 3. */
function computeDepth(kind: Uint8Array, width: number, depth: number): Uint8Array {
  const out = new Uint8Array(kind.length)
  const queue: number[] = []
  for (let i = 0; i < kind.length; i++) {
    if (kind[i] === 0) continue
    const x = i % width
    const z = Math.floor(i / width)
    for (const [dx, dz] of DIRS) {
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
    for (const [dx, dz] of DIRS) {
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
  // Water with no reachable shore (a fully flooded map) is just deep.
  for (let i = 0; i < kind.length; i++) if (kind[i] !== 0 && out[i] === 0) out[i] = 3
  return out
}
