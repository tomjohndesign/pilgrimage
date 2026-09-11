import { describe, expect, it } from "vitest"
import { generateElevation, elevationStep } from "./elevation"
import { generateMap } from "./generate-map"
import { isRoadTerrain } from "./road"
import { CLIFF_CLEARANCE, cliffVergeCost, clearCliffsBesideRoads } from "./road-cliffs"
import { ROUTE_DIRS } from "./route"
import type { GameMap } from "./types"
import type { TerrainId } from "./terrain"

/** Dry cliff faces within `clearance` land tiles of any road or track tile. */
function cliffsBesideRoads(map: GameMap, clearance = CLIFF_CLEARANCE): string[] {
  const { width, depth, tiles, elevation } = map, e = elevation!
  const water = (i: number) => tiles[i] === "water" || tiles[i] === "bridge"
  const distance = new Int32Array(tiles.length).fill(-1), queue: number[] = []
  for (let i = 0; i < tiles.length; i++) if (isRoadTerrain(tiles[i])) { distance[i] = 0; queue.push(i) }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q], x = i % width, z = Math.floor(i / width)
    if (distance[i] >= clearance) continue
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || water(n) || distance[n] !== -1) continue
      distance[n] = distance[i] + 1; queue.push(n)
    }
  }
  const found: string[] = []
  for (let i = 0; i < tiles.length; i++) {
    if (distance[i] < 0) continue
    const x = i % width, z = Math.floor(i / width)
    for (const [dx, dz] of ROUTE_DIRS) {
      const nx = x + dx, nz = z + dz, n = nz * width + nx
      if (nx < 0 || nz < 0 || nx >= width || nz >= depth || water(n)) continue
      if (Math.abs(e.height[i] - e.height[n]) >= e.settings.cliffThreshold) found.push(`${x},${z}→${nx},${nz}`)
    }
  }
  return found
}

describe("cliff clearance beside roads", () => {
  it("cuts a ridge back from a road, feathers the cut, and leaves distant cliffs alone", () => {
    const width = 12, depth = 9, kind = new Uint8Array(width * depth)
    const e = generateElevation(1, width, depth, kind)
    e.height.fill(0)
    // A road along z = 1, a ridge top two tiles below it, and a far ridge at the bottom edge.
    for (let x = 0; x < width; x++) for (let z = 3; z <= 4; z++) e.height[z * width + x] = 1
    for (let x = 0; x < width; x++) e.height[8 * width + x] = 1
    const tiles: TerrainId[] = Array(width * depth).fill("grass")
    for (let x = 0; x < width; x++) tiles[1 * width + x] = "path"
    const before = [...e.height]
    expect(clearCliffsBesideRoads(e, width, depth, kind, tiles)).toBeGreaterThan(0)
    const map: GameMap = { width, depth, tiles, buildings: [], elevation: e }
    expect(cliffsBesideRoads(map)).toEqual([])
    for (let x = 0; x < width; x++) {
      expect(e.height[1 * width + x]).toBe(0)
      // The far ridge is untouched, and so is the flat ground beside it.
      expect(e.height[8 * width + x]).toBe(before[8 * width + x])
      expect(e.height[7 * width + x]).toBe(before[7 * width + x])
      // Within the clearance every step is walkable; the ridge's far face lies beyond it.
      for (let z = 0; z < 4; z++) expect(Number.isFinite(elevationStep(e, z * width + x, (z + 1) * width + x))).toBe(true)
    }
  })

  it("charges routes for hugging a cliff face, out to the clearance", () => {
    const width = 9, depth = 1, kind = new Uint8Array(width)
    const e = generateElevation(1, width, depth, kind)
    e.height.fill(0); e.height[0] = 1
    expect([...cliffVergeCost(e, width, depth, kind)].map(c => c > 0)).toEqual([true, true, true, true, false, false, false, false, false])
  })

  it.each([
    { seed: 1 }, { seed: 42 }, { seed: 7919 }, { seed: 158381 },
    { seed: 1, elevation: { maxHeight: 4, cliffHeight: 2, cliffThreshold: 0.25, scale: 8, detail: 0.5, riverCut: 1, cutFrequency: 1 } },
    { seed: 42, elevation: { maxHeight: 4, cliffHeight: 2, cliffThreshold: 0.25, scale: 8, detail: 0.5, riverCut: 1, cutFrequency: 1 } },
  ])("keeps every generated road and track edge clear of cliff faces (%o)", options => {
    const map = generateMap(options)
    expect(map.elevation!.cliffs.some(Boolean)).toBe(true)
    expect(cliffsBesideRoads(map)).toEqual([])
  }, 120000)
})
