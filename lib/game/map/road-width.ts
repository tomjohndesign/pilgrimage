import { elevationStep } from "./elevation"
import { bridgeLayout } from "./bridges"
import { diagonalRoadBend } from "./road"
import { tileAt, type GameMap } from "./types"

/** Main roads have two tiles of usable ground; tracks and bridge decks retain one. */
export const MAIN_ROAD_WIDTH = 2
const profiles = new WeakMap<GameMap, { width: number[]; lanes: number[] }>()

function profile(map: GameMap) {
  const old = profiles.get(map)
  if (old) return old
  const road = map.road ?? [], bridges = bridgeLayout(map)
  const width = road.map(p => {
    const index = p.z * map.width + p.x
    if (bridges.rise[index] > 0 || tileAt(map, p.x, p.z) === "bridge") return 1
    // A bank, cliff or existing building can still make a local pinch point.
    for (let z = p.z - 1; z <= p.z + 1; z++) for (let x = p.x - 1; x <= p.x + 1; x++) {
      const terrain = tileAt(map, x, z)
      if (terrain === "water" || terrain === "bridge" || map.elevation?.cliffs[z * map.width + x]
        || map.buildings.some(b => x >= b.x && x < b.x + b.w && z >= b.z && z < b.z + b.d)) return 1
    }
    return map.mainRoadWidth ?? 1
  })
  // Start narrowing before a landing, and finish widening after its ramp.
  const taper = (values: number[], reach: number) => values.map((value, i) => {
    for (let j = Math.max(0, i - reach); j <= Math.min(values.length - 1, i + reach); j++)
      value = Math.min(value, values[j] + Math.abs(i - j) / reach)
    return value
  })
  const surface = taper(width, 3)
  const walking = [...surface]
  for (let i = 1; i < road.length - 1; i++) {
    const a = road[i - 1], p = road[i], b = road[i + 1]
    if ((p.x - a.x) * (b.z - p.z) === (p.z - a.z) * (b.x - p.x)) continue
    // Inside a diagonal ribbon the alternating bends render as one 45-degree
    // line, so walkers spread across it exactly as they do on a straight.
    // Bridge decks keep their quarter-turn lanes and stay narrow.
    if (!bridges.rise[p.z * map.width + p.x] && tileAt(map, p.x, p.z) !== "bridge" && diagonalRoadBend(map, p.x, p.z)?.straight) continue
    // The authored Bezier's tightest radius is smaller than half a tile.
    // Narrow through the whole bend, then ease back out on either straight.
    for (let j = i - 1; j <= i + 1; j++) walking[j] = Math.min(walking[j], .7)
  }
  const lanes = taper(walking, 2)
  const result = { width: surface, lanes }
  profiles.set(map, result)
  return result
}

export function mainRoadWidthAt(map: GameMap, progress: number, walking = false): number {
  if ((map.mainRoadWidth ?? 1) <= 1 || !map.road?.length) return 1
  const values = walking ? profile(map).lanes : profile(map).width
  const p = Math.max(0, Math.min(values.length - 1, progress)), i = Math.floor(p)
  const t = p - i, smooth = t * t * (3 - 2 * t)
  return values[i] + (values[Math.min(i + 1, values.length - 1)] - values[i]) * smooth
}

/** Clear extra forest verge without adding parallel route tiles or changing junctions. */
export function clearMainRoadVerge(map: GameMap): void {
  if ((map.mainRoadWidth ?? 1) <= 1) return
  for (const p of map.road ?? []) for (let z = p.z - 1; z <= p.z + 1; z++) for (let x = p.x - 1; x <= p.x + 1; x++) {
    const terrain = tileAt(map, x, z)
    if (terrain !== "forest" && terrain !== "darkwood") continue
    const index = z * map.width + x, origin = p.z * map.width + p.x
    const connected = x === p.x || z === p.z
      ? Number.isFinite(elevationStep(map.elevation, origin, index))
      : [{ x, z: p.z }, { x: p.x, z }].some(v => {
        const via = v.z * map.width + v.x, ground = tileAt(map, v.x, v.z)
        return ground !== null && ["path", "track", "grass", "clearing", "dirt", "sand"].includes(ground)
          && Number.isFinite(elevationStep(map.elevation, origin, via)) && Number.isFinite(elevationStep(map.elevation, via, index))
      })
    if (connected) map.tiles[index] = "clearing"
  }
}
