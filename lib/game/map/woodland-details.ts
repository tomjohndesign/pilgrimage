import { MinHeap, ROUTE_DIRS } from "./route"
import { makeRng } from "../rng"
import { isWoods, type TerrainId } from "./terrain"

export function neighbors(i: number, size: number): number[] {
  const x = i % size, z = Math.floor(i / size)
  return [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, z > 0 ? i - size : -1, z < size - 1 ? i + size : -1].filter(n => n >= 0)
}

/** Grow a connected, asymmetric clearing from a frontier. Elongation, a bent
 * axis and local terrain noise produce bays and shoulders instead of a disk. */
export function growOrganicClearing(center: { x: number; z: number; radius: number }, size: number, seed: number, interior: Int32Array, noise: (x: number, z: number) => number): number[] {
  const rng = makeRng(seed), angle = rng() * Math.PI * 2, bend = rng() < .5 ? -1 : 1
  const open = new MinHeap(), seen = new Uint8Array(size * size), result: number[] = []
  const start = center.z * size + center.x
  open.push(start, 0); seen[start] = 1
  const target = Math.round(Math.PI * center.radius ** 2)
  while (open.size && result.length < target) {
    const i = open.pop(); result.push(i)
    for (const n of neighbors(i, size)) {
      if (seen[n] || interior[n] < 4) continue
      seen[n] = 1
      const x = n % size, z = Math.floor(n / size), dx = x - center.x, dz = z - center.z
      const along = (dx * Math.cos(angle) + dz * Math.sin(angle)) / center.radius
      const across = (-dx * Math.sin(angle) + dz * Math.cos(angle)) / center.radius - bend * .3 * along * along
      const score = Math.hypot(along / 1.55, across * 1.55) + noise(x / size, z / size) * 1.2
      open.push(n, score)
    }
  }
  return result
}

/** Wind-biased frontier growth for 1–8 tile sapling patches. Most start on or
 * near a treeline; occasional seeds reach open land. No circular stamp or
 * meadow halo is used, and reserved clearing interiors stay open. */
export function scatterSaplings(tiles: TerrainId[], reserved: Uint8Array, size: number, seed: number, wind: number): number[][] {
  const rng = makeRng(seed), clusters: number[][] = [], occupied = new Uint8Array(tiles.length)
  const fringe: number[] = [], openings: number[] = [], attached: number[] = []
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i] !== "grass" || reserved[i]) continue
    if (neighbors(i, size).some(n => isWoods(tiles[n]))) attached.push(i)
    else {
      let near = false
      const x = i % size, z = Math.floor(i / size)
      for (let dz = -7; dz <= 7 && !near; dz += 2) for (let dx = -7; dx <= 7; dx += 2) {
        const nx = x + dx, nz = z + dz
        if (nx >= 0 && nz >= 0 && nx < size && nz < size && isWoods(tiles[nz * size + nx])) { near = true; break }
      }
      ;(near ? fringe : openings).push(i)
    }
  }
  const direction = wind / 180 * Math.PI
  for (let attempt = 0; attempt < Math.round(size * size / 700); attempt++) {
    const roll = rng(), pool = roll < .4 ? attached : roll < .85 ? fringe : openings
    if (!pool.length) continue
    const start = pool[Math.floor(rng() * pool.length)]
    if (occupied[start] || tiles[start] !== "grass") continue
    const cluster = [start], target = 1 + Math.floor(rng() * 8)
    tiles[start] = "forest"
    for (let tries = 0; tries < 80 && cluster.length < target; tries++) {
      const from = cluster[Math.floor(rng() * cluster.length)], x = from % size, z = Math.floor(from / size)
      const choices = ROUTE_DIRS.map(([dx, dz]) => ({ dx, dz, weight: .25 + Math.max(0, dx * Math.cos(direction) + dz * Math.sin(direction)) }))
      let pick = rng() * choices.reduce((sum, d) => sum + d.weight, 0)
      const d = choices.find(d => (pick -= d.weight) <= 0) ?? choices[0]
      const nx = x + d.dx, nz = z + d.dz, n = nz * size + nx
      if (nx < 0 || nz < 0 || nx >= size || nz >= size || reserved[n] || occupied[n] || tiles[n] !== "grass") continue
      // Detached patches don't merge with existing woods as they grow. Edge
      // extensions can stay attached to their parent stand.
      if (pool !== attached && neighbors(n, size).some(q => isWoods(tiles[q]) && !cluster.includes(q))) continue
      tiles[n] = "forest"; cluster.push(n)
    }
    clusters.push(cluster)
    for (const i of cluster) {
      const x = i % size, z = Math.floor(i / size)
      for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
        const nx = x + dx, nz = z + dz
        if (nx >= 0 && nz >= 0 && nx < size && nz < size) occupied[nz * size + nx] = 1
      }
    }
  }
  return clusters
}
