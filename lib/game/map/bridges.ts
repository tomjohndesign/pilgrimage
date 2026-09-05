import { TILE_HEIGHT } from "./terrain"
import { tileAt, type GameMap, type TilePos } from "./types"

/**
 * Where the bridges are and how the ground rises to meet them. Pure data
 * derived from the tile grid — no three.js, no React — so the renderer, the
 * traveler sim, and anything that stands a figure on a tile all agree on how
 * high the surface is.
 *
 * A bridge is a straight run of `bridge` tiles (the generator guarantees
 * straight, short spans over river water). Its deck floats BRIDGE_RISE above
 * the ground so the water shows beneath it, and the land tile at each end —
 * the approach — is a ramp that climbs from ground level at its far edge to
 * deck level where it meets the span. Anything walking the road follows the
 * same rise: tile-centre heights interpolate linearly, and the ramp's centre
 * sits at exactly half the rise, so a walker's feet track the wedge.
 */

/** How far above the ground a bridge deck sits, in world units. */
export const BRIDGE_RISE = 0.36

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
}

export interface BridgeLayout {
  spans: BridgeSpan[]
  ramps: BridgeRamp[]
  /**
   * Land tiles between two spans, approached from both sides: the ground can't
   * ramp both ways, so it stands level at deck height as a causeway.
   */
  plateaus: TilePos[]
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
  // whichever axis has the most land at its ends. Off the map counts for
  // half — the bank may well be there, just out of sight.
  const landScore = (tx: number, tz: number) =>
    tileAt(map, tx, tz) === null ? 1 : isWet(map, tx, tz) ? 0 : 2
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

/** Every bridge on the map, with the ramps and causeways that reach them. */
export function bridgeLayout(map: GameMap): BridgeLayout {
  const cached = layoutCache.get(map)
  if (cached) return cached

  const spans: BridgeSpan[] = []
  const seen = new Set<number>()
  // Land tiles that a span launches from or lands on, keyed by tile index.
  // A tile reached by more than one span becomes a plateau instead of a ramp.
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
        // Only land climbs; a span that meets water end-on (say, at a lake
        // the generator let it touch) has nothing to ramp from.
        if (!tile || isWet(map, tile.x, tile.z)) return
        const key = tile.z * map.width + tile.x
        const list = approaches.get(key) ?? []
        list.push({ x: tile.x, z: tile.z, dx: ux, dz: uz })
        approaches.set(key, list)
      }
      approach(from, dx, dz)
      // `|| 0` keeps a negated zero axis at +0, so ramps compare by value.
      approach(to, -dx || 0, -dz || 0)
    }
  }

  const ramps: BridgeRamp[] = []
  const plateaus: TilePos[] = []
  const rise = new Float32Array(map.width * map.depth)
  for (const span of spans) {
    for (const tile of span.tiles) rise[tile.z * map.width + tile.x] = BRIDGE_RISE
  }
  for (const [index, list] of approaches) {
    if (list.length === 1) {
      ramps.push(list[0])
      rise[index] = BRIDGE_RISE / 2
    } else {
      plateaus.push({ x: list[0].x, z: list[0].z })
      rise[index] = BRIDGE_RISE
    }
  }

  const layout = { spans, ramps, plateaus, rise }
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
