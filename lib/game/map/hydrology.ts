import type { ElevationInfo } from "./elevation"
import { ROUTE_DIRS } from "./route"
import type { WaterInfo } from "./types"

/** Drain each water component to its lake or boundary outlet, with an acyclic downhill graph. */
export function drainWater(kind: Uint8Array, depths: Uint8Array, width: number, depth: number, elevation: ElevationInfo): WaterInfo {
  const { settings } = elevation, size = kind.length
  const surface = new Array<number>(size).fill(0)
  const downstream = new Array<number>(size).fill(-1), drop = new Array<number>(size).fill(0)
  const motion: NonNullable<WaterInfo["motion"]> = new Array(size).fill("still")
  const flow: WaterInfo["flow"] = {}, seen = new Uint8Array(size)
  const neighbours = (i: number): number[] => {
    const x = i % width, z = Math.floor(i / width)
    return ROUTE_DIRS.flatMap(([dx, dz]) => {
      const nx = x + dx, nz = z + dz
      return nx >= 0 && nz >= 0 && nx < width && nz < depth && kind[nz * width + nx] ? [nz * width + nx] : []
    })
  }
  for (let start = 0; start < size; start++) {
    if (!kind[start] || seen[start]) continue
    const body = [start]; seen[start] = 1
    for (let q = 0; q < body.length; q++) for (const n of neighbours(body[q])) {
      if (!seen[n]) { seen[n] = 1; body.push(n) }
    }
    let outlets = body.filter((i) => kind[i] === 2)
    if (!outlets.length) {
      const edge = body.find((i) => i % width === 0 || i % width === width - 1 || i < width || i >= size - width)
      outlets = [edge ?? body[0]] // An enclosed river terminates in a still pool.
    }
    const distance = new Map(outlets.map((i) => [i, 0])), queue = [...outlets]
    let maxDistance = 0
    for (let q = 0; q < queue.length; q++) for (const n of neighbours(queue[q])) {
      if (distance.has(n)) continue
      const d = distance.get(queue[q])! + 1
      distance.set(n, d); downstream[n] = queue[q]; maxDistance = Math.max(maxDistance, d); queue.push(n)
    }
    // The headwater stays below the base. Each reach descends toward its outlet.
    for (const i of body) {
      const along = maxDistance - distance.get(i)!
      surface[i] = -0.05 - along * settings.riverDrop - Math.floor(along / settings.waterfallSpacing) * settings.waterfallDrop
      elevation.height[i] = surface[i] - depths[i] * settings.waterDepth
    }
    for (const i of body) {
      const n = downstream[i]
      if (kind[i] !== 1) continue
      if (n < 0) {
        const x = i % width, z = Math.floor(i / width)
        if (x === 0) flow[i] = [-1, 0]
        else if (x === width - 1) flow[i] = [1, 0]
        else if (z === 0) flow[i] = [0, -1]
        else if (z === depth - 1) flow[i] = [0, 1]
        if (flow[i]) motion[i] = "flow"
        continue
      }
      drop[i] = Math.max(0, surface[i] - surface[n])
      flow[i] = [(n % width) - (i % width), Math.floor(n / width) - Math.floor(i / width)]
      motion[i] = drop[i] >= settings.cliffThreshold ? "waterfall" : "flow"
    }
  }
  return { depth: Array.from(depths), flow, surface, downstream, drop, motion }
}
