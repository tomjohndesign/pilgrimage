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
 *  - Centerlines meander along an imaginary topography: a smooth noise field
 *    rolled once per map, which every river (and branch) leans along, so the
 *    bends are long and rivers near each other curve the same way.
 *  - Rivers never cross. One that meets water already on the map ends there:
 *    at a lake it simply stops; at another river it bends downstream into it
 *    as a tributary, and the receiving river runs wider from the junction on.
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
 * Every river gets pinched at least once every NARROW_INTERVAL centerline
 * steps, so a legal bridge crossing always exists within a short deflection
 * of wherever the road wants to cross. Bridges are axis-aligned, so the pinch
 * goes where the river runs closest to an axis in its window, and its width
 * depends on how diagonal the river still is there: NARROW_WIDTH when the
 * heading is within PINCH_AXIS_SLOPE of an axis, else NARROW_WIDTH_DIAGONAL
 * (a 3-wide band crossed at 45° is already five or six tiles on the grid).
 * The pinch holds for PINCH_PLATEAU steps before the banks ramp back out at
 * one tile per step; without the plateau the ramp alone would spill four or
 * five tiles of water onto a bridge line across a diagonal reach.
 */
const NARROW_WIDTH = 3
const NARROW_WIDTH_DIAGONAL = 2
const NARROW_INTERVAL = 16
const PINCH_PLATEAU = 5
const PINCH_AXIS_SLOPE = 0.3

/** Half-window of centerline steps averaged into a tile's river heading. */
const HEADING_SMOOTHING = 4

/**
 * Point bars go on the inside of any bend whose heading turns by more than
 * BAR_TURN (the sine of the angle: 0.45 ≈ 27°) over ±BAR_REACH steps, one
 * every BAR_SPACING steps along the bend.
 */
const BAR_REACH = 8
const BAR_TURN = 0.45
const BAR_SPACING = 2

/**
 * Edge-to-edge rivers (and branches) re-roll their far end until the chord's
 * midpoint sits at least this fraction of the map in from every border, so a
 * river doesn't run the length of an edge.
 */
const CHORD_INSET = 0.2
const CHORD_ATTEMPTS = 6

/**
 * The imaginary topography is a swell of TERRAIN_WAVES plane waves whose
 * wavelengths run from the base cell to twice it. The cell is a fifth of the
 * map's longer side, clamped so bends stay river-sized on the biggest worlds.
 */
const TERRAIN_CELL_MIN = 24
const TERRAIN_CELL_MAX = 64
const TERRAIN_WAVES = 8
/** Standard deviation the field is scaled to before clamping to [-1, 1]. */
const TERRAIN_SPREAD = 0.5

/**
 * A river steers by the relief: its heading sits off its chord (the straight
 * line from start to goal) by MEANDER_MAX_DEVIATION times the field's value
 * under it, so as the field rises and falls along the way the heading swings
 * left and right — a sine-generated meander in spirit, without the
 * regularity, since the field is a random swell. A homing term adds a share
 * of the turn toward the goal proper (MEANDER_HOMING_MIN of it far out,
 * rising to all of it inside MEANDER_HOMING_CELLS base cells of the goal),
 * so the drift the swell leaves behind is corrected and the line lands. The
 * total is held within MEANDER_MAX_OFF_CHORD of the chord, so every step
 * gains along it and a river can never turn back across its own course. It
 * turns no faster than MEANDER_TURN_RATE radians per tile, which keeps every
 * bend a smooth loop. Near an exact end the swing fades out over
 * MEANDER_TAPER_CELLS of the base cell so the line lands where it should.
 */
const MEANDER_MAX_DEVIATION = (75 * Math.PI) / 180
const MEANDER_MAX_OFF_CHORD = (85 * Math.PI) / 180
const MEANDER_HOMING_MIN = 0.3
const MEANDER_HOMING_CELLS = 1.5
const MEANDER_TURN_RATE = 0.14
const MEANDER_TAPER_CELLS = 0.5
/** Integration step along the curve, in tiles. */
const MEANDER_SAMPLE_STEP = 0.5

/**
 * How many grid steps a meandering centerline takes per tile of the map's
 * longer side — the bends plus the staircase — used to split the water
 * budget into a sustainable width per river.
 */
const MEANDER_SINUOSITY = 1.4

