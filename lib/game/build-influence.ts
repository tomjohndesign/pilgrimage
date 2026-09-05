import { buildCatalog, DEFAULT_BALANCE, type GameBalance } from "./balance"
import { TERRAIN } from "./map/terrain"
import type { GameMap } from "./map/types"

/** Enough frontage for a three-tile building beside the shrine's approach. */
export const APPROACH_BUILD_WIDTH = 3

export function influenceRadius(renown: number, balance: GameBalance = DEFAULT_BALANCE): number {
  return renown > 0 ? balance.rules.buildRadius * Math.sqrt(renown / 5) : 0
}

export interface BuildInfluence {
  /** Radiated area, including obstacles, for drawing the boundary. */
  radiated: Uint8Array
  /** Land within that area connected to the approach (four neighbours). */
  connected: Uint8Array
}

/**
 * The approach seeds settlement frontage. Renown sources extend it; housing
 * and production with zero renown cannot. Water and woods cannot connect an
 * isolated pocket. Footprints do not erase established territorial influence.
 * Callers share the result between placement validation and the map overlay.
 */
export function buildInfluence(map: GameMap, balance: GameBalance = DEFAULT_BALANCE): BuildInfluence {
  const radiated = new Uint8Array(map.width * map.depth)
  const connected = new Uint8Array(radiated.length)
  if (!map.site) return { radiated, connected }
  const stamp = (cx: number, cz: number, radius: number) => {
    for (let z = Math.max(0, Math.ceil(cz - radius)); z <= Math.min(map.depth - 1, Math.floor(cz + radius)); z++) {
      for (let x = Math.max(0, Math.ceil(cx - radius)); x <= Math.min(map.width - 1, Math.floor(cx + radius)); x++) {
        if (Math.hypot(x - cx, z - cz) <= radius) radiated[z * map.width + x] = 1
      }
    }
  }
  const approach = [...map.site.branch, map.site.door]
  for (const tile of approach) stamp(tile.x, tile.z, APPROACH_BUILD_WIDTH)
  const catalog = buildCatalog(balance)
  for (const building of map.buildings) {
    const renown = building.id === map.site.hovelId ? balance.rules.hovelRenown
      : catalog.find((def) => def.id === building.buildType)?.renown ?? 0
    if (renown > 0) stamp(building.x + (building.w - 1) / 2,
      building.z + (building.d - 1) / 2, influenceRadius(renown, balance))
  }
  const queue: number[] = []
  const visit = (x: number, z: number) => {
    if (x < 0 || z < 0 || x >= map.width || z >= map.depth) return
    const i = z * map.width + x
    if (!radiated[i] || connected[i] || !TERRAIN[map.tiles[i]].passable) return
    if (map.water?.depth[i] && map.tiles[i] !== "bridge") return
    connected[i] = 1
    queue.push(i)
  }
  for (const tile of approach) visit(tile.x, tile.z)
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % map.width, z = Math.floor(i / map.width)
    visit(x - 1, z)
    visit(x + 1, z)
    visit(x, z - 1)
    visit(x, z + 1)
  }
  return { radiated, connected }
}

// Game maps and balances are immutable in gameplay. Avoid rebuilding the field
// for each pointer move; fixtures that mutate a map can call buildInfluence directly.
const cache = new WeakMap<GameMap, WeakMap<GameBalance, BuildInfluence>>()
export function getBuildInfluence(map: GameMap, balance: GameBalance = DEFAULT_BALANCE): BuildInfluence {
  let balances = cache.get(map)
  if (!balances) { balances = new WeakMap(); cache.set(map, balances) }
  let field = balances.get(balance)
  if (!field) { field = buildInfluence(map, balance); balances.set(balance, field) }
  return field
}
