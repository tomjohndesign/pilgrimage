import { describe, expect, it } from "vitest"
import { makeRng } from "../rng"
import { expandReachable, nearestReachableLand } from "./connectivity"
import { DEFAULT_ELEVATION, elevationStep, type ElevationInfo } from "./elevation"
import { ROUTE_DIRS } from "./route"
import { TERRAIN, type TerrainId } from "./terrain"

function level(width: number, depth: number): ElevationInfo {
  const area = width * depth
  return { settings: DEFAULT_ELEVATION, height: Array(area).fill(0), corners: Array(area * 4).fill(0),
    slope: Array(area).fill(0), cliffs: Array(area).fill(0) }
}

/** Complete reference flood, deliberately independent of incremental state. */
function fullFlood(tiles: TerrainId[], roots: number[], width: number, depth: number, elevation: ElevationInfo) {
  const seen = new Uint8Array(tiles.length), queue = [...roots]
  for (const i of roots) seen[i] = 1
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % width, z = Math.floor(i / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || seen[n] || !TERRAIN[tiles[n]].passable) continue
      if (tiles[i] !== "bridge" && tiles[n] !== "bridge" && !Number.isFinite(elevationStep(elevation, i, n))) continue
      seen[n] = 1; queue.push(n)
    }
  }
  return seen
}

describe("incremental generation connectivity", () => {
  it("matches a fresh flood after disconnected openings, reversed paths and a bridge across a cliff", () => {
    const width = 9, depth = 5, tiles: TerrainId[] = Array(width * depth).fill("forest")
    const elevation = level(width, depth), roots = [0], seen = new Uint8Array(tiles.length)
    tiles[0] = "grass"; seen[0] = 1
    for (const i of [4, 13, 22, 31, 40]) { tiles[i] = "water"; elevation.height[i] = 10 }
    for (const opening of [[8, 7, 6, 5], [3, 2, 1], [4], [17, 26, 25, 24]]) {
      for (const i of opening) tiles[i] = i === 4 ? "bridge" : "clearing"
      const before = seen.reduce((sum, value) => sum + value, 0)
      const added = expandReachable(tiles, opening, seen, width, depth, elevation)
      expect(seen).toEqual(fullFlood(tiles, roots, width, depth, elevation))
      expect(added).toBe(seen.reduce((sum, value) => sum + value, 0) - before)
      expect(expandReachable(tiles, opening, seen, width, depth, elevation)).toBe(0)
      if (opening[0] === 8) expect(seen[8]).toBe(0)
    }
    expect(seen[8]).toBe(1)
    expect(seen[13]).toBe(0)
  })

  it("does not enter an unbridged cliff", () => {
    const tiles: TerrainId[] = ["grass", "forest", "grass"], elevation = level(3, 1)
    elevation.height[2] = 10
    const seen = Uint8Array.of(1, 0, 0)
    tiles[1] = "clearing"
    expandReachable(tiles, [1], seen, 3, 1, elevation)
    expect([...seen]).toEqual([1, 1, 0])
  })

  it("preserves complete-search distance, destination and source ties on rectangular worlds", () => {
    const width = 13, depth = 7, area = width * depth
    for (let seed = 0; seed < 50; seed++) {
      const rng = makeRng(seed), tiles: TerrainId[] = Array(area).fill("grass"), elevation = level(width, depth)
      const walls = Uint8Array.from({ length: area }, () => Number(rng() < .2))
      const reached = Uint8Array.from({ length: area }, () => Number(rng() < .12))
      elevation.height = elevation.height.map(() => rng() < .15 ? 10 : 0)
      const pocket = [Math.floor(rng() * area), Math.floor(rng() * area)]
      const dist = new Int32Array(area).fill(-1), origin = new Int32Array(area).fill(-1), queue: number[] = []
      for (const i of pocket) if (!walls[i] && dist[i] < 0) { dist[i] = 0; origin[i] = i; queue.push(i) }
      for (let head = 0; head < queue.length; head++) {
        const i = queue[head], x = i % width, z = Math.floor(i / width)
        for (const [dx, dz] of ROUTE_DIRS) {
          const nx = x + dx, nz = z + dz, n = nz * width + nx
          if (nx < 0 || nz < 0 || nx >= width || nz >= depth || walls[n] || dist[n] >= 0 || !Number.isFinite(elevationStep(elevation, i, n))) continue
          dist[n] = dist[i] + 1; origin[n] = origin[i]; queue.push(n)
        }
      }
      let best = -1
      for (let i = 0; i < area; i++) if (reached[i] && dist[i] >= 0 && (best < 0 || dist[i] < dist[best])) best = i
      expect(nearestReachableLand(pocket, reached, tiles, walls, width, depth, elevation))
        .toEqual(best < 0 ? null : { from: origin[best], to: best })
    }
  })

  it("resolves equal-distance destinations by index, rather than discovery order", () => {
    const tiles: TerrainId[] = ["grass", "grass", "grass"], elevation = level(3, 1)
    expect(nearestReachableLand([1], Uint8Array.of(1, 0, 1), tiles, new Uint8Array(3), 3, 1, elevation))
      .toEqual({ from: 1, to: 0 })
  })
})
