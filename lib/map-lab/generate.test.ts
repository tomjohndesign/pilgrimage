import { describe, expect, it } from "vitest"
import { TERRAIN } from "../game/map/terrain"
import { makeRng } from "../game/rng"
import { generateWater, WATER_KIND_LAKE, WATER_KIND_RIVER } from "../game/map/water"
import { DEFAULT_SETTINGS, SEED_REGION_SIZE, METHODS, generatePreview, normalizeSettings, seedingMethodForSeed, type Method, type Preview } from "./generate"
import { neighbors } from "../game/map/woodland-details"

const methods = Object.keys(METHODS) as Method[]

/** Independent flood fill: verify every reserved clearing tile, not just its
 * center or the generator's own connectivity statistic. */
function reachable(map: Preview) {
  const seen = new Set<number>(), pending = [map.clearings[0].z * map.size + map.clearings[0].x]
  while (pending.length) {
    const i = pending.pop()!
    if (seen.has(i) || !TERRAIN[map.tiles[i]].passable) continue
    seen.add(i)
    const x = i % map.size, z = Math.floor(i / map.size)
    if (x > 0) pending.push(i - 1)
    if (x < map.size - 1) pending.push(i + 1)
    if (z > 0) pending.push(i - map.size)
    if (z < map.size - 1) pending.push(i + map.size)
  }
  return seen
}