/**
 * A tributary meets its river with a bend: its last JOIN_BEND centerline
 * tiles are replaced by a curve that turns downstream and lands on the
 * receiving river's centerline JOIN_RUN_PER_WIDTH of that river's widths (plus
 * JOIN_RUN_BASE steps) below the point of contact.
 */
const JOIN_BEND = 12
const JOIN_RUN_BASE = 6
const JOIN_RUN_PER_WIDTH = 2

/** Smooth field over the map in [-1, 1] — the lie of the land rivers follow. */
export type Terrain = (x: number, z: number) => number

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
  const cell = Math.max(TERRAIN_CELL_MIN, Math.min(TERRAIN_CELL_MAX, Math.max(width, mapDepth) / 5))
  const world: RiverWorld = {
    kind,
    flow,
    bars,
    owner: new Int16Array(area).fill(-1),
    records: [],
    width,
    mapDepth,
    rng,
    terrain: makeTerrain(rng, width, mapDepth, cell),
    taper: MEANDER_TAPER_CELLS * cell,
    lakeCenters,
  }

  for (let r = 0; r < rivers; r++) {
    // Split the remaining budget across the remaining rivers; when it can't
    // sustain even a minimum-width river, stop making them.
    const estLength = Math.max(width, mapDepth) * MEANDER_SINUOSITY
    const avgWidth = (budget - waterCount) / ((rivers - r) * estLength)
    if (avgWidth < MIN_RIVER_WIDTH) break
    const maxWidth = Math.min(
      MAX_RIVER_WIDTH,
      Math.max(NARROW_WIDTH, Math.round(avgWidth + 1 + rng() * 2)),
    )

    waterCount += carveRiver({ world, maxWidth, allowBranch: true })
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

/**
 * The relief is a sum of TERRAIN_WAVES plane waves with random directions,
 * phases, and wavelengths between `cell` and twice `cell` — smooth
 * everywhere, with no lattice to leave flat spots, and along any one path it
 * reads as an irregular swell rather than a single sine. Scaled so its
 * standard deviation over the map is TERRAIN_SPREAD, then clamped to [-1, 1].
 */
export function makeTerrain(rng: () => number, width: number, depth: number, cell: number): Terrain {
  const waves: Array<{ kx: number; kz: number; phase: number }> = []
  for (let i = 0; i < TERRAIN_WAVES; i++) {
    const wavelength = cell * (1 + rng())
    const angle = rng() * Math.PI * 2
    const k = (Math.PI * 2) / wavelength
    waves.push({ kx: Math.cos(angle) * k, kz: Math.sin(angle) * k, phase: rng() * Math.PI * 2 })
  }
  const raw = (x: number, z: number) => {
    let value = 0
    for (const wave of waves) value += Math.sin(wave.kx * x + wave.kz * z + wave.phase)
    return value
  }
  // Sampled on a coarse grid so the spread is the map's own, not the sum's.
  let sum = 0
  let sumSq = 0
  let count = 0
  for (let z = 0; z < depth; z += 4) {
    for (let x = 0; x < width; x += 4) {
      const v = raw(x, z)
      sum += v
      sumSq += v * v
      count++
    }
  }
  const mean = sum / count
  const std = Math.sqrt(Math.max(1e-9, sumSq / count - mean * mean))
  const scale = TERRAIN_SPREAD / std
  return (x, z) => Math.min(1, Math.max(-1, (raw(x, z) - mean) * scale))
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
 * A far end for an edge-to-edge river: a point on one of the three other
 * sides, re-rolled (up to CHORD_ATTEMPTS times) until the chord's midpoint
 * sits CHORD_INSET of the map in from every border. The last roll stands if
 * none qualifies.
 */
function insetEdgeGoal(
  start: { x: number; z: number },
  startSide: number,
  width: number,
  depth: number,
  rng: () => number,
): { x: number; z: number } {
  let goal = start
  for (let attempt = 0; attempt < CHORD_ATTEMPTS; attempt++) {
    goal = edgePoint(startSide + 1 + Math.floor(rng() * 3), width, depth, rng)
    const midX = (start.x + goal.x) / 2
    const midZ = (start.z + goal.z) / 2
    if (
      midX >= width * CHORD_INSET &&
      midX <= width * (1 - CHORD_INSET) &&
      midZ >= depth * CHORD_INSET &&
      midZ <= depth * (1 - CHORD_INSET)
    ) {
      break
    }
  }
  return goal
}

/**
 * A meandering 4-connected centerline from `start` toward `goal`. Exported
 * for its tests; the map only ever sees the carved result.
 *
 * The river is steered, not plotted: it sets out along its chord, the relief
 * under it swings its heading left or right of that line, a homing term
 * bends it back toward the goal as it nears, and it turns toward the result
 * no faster than MEANDER_TURN_RATE allows. The river doubles back as far as
 * the relief says — but never across its own course, since the heading is
 * held within a right angle of the chord and so every step gains along it.
 * An *exact*
 * end (a branch's fork, a lake) has the swing faded out so the line lands on
 * the point itself; the map edge is a soft end: a river that wanders off the
 * map simply leaves there. Starts always fade in, so a river sets off into
 * the map rather than straight back over its edge.
 */
export function meanderLine(
  start: { x: number; z: number },
  goal: { x: number; z: number },
  width: number,
  mapDepth: number,
  terrain: Terrain,
  taper: number,
  rng: () => number,
  ends: { exactStart: boolean; exactEnd: boolean },
): number[] {
  const walker = makeWalker(width, rng)
  const { line } = walker
  walker.push(start.x, start.z)
  if (start.x === goal.x && start.z === goal.z) return line

  const smooth = (t: number) => (t >= 1 ? 1 : t * t * (3 - 2 * t))
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
  const ds = MEANDER_SAMPLE_STEP
  const maxTurn = MEANDER_TURN_RATE * ds
  const fade = Math.max(1, taper)

  let x = start.x
  let z = start.z
  const chord = Math.atan2(goal.z - z, goal.x - x)
  const homing = (MEANDER_HOMING_CELLS / MEANDER_TAPER_CELLS) * fade
  let heading = chord
  let left = false
  const maxSteps = Math.ceil((8 * (width + mapDepth)) / MEANDER_SAMPLE_STEP)
  for (let step = 0; step < maxSteps; step++) {
    const toGoal = Math.hypot(goal.x - x, goal.z - z)
    if (toGoal < MEANDER_SAMPLE_STEP) break
    const fromStart = Math.hypot(x - start.x, z - start.z)
    let envelope = smooth(fromStart / fade)
    if (ends.exactEnd) envelope *= smooth(toGoal / fade)
    const direct = Math.atan2(goal.z - z, goal.x - x)
    const home = MEANDER_HOMING_MIN + (1 - MEANDER_HOMING_MIN) * (1 - smooth(toGoal / homing))
    const swing = envelope * MEANDER_MAX_DEVIATION * terrain(x, z) + home * wrap(direct - chord)
    const want = chord + Math.min(MEANDER_MAX_OFF_CHORD, Math.max(-MEANDER_MAX_OFF_CHORD, swing))
    heading += Math.min(maxTurn, Math.max(-maxTurn, wrap(want - heading)))
    x += Math.cos(heading) * ds
    z += Math.sin(heading) * ds
    const fx = Math.round(x)
    const fz = Math.round(z)
    const tx = Math.min(width - 1, Math.max(0, fx))
    const tz = Math.min(mapDepth - 1, Math.max(0, fz))
    if (fx !== tx || fz !== tz) {
      walker.walkTo(tx, tz, true)
      left = true
      break
    }
    if (!walker.has(tz * width + tx)) walker.walkTo(tx, tz, false)
  }
  if (!left) walker.walkTo(goal.x, goal.z, true)
  return line
}

/**
 * Tile-by-tile rasteriser for a curve: `walkTo` steps 4-connected toward a
 * target, picking the axis at random in proportion to the remaining offset
 * so diagonals come out as a ragged staircase, and never re-treads a tile of
 * the line unless forced. Starts from the end of `line` when one is given.
 */
function makeWalker(width: number, rng: () => number, line: number[] = []) {
  const visited = new Set(line)
  const last = line.length > 0 ? line[line.length - 1] : 0
  let cx = last % width
  let cz = Math.floor(last / width)
  const push = (x: number, z: number) => {
    cx = x
    cz = z
    const t = z * width + x
    visited.add(t)
    line.push(t)
  }
  const walkTo = (tx: number, tz: number, force: boolean) => {
    while (cx !== tx || cz !== tz) {
      const dx = Math.sign(tx - cx)
      const dz = Math.sign(tz - cz)
      const xStep = dx !== 0 ? cz * width + cx + dx : -1
      const zStep = dz !== 0 ? (cz + dz) * width + cx : -1
      const xOpen = xStep >= 0 && (force || !visited.has(xStep))
      const zOpen = zStep >= 0 && (force || !visited.has(zStep))
      let stepX: boolean
      if (xOpen && zOpen) {
        stepX = rng() * (Math.abs(tx - cx) + Math.abs(tz - cz)) < Math.abs(tx - cx)
      } else if (xOpen || zOpen) {
        stepX = xOpen
      } else {
        // Both ways lead back over the line: leave this sample for the next.
        return
      }
      if (stepX) push(cx + dx, cz)
      else push(cx, cz + dz)
    }
  }
  return { line, push, walkTo, has: (t: number) => visited.has(t) }
}

/** State shared by every river on one map. */
interface RiverWorld {
  kind: Uint8Array
  flow: Map<number, readonly [number, number]>
  bars: Set<number>
  /** Per tile, the index in `records` of the river that first carved it. */
  owner: Int16Array
  records: RiverRecord[]
  width: number
  mapDepth: number
  rng: () => number
  terrain: Terrain
  /** Tiles over which the meander fades out at an exact end. */
  taper: number
  lakeCenters: Array<{ x: number; z: number }>
}

/** What a carved river remembers, so a tributary can widen it later. */
interface RiverRecord {
  line: number[]
  headings: Array<readonly [number, number]>
  widths: number[]
  /** Per-index ceiling from the pinches; widening never lifts above it. */
  cap: number[]
  /** Flow runs against the line's direction. */
  reversed: boolean
  /** Centerline tiles reverted to land; re-carving leaves them alone. */
  islands: Set<number>
  /** The river this one empties into, and the index on it where it joins. */
  joined?: { river: number; at: number }
}

/**
 * Route and carve one river (and possibly one branch). Returns how many tiles
 * were newly converted to water.
 */
function carveRiver(args: {
  world: RiverWorld
  maxWidth: number
  allowBranch: boolean
  /** When set, the river starts here (branches) instead of at a map edge. */
  from?: { x: number; z: number }
  /** When set, flow directions are flipped (inherited by branches). */
  reversedFlow?: boolean
  startWidth?: number
}): number {
  const { world, maxWidth } = args
  const { kind, width, mapDepth, rng, terrain, taper, lakeCenters } = world

  // Endpoints: from a map edge (or the branch point) to a lake or another edge.
  const toLake = lakeCenters.length > 0 && rng() < 0.6
  const startSide = Math.floor(rng() * 4)
  const start = args.from ?? edgePoint(startSide, width, mapDepth, rng)
  const goal = toLake
    ? lakeCenters[Math.floor(rng() * lakeCenters.length)]
    : insetEdgeGoal(start, startSide, width, mapDepth, rng)

  let line = meanderLine(start, goal, width, mapDepth, terrain, taper, rng, {
    exactStart: args.from !== undefined,
    exactEnd: toLake,
  })

  // The river ends where it first meets water already on the map — past any
  // it sets out from (a branch forks inside its parent). A lake just stops
  // it; another river takes it in with a bend.
  let joined: RiverRecord["joined"]
  let first = 0
  while (first < line.length && kind[line[first]] !== 0) first++
  let contact = -1
  for (let i = first; i < line.length; i++) {
    if (kind[line[i]] !== 0) {
      contact = i
      break
    }
  }
  if (contact >= 0) {
    const parentIndex = kind[line[contact]] === WATER_KIND_RIVER ? world.owner[line[contact]] : -1
    if (parentIndex >= 0) {
      const parent = world.records[parentIndex]
      const at = nearestIndex(parent.line, line[contact], width)
      line = joinCurve(world, line, contact, parent, at)
      joined = { river: parentIndex, at }
    } else {
      line = line.slice(0, contact + 1)
    }
  }
  if (line.length < 2) return 0

  // Rivers into a lake or another river flow downstream as routed; rivers out
  // of a lake (and half of the edge-to-edge ones, since routing direction is
  // an artifact) run reversed. Branches inherit their parent's sense.
  const reversed = args.reversedFlow ?? (joined ? false : rng() < 0.5)

  const headings = smoothedHeadings(line, width)
  const { widths, cap } = widthProfile(line.length, maxWidth, args.startWidth, rng, headings)
  const record: RiverRecord = { line, headings, widths, cap, reversed, islands: new Set(), joined }
  const riverIndex = world.records.length
  world.records.push(record)
  let added = carveBand(world, record, riverIndex, 0, line.length - 1)

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
      if (kind[t] === WATER_KIND_RIVER && world.owner[t] === riverIndex) {
        kind[t] = 0
        world.flow.delete(t)
        record.islands.add(t)
        added--
      }
    }
  }

  // Point bars: a river drops sediment on the inside of its bends. Where the
  // smoothed heading turns through more than BAR_TURN across ±BAR_REACH
  // steps, the first land tile inward of the bend gets sand — every
  // BAR_SPACING steps for as long as the bend lasts, so a long bend grows a
  // strip along its inner bank.
  let sinceBar = BAR_SPACING
  for (let i = BAR_REACH; i < line.length - BAR_REACH; i++) {
    sinceBar++
    const [ax, az] = headings[i - BAR_REACH]
    const [bx, bz] = headings[i + BAR_REACH]
    // Sine of the turn; positive when the heading swings toward its left.
    const turn = ax * bz - az * bx
    if (Math.abs(turn) < BAR_TURN || sinceBar < BAR_SPACING) continue
    sinceBar = 0
    const [hx, hz] = headings[i]
    const side = turn > 0 ? 1 : -1
    const ix = -hz * side
    const iz = hx * side
    let x = line[i] % width
    let z = Math.floor(line[i] / width)
    for (let step = 1; step <= MAX_RIVER_WIDTH + 2; step++) {
      x += ix
      z += iz
      const tx = Math.round(x)
      const tz = Math.round(z)
      if (tx < 0 || tz < 0 || tx >= width || tz >= mapDepth) break
      const t = tz * width + tx
      if (kind[t] === WATER_KIND_LAKE) break
      if (kind[t] === 0) {
        world.bars.add(t)
        break
      }
    }
  }

  // A tributary's water has to go somewhere: the river it joins runs wider
  // from the junction down.
  if (joined && !reversed) {
    const mouth = Math.max(...widths.slice(Math.max(0, line.length - JOIN_BEND)))
    added += widenDownstream(world, joined.river, joined.at, mouth, 0)
  }

  // One optional branch, splitting off mid-river toward a lake or an edge, so
  // branches obey the same "end at an edge or a lake" rule as their parent.
  // A branch that flows back into this river (the reversed case) is a
  // tributary, and this river widens below the fork to carry it.
  if (args.allowBranch && line.length >= 30 && rng() < 0.45) {
    const j = Math.floor(line.length * (0.3 + rng() * 0.4))
    const at = { x: line[j] % width, z: Math.floor(line[j] / width) }
    const startWidth = Math.max(MIN_RIVER_WIDTH, Math.min(widths[j], 4))
    const before = world.records.length
    added += carveRiver({
      world,
      allowBranch: false,
      from: at,
      reversedFlow: reversed,
      maxWidth: Math.max(MIN_RIVER_WIDTH, Math.min(maxWidth, widths[j])),
      startWidth,
    })
    if (reversed && world.records.length > before) {
      added += widenDownstream(world, riverIndex, j, startWidth, 0)
    }
  }

  return added
}

