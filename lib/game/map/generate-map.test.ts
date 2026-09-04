import { describe, expect, it } from "vitest"

import { generateMap } from "./generate-map"
import { TERRAIN } from "./terrain"
import { tileAt, type GameMap } from "./types"

/** Enough seeds to catch structural bugs, few enough to stay fast. */
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1)

function countTerrain(map: GameMap, id: string): number {
  return map.tiles.filter((t) => t === id).length
}

/** All path tiles reachable from the west edge, walking 4-connected path only. */
function reachablePath(map: GameMap): Set<string> {
  const seen = new Set<string>()
  const queue: Array<[number, number]> = []
  for (let z = 0; z < map.depth; z++) {
    if (tileAt(map, 0, z) === "path") queue.push([0, z])
  }
  while (queue.length) {
    const [x, z] = queue.pop()!
    const key = `${x},${z}`
    if (seen.has(key) || tileAt(map, x, z) !== "path") continue
    seen.add(key)
    queue.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1])
  }
  return seen
}

describe("generateMap", () => {
  it("is fully determined by its seed", () => {
    const a = generateMap({ seed: 12345 })
    const b = generateMap({ seed: 12345 })
    expect(a.tiles).toEqual(b.tiles)
    expect(a.seed).toBe(12345)
  })

  it("produces different maps for different seeds", () => {
    const a = generateMap({ seed: 1 })
    const b = generateMap({ seed: 2 })
    expect(a.tiles).not.toEqual(b.tiles)
  })

  it("generates no buildings — building is the player's job", () => {
    for (const seed of SEEDS) {
      expect(generateMap({ seed }).buildings).toEqual([])
    }
  })

  it("fills the grid with valid terrain at the requested size", () => {
    const map = generateMap({ seed: 99, width: 24, depth: 40 })
    expect(map.width).toBe(24)
    expect(map.depth).toBe(40)
    expect(map.tiles).toHaveLength(24 * 40)
    expect(map.tiles.every((t) => t in TERRAIN)).toBe(true)
  })

  it("connects the west edge to the east edge with an unbroken road, every seed", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const reached = reachablePath(map)
      expect(reached.size, `seed ${seed} has a road`).toBeGreaterThan(0)

      let reachesEast = false
      for (let z = 0; z < map.depth; z++) {
        if (reached.has(`${map.width - 1},${z}`)) reachesEast = true
      }
      expect(reachesEast, `seed ${seed} road reaches the east edge`).toBe(true)
    }
  })

  it("returns the road as an unbroken ordered walk, west edge to east edge", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const road = map.road!
      expect(road.length, `seed ${seed} has a route`).toBeGreaterThan(0)
      expect(road[0].x, `seed ${seed} starts on the west edge`).toBe(0)
      expect(road[road.length - 1].x, `seed ${seed} ends on the east edge`).toBe(map.width - 1)

      for (let i = 0; i < road.length; i++) {
        expect(tileAt(map, road[i].x, road[i].z), `seed ${seed} route is on path`).toBe("path")
        if (i > 0) {
          const step =
            Math.abs(road[i].x - road[i - 1].x) + Math.abs(road[i].z - road[i - 1].z)
          expect(step, `seed ${seed} step ${i} is to a neighbour`).toBe(1)
        }
      }
    }
  })

  it("grows forests in clusters rather than scattering lone trees", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const forest = countTerrain(map, "forest")
      expect(forest, `seed ${seed} grew forests`).toBeGreaterThanOrEqual(30)

      // Compactness: in a blob, most forest tiles touch other forest tiles.
      let neighbourSum = 0
      for (let z = 0; z < map.depth; z++) {
        for (let x = 0; x < map.width; x++) {
          if (tileAt(map, x, z) !== "forest") continue
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (tileAt(map, x + dx, z + dz) === "forest") neighbourSum++
          }
        }
      }
      expect(neighbourSum / forest, `seed ${seed} forests are clustered`).toBeGreaterThan(1.5)
    }
  })

  it("threads the road through the woods, never blocked by them", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      let pathBesideForest = 0
      for (let z = 0; z < map.depth; z++) {
        for (let x = 0; x < map.width; x++) {
          if (tileAt(map, x, z) !== "path") continue
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (tileAt(map, x + dx, z + dz) === "forest") pathBesideForest++
          }
        }
      }
      // The waypoint routing sends the road through cluster interiors, so
      // carved road with trees alongside must exist on every seed.
      expect(pathBesideForest, `seed ${seed} road passes through forest`).toBeGreaterThan(0)
    }
  })

  it("leaves a generous share of buildable land at default coverage", () => {
    for (const seed of SEEDS) {
      const map = generateMap({ seed })
      const buildable = map.tiles.filter((t) => TERRAIN[t].buildable).length
      expect(buildable / map.tiles.length, `seed ${seed} is buildable`).toBeGreaterThan(0.5)
    }
  })

  it("scales forest area with the coverage knob", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const sparse = generateMap({ seed, forestCoverage: 0.12 })
      const dense = generateMap({ seed, forestCoverage: 0.45 })
      const fraction = (m: GameMap) => countTerrain(m, "forest") / m.tiles.length
      expect(fraction(dense), `seed ${seed} dense > sparse`).toBeGreaterThan(fraction(sparse))
      expect(fraction(dense), `seed ${seed} dense is dense`).toBeGreaterThan(0.3)
      expect(fraction(sparse), `seed ${seed} sparse is sparse`).toBeLessThan(0.25)
    }
  })

  it("scatters small groves when asked, even with zero cluster coverage", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const map = generateMap({ seed, forestCoverage: 0, groveCount: 10 })
      const forest = countTerrain(map, "forest")
      // 10 groves of 2–5 tiles, minus path carving and blob overlap.
      expect(forest, `seed ${seed} has grove trees`).toBeGreaterThanOrEqual(8)
      expect(forest, `seed ${seed} groves stay small`).toBeLessThanOrEqual(50)
    }
  })

  it("keeps the road identical when only forest knobs change", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      // With no clusters there are no waypoints, so the road depends only on
      // its own RNG stream — forest knobs must not disturb it.
      const bare = generateMap({ seed, forestCoverage: 0, groveCount: 0 })
      const grovey = generateMap({ seed, forestCoverage: 0, groveCount: 15 })
      const roadOf = (m: GameMap) =>
        m.tiles.map((t, i) => (t === "path" ? i : -1)).filter((i) => i >= 0)
      expect(roadOf(grovey), `seed ${seed} road is stable`).toEqual(roadOf(bare))
    }
  })
})
