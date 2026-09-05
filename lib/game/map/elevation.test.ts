import { describe, expect, it } from "vitest"
import { DEFAULT_ELEVATION, elevationSettings, elevationStep, finishElevation, generateElevation, groundHeight } from "./elevation"
import { drainWater } from "./hydrology"
import { generateMap } from "./generate-map"
import { routeBlind } from "./route"
import type { GameMap } from "./types"

describe("topography", () => {
  it("clamps invalid settings and enforces the +4 ceiling", () => {
    expect(elevationSettings({ maxHeight: 99, scale: NaN, slopeCost: -9 })).toMatchObject({ maxHeight: 4, scale: DEFAULT_ELEVATION.scale, slopeCost: 0 })
  })

  it("has independent seeded noise, smooth hills, cliffs, and asymmetric river cuts", () => {
    const width = 64, depth = 64, water = new Uint8Array(width * depth)
    const flow = new Map<number, readonly [number, number]>()
    for (let z = 0; z < depth; z++) { water[z * width + 32] = 1; flow.set(z * width + 32, [0, 1]) }
    const input = { riverCut: 1, cutFrequency: 1, maxHeight: 4 }
    const e = generateElevation(42, width, depth, water, input, flow)
    expect(e).toEqual(generateElevation(42, width, depth, water, input, flow))
    const flat = generateElevation(42, width, depth, water, { ...input, riverCut: 0 }, flow)
    expect(e.height[32 * width + 31]).toBeGreaterThan(flat.height[32 * width + 31])
    expect(e.height[32 * width + 33]).toBe(0)
    finishElevation(e, width, depth, water, new Array(water.length).fill(-0.05))
    expect(e.height.every((h) => h >= 0 && h <= 4)).toBe(true)
    expect(e.slope.some((s) => s > 0.01 && s < e.settings.cliffThreshold)).toBe(true)
    expect(e.cliffs.some(Boolean)).toBe(true)
  })

  it("shares slope corners across every passable dry edge, including beside cliffs", () => {
    const width = 32, depth = 32, water = new Uint8Array(width * depth)
    const e = generateElevation(15, width, depth, water, { maxHeight: 4, cliffHeight: 2, scale: 8 })
    finishElevation(e, width, depth, water, new Array(water.length).fill(0))
    for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
      const i = z * width + x, c = e.corners
      if (x + 1 < width && Number.isFinite(elevationStep(e, i, i + 1))) {
        expect(c[i * 4 + 1]).toBe(c[(i + 1) * 4]); expect(c[i * 4 + 3]).toBe(c[(i + 1) * 4 + 2])
      }
      if (z + 1 < depth && Number.isFinite(elevationStep(e, i, i + width))) {
        expect(c[i * 4 + 2]).toBe(c[(i + width) * 4]); expect(c[i * 4 + 3]).toBe(c[(i + width) * 4 + 1])
      }
    }
  })

  it("reports carved river-bank cliffs as well as dry cliffs", () => {
    const water = new Uint8Array([0, 1])
    const e = generateElevation(1, 2, 1, water)
    e.height = [1, -1]
    finishElevation(e, 2, 1, water, [0, -0.5])
    expect(e.cliffs).toEqual([1, 2])
  })

  it("routes around a cliff and prefers a flat detour over a climb", () => {
    const water = new Uint8Array(25)
    const e = generateElevation(1, 5, 5, water)
    e.height.fill(0); e.height[12] = 2
    expect(routeBlind({ x: 0, z: 2 }, { x: 4, z: 2 }, 5, 5, new Float64Array(25), e)).not.toContain(12)
    e.height[12] = 0.5
    expect(routeBlind({ x: 0, z: 2 }, { x: 4, z: 2 }, 5, 5, new Float64Array(25), e)).not.toContain(12)
    e.settings = { ...e.settings, slopeCost: 0 }
    expect(routeBlind({ x: 0, z: 2 }, { x: 4, z: 2 }, 5, 5, new Float64Array(25), e)).toContain(12)
    e.height.fill(2, 10, 15)
    expect(routeBlind({ x: 2, z: 0 }, { x: 2, z: 4 }, 5, 5, new Float64Array(25), e)).toEqual([])
  })

  it("drains rivers downhill, keeps lakes level, and classifies waterfalls by drop", () => {
    const kind = new Uint8Array(80).fill(1); kind[0] = 2; kind[1] = 2
    const depths = new Uint8Array(80).fill(2)
    const e = generateElevation(1, 80, 1, kind, { waterfallSpacing: 30 })
    const water = drainWater(kind, depths, 80, 1, e)
    expect(water.surface![0]).toBe(water.surface![1])
    expect(water.motion).toContain("waterfall"); expect(water.motion).toContain("flow")
    for (let i = 0; i < kind.length; i++) {
      expect(e.height[i]).toBeLessThan(water.surface![i])
      expect(water.surface![i]).toBeLessThan(0)
      const n = water.downstream![i]
      if (n >= 0) {
        expect(water.surface![i]).toBeGreaterThanOrEqual(water.surface![n])
        expect(water.drop![i]).toBeCloseTo(water.surface![i] - water.surface![n])
      }
    }
  })

  it("samples the rendered slope triangles and preserves legacy flat maps", () => {
    const e = generateElevation(1, 1, 1, new Uint8Array(1))
    e.corners = [0, 1, 1, 2]
    const map: GameMap = { width: 1, depth: 1, tiles: ["grass"], buildings: [], elevation: e }
    expect(groundHeight(map, 0, 0)).toBeCloseTo(1.2)
    expect(groundHeight(map, -0.5, -0.5)).toBeCloseTo(0.2)
    expect(groundHeight({ ...map, elevation: undefined }, 0, 0)).toBe(0.2)
  })

  it("keeps generated roads, shortcuts, and shrine tracks connected without cliff crossings", () => {
    const cases = [1, 42, 7919, 158381, 221733, 126705].map((seed) => ({ seed }))
    cases.push(...[1, 42].map((seed) => ({ seed, elevation: {
      maxHeight: 4, cliffHeight: 2, cliffThreshold: 0.25, scale: 8,
      detail: 0.5, riverCut: 1, cutFrequency: 1,
    } })))
    for (const options of cases) {
      const { seed } = options
      const map = generateMap(options)
      for (const route of [map.road!, map.site!.branch, ...map.shortcuts!.map((s) => s.tiles)]) {
        expect(route.length, `seed ${seed}`).toBeGreaterThan(1)
        for (let k = 1; k < route.length; k++) {
          const a = route[k - 1], b = route[k], ai = a.z * map.width + a.x, bi = b.z * map.width + b.x
          expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBe(1)
          if (map.tiles[ai] !== "bridge" && map.tiles[bi] !== "bridge") {
            expect(Number.isFinite(elevationStep(map.elevation, ai, bi)), `seed ${seed} at ${ai} → ${bi}`).toBe(true)
          }
        }
      }
      for (let i = 0; i < map.tiles.length; i++) {
        const n = map.water!.downstream![i]
        if (n >= 0) expect(map.water!.surface![i]).toBeGreaterThanOrEqual(map.water!.surface![n])
      }
    }
  }, 30000)
})
