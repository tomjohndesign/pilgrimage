export const ROUTE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * A* over the full grid, 4-connected, cost 1 + wander per step. Terrain is
 * deliberately ignored — whatever is in the way gets carved by the caller.
 * The last-resort fallback for the road and the hovel's track.
 *
 * The open list is a binary heap keyed on f = g + h. A linear scan was fine up
 * to 128 tiles a side but cost seconds per route at 512, and a map routes
 * several times (rivers, road, hovel track). Stale heap entries — a tile pushed
 * again after a cheaper path was found — are skipped via the closed set.
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
  const open = new MinHeap()
  open.push(startIndex, h(startIndex))

  while (open.size > 0) {
    const current = open.pop()
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

/**
 * Binary min-heap of tile indices keyed on a float priority. Ties are broken
 * by insertion order so routing stays deterministic for a given seed.
 */
export class MinHeap {
  private items: number[] = []
  private keys: number[] = []
  private orders: number[] = []
  private pushed = 0

  get size(): number {
    return this.items.length
  }

  push(item: number, key: number): void {
    this.items.push(item)
    this.keys.push(key)
    this.orders.push(this.pushed++)
    this.siftUp(this.items.length - 1)
  }

  pop(): number {
    const top = this.items[0]
    const lastItem = this.items.pop()!
    const lastKey = this.keys.pop()!
    const lastOrder = this.orders.pop()!
    if (this.items.length > 0) {
      this.items[0] = lastItem
      this.keys[0] = lastKey
      this.orders[0] = lastOrder
      this.siftDown(0)
    }
    return top
  }

  private less(a: number, b: number): boolean {
    return this.keys[a] < this.keys[b] || (this.keys[a] === this.keys[b] && this.orders[a] < this.orders[b])
  }

  private swap(a: number, b: number): void {
    ;[this.items[a], this.items[b]] = [this.items[b], this.items[a]]
    ;[this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]]
    ;[this.orders[a], this.orders[b]] = [this.orders[b], this.orders[a]]
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!this.less(i, parent)) return
      this.swap(i, parent)
      i = parent
    }
  }

  private siftDown(i: number): void {
    const n = this.items.length
    for (;;) {
      const left = 2 * i + 1
      const right = left + 1
      let smallest = i
      if (left < n && this.less(left, smallest)) smallest = left
      if (right < n && this.less(right, smallest)) smallest = right
      if (smallest === i) return
      this.swap(i, smallest)
      i = smallest
    }
  }
}
