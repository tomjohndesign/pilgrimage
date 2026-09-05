import { expect, it } from "vitest"
import { generateElevation } from "./elevation"
import { gradeBridgeApproaches, taperRiverBanks } from "./river-banks"
import { bridgeLayout, ropeDeckHeight, ropeHeightAt, BRIDGE_RISE } from "./bridges"
import { parseAsciiMap } from "./prototype-map"
import { TILE_HEIGHT } from "./terrain"

it("tapers one bank to a deep river while preserving the opposite cliff and the water level", () => {
  const width = 64, depth = 32, kind = new Uint8Array(width * depth)
  const flow = new Map<number, readonly [number, number]>()
  for (let z = 0; z < depth; z++) { kind[z * width + 32] = 1; flow.set(z * width + 32, [0, 1]) }
  const elevation = generateElevation(1, width, depth, kind, { cutFrequency: 1 })
  elevation.height.fill(1)
  const surface = Array.from(kind, (k) => k ? -2 : 0)
  const water = { depth: Array.from(kind), surface, flow: Object.fromEntries(flow) }
  taperRiverBanks(elevation, width, depth, kind, water, flow)
  const row = 16 * width
  expect(elevation.height[row + 31]).toBe(1)
  expect(elevation.height[row + 33]).toBeLessThan(-1.9)
  expect(elevation.height[row + 63]).toBeCloseTo(1)
  for (let x = 34; x < width; x++) {
    const delta = elevation.height[row + x] - elevation.height[row + x - 1]
    expect(delta).toBeGreaterThanOrEqual(0)
    expect(delta).toBeLessThanOrEqual(elevation.settings.bankSlope)
  }
  expect(surface[row + 32]).toBe(-2)
})

it("feathers bridge abutments into both raised and lowered land without new cliffs", () => {
  const kind = new Uint8Array(31), e = generateElevation(1, 31, 1, kind)
  e.height = Array.from({ length: 31 }, (_, x) => x / 10 - 1.5)
  gradeBridgeApproaches(e, 31, 1, kind, [5, 25])
  expect(e.height[5]).toBe(0); expect(e.height[25]).toBe(0)
  for (let i = 1; i < 31; i++) expect(Math.abs(e.height[i] - e.height[i - 1])).toBeLessThanOrEqual(0.180001)
})

it("uses sagging rope decks over canyons, with level anchors and clearance above water", () => {
  const map = parseAsciiMap(["==#####=="])
  map.water = { depth: [0, 0, 1, 1, 1, 1, 1, 0, 0], surface: [0, 0, -2, -2, -2, -2, -2, 0, 0], flow: {} }
  const span = bridgeLayout(map).spans[0]
  expect(span.ropeSag).toBeGreaterThan(0)
  expect(ropeDeckHeight(span, -2.5)).toBe(TILE_HEIGHT + BRIDGE_RISE)
  expect(ropeDeckHeight(span, 2.5)).toBe(TILE_HEIGHT + BRIDGE_RISE)
  expect(ropeHeightAt(map, 4, 0)).toBeLessThan(ropeHeightAt(map, 2, 0)!)
  expect(ropeHeightAt(map, 4, 0)).toBeGreaterThan(TILE_HEIGHT - 2 + 0.16)
  expect(ropeHeightAt(map, 3.25, 0)).toBeCloseTo(ropeDeckHeight(span, -0.75))
  const flat = parseAsciiMap(["==#####=="])
  expect(bridgeLayout(flat).spans[0].ropeSag).toBeUndefined()
})

it("gives a deep lake gentle shores and a deposited shelf while preserving its level", () => {
  const width = 64, kind = new Uint8Array(width * width)
  for (let z = 20; z < 44; z++) for (let x = 20; x < 44; x++) kind[z * width + x] = 2
  const e = generateElevation(8, width, width, kind, { lakeCliffs: 0 })
  e.height.fill(1)
  const water = { surface: Array.from(kind, k => k ? -2 : 0), depth: Array.from(kind, k => k ? 3 : 0), flow: {} }
  taperRiverBanks(e, width, width, kind, water, new Map(), 8)
  for (let z = 20; z < 44; z++) {
    expect(e.height[z * width + 19]).toBeLessThan(-1.9)
    expect(e.height[z * width + 44]).toBeLessThan(-1.9)
  }
  for (let x = 1; x < 20; x++) expect(Math.abs(e.height[32 * width + x] - e.height[32 * width + x - 1])).toBeLessThan(0.17)
  expect(water.depth[32 * width + 20]).toBe(1)
  expect(water.depth[32 * width + 22]).toBe(1)
  expect(water.depth[32 * width + 32]).toBe(3)
  expect(water.surface[32 * width + 32]).toBe(-2)
  expect(e.height[32 * width + 20]).toBe(-2.4)
})

it("breaks up river cut walls while retaining a consistently low opposite bank", () => {
  const width = 64, kind = new Uint8Array(width * width), flow = new Map<number, readonly [number, number]>()
  for (let z = 0; z < width; z++) { kind[z * width + 32] = 1; flow.set(z * width + 32, [0, 1]) }
  const e = generateElevation(9, width, width, kind)
  e.height.fill(1)
  const water = { surface: Array.from(kind, k => k ? -2 : 0), depth: Array.from(kind), flow: Object.fromEntries(flow) }
  taperRiverBanks(e, width, width, kind, water, flow, 9)
  const cut = Array.from({ length: width }, (_, z) => e.height[z * width + 31])
  expect(Math.max(...cut) - Math.min(...cut)).toBeGreaterThan(1)
  expect(cut.some(h => h > -0.5)).toBe(true)
  expect(cut.some(h => h < -1.9)).toBe(true)
  for (let z = 0; z < width; z++) expect(e.height[z * width + 33]).toBeLessThan(-1.9)
})

it("retains occasional lake cliffs among mostly eroded shoreline across seeds", () => {
  const width = 64, kind = new Uint8Array(width * width)
  for (let z = 16; z < 48; z++) for (let x = 16; x < 48; x++) kind[z * width + x] = 2
  let cliffs = 0, shore = 0
  for (const seed of [1, 8, 29]) {
    const e = generateElevation(seed, width, width, kind)
    e.height.fill(1)
    const water = { surface: Array.from(kind, k => k ? -2 : 0), depth: Array.from(kind, k => k ? 3 : 0), flow: {} }
    taperRiverBanks(e, width, width, kind, water, new Map(), seed)
    for (let k = 16; k < 48; k++) for (const i of [k * width + 15, k * width + 48, 15 * width + k, 48 * width + k]) {
      shore++
      if (e.height[i] + 2 >= e.settings.cliffThreshold) cliffs++
    }
  }
  expect(cliffs).toBeGreaterThan(0)
  expect(cliffs / shore).toBeLessThan(0.3)
})
