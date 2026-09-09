import type { buildingSpatialQuery } from "./building-spatial"
import { terrainQueryToken } from "./map/cliff-corners"
import { tileAt, type GameMap, type TilePos } from "./map/types"

type Nearby = ReturnType<typeof buildingSpatialQuery>
const cells = new WeakMap<GameMap, WeakMap<Nearby, { token: object; values: Uint8Array; query: (point: TilePos) => boolean }>>()

/** Exact outdoor footprint checks shared by footsteps and route smoothing.
 * Only cache during a read-only terrain scope; edits between ticks and direct
 * callers continue to observe live terrain and building geometry. */
export function walkingGroundQuery(map: GameMap, nearby: Nearby): (point: TilePos) => boolean {
  const token = terrainQueryToken(map)
  if (!token) return makeQuery(map, nearby)
  let variants = cells.get(map)
  if (!variants) { variants = new WeakMap(); cells.set(map, variants) }
  let cache = variants.get(nearby)
  if (!cache || cache.values.length !== map.width * map.depth) {
    const values = new Uint8Array(map.width * map.depth)
    cache = { token, values, query: makeQuery(map, nearby, values) }
    variants.set(nearby, cache)
  } else if (cache.token !== token) {
    cache.values.fill(0); cache.token = token
  }
  return cache.query
}

function makeQuery(map: GameMap, nearby: Nearby, values?: Uint8Array): (point: TilePos) => boolean {
  return p => {
    if (p.x < 0 || p.z < 0 || p.x >= map.width || p.z >= map.depth) return false
    const index = p.z * map.width + p.x
    if (values?.[index]) return values[index] === 2
    const terrain = tileAt(map, p.x, p.z)
    let open = terrain === "grass" || terrain === "clearing" || terrain === "dirt" || terrain === "sand" || terrain === "path" || terrain === "track"
    if (open) for (const b of nearby(p)) {
      if (p.x >= b.x && p.x < b.x + b.w && p.z >= b.z && p.z < b.z + b.d) { open = false; break }
    }
    if (values) values[index] = open ? 2 : 1
    return open
  }
}
