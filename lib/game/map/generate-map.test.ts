import { describe, expect, it } from "vitest"

import { generateMap } from "./generate-map"
import { TERRAIN } from "./terrain"
import { tileAt, type GameMap } from "./types"

/** Enough seeds to catch structural bugs, few enough to stay fast. */
const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1)

/** Maps are ~50ms each at the 128×128 floor, so suite-wide loops share them. */
const SWEEP_TIMEOUT = 30_000

/** Default-options maps, shared across tests — nothing mutates them. */
const mapCache = new Map<number, GameMap>()
function mapFor(seed: number): GameMap {
  let map = mapCache.get(seed)
  if (!map) {
    map = generateMap({ seed })
    mapCache.set(seed, map)
  }
  return map
}

/** Forced lake-only maps, shared by the lake tests. */
const lakeCache = new Map<number, GameMap>()
function lakeMapFor(seed: number): GameMap {
  let map = lakeCache.get(seed)
  if (!map) {
    map = generateMap({ seed, lakeCount: 1, riverCount: 0, pondCount: 0 })
    lakeCache.set(seed, map)
  }
  return map
}

function countTerrain(map: GameMap, id: string): number {
  return map.tiles.filter((t) => t === id).length
}

/** All road tiles (path or bridge) reachable from the west edge, 4-connected. */
function reachablePath(map: GameMap): Set<string> {
  const seen = new Set<string>()
  const queue: Array<[number, number]> = []
  const isRoad = (x: number, z: number) => {
    const t = tileAt(map, x, z)
    return t === "path" || t === "bridge"
  }
  for (let z = 0; z < map.depth; z++) {
    if (isRoad(0, z)) queue.push([0, z])
  }
  while (queue.length) {
    const [x, z] = queue.pop()!
    const key = `${x},${z}`
    if (seen.has(key) || !isRoad(x, z)) continue
    seen.add(key)
    queue.push([x + 1, z], [x - 1, z], [x, z + 1], [x, z - 1])
  }
  return seen
}

function roadReachesEast(map: GameMap): boolean {
  const reached = reachablePath(map)
  for (let z = 0; z < map.depth; z++) {
    if (reached.has(`${map.width - 1},${z}`)) return true
  }
  return false
}

/** True for tiles that carry water — bridges keep the water beneath them. */
function carriesWater(map: GameMap, x: number, z: number): boolean {
  const t = tileAt(map, x, z)
  return t === "water" || t === "bridge"
}

/** 4-connected components of water-carrying tiles, as index lists. */
function waterBodies(map: GameMap): number[][] {
  const seen = new Set<number>()
  const bodies: number[][] = []
  for (let z = 0; z < map.depth; z++) {
    for (let x = 0; x < map.width; x++) {
      const start = z * map.width + x
      if (seen.has(start) || !carriesWater(map, x, z)) continue
      const body = [start]
      seen.add(start)
      for (let q = 0; q < body.length; q++) {
        const bx = body[q] % map.width
        const bz = Math.floor(body[q] / map.width)
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = bx + dx
          const nz = bz + dz
          const n = nz * map.width + nx
          if (carriesWater(map, nx, nz) && !seen.has(n)) {
            seen.add(n)
            body.push(n)
          }
        }
      }
      bodies.push(body)
    }
  }
  return bodies
}

