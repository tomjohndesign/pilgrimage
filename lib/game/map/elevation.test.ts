import { describe, expect, it } from "vitest"
import { DEFAULT_ELEVATION, elevationSettings, elevationStep, finishElevation, footprintGrading, generateElevation, groundHeight, levelBuildingGround } from "./elevation"
import { drainWater } from "./hydrology"
import { generateMap } from "./generate-map"
import { routeBlind } from "./route"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./types"
import { walkingSurface } from "./walking-surface"

describe("topography", () => {
  it("keeps already level plots and distant navigation buffers intact", () => {
    const size = 12, count = size * size
    const map: GameMap = { width: size, depth: size, tiles: Array(count).fill("grass"), buildings: [],
      elevation: { settings: DEFAULT_ELEVATION, height: Array(count).fill(0), corners: Array(count * 4).fill(0), slope: Array(count).fill(0), cliffs: Array(count).fill(0) } }
    const plot = { x: 4, z: 4, w: 2, d: 2 }
    expect(levelBuildingGround(map, plot)).toBe(map.elevation)
    map.elevation!.height[4 * size + 4] = .7
    const water = new Uint8Array(count)
    finishElevation(map.elevation!, size, size, water, [])
    const original = structuredClone(map.elevation!)
    const graded = levelBuildingGround(map, plot)!
    const rebuilt = structuredClone(graded)
    finishElevation(rebuilt, size, size, water, [])
    expect(graded.cliffs).toEqual(rebuilt.cliffs)
    expect(graded.slope).toEqual(rebuilt.slope)
    expect(map.elevation).toEqual(original)
    expect(graded.height[0]).toBe(original.height[0])
    expect(graded.corners.slice(0, 4)).toEqual(original.corners.slice(0, 4))
  })

  it.each([1, 42, 7919])("keeps every founding building's floor clear of terrain for seed %i", seed => {
    const map = generateMap({ seed })
    for (const building of map.buildings) {
      const foundation = groundHeight(map, building.x + (building.w - 1) / 2, building.z + (building.d - 1) / 2)
      for (let z = building.z; z < building.z + building.d; z++) for (let x = building.x; x < building.x + building.w; x++) {
        const i = z * map.width + x
        for (const corner of map.elevation!.corners.slice(i * 4, i * 4 + 4)) {
          expect(corner + 0.2, `${building.id} at ${x},${z}`).toBeCloseTo(foundation, 10)
        }
        expect(walkingSurface(map, tileToWorldX(map, x), tileToWorldZ(map, z))).toEqual({ height: foundation, dx: 0, dz: 0 })
      }
    }
  })

  it.each([{ x: 2, z: 2, w: 2, d: 2 }, { x: 0, z: 0, w: 1, d: 1 }, { x: 5, z: 4, w: 3, d: 4 }])(
    "levels the entire building pad and joins its dry perimeter at $x,$z", (building) => {
      const width = 8, depth = 8, water = new Uint8Array(width * depth)
      const elevation = generateElevation(1, width, depth, water)
      elevation.height = elevation.height.map((_, i) => (i % width) * 0.04 + Math.floor(i / width) * 0.03)
      finishElevation(elevation, width, depth, water, [])
      const map: GameMap = { width, depth, tiles: Array(64).fill("grass"), buildings: [], elevation }
      const before = structuredClone(map)
      const foundation = groundHeight(map, building.x + (building.w - 1) / 2, building.z + (building.d - 1) / 2)
      const graded = { ...map, elevation: levelBuildingGround(map, building)! }
      expect(map).toEqual(before)
      for (let z = building.z; z < building.z + building.d; z++) for (let x = building.x; x < building.x + building.w; x++) {
        const i = z * width + x
        for (const corner of graded.elevation.corners.slice(i * 4, i * 4 + 4)) expect(corner + 0.2).toBeCloseTo(foundation)
        expect(graded.elevation.height[i] + 0.2).toBeCloseTo(foundation)
        for (const dx of [-0.49, 0, 0.49]) for (const dz of [-0.49, 0, 0.49]) {
          expect(walkingSurface(graded, tileToWorldX(map, x) + dx, tileToWorldZ(map, z) + dz)).toEqual({ height: foundation, dx: 0, dz: 0 })
        }
      }
      // Every dry neighbour still shares its edge, including all four pad boundaries.
      const c = graded.elevation.corners
      for (let z = 0; z < depth; z++) for (let x = 0; x < width; x++) {
        const i = z * width + x
        if (x + 1 < width) { expect(c[i * 4 + 1]).toBe(c[(i + 1) * 4]); expect(c[i * 4 + 3]).toBe(c[(i + 1) * 4 + 2]) }
        if (z + 1 < depth) { expect(c[i * 4 + 2]).toBe(c[(i + width) * 4]); expect(c[i * 4 + 3]).toBe(c[(i + width) * 4 + 1]) }
      }
      expect(graded.elevation.cliffs.every((mask) => mask === 0)).toBe(true)
      expect(graded.elevation.slope[building.z * width + building.x]).not.toBe(elevation.slope[building.z * width + building.x])
    },
  )

  it("previews the cut, fill and cliff risk of grading a footprint, matching what levelling then does", () => {
    const width = 8, depth = 8, water = new Uint8Array(width * depth)
    const flat: GameMap = { width, depth, tiles: Array(64).fill("grass"), buildings: [] }
    expect(footprintGrading(flat, { x: 2, z: 2, w: 2, d: 2 })).toEqual({ foundation: 0, cut: 0, fill: 0, cliff: false })
    const elevation = generateElevation(1, width, depth, water)
    elevation.height = elevation.height.map((_, i) => (i % width) * 0.1)
    finishElevation(elevation, width, depth, water, [])
    const map: GameMap = { width, depth, tiles: Array(64).fill("grass"), buildings: [], elevation }
    const plot = { x: 2, z: 2, w: 3, d: 2 }
    const grading = footprintGrading(map, plot)
    expect(grading.foundation).toBeCloseTo(0.3)
    // Corners reach half a tile beyond the outer tile centres: 0.1 to the tile, 0.05 more to its corner.
    expect(grading.cut).toBeCloseTo(0.15); expect(grading.fill).toBeCloseTo(0.15); expect(grading.cliff).toBe(false)
    const graded = { ...map, elevation: levelBuildingGround(map, plot)! }
    expect(footprintGrading(graded, plot)).toMatchObject({ foundation: 0.3, cut: 0, fill: 0, cliff: false })
    expect(footprintGrading(graded, plot).cut).toBe(0)
    // The neighbouring column to the east stands 0.7 above the pad once graded: a cliff.
    elevation.height = elevation.height.map((_, i) => (i % width) >= 5 ? 1 : 0.3)
    finishElevation(elevation, width, depth, water, [])
    expect(footprintGrading(map, plot).cliff).toBe(true)
    expect(footprintGrading(map, { ...plot, x: 1 }).cliff).toBe(false)
  })

  it("preserves water, distant terrain, and an existing foundation beside a later purchase", () => {
    const width = 8, depth = 8, water = new Uint8Array(64)
    water[3 * width + 4] = 1
    const elevation = generateElevation(1, width, depth, water)
    elevation.height = elevation.height.map((_, i) => i % width * 0.04)
    elevation.height[3 * width + 4] = -0.5
    const surface = Array(64).fill(-0.1)
    finishElevation(elevation, width, depth, water, surface)
    const map: GameMap = { width, depth, tiles: Array(64).fill("grass"), buildings: [], elevation, water: { depth: Array.from(water), surface, flow: {} } }
    map.tiles[3 * width + 4] = "water"
    // A bridge can extend over dry banks; its land footings must stay dry.
    map.tiles[63] = "bridge"
    surface[63] = -2
    const first = { x: 1, z: 2, w: 2, d: 2, id: "first", label: "First", height: 1, color: "", roofColor: "" }
    const firstMap = { ...map, elevation: levelBuildingGround(map, first)!, buildings: [first] }
    const next = levelBuildingGround(firstMap, { x: 3, z: 2, w: 1, d: 2 })!
    for (const i of [0, 18, 17, 25, 26, 28, 63]) {
      expect(next.corners.slice(i * 4, i * 4 + 4)).toEqual(firstMap.elevation.corners.slice(i * 4, i * 4 + 4))
      expect(next.height[i]).toBe(firstMap.elevation.height[i])
    }
    expect(next.cliffs[63]).toBe(elevation.cliffs[63])
    expect(map.water!.surface).toEqual(surface)
    expect(levelBuildingGround({ ...map, elevation: undefined }, first)).toBeUndefined()
  })

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

  it.each([0, 0.8])("keeps a diagonal river bank continuous with waterfall relief %s", (waterfallDrop) => {
    // Reported seed: the northeast bank alternated between intact ground and
    // deep, straight trenches whenever the river centerline took a grid turn.
    const map = generateMap({ seed: 1995993239, elevation: { waterfallDrop } })
    const e = map.elevation!, water = map.water!, w = map.width
    // The river beside the affected bank is an ordinary flowing reach.
    for (const [x, z] of [[28, 12], [30, 15], [32, 20], [33, 25]]) {
      expect(water.motion![z * w + x]).toBe("flow")
    }
    for (let z = 8; z < 27; z++) for (let x = 35; x < 47; x++) {
      const i = z * w + x
      expect(water.depth[i]).toBe(0)
      for (const n of [i + 1, i + w]) {
        expect(Number.isFinite(elevationStep(e, i, n)), `bank at ${x},${z} → ${n}`).toBe(true)
      }
    }
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
