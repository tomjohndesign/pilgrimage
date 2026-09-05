export const ROUTE_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/**
 * A* over the full grid, 4-connected, cost 1 + wander per step. Terrain is
 * deliberately ignored — whatever is in the way gets carved by the caller.
 * Used for river centerlines and as the road's last-resort fallback.
 * Linear-scan open list; fine at prototype map sizes.
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
  const open: number[] = [startIndex]

  while (open.length > 0) {
    let best = 0
    for (let k = 1; k < open.length; k++) {
      if (g[open[k]] + h(open[k]) < g[open[best]] + h(open[best])) best = k
    }
    const current = open[best]
    open[best] = open[open.length - 1]
    open.pop()
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
        open.push(n)
      }
    }
  }

  const route: number[] = []
  for (let i = goalIndex; i !== -1; i = cameFrom[i]) route.push(i)
  return route.reverse()
}