describe("woodland seeding studies", { timeout: 30_000 }, () => {
  it("chooses an accepted woodland style deterministically from the seed", () => {
    expect(seedingMethodForSeed(0)).toBe("groves")
    expect(seedingMethodForSeed(1)).toBe("cellular")
    const choices = Array.from({ length: 128 }, (_, seed) => seedingMethodForSeed(seed))
    expect(new Set(choices)).toEqual(new Set(["groves", "cellular"]))
    for (let seed = 127; seed >= 0; seed--) {
      expect(seedingMethodForSeed(seed)).toBe(choices[seed])
      expect(seedingMethodForSeed(seed + 2 ** 32)).toBe(choices[seed])
    }
  })
  it.each(methods)("%s keeps all clearing interiors walkable across seeds and extremes", method => {
    for (const seed of [0, 1, 7919, 20250805, 4294967295]) {
      for (const extreme of [false, true]) {
        const map = generatePreview(method, { seed, size: 128, ...(extreme ? { forest: 60, darkShare: 14, heart: 12, clearings: 14, corridor: 1, groves: 28 } : {}) })
        const seen = reachable(map)
        expect(map.stats.connected).toBe(map.clearings.length)
        for (const clearing of map.clearings) {
          expect(seen.has(clearing.z * map.size + clearing.x)).toBe(true)
          expect(clearing.tiles.length).toBeGreaterThan(0)
          for (const i of clearing.tiles) expect(seen.has(i)).toBe(true)
        }
        expect(map.routes).toHaveLength(map.clearings.length)
        expect(seen.has(map.church.z * map.size + map.church.x)).toBe(true)
        expect(map.stats.nearbyTrees).toBeGreaterThanOrEqual(24)
        for (const route of map.routes) expect(route.length).toBeGreaterThan(0)
      }
    }
  })

  it("repeats exactly and holds clearing anchors fixed between techniques", () => {
    const maps = methods.map(method => generatePreview(method))
    expect(generatePreview("groves")).toEqual(maps[1])
    for (const map of maps) expect(map.clearings).toEqual(maps[0].clearings)
    expect(new Set(maps.map(map => map.tiles.join(","))).size).toBe(4)
    expect(generatePreview("groves", { seed: 17 }).tiles).not.toEqual(maps[1].tiles)
  })

  it.each(methods)("%s has open meadows, nearby lumber, and substantial dark forests", method => {
    const map = generatePreview(method)
    expect(map.stats.open).toBeGreaterThan(45)
    expect(map.stats.open).toBeLessThan(70)
    expect(map.stats.nearbyTrees).toBeGreaterThanOrEqual(24)
    expect(map.stats.dark).toBeGreaterThan(3)
    expect(map.stats.forest).toBeGreaterThan(map.stats.dark * 2)
    expect(map.clearings.some(c => c.kind === "heart")).toBe(true)
    expect(map.stats.open + map.stats.forest + map.stats.dark + map.stats.water).toBeCloseTo(100)
    for (const heart of map.clearings.filter(c => c.kind === "heart")) {
      // A thick canopy remains in all four directions beyond the open heart,
      // allowing for the narrow entrance cut into it.
      const r = Math.round(heart.radius + 8)
      const probes = [[r, 0], [-r, 0], [0, r], [0, -r]].map(([dx, dz]) => map.tiles[(heart.z + dz) * map.size + heart.x + dx])
      expect(probes.filter(t => t === "darkwood").length).toBeGreaterThanOrEqual(3)
    }
  })

  it("supports no dark forest and the largest square", () => {
    const map = generatePreview("noise", { size: 256, darkCount: 0, groves: 0 })
    expect(map.tiles).toHaveLength(256 ** 2)
    expect(map.stats.dark).toBe(0)
    expect(map.clearings.length).toBeGreaterThan(DEFAULT_SETTINGS.clearings)
    expect(map.stats.connected).toBe(map.clearings.length)
  })

  it("bounds untrusted shared settings", () => {
    expect(normalizeSettings({ size: Infinity, forest: -20, clearings: 1000, seed: -1 })).toEqual({
      ...DEFAULT_SETTINGS, forest: 25, clearings: 14, seed: 4294967295,
    })
  })

  it.each(methods)("%s preserves water, dry plots and accessible starting lumber in wet and dry worlds", method => {
    for (const seed of [1, 7919, 20250805]) for (const water of [0, 25]) {
      const settings = { seed, size: 128, water, rivers: 2, lakes: 2, forest: 25, darkShare: 14, corridor: 5 }
      const map = generatePreview(method, settings), seen = reachable(map)
      const surrounding = generateWater({ rng: makeRng(seed ^ 0x94d049bb), width: SEED_REGION_SIZE, depth: SEED_REGION_SIZE, coverage: water / 100, riverCount: 8, lakeCount: 8, pondCount: 0, landmarkArea: 192 ** 2 }).kind
      const expected = Uint8Array.from({ length: map.size ** 2 }, (_, i) => surrounding[(Math.floor(i / map.size) + map.origin.z) * SEED_REGION_SIZE + i % map.size + map.origin.x])
      expect(map.water.every((kind, i) => kind === expected[i])).toBe(true)
      expect(map.stats.connected).toBe(map.clearings.length)
      expect(seen.has(map.church.z * map.size + map.church.x)).toBe(true)
      let near = 0, harvestable = 0
      for (let i = 0; i < map.tiles.length; i++) {
        expect(map.tiles[i] === "water" || map.tiles[i] === "bridge").toBe(Boolean(expected[i]))
        const x = i % map.size, z = Math.floor(i / map.size)
        if (Math.abs(x - map.church.x) <= 2 && Math.abs(z - map.church.z) <= 2) expect(map.tiles[i]).toBe("grass")
        if (Math.abs(x - map.church.x) <= 8 && Math.abs(z - map.church.z) <= 8 && map.tiles[i] === "forest") {
          near++
          if ([x > 0 ? i - 1 : -1, x < map.size - 1 ? i + 1 : -1, z > 0 ? i - map.size : -1, z < map.size - 1 ? i + map.size : -1].some(n => seen.has(n))) harvestable++
        }
      }
      expect(near).toBeGreaterThanOrEqual(24)
      expect(harvestable).toBeGreaterThan(0)
      expect(map.stats.nearbyTrees).toBe(near)
    }
  })

  it.each(methods)("%s surrounds jagged dark forests with ordinary woods", method => {
    const map = generatePreview(method, { water: 0 })
    const hearts = map.clearings.filter(c => c.kind === "heart")
    const heartTiles = new Set(map.seededTiles.flatMap((tile, i) => tile === "grass" && map.darkFootprint[i] ? [i] : []))
    let outerPerimeter = 0, darkArea = 0
    for (let i = 0; i < map.tiles.length; i++) {
      if (map.tiles[i] !== "darkwood") continue
      darkArea++
      const x = i % map.size, z = Math.floor(i / map.size)
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        if (x + dx < 0 || z + dz < 0 || x + dx >= map.size || z + dz >= map.size) continue
        const n = (z + dz) * map.size + x + dx
        const inHeart = heartTiles.has(n)
        if (!inHeart) expect(map.tiles[n]).not.toBe("grass")
      }
      for (const n of [i - 1, i + 1, i - map.size, i + map.size]) if (map.tiles[n] === "forest") outerPerimeter++
    }
    // Pixel stair-steps alone give circles about 1.27× their smooth perimeter;
    // pronounced inlets and protrusions must go substantially beyond that.
    const equivalentCircles = 2 * Math.sqrt(Math.PI * (darkArea + hearts.reduce((sum, c) => sum + Math.PI * c.radius ** 2, 0)) * hearts.length)
    expect(outerPerimeter / equivalentCircles).toBeGreaterThan(1.5)
  })

  it("shares river/lake seeds across techniques and changes only wind growth when wind turns", () => {
    const maps = methods.map(method => generatePreview(method))
    for (const map of maps) expect(map.water).toEqual(maps[0].water)
    expect(maps[0].water.includes(WATER_KIND_RIVER)).toBe(true)
    expect(maps[0].water.includes(WATER_KIND_LAKE)).toBe(true)
    expect(generatePreview("groves", { wind: 135 }).tiles).not.toEqual(maps[1].tiles)
    expect(generatePreview("cellular", { wind: 135, groves: 28 }).tiles).toEqual(maps[3].tiles)
  })

  it.each(methods)("%s gives each connected dark forest one actual entrance, including wide trails", method => {
    for (const seed of [0, 7919, 20250805]) for (const corridor of [1, 5]) {
      const map = generatePreview(method, { seed, size: 128, corridor, darkShare: 14, water: 25, rivers: 2, lakes: 2 })
      const mainRoutes = map.routes.slice(0, map.clearings.filter(c => c.kind === "main").length)
      for (const route of mainRoutes) expect(route.every(i => !map.darkFootprint[i])).toBe(true)
      for (const route of map.forestAccess) {
        const crossings = route.slice(1).filter((i, n) => Boolean(map.darkFootprint[i]) !== Boolean(map.darkFootprint[route[n]]))
        expect(crossings).toHaveLength(1)
      }
      // Count distinct openings on the FINAL raster. A route graph alone can
      // miss extra doors accidentally opened by a wide trail near a notch.
      const portals = new Set<number>()
      for (let i = 0; i < map.tiles.length; i++) if (map.darkFootprint[i] && TERRAIN[map.tiles[i]].passable
        && neighbors(i, map.size).some(n => !map.darkFootprint[n] && TERRAIN[map.tiles[n]].passable)) portals.add(i)
      let entrances = 0
      while (portals.size) {
        const queue = [portals.values().next().value!]; portals.delete(queue[0]); entrances++
        for (let head = 0; head < queue.length; head++) {
          const x = queue[head] % map.size, z = Math.floor(queue[head] / map.size)
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, nz = z + dz
            if (nx >= 0 && nz >= 0 && nx < map.size && nz < map.size && portals.delete(nz * map.size + nx)) queue.push(nz * map.size + nx)
          }
        }
      }
      expect(entrances, `seed ${seed}, width ${corridor}`).toBe(map.forestAccess.length)
      expect(map.stats.connected).toBe(map.clearings.length)
    }
  })

  it.each(["main", "heart"])("grows asymmetric %s clearings with the requested area, rather than circular holes", kind => {
    const map = generatePreview("groves", { water: 0 })
    const whole = map.clearings.filter(c => c.kind === kind && Math.min(c.x, c.z, map.size - 1 - c.x, map.size - 1 - c.z) > c.radius * 3)
    expect(whole.length).toBeGreaterThan(0)
    for (const heart of whole) {
      expect(heart.tiles.length).toBe(Math.round(Math.PI * heart.radius ** 2))
      const points = heart.tiles.map(i => [i % map.size, Math.floor(i / map.size)])
      const mx = points.reduce((sum, p) => sum + p[0], 0) / points.length, mz = points.reduce((sum, p) => sum + p[1], 0) / points.length
      let xx = 0, zz = 0, xz = 0
      for (const [x, z] of points) { xx += (x - mx) ** 2; zz += (z - mz) ** 2; xz += (x - mx) * (z - mz) }
      const spread = Math.sqrt((xx - zz) ** 2 + 4 * xz * xz)
      // Rotation-independent elongation: a circular stamp is close to 1.
      expect((xx + zz + spread) / (xx + zz - spread)).toBeGreaterThan(2.5)
    }
  })

  it("crops wind groves across every edge and adds tiny irregular patches without meadow halos", () => {
    for (const seed of [0, 1, 7919, 20250805]) {
      const map = generatePreview("groves", { seed })
      for (let side = 0; side < 4; side++) {
        const edge = Array.from({ length: map.size }, (_, n) => side === 0 ? n * map.size : side === 1 ? n * map.size + map.size - 1 : side === 2 ? n : (map.size - 1) * map.size + n)
        expect(edge.filter(i => map.tiles[i] === "forest").length).toBeGreaterThan(5)
        expect(edge.some(i => map.tiles[i] === "grass" || map.tiles[i] === "water")).toBe(true)
      }
      expect(map.stats.tinyGroves).toBeGreaterThan(5)
      const protectedClearings = new Set(map.clearings.flatMap(c => c.tiles))
      for (const cluster of map.saplings) {
        expect(cluster.length).toBeGreaterThanOrEqual(1)
        expect(cluster.length).toBeLessThanOrEqual(8)
        expect(cluster.some(i => protectedClearings.has(i))).toBe(false)
        const reached = new Set([cluster[0]])
        for (const i of reached) for (const n of neighbors(i, map.size)) if (cluster.includes(n)) reached.add(n)
        expect(reached.size).toBe(cluster.length)
      }
      expect(map.saplings.some(cluster => cluster.some(i => neighbors(i, map.size).some(n => map.tiles[n] === "forest" && !cluster.includes(n))))).toBe(true)
    }
  })

  it.each(methods)("%s samples the same terrain at every size without rescaling or reseeding", method => {
    for (const seed of [20250805, 7919]) {
      const large = generatePreview(method, { seed, size: 256 })
      for (const size of [128, 192]) {
        const sample = generatePreview(method, { seed, size }), dx = sample.origin.x - large.origin.x, dz = sample.origin.z - large.origin.z
        let mismatches = 0
        for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
          const a = z * size + x, b = (z + dz) * large.size + x + dx
          if (sample.seededTiles[a] !== large.seededTiles[b] || sample.water[a] !== large.water[b] || sample.darkFootprint[a] !== large.darkFootprint[b]) mismatches++
        }
        expect(mismatches).toBe(0)
        for (const c of sample.clearings) {
          const same = large.clearings.find(other => other.x === c.x + dx && other.z === c.z + dz && other.kind === c.kind)
          if (same) expect(c.radius).toBe(same.radius)
        }
        expect(sample.stats.connected).toBe(sample.clearings.length)
        expect(sample.stats.nearbyTrees).toBeGreaterThanOrEqual(24)
      }
      expect(generatePreview(method, { seed, size: 256 }).seededTiles).toEqual(large.seededTiles)
    }
  })
})