/**
 * Carve the band for centerline indices `from`..`to` of one river: each
 * index paints a segment `widths[i]` tiles wide, perpendicular to the
 * smoothed heading rather than to this one grid step, so the channel keeps
 * its width through a diagonal reach instead of thinning to a staircase.
 * Even widths sit half a tile off-centre (to the left), matching the lo/hi
 * split of an axis-aligned strip. Returns the tiles newly turned to water.
 */
function carveBand(world: RiverWorld, river: RiverRecord, riverIndex: number, from: number, to: number): number {
  const { kind, flow, owner, width, mapDepth } = world
  const { line, headings, widths, reversed, islands } = river
  let added = 0
  for (let i = from; i <= to; i++) {
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
    const [ux, uz] = headings[i]
    const nx = -uz
    const nz = ux
    const w = widths[i]
    const shift = w % 2 === 0 ? 0.5 : 0
    const cx = cur % width
    const cz = Math.floor(cur / width)
    const reach = Math.ceil(w / 2) + 1
    for (let oz = -reach; oz <= reach; oz++) {
      for (let ox = -reach; ox <= reach; ox++) {
        const along = ox * ux + oz * uz
        if (Math.abs(along) > 0.5 + 1e-9) continue
        const across = (ox - nx * shift) * nx + (oz - nz * shift) * nz
        if (Math.abs(across) > w / 2 + 1e-9) continue
        const x = cx + ox
        const z = cz + oz
        if (x < 0 || z < 0 || x >= width || z >= mapDepth) continue
        const t = z * width + x
        if (islands.has(t)) continue
        if (kind[t] === 0) {
          kind[t] = WATER_KIND_RIVER
          added++
        }
        if (kind[t] === WATER_KIND_RIVER) {
          if (owner[t] === -1) owner[t] = riverIndex
          flow.set(t, reversed ? [-dx, -dz] : [dx, dz])
        }
      }
    }
  }
  return added
}