describe("generateMap", () => {
  it("is fully determined by its seed", () => {
    const a = generateMap({ seed: 12345 })
    const b = generateMap({ seed: 12345 })
    expect(a.tiles).toEqual(b.tiles)
    expect(a.water).toEqual(b.water)
    expect(a.seed).toBe(12345)
  })

  it("produces different maps for different seeds", () => {
    expect(mapFor(1).tiles).not.toEqual(mapFor(2).tiles)
  })

  it("generates no buildings — building is the player's job", () => {
    for (const seed of SEEDS) {
      expect(mapFor(seed).buildings).toEqual([])
    }
  }, SWEEP_TIMEOUT)

  it("fills the grid with valid terrain, never smaller than 128 a side", () => {
    const map = generateMap({ seed: 99, width: 160, depth: 192 })
    expect(map.width).toBe(160)
    expect(map.depth).toBe(192)
    expect(map.tiles).toHaveLength(160 * 192)
    expect(map.tiles.every((t) => t in TERRAIN)).toBe(true)

    // Requests below the floor clamp up — 128×128 is the absolute minimum.
    const small = generateMap({ seed: 99, width: 24, depth: 40 })
    expect(small.width).toBe(128)
    expect(small.depth).toBe(128)
    expect(small.tiles).toHaveLength(128 * 128)
  }, SWEEP_TIMEOUT)

  it("connects the west edge to the east edge with an unbroken road, every seed", () => {
    for (const seed of SEEDS) {
      expect(roadReachesEast(mapFor(seed)), `seed ${seed} road reaches the east edge`).toBe(true)
    }
  }, SWEEP_TIMEOUT)

  it("grows forests in clusters rather than scattering lone trees", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
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
  }, SWEEP_TIMEOUT)

  it("threads the road through the woods, never blocked by them", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
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
  }, SWEEP_TIMEOUT)

  it("leaves a generous share of buildable land at default coverage", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const buildable = map.tiles.filter((t) => TERRAIN[t].buildable).length
      expect(buildable / map.tiles.length, `seed ${seed} is buildable`).toBeGreaterThan(0.5)
    }
  }, SWEEP_TIMEOUT)

  it("scales forest area with the coverage knob", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const sparse = generateMap({ seed, forestCoverage: 0.12 })
      const dense = generateMap({ seed, forestCoverage: 0.45 })
      const fraction = (m: GameMap) => countTerrain(m, "forest") / m.tiles.length
      expect(fraction(dense), `seed ${seed} dense > sparse`).toBeGreaterThan(fraction(sparse))
      expect(fraction(dense), `seed ${seed} dense is dense`).toBeGreaterThan(0.3)
      expect(fraction(sparse), `seed ${seed} sparse is sparse`).toBeLessThan(0.25)
    }
  }, SWEEP_TIMEOUT)

  it("scatters small groves when asked, even with zero cluster coverage", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const map = generateMap({ seed, forestCoverage: 0, groveCount: 10 })
      const forest = countTerrain(map, "forest")
      // 10 groves of 2–5 tiles, minus path carving and blob overlap.
      expect(forest, `seed ${seed} has grove trees`).toBeGreaterThanOrEqual(8)
      expect(forest, `seed ${seed} groves stay small`).toBeLessThanOrEqual(50)
    }
  }, SWEEP_TIMEOUT)

  it("generates no water when the coverage knob is zero", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const map = generateMap({ seed, waterCoverage: 0 })
      expect(countTerrain(map, "water"), `seed ${seed} has no water`).toBe(0)
      expect(countTerrain(map, "sand"), `seed ${seed} has no beaches`).toBe(0)
      expect(countTerrain(map, "bridge"), `seed ${seed} has no bridges`).toBe(0)
    }
  }, SWEEP_TIMEOUT)

  it("keeps water from dominating the map", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const wet = map.tiles.filter((t) => t === "water" || t === "bridge").length
      expect(wet / map.tiles.length, `seed ${seed} water stays modest`).toBeLessThan(0.16)
    }
  }, SWEEP_TIMEOUT)

  it("never leaves a water body smaller than 10 tiles", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      for (const body of waterBodies(map)) {
        expect(body.length, `seed ${seed} body size`).toBeGreaterThanOrEqual(10)
      }
    }
  }, SWEEP_TIMEOUT)

  it("ends every river at a map edge or a lake — no inland dead-ends", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      for (const body of waterBodies(map)) {
        // A body with flowing tiles contains river; it must either touch the
        // map edge or include still (lake) water.
        const hasRiver = body.some((i) => map.water!.flow[i])
        if (!hasRiver) continue
        const touchesEdge = body.some((i) => {
          const x = i % map.width
          const z = Math.floor(i / map.width)
          return x === 0 || z === 0 || x === map.width - 1 || z === map.depth - 1
        })
        const hasLake = body.some(
          (i) => !map.water!.flow[i] && map.tiles[i] === "water",
        )
        expect(touchesEdge || hasLake, `seed ${seed} river ends legally`).toBe(true)
      }
    }
  }, SWEEP_TIMEOUT)

  it("assigns every water tile a depth from 1 (shore) to 3 (deep)", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const water = map.water!
      // One aggregated assertion per seed — per-tile expect() calls at this
      // map size are what used to blow the test budget.
      let landWithDepth = 0
      let outOfRange = 0
      let deepShore = 0
      for (let z = 0; z < map.depth; z++) {
        for (let x = 0; x < map.width; x++) {
          const i = z * map.width + x
          if (!carriesWater(map, x, z)) {
            if (water.depth[i] !== 0) landWithDepth++
            continue
          }
          if (water.depth[i] < 1 || water.depth[i] > 3) outOfRange++
          const touchesLand = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => {
            const t = tileAt(map, x + dx, z + dz)
            return t !== null && !carriesWater(map, x + dx, z + dz)
          })
          if (touchesLand && water.depth[i] !== 1) deepShore++
        }
      }
      expect({ landWithDepth, outOfRange, deepShore }, `seed ${seed} depth field`).toEqual({
        landWithDepth: 0,
        outOfRange: 0,
        deepShore: 0,
      })
    }
  }, SWEEP_TIMEOUT)

  it("flows every river tile in a cardinal direction", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      for (const [key, dir] of Object.entries(map.water!.flow)) {
        const i = Number(key)
        expect(carriesWater(map, i % map.width, Math.floor(i / map.width))).toBe(true)
        expect(Math.abs(dir[0]) + Math.abs(dir[1]), `seed ${seed} unit flow`).toBe(1)
      }
    }
  }, SWEEP_TIMEOUT)

  it("builds bridges that are short, straight, and over river water only", () => {
    for (const seed of SEEDS) {
      const map = mapFor(seed)
      const bridges = new Set<number>()
      map.tiles.forEach((t, i) => {
        if (t === "bridge") bridges.add(i)
      })
      // Group bridge tiles into 4-connected components.
      const seen = new Set<number>()
      for (const start of bridges) {
        if (seen.has(start)) continue
        const span = [start]
        seen.add(start)
        for (let q = 0; q < span.length; q++) {
          for (const step of [1, -1, map.width, -map.width]) {
            const n = span[q] + step
            if (bridges.has(n) && !seen.has(n)) {
              seen.add(n)
              span.push(n)
            }
          }
        }
        expect(span.length, `seed ${seed} bridge span`).toBeLessThanOrEqual(5)
        const xs = new Set(span.map((i) => i % map.width))
        const zs = new Set(span.map((i) => Math.floor(i / map.width)))
        expect(Math.min(xs.size, zs.size), `seed ${seed} bridge is straight`).toBe(1)
        for (const i of span) {
          expect(map.water!.flow[i], `seed ${seed} bridge sits over a river`).toBeDefined()
        }
      }
    }
  }, SWEEP_TIMEOUT)

  it("grows lakes big enough to be landmarks", () => {
    let bigEnough = 0
    const sample = SEEDS.slice(0, 15)
    for (const seed of sample) {
      const map = lakeMapFor(seed)
      const still = waterBodies(map)
        .map((body) => body.filter((i) => map.tiles[i] === "water" && !map.water!.flow[i]).length)
        .reduce((a, b) => Math.max(a, b), 0)
      // Lakes target 2.5–4.5% of the map; growth can stall, so allow slack.
      if (still >= map.tiles.length * 0.015) bigEnough++
    }
    expect(bigEnough).toBeGreaterThanOrEqual(Math.ceil(sample.length * 0.8))
  }, SWEEP_TIMEOUT)

  it("rings lakes with sand beaches", () => {
    let lakeSeeds = 0
    for (const seed of SEEDS.slice(0, 20)) {
      const map = lakeMapFor(seed)
      const lakeTiles = map.tiles.filter(
        (t, i) => t === "water" && !map.water!.flow[i],
      ).length
      if (lakeTiles === 0) continue
      lakeSeeds++
      expect(countTerrain(map, "sand"), `seed ${seed} lake has a beach`).toBeGreaterThan(0)
      // Every remaining sand tile sits within the two-ring beach band of some
      // water (the road may pave parts of the band over).
      let strandedSand = 0
      for (let z = 0; z < map.depth; z++) {
        for (let x = 0; x < map.width; x++) {
          if (tileAt(map, x, z) !== "sand") continue
          let nearWater = false
          for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
              const i = (z + dz) * map.width + (x + dx)
              if (tileAt(map, x + dx, z + dz) !== null && map.water!.depth[i] > 0) {
                nearWater = true
              }
            }
          }
          if (!nearWater) strandedSand++
        }
      }
      expect(strandedSand, `seed ${seed} sand stays near water`).toBe(0)
    }
    expect(lakeSeeds, "forced lakes actually generate").toBeGreaterThan(16)
  }, SWEEP_TIMEOUT)

  it("deposits sand bars on the inside of river bends", () => {
    let seedsWithBars = 0
    const sample = SEEDS.slice(0, 15)
    for (const seed of sample) {
      const map = generateMap({ seed, riverCount: 1, lakeCount: 0, pondCount: 0 })
      // With no lakes there are no beach rings, so any sand is a point bar —
      // and every bar must hug the river.
      let bars = 0
      let stranded = 0
      for (let z = 0; z < map.depth; z++) {
        for (let x = 0; x < map.width; x++) {
          if (tileAt(map, x, z) !== "sand") continue
          bars++
          let hugsRiver = false
          for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
              const i = (z + dz) * map.width + (x + dx)
              if (tileAt(map, x + dx, z + dz) !== null && map.water!.depth[i] > 0) {
                hugsRiver = true
              }
            }
          }
          if (!hugsRiver) stranded++
        }
      }
      if (bars > 0) seedsWithBars++
      expect(stranded, `seed ${seed} bars hug the river`).toBe(0)
    }
    // Wandering rivers bend constantly; nearly every seed should deposit bars.
    expect(seedsWithBars).toBeGreaterThanOrEqual(Math.ceil(sample.length * 0.8))
  }, SWEEP_TIMEOUT)

  it("keeps the road connected across forced rivers", () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const map = generateMap({ seed, riverCount: 2 })
      expect(roadReachesEast(map), `seed ${seed} road crosses the rivers`).toBe(true)
    }
  }, SWEEP_TIMEOUT)

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
  }, SWEEP_TIMEOUT)
})
