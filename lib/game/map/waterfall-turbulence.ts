import type { WaterInfo } from "./types"

/** Follow the drainage graph: fast approach water, a churning landing, then a fading wake. */
export function waterfallTurbulence(water: WaterInfo | undefined, size: number, reach: number): Float32Array {
  // Per tile: intensity, flow X, flow Z. Dry land and unrelated water stay zero.
  const field = new Float32Array(size * 3)
  if (!water?.downstream || !water.motion) return field
  const upstream: number[][] = Array.from({ length: size }, () => [])
  water.downstream.forEach((n, i) => { if (n >= 0 && n < size) upstream[n].push(i) })
  const write = (i: number, strength: number, direction: readonly [number, number]) => {
    if (!water.depth[i] || field[i * 3] >= strength) return
    field.set([strength, ...direction], i * 3)
  }
  for (let i = 0; i < size; i++) {
    if (water.motion[i] !== "waterfall" || !water.flow[i]) continue
    const flow = water.flow[i], steps = Math.max(1, Math.round(reach))
    const queue = [{ i, distance: 0 }], seen = new Set([i])
    for (let q = 0; q < queue.length; q++) {
      const at = queue[q]
      write(at.i, 1 - at.distance / (steps + 0.5), water.flow[at.i] ?? flow)
      if (at.distance >= steps) continue
      for (const n of upstream[at.i]) if (!seen.has(n)) {
        seen.add(n); queue.push({ i: n, distance: at.distance + 1 })
      }
    }
    let n = water.downstream[i]
    for (let d = 0; d < steps + 1 && n >= 0 && n < size; d++) {
      write(n, 1 - d / (steps + 1), water.flow[n] ?? flow)
      n = water.downstream[n]
    }
  }
  return field
}
