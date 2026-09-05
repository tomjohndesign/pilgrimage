import { isRoadTerrain } from "./road"
import { TILE_HEIGHT } from "./terrain"
import { tileAt, type GameMap, type TilePos } from "./types"

/**
 * Where the bridges are and how their approaches rise to meet them. Pure data
 * derived from the tile grid — no three.js, no React — so the renderer, the
 * traveler sim, and anything that stands a figure on a tile all agree on how
 * high the surface is.
 *
 * A bridge is a straight run of `bridge` tiles (the generator guarantees
 * straight, short spans over river water). Its deck floats BRIDGE_RISE above
 * the ground so the water shows beneath it. Ramps follow the path at each
 * end, with level landings wherever it turns before descending. Each ramp
 * climbs from ground level at its far edge to deck level at its upper edge.
 * Anything walking the road follows the
 * same rise: tile-centre heights interpolate linearly, and the ramp's centre
 * sits at exactly half the rise, so a walker's feet track the wedge.
 */

/** How far above the ground a bridge deck sits, in world units. */
export const BRIDGE_RISE = 0.36

/** Down ramp, level path, and up ramp between separate spans. */
export const MIN_BRIDGE_LAND_GAP = 3

export interface BridgeSpan {
  /** The bridge tiles in order from `from` to `to`. */
  tiles: TilePos[]
  /** Unit step along the span, from `from` toward `to`: (±1, 0) or (0, ±1). */
  dx: number
  dz: number
  /** The land tile the span launches from, or null off the edge of the map. */
  from: TilePos | null
  /** The land tile the span lands on, or null off the edge of the map. */
  to: TilePos | null
  /**
   * Whether the main road crosses here or only a beaten track. Decided by the
   * land at either end — a track never becomes road however the road is
   * surfaced, so its bridges stay timber.
   */
  kind: "road" | "track"
}

/** A land tile that climbs toward a bridge: (dx, dz) points uphill, onto the span. */
export interface BridgeRamp extends TilePos {
  dx: number
  dz: number
  kind: "road" | "track"
}

export interface BridgeConnector extends TilePos {
  kind: "road" | "track"
  /** Open deck edges in +x, -x, +z, -z order. */
  open: boolean[]
}

export interface BridgeLayout {
  spans: BridgeSpan[]
  ramps: BridgeRamp[]
  /** Level decks over short land gaps and corners before the ramps. */
  connectors: BridgeConnector[]
  /** Height of the walking surface above TILE_HEIGHT at each tile's centre, by tile index. */
  rise: Float32Array
}

const AXES: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
]

const layoutCache = new WeakMap<GameMap, BridgeLayout>()

function isBridge(map: GameMap, x: number, z: number): boolean {
  return tileAt(map, x, z) === "bridge"
}

/** Water, or a bridge with water still running beneath it. */
function isWet(map: GameMap, x: number, z: number): boolean {
  const t = tileAt(map, x, z)
  return t === "water" || t === "bridge"
}

/** Which way a span runs, for the tile at (x, z). */
function spanAxis(map: GameMap, x: number, z: number): readonly [number, number] {
  for (const [dx, dz] of AXES) {
    if (isBridge(map, x + dx, z + dz) || isBridge(map, x - dx, z - dz)) return [dx, dz]
  }
  // A single-tile span: it crosses from bank to bank, so it runs along
  // whichever axis has the most path at its ends, then land. Off the map
  // counts for half a bank — it may be there, just out of sight.
  const landScore = (tx: number, tz: number) => {
    const terrain = tileAt(map, tx, tz)
    if (isRoadTerrain(terrain)) return 5
    return terrain === null ? 1 : isWet(map, tx, tz) ? 0 : 2
  }
  let best = AXES[0]
  let bestScore = -1
  for (const axis of AXES) {
    const [dx, dz] = axis
    const score = landScore(x + dx, z + dz) + landScore(x - dx, z - dz)
    if (score > bestScore) {
      best = axis
      bestScore = score
    }
  }
  return best
}

