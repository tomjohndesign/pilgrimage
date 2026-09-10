import { mainRoadWidthAt } from "./road-width"
import { bridgeLayout } from "./bridges"
import { diagonalRoadBend, isRoadTerrain, sampleRoadBend } from "./road"
import { tileAt, type GameMap, type TilePos } from "./types"

interface LaneTile {
  /** Null when the tile takes no lane: not road, or not a straight/quarter-turn join. */
  ok: boolean
  ix: number; iz: number; ox: number; oz: number
  straight: boolean
  bend: ReturnType<typeof diagonalRoadBend>
}

// Every step of every walker samples the road curve. The per-tile facts (road
// terrain, deck, entrance/exit directions, authored bend) never change for a
// given map and route, so they are resolved once per tile and reused.
const laneTiles = new WeakMap<readonly TilePos[], { map: GameMap; tiles: Array<LaneTile | undefined> }>()
function laneTile(map: GameMap, route: readonly TilePos[], i: number): LaneTile {
  let cache = laneTiles.get(route)
  if (!cache || cache.map !== map) { cache = { map, tiles: new Array(route.length) }; laneTiles.set(route, cache) }
  const cached = cache.tiles[i]
  if (cached) return cached
  const p = route[i], a = route[Math.max(0, i - 1)], b = route[Math.min(route.length - 1, i + 1)]
  const onDeck = bridgeLayout(map).rise[p.z * map.width + p.x] > 0
  const ix = i === 0 ? b.x - p.x : p.x - a.x, iz = i === 0 ? b.z - p.z : p.z - a.z
  const ox = i === route.length - 1 ? ix : b.x - p.x, oz = i === route.length - 1 ? iz : b.z - p.z
  const dot = ix * ox + iz * oz
  const ok = (onDeck || isRoadTerrain(tileAt(map, p.x, p.z))) && Math.abs(ix) + Math.abs(iz) === 1 && Math.abs(ox) + Math.abs(oz) === 1 && dot >= 0
  const tile: LaneTile = { ok, ix, iz, ox, oz, straight: dot === 1, bend: ok && dot !== 1 && !onDeck ? diagonalRoadBend(map, p.x, p.z) : null }
  cache.tiles[i] = tile
  return tile
}

/** Sample a road tile's rendered curve, offset along its local left normal.
 * Main-road lane offsets expand with usable width and tighten at bends/bridges.
 * Progress still counts tile centres so junctions and arrival triggers retain
 * their indices; half-integers are the shared entrances between tiles. */
export function roadLanePoint(map: GameMap, route: readonly TilePos[], progress: number, lane: number): TilePos | null {
  const i = Math.max(0, Math.min(route.length - 1, Math.floor(progress + 0.5)))
  const p = route[i]
  if (!p || route.length < 2) return null
  const tile = laneTile(map, route, i)
  if (!tile.ok) return null
  const { ix, iz, ox, oz } = tile
  const t = progress - i + 0.5
  let x: number, z: number, dx: number, dz: number
  if (tile.straight) {
    x = p.x + ix * (t - 0.5); z = p.z + iz * (t - 0.5)
    dx = ix; dz = iz
  } else {
    // Ground staircase shortcuts can pass outside a raised landing. Bridge
    // bends instead join the actual deck entrances with a tangent arc.
    const bend = tile.bend
    if (bend) {
      // The shared renderer curve is authored from the X entrance to Z.
      const forward = ix !== 0, u = forward ? t : 1 - t
      const centre = sampleRoadBend(bend, u)
      x = centre.x - 0.5; z = centre.z - 0.5
      const v = 1 - u, sign = forward ? 1 : -1
      const tangent = (axis: "x" | "z") => sign * (bend.straight ? bend.b[axis] - bend.a[axis] :
        3 * v * v * (bend.controlA[axis] - bend.a[axis]) +
        6 * v * u * (bend.controlB[axis] - bend.controlA[axis]) +
        3 * u * u * (bend.b[axis] - bend.controlB[axis]))
      dx = tangent("x"); dz = tangent("z")
    } else {
      // Ordinary bends are quarter circles of radius half a tile, exactly
      // like roadShape in the terrain shader, with tangent entrances.
      const angle = t * Math.PI / 2, sin = Math.sin(angle), cos = Math.cos(angle)
      x = p.x + (-ix + ox + ix * sin - ox * cos) / 2
      z = p.z + (-iz + oz + iz * sin - oz * cos) / 2
      dx = ix * cos + ox * sin
      dz = iz * cos + oz * sin
    }
  }
  if (route === map.road) lane *= mainRoadWidthAt(map, progress, true)
  const length = Math.hypot(dx, dz)
  return { x: x + dz / length * lane, z: z - dx / length * lane }
}