/** Index of the centerline tile nearest to `tile`. */
function nearestIndex(line: number[], tile: number, width: number): number {
  const x = tile % width
  const z = Math.floor(tile / width)
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < line.length; i++) {
    const dx = (line[i] % width) - x
    const dz = Math.floor(line[i] / width) - z
    const d = dx * dx + dz * dz
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  return best
}

/**
 * Bend the tail of a tributary into the river it has just met. The line is
 * cut JOIN_BEND tiles short of the point of contact, and from there a cubic
 * Hermite curve — leaving along the tributary's own heading, arriving along
 * the receiving river's downstream heading — is rasterised onto the
 * receiving river's centerline a short run below the contact, so the two
 * meet at a shallow angle the way real confluences do.
 */
function joinCurve(
  world: RiverWorld,
  line: number[],
  contact: number,
  parent: RiverRecord,
  at: number,
): number[] {
  const { width, mapDepth, rng } = world
  const dir = parent.reversed ? -1 : 1
  const run = JOIN_RUN_BASE + JOIN_RUN_PER_WIDTH * parent.widths[at]
  const target = Math.min(parent.line.length - 1, Math.max(0, at + dir * run))
  const cut = Math.max(0, contact - JOIN_BEND)
  const kept = line.slice(0, cut + 1)

  const p0 = kept[kept.length - 1]
  const p2 = parent.line[target]
  const x0 = p0 % width
  const z0 = Math.floor(p0 / width)
  const x2 = p2 % width
  const z2 = Math.floor(p2 / width)
  const length = Math.hypot(x2 - x0, z2 - z0)
  if (length < 1) return kept

  // Leaving heading: the tributary's own, from a few tiles back.
  const back = kept[Math.max(0, kept.length - 1 - HEADING_SMOOTHING)]
  let hx0 = x0 - (back % width)
  let hz0 = z0 - Math.floor(back / width)
  const len0 = Math.hypot(hx0, hz0)
  if (len0 < 1e-9) {
    hx0 = (x2 - x0) / length
    hz0 = (z2 - z0) / length
  } else {
    hx0 /= len0
    hz0 /= len0
  }
  // Arriving heading: the receiving river's, downstream.
  const hx2 = parent.headings[target][0] * dir
  const hz2 = parent.headings[target][1] * dir

  const walker = makeWalker(width, rng, kept)
  const steps = Math.ceil(length / MEANDER_SAMPLE_STEP)
  for (let k = 1; k <= steps; k++) {
    const t = k / steps
    const t2 = t * t
    const t3 = t2 * t
    const a = 2 * t3 - 3 * t2 + 1
    const b = t3 - 2 * t2 + t
    const c = -2 * t3 + 3 * t2
    const d = t3 - t2
    const fx = a * x0 + b * length * hx0 + c * x2 + d * length * hx2
    const fz = a * z0 + b * length * hz0 + c * z2 + d * length * hz2
    const tx = Math.min(width - 1, Math.max(0, Math.round(fx)))
    const tz = Math.min(mapDepth - 1, Math.max(0, Math.round(fz)))
    if (!walker.has(tz * width + tx)) walker.walkTo(tx, tz, false)
  }
  walker.walkTo(x2, z2, true)
  return walker.line
}

