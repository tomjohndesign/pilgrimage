import { describe, expect, it } from "vitest"
import { bridgeLayout } from "../map/bridges"
import { generateMap } from "../map/generate-map"
import { parseAsciiMap } from "../map/prototype-map"
import { worldToTileX, worldToTileZ, type GameMap } from "../map/types"
import { ELEMENT_RADIUS, ENVIRONMENT_KINDS, generateElement } from "./elements"
import { environmentSpacing, placeEnvironment } from "./placement"

const meadow = (seed: number): GameMap => ({
  ...parseAsciiMap(Array(64).fill(".".repeat(64))), seed,
})

describe("environment dressing", () => {
  it("reproduces the seed, varies between seeds, and leaves most meadow empty", () => {
    const map = meadow(42)
    const before = structuredClone(map)
    const placements = placeEnvironment(map)
    expect(placeEnvironment(map)).toEqual(placements)
    expect(placeEnvironment(meadow(43))).not.toEqual(placements)
    expect(map).toEqual(before)
    expect(placements.length).toBeGreaterThan(map.tiles.length * 0.04)
    const occupied = new Set(placements.map((p) => worldToTileZ(map, p.z) * map.width + worldToTileX(map, p.x)))
    expect(occupied.size).toBeLessThan(map.tiles.length * 0.25)
    expect(new Set(placements.map((p) => p.kind))).toEqual(new Set(ENVIRONMENT_KINDS))
  })

  it("keeps full footprints on open land and away from buildings and raised bridge approaches", () => {
    const violations: string[] = []
    for (const seed of [0, 42, 20250805]) {
      const map = generateMap({ seed, width: 64, depth: 64 })
      const rise = bridgeLayout(map).rise
      for (const p of placeEnvironment(map)) {
        const radius = ELEMENT_RADIUS * p.scale
        // Every intersected tile, not just the center: patches cross tile edges.
        for (let z = worldToTileZ(map, p.z - radius); z <= worldToTileZ(map, p.z + radius); z++) {
          for (let x = worldToTileX(map, p.x - radius); x <= worldToTileX(map, p.x + radius); x++) {
            const terrain = map.tiles[z * map.width + x]
            const outside = x < 0 || z < 0 || x >= map.width || z >= map.depth
            const occupied = map.buildings.some((b) => x >= b.x - 1 && x < b.x + b.w + 1 && z >= b.z - 1 && z < b.z + b.d + 1)
            if (outside || occupied || rise[z * map.width + x] > 0 || !["grass", "clearing", "hills", "dirt", "sand"].includes(terrain)) {
              violations.push(`Seed ${seed}: ${p.kind} overlaps ${terrain} at ${x},${z}`)
            }
          }
        }
      }
    }
    expect(violations).toEqual([])
  })

  it("leaves breathing room between neighboring clusters", () => {
    const placements = placeEnvironment(meadow(11))
    for (let i = 0; i < placements.length; i++) {
      for (let j = i + 1; j < placements.length; j++) {
        const a = placements[i]
        const b = placements[j]
        const distance = Math.hypot(a.x - b.x, a.z - b.z)
        // All possible exclusion radii are below two tiles.
        if (distance >= 2) continue
        expect(distance).toBeGreaterThanOrEqual(environmentSpacing(a, b))
      }
    }
  })

  it("grows connected grass patches across several tiles and groups boulders", () => {
    const map = meadow(42)
    const placements = placeEnvironment(map)
    const grass = placements.filter((p) => p.kind === "grass")
    const connected = grass.filter((a) => grass.some((b) => a !== b && a.cluster === b.cluster && Math.hypot(a.x - b.x, a.z - b.z) < 1))
    expect(connected.length).toBeGreaterThan(grass.length * 0.8)
    const patches = new Map<number, typeof grass>()
    for (const p of grass) patches.set(p.cluster!, [...(patches.get(p.cluster!) ?? []), p])
    const broad = [...patches.values()].filter((patch) => {
      const tiles = new Set(patch.map((p) => worldToTileZ(map, p.z) * map.width + worldToTileX(map, p.x)))
      const span = Math.max(...patch.map((p) => p.x)) - Math.min(...patch.map((p) => p.x))
      return tiles.size >= 4 && span > 2
    })
    expect(broad.length).toBeGreaterThan(patches.size * 0.5)

    const hills = { ...map, tiles: map.tiles.map(() => "hills" as const) }
    const boulders = placeEnvironment(hills).filter((p) => p.kind === "boulder")
    const grouped = boulders.filter((a) => boulders.some((b) => a !== b && a.cluster === b.cluster))
    expect(grouped.length).toBeGreaterThan(boulders.length * 0.5)
    expect(grouped.length).toBeLessThan(boulders.length)
    expect(placements.filter((p) => p.kind === "wildflowers").length).toBeGreaterThan(10)
  })

  it("keeps generated silhouettes inside the footprint used by placement", () => {
    for (const kind of ENVIRONMENT_KINDS) {
      for (let seed = 0; seed < 100; seed++) {
        const parts = generateElement(kind, seed)
        expect(parts.length).toBeGreaterThan(0)
        for (const p of parts) {
          expect(Math.hypot(p.x, p.z) + Math.max(p.rx, p.rz)).toBeLessThanOrEqual(ELEMENT_RADIUS)
          expect(p.ry).toBeGreaterThan(0)
        }
      }
    }
  })

  it("handles maps without eligible land", () => {
    expect(placeEnvironment(parseAsciiMap(["FFFF", "D~~D", "=--="]))).toEqual([])
  })
})
