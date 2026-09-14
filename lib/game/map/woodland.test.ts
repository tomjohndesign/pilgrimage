import { describe, expect, it } from "vitest"
import { generateMap, HOVEL_ID } from "./generate-map"
import { elevationStep } from "./elevation"
import { TERRAIN } from "./terrain"
import { seedingMethodForSeed, sampleWoodland, DEFAULT_SETTINGS } from "./woodland"

function reachable(map: ReturnType<typeof generateMap>) {
  const seen = new Set<number>(), queue = [map.site!.door.z * map.width + map.site!.door.x]
  seen.add(queue[0])
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head], x = i % map.width, z = Math.floor(i / map.width)
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz, n = nz * map.width + nx
      if (nx < 0 || nz < 0 || nx >= map.width || nz >= map.depth || seen.has(n) || !TERRAIN[map.tiles[n]].passable) continue
      if (map.tiles[i] !== "bridge" && map.tiles[n] !== "bridge" && !Number.isFinite(elevationStep(map.elevation, i, n))) continue
      seen.add(n); queue.push(n)
    }
  }
  return seen
}

describe("playable woodland", () => {
  it.each([
    ...[0, 1, 7919, 166300, 316761, 4294967295].map(seed => ({ seed, width: 192, depth: 192 })),
    { seed: 0, width: 512, depth: 512 }, { seed: 1, width: 512, depth: 512 },
    { seed: 0, width: 128, depth: 256 }, { seed: 0, width: 256, depth: 128 },
    { seed: 95029, width: 128, depth: 128 }, { seed: 110867, width: 128, depth: 128 },
  ])("connects seed $seed at $width × $depth and keeps lumber near the church", options => {
    const { seed } = options
    const map = generateMap(options)
    expect(map.woodlandMethod).toBe(seedingMethodForSeed(seed))
    expect(map.shortcuts).toEqual([])
    if (map.width === 512) {
      const normal = map.tiles.filter(t => t === "forest").length, ancient = map.tiles.filter(t => t === "darkwood").length
      expect(ancient).toBeGreaterThan(1000)
      expect(normal).toBeGreaterThan(ancient * 2)
    }
    const seen = reachable(map)
    for (const p of map.mainClearings!) expect(seen.has(p.z * map.width + p.x), `clearing ${p.x},${p.z}`).toBe(true)
    for (const f of map.darkForests!) {
      expect(f.clearing.length).toBeGreaterThanOrEqual(100)
      expect(seen.has(f.center.z * map.width + f.center.x)).toBe(true)
      const floor = new Set(map.darkForestFloor)
      let entries = 0
      for (let j = 1; j < f.approach.length; j++) {
        const a = f.approach[j - 1], b = f.approach[j]
        if (!floor.has(a.z * map.width + a.x) && floor.has(b.z * map.width + b.x)) entries++
      }
      expect(entries).toBe(1)
    }
    const church = map.buildings.find(b => b.id === HOVEL_ID) ?? map.buildings[0]
    const cx = church.x + Math.floor(church.w / 2), cz = church.z + Math.floor(church.d / 2)
    // The middle of the map is a founding rule; the others can bend it by a few tiles.
    expect(Math.abs(cx - map.width / 2)).toBeLessThanOrEqual(map.width * .3)
    expect(Math.abs(cz - map.depth / 2)).toBeLessThanOrEqual(map.depth * .3)
    const trees = map.tiles.flatMap((t, i) => t === "forest" && Math.hypot(i % map.width - cx, Math.floor(i / map.width) - cz) <= 15 ? [i] : [])
    expect(trees.length).toBeGreaterThanOrEqual(12)
    expect(trees.some(i => [i-1, i+1, i-map.width, i+map.width].some(n => seen.has(n)))).toBe(true)
  }, 90000)

  it("samples the same tile-scale canopy at playable sizes and rectangular extents", () => {
    const settings = { ...DEFAULT_SETTINGS, seed: 1, water: 0 }
    const small = sampleWoodland("cellular", settings, 128, 192, 576)
    const large = sampleWoodland("cellular", settings, 512, 512, 576)
    const ox = small.origin.x - large.origin.x, oz = small.origin.z - large.origin.z
    for (let z = 0; z < 192; z++) for (let x = 0; x < 128; x++) expect(small.tiles[z * 128 + x]).toBe(large.tiles[(z + oz) * 512 + x + ox])
  }, 90000)
})