/**
 * A river has taken on a tributary `extra` tiles wide at index `at`: widen it
 * from there downstream (as if the two discharges added), within the pinch
 * caps, and re-carve. Whatever it in turn empties into widens the same way.
 */
function widenDownstream(world: RiverWorld, riverIndex: number, at: number, extra: number, hops: number): number {
  const river = world.records[riverIndex]
  const last = river.line.length - 1
  const lo = river.reversed ? 0 : at
  const hi = river.reversed ? at : last
  let changed = false
  for (let i = lo; i <= hi; i++) {
    const wider = Math.min(river.cap[i], MAX_RIVER_WIDTH, Math.round(Math.hypot(river.widths[i], extra)))
    if (wider > river.widths[i]) {
      river.widths[i] = wider
      changed = true
    }
  }
  let added = changed ? carveBand(world, river, riverIndex, lo, hi) : 0
  if (river.joined && hops < 4) {
    added += widenDownstream(world, river.joined.river, river.joined.at, extra, hops + 1)
  }
  return added
}

/**
 * Unit heading per centerline tile, averaged over ±HEADING_SMOOTHING steps so
 * a staircase reads as the diagonal it approximates. Falls back to the single
 * grid step at the ends.
 */
function smoothedHeadings(line: number[], width: number): Array<readonly [number, number]> {
  const out = new Array<readonly [number, number]>(line.length)
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - HEADING_SMOOTHING)]
    const b = line[Math.min(line.length - 1, i + HEADING_SMOOTHING)]
    let dx = (b % width) - (a % width)
    let dz = Math.floor(b / width) - Math.floor(a / width)
    if (dx === 0 && dz === 0) {
      const c = line[Math.min(line.length - 1, i + 1)]
      const d = line[Math.max(0, i - 1)]
      dx = (c % width) - (d % width)
      dz = Math.floor(c / width) - Math.floor(d / width)
    }
    const len = Math.hypot(dx, dz) || 1
    out[i] = [dx / len, dz / len]
  }
  return out
}

