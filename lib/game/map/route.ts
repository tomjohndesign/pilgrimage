export const ROUTE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * Binary min-heap open list for the A* routers, keyed by f = g + h. Entries
 * are (tile index, key) pairs; a tile may sit in the heap more than once
 * after being relaxed, and callers skip the stale copies via their closed
 * set. Replaces a linear-scan open list — the routers cost the ground they
 * cross, which loosens the Manhattan heuristic and makes them expand many
 * more tiles than a straight-line route would.
 */
export class OpenHeap {
  private items: number[] = []
  private keys: number[] = []

  get size(): number {
    return this.items.length
  }

  push(item: number, key: number): void {
    const items = this.items
    const keys = this.keys
    let i = items.length
    items.push(item)
    keys.push(key)
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (keys[parent] <= key) break
      items[i] = items[parent]
      keys[i] = keys[parent]
      i = parent
    }
    items[i] = item
    keys[i] = key
  }

  /** Removes and returns the item with the smallest key. Undefined when empty. */
  pop(): number | undefined {
    const items = this.items
    const keys = this.keys
    if (items.length === 0) return undefined
    const top = items[0]
    const lastItem = items.pop() as number
    const lastKey = keys.pop() as number
    const n = items.length
    if (n > 0) {
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        if (left >= n) break
        const right = left + 1
        const child = right < n && keys[right] < keys[left] ? right : left
        if (keys[child] >= lastKey) break
        items[i] = items[child]
        keys[i] = keys[child]
        i = child
      }
      items[i] = lastItem
      keys[i] = lastKey
    }
    return top
  }
}

/**
 * A* over the full grid, 4-connected, cost 1 + wander per step. Terrain is
 * deliberately ignored — whatever is in the way gets carved by the caller.
 * Used for river centerlines and as the road's last-resort fallback.
 */
export function routeBlind(
  start: { x: number; z: number },
  goal: { x: number; z: number },
  width: number,
  depth: number,
  wander: Float64Array,
): number[] {
  const size = width * depth
  const g = new Float64Array(size).fill(Infinity)
  const cameFrom = new Int32Array(size).fill(-1)
  const closed = new Uint8Array(size)

  const startIndex = start.z * width + start.x
  const goalIndex = goal.z * width + goal.x
  // Manhattan distance; admissible because every step costs at least 1.
  const h = (i: number) => Math.abs((i % width) - goal.x) + Math.abs(Math.floor(i / width) - goal.z)

  g[startIndex] = 0
  const open = new OpenHeap()
  open.push(startIndex, h(startIndex))

  while (open.size > 0) {
    const current = open.pop() as number
    if (closed[current]) continue
    closed[current] = 1
    if (current === goalIndex) break

    const cx = current % width
    const cz = Math.floor(current / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = cx + dx
      const nz = cz + dz
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth) continue
      const n = nz * width + nx
      if (closed[n]) continue
      const cost = g[current] + 1 + wander[n]
      if (cost < g[n]) {
        g[n] = cost
        cameFrom[n] = current
        open.push(n, cost + h(n))
      }
    }
  }

  const route: number[] = []
  for (let i = goalIndex; i !== -1; i = cameFrom[i]) route.push(i)
  return route.reverse()
}
