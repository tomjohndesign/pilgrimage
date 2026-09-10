import { MinHeap, ROUTE_DIRS } from "../game/map/route"
import type { TerrainId } from "../game/map/terrain"
import { WATER_KIND_LAKE } from "../game/map/water"

/** Preview crossings jump straight from bank to bank. Their high cost favors
 * narrow river crossings and walking around lakes. Lake crossings are allowed
 * as a last resort for islands; this is not the live road/bridge generator. */
export function connectPreview(start: number, goal: number, tiles: TerrainId[], water: Uint8Array, size: number, jitter: Float64Array, lumber: Uint8Array,
  options: { blocked?: Uint8Array; exitOnly?: Uint8Array } = {}): number[] {
  const costs = new Float64Array(tiles.length).fill(Infinity), previous = new Int32Array(tiles.length).fill(-1)
  const closed = new Uint8Array(tiles.length), open = new MinHeap()
  const heuristic = (i: number) => Math.abs(i % size - goal % size) + Math.abs(Math.floor(i / size) - Math.floor(goal / size))
  costs[start] = 0; open.push(start, heuristic(start))
  while (open.size) {
    const i = open.pop()
    if (closed[i]) continue
    if (i === goal) break
    closed[i] = 1
    for (const [dx, dz] of ROUTE_DIRS) {
      let x = i % size + dx, z = Math.floor(i / size) + dz, crossing = 0
      while (x >= 0 && z >= 0 && x < size && z < size && water[z * size + x]) {
        const n = z * size + x
        crossing += tiles[n] === "bridge" ? 1 : water[n] === WATER_KIND_LAKE ? 120 : 35
        x += dx; z += dz
      }
      if (x < 0 || z < 0 || x >= size || z >= size) continue
      const n = z * size + x
      if (lumber[n] || options.blocked?.[n] || (options.exitOnly && !options.exitOnly[i] && options.exitOnly[n])) continue
      const cost = costs[i] + crossing + 1 + jitter[n] + (tiles[n] === "darkwood" ? 14 : tiles[n] === "forest" ? 5 : 0)
      if (!closed[n] && cost < costs[n]) {
        costs[n] = cost; previous[n] = i; open.push(n, cost + heuristic(n))
      }
    }
  }
  if (!Number.isFinite(costs[goal])) throw new Error("No preview crossing connects these clearings")
  const spine: number[] = []
  for (let i = goal; i !== -1; i = previous[i]) spine.push(i)
  spine.reverse()
  const route = [start]
  for (let n = 1; n < spine.length; n++) {
    let x = spine[n - 1] % size, z = Math.floor(spine[n - 1] / size)
    const gx = spine[n] % size, gz = Math.floor(spine[n] / size), dx = Math.sign(gx - x), dz = Math.sign(gz - z)
    while (x !== gx || z !== gz) { x += dx; z += dz; route.push(z * size + x) }
  }
  return route
}