/** 0 on an axis-aligned heading, 1 on a perfect diagonal. */
function diagonality(heading: readonly [number, number]): number {
  const ax = Math.abs(heading[0])
  const az = Math.abs(heading[1])
  return Math.min(ax, az) / (Math.max(ax, az) || 1)
}

/**
 * Width along the centerline: a slow random walk in [MIN_RIVER_WIDTH, maxWidth],
 * then pinched so every NARROW_INTERVAL-step window has a short plateau narrow
 * enough for a straight bridge — the guarantee that a crossing always exists.
 * Each window pinches where its heading is closest to an axis. The pinch
 * ceilings come back as `cap`, so later widening honours them too.
 */
function widthProfile(
  length: number,
  maxWidth: number,
  startWidth: number | undefined,
  rng: () => number,
  headings: Array<readonly [number, number]>,
): { widths: number[]; cap: number[] } {
  const widths = new Array<number>(length)
  const cap = new Array<number>(length).fill(MAX_RIVER_WIDTH)
  let cur = startWidth ?? MIN_RIVER_WIDTH + rng() * (maxWidth - MIN_RIVER_WIDTH)
  for (let i = 0; i < length; i++) {
    cur = Math.min(maxWidth, Math.max(MIN_RIVER_WIDTH, cur + (rng() - 0.5) * 0.9))
    widths[i] = Math.round(cur)
  }
  const half = Math.floor(PINCH_PLATEAU / 2)
  for (let s = 0; s < length; s += NARROW_INTERVAL) {
    const e = Math.min(length, s + NARROW_INTERVAL)
    let pinch = s
    let pinchDiag = diagonality(headings[s])
    for (let i = s + 1; i < e; i++) {
      const diag = diagonality(headings[i])
      if (diag < pinchDiag - 1e-9 || (Math.abs(diag - pinchDiag) <= 1e-9 && widths[i] < widths[pinch])) {
        pinch = i
        pinchDiag = diag
      }
    }
    const narrow = pinchDiag <= PINCH_AXIS_SLOPE ? NARROW_WIDTH : NARROW_WIDTH_DIAGONAL
    // Hold the pinch flat, then ramp out at one tile per step so the banks
    // stay smooth.
    for (let i = 0; i < length; i++) {
      cap[i] = Math.min(cap[i], narrow + Math.max(0, Math.abs(i - pinch) - half))
      widths[i] = Math.min(widths[i], cap[i])
    }
  }
  return { widths, cap }
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