/** Every bridge on the map, with the ramps and island decks that reach them. */
export function bridgeLayout(map: GameMap): BridgeLayout {
  const cached = layoutCache.get(map)
  if (cached) return cached

  const spans: BridgeSpan[] = []
  const seen = new Set<number>()
  // Land tiles that a span launches from or lands on, keyed by tile index.
  // Nearby approaches are joined by decks when there is too little dry land.
  const approaches = new Map<number, BridgeRamp[]>()

  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      const index = z * map.width + x
      if (seen.has(index) || !isBridge(map, x, z)) continue
      const [dx, dz] = spanAxis(map, x, z)

      // Walk back to the span's first tile, then forward across the whole run.
      let sx = x
      let sz = z
      while (isBridge(map, sx - dx, sz - dz)) {
        sx -= dx
        sz -= dz
      }
      const tiles: TilePos[] = []
      let tx = sx
      let tz = sz
      while (isBridge(map, tx, tz)) {
        tiles.push({ x: tx, z: tz })
        seen.add(tz * map.width + tx)
        tx += dx
        tz += dz
      }

      const first = tiles[0]
      const last = tiles[tiles.length - 1]
      const fromTerrain = tileAt(map, first.x - dx, first.z - dz)
      const toTerrain = tileAt(map, last.x + dx, last.z + dz)
      const from = fromTerrain === null ? null : { x: first.x - dx, z: first.z - dz }
      const to = toTerrain === null ? null : { x: last.x + dx, z: last.z + dz }
      const kind = fromTerrain === "path" || toTerrain === "path" ? "road" : "track"
      spans.push({ tiles, dx, dz, from, to, kind })

      const approach = (tile: TilePos | null, ux: number, uz: number) => {
        // Approaches follow the path; bare banks and water have no ramp.
        if (!tile || !isRoadTerrain(tileAt(map, tile.x, tile.z))) return
        const key = tile.z * map.width + tile.x
        const list = approaches.get(key) ?? []
        list.push({ x: tile.x, z: tile.z, dx: ux, dz: uz, kind })
        approaches.set(key, list)
      }
      approach(from, dx, dz)
      // `|| 0` keeps a negated zero axis at +0, so ramps compare by value.
      approach(to, -dx || 0, -dz || 0)
    }
  }

  // Search from each bank through at most two path tiles. Three dry tiles
  // leave room for a down ramp, level path, and an up ramp; shorter gaps
  // carry the deck straight through, including bends on tiny islands.
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
  const connectorKeys = new Set<number>()
  const spanAt = new Map<number, number>()
  spans.forEach((span, id) => {
    for (const tile of span.tiles) spanAt.set(tile.z * map.width + tile.x, id)
  })
  for (const [start, banks] of approaches) {
    const bank = banks[0]
    const source = spanAt.get((bank.z + bank.dz) * map.width + bank.x + bank.dx)
    const visit = (path: number[]) => {
      const index = path[path.length - 1]
      const x = index % map.width
      const z = Math.floor(index / map.width)
      for (const [dx, dz] of dirs) {
        const terrain = tileAt(map, x + dx, z + dz)
        if (terrain === null) continue
        const next = (z + dz) * map.width + x + dx
        if (terrain === "bridge" && spanAt.get(next) !== source &&
          approaches.get(index)?.some((bank) => bank.dx === dx && bank.dz === dz)) {
          for (const key of path) connectorKeys.add(key)
        } else if (path.length < MIN_BRIDGE_LAND_GAP - 1 && isRoadTerrain(terrain) && !path.includes(next)) {
          visit([...path, next])
        }
      }
    }
    if (isRoadTerrain(map.tiles[start])) visit([start])
  }

  // A ramp needs a level path tile beyond its low edge. Carry the deck
  // around corners until that is possible, also merging approaches that
  // would otherwise descend into each other or meet a deck sideways.
  const pending = new Map([...approaches].map(([index, list]) => [index, [...list]]))
  const expanded = new Set<number>()
  while (true) {
    for (const index of connectorKeys) {
      if (expanded.has(index)) continue
      expanded.add(index)
      pending.delete(index)
      for (const [dx, dz] of dirs) {
        const x = index % map.width + dx
        const z = Math.floor(index / map.width) + dz
        const terrain = tileAt(map, x, z)
        const next = z * map.width + x
        if (!isRoadTerrain(terrain) || connectorKeys.has(next)) continue
        const list = pending.get(next) ?? []
        list.push({ x, z, dx: -dx || 0, dz: -dz || 0, kind: terrain === "path" ? "road" : "track" })
        pending.set(next, list)
      }
    }
    const promote: number[] = []
    for (const [index, list] of pending) {
      const ramp = list[0]
      const x = ramp.x - ramp.dx
      const z = ramp.z - ramp.dz
      const terrain = tileAt(map, x, z)
      const next = z * map.width + x
      const conflicting = list.some((other) => other.dx !== ramp.dx || other.dz !== ramp.dz)
      // Off-map paths continue beyond the visible world, as on ground roads.
      const levelExit = terrain === null || (isRoadTerrain(terrain) && !connectorKeys.has(next) && !pending.has(next))
      if (conflicting || !levelExit) promote.push(index)
    }
    if (promote.length === 0) break
    for (const index of promote) connectorKeys.add(index)
  }

  const ramps = [...pending.values()].map((list) => list[0])
  const rise = new Float32Array(map.width * map.depth)
  for (const span of spans) {
    for (const tile of span.tiles) rise[tile.z * map.width + tile.x] = BRIDGE_RISE
  }
  for (const ramp of ramps) {
    rise[ramp.z * map.width + ramp.x] = BRIDGE_RISE / 2
  }
  const rampAt = new Map(ramps.map((r) => [r.z * map.width + r.x, r]))
  const connectors: BridgeConnector[] = [...connectorKeys].map((index) => {
    const x = index % map.width
    const z = Math.floor(index / map.width)
    rise[index] = BRIDGE_RISE
    return {
      x, z,
      kind: map.tiles[index] === "path" ? "road" : "track",
      open: dirs.map(([dx, dz]) => {
        if (tileAt(map, x + dx, z + dz) === null) return false
        const next = (z + dz) * map.width + x + dx
        const ramp = rampAt.get(next)
        const meetsSpan = approaches.get(index)?.some((bank) => bank.dx === dx && bank.dz === dz) ?? false
        return meetsSpan || connectorKeys.has(next) || (ramp?.dx === -dx && ramp?.dz === -dz)
      }),
    }
  })

  const layout = { spans, ramps, connectors, rise }
  layoutCache.set(map, layout)
  return layout
}

/**
 * World-space height of the walking surface at a tile's centre: the ground,
 * or the deck of a bridge, or halfway up the ramp onto one. Off the map, the
 * ground.
 */
export function surfaceHeight(map: GameMap, x: number, z: number): number {
  if (x < 0 || z < 0 || x >= map.width || z >= map.depth) return TILE_HEIGHT
  return TILE_HEIGHT + bridgeLayout(map).rise[z * map.width + x]
}
