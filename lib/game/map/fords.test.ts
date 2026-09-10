import { describe, expect, it } from "vitest"
import { FORD_DEPTH, FORD_SPEED, seedFords, seedRiverShallows } from "./fords"
import { bridgeLayout, surfaceHeight } from "./bridges"
import { parseAsciiMap } from "./prototype-map"
import { DEFAULT_ELEVATION, elevationStep, finishElevation } from "./elevation"
import { generateMap } from "./generate-map"
import { isWaterTerrain, TILE_HEIGHT } from "./terrain"
import { walkingSurface } from "./walking-surface"
import { tileToWorldX, tileToWorldZ } from "./types"
import { settlementRoute } from "../settlement-route"
import { createSim, stepSim } from "../sim"
import { generateTravelers, TRAVELER_TYPES } from "../travelers"
import { alignCart } from "../transport/follow"
import { convoyClear } from "../transport/navigation"
import { cartOffset } from "../transport/assets"

function crossing(seed = 1) {
  const map = parseAsciiMap([
    "......~~~......", "......~~~......", "......~~~......",
    "======###======",
    "......~~~......", "......~~~......", "......~~~......",
  ])
  map.seed = seed
  map.road = Array.from({ length: map.width }, (_, x) => ({ x, z: 3 }))
  const wet = map.tiles.map(isWaterTerrain)
  map.water = { depth: wet.map(w => w ? 2 : 0), surface: wet.map(w => w ? -0.2 : 0),
    flow: Object.fromEntries(wet.flatMap((w, i) => w ? [[i, [0, 1]]] : [])),
    motion: wet.map(w => w ? "flow" : "still") }
  map.elevation = { settings: { ...DEFAULT_ELEVATION }, height: wet.map(w => w ? -1 : 0),
    corners: [], cliffs: [], slope: [] }
  return map
}

function finish(map: ReturnType<typeof crossing>) {
  finishElevation(map.elevation!, map.width, map.depth, Uint8Array.from(map.tiles.map(t => +isWaterTerrain(t))), map.water!.surface!)
  return map
}

describe("shallow river fords", () => {
  it("scatters small natural patches along riverbanks without a road", () => {
    const map = parseAsciiMap(Array(64).fill("........~~~~~........"))
    map.seed = 7919
    map.water = { depth: map.tiles.map((t, i) => t !== "water" ? 0 : i % map.width === 8 || i % map.width === 12 ? 1 : 3),
      surface: map.tiles.map(t => t === "water" ? -0.2 : 0),
      flow: Object.fromEntries(map.tiles.flatMap((t, i) => t === "water" ? [[i, [0, 1]]] : [])) }
    map.elevation = { settings: { ...DEFAULT_ELEVATION }, height: map.tiles.map(t => t === "water" ? -0.6 : -0.15), corners: [], cliffs: [], slope: [] }
    const copy = structuredClone(map), water = structuredClone(map.water)
    seedRiverShallows(map)
    seedRiverShallows(copy)
    expect(map).toEqual(copy)
    const shallows = map.tiles.flatMap((t, i) => t === "ford" ? [i] : [])
    expect(shallows.length).toBeGreaterThan(3)
    expect(shallows.length).toBeLessThan(64 * 5 * 0.15)
    for (const i of shallows) {
      expect([8, 12]).toContain(i % map.width)
      expect([map.tiles[i - map.width], map.tiles[i + map.width]]).toContain("ford")
    }
    for (let z = 0; z < map.depth; z++) expect(map.tiles[z * map.width + 10]).toBe("water")
    expect(map.water.surface).toEqual(water.surface)
    expect(map.water.flow).toEqual(water.flow)
    expect(map.road).toBeUndefined()
  })

  it("seeds both natural fords and occasional old bridges without changing flow", () => {
    let fords = 0, bridges = 0
    for (let seed = 1; seed <= 30; seed++) {
      const map = crossing(seed), flow = structuredClone(map.water!.flow), surface = [...map.water!.surface!]
      seedFords(map, bridgeLayout({ ...map }).spans)
      finish(map)
      expect(map.water!.flow).toEqual(flow)
      expect(map.water!.surface).toEqual(surface)
      if (map.tiles[3 * map.width + 7] === "ford") {
        fords++
        expect(bridgeLayout(map).spans).toHaveLength(0)
        expect(settlementRoute(map, [], { x: 3, z: 3 }, { x: 11, z: 3 })).not.toBeNull()
        for (let x = 5; x <= 9; x++) expect(elevationStep(map.elevation, 3 * map.width + x - 1, 3 * map.width + x)).toBeLessThan(Infinity)
        expect(settlementRoute(map, [], { x: 5, z: 0 }, { x: 9, z: 0 })?.some(p => map.tiles[p.z * map.width + p.x] === "ford")).toBe(true)
        for (const z of [2, 3, 4]) for (let x = 6; x <= 8; x++)
          expect(map.tiles[z * map.width + x]).toBe("ford")
        for (let x = 6; x <= 8; x++) {
          const i = 3 * map.width + x, height = TILE_HEIGHT + surface[i] - FORD_DEPTH
          expect(map.water!.depth[i]).toBe(1)
          expect(map.elevation!.height[i]).toBeCloseTo(surface[i] - FORD_DEPTH)
          expect(surfaceHeight(map, x, 3)).toBeCloseTo(height)
          expect(walkingSurface(map, tileToWorldX(map, x), tileToWorldZ(map, 3)).height).toBeCloseTo(height)
        }
      } else bridges++
    }
    expect(fords).toBeGreaterThan(bridges)
    expect(bridges).toBeGreaterThan(0)
  })

  it.each(["waterfall", "lake"])("does not turn a %s into a ford", kind => {
    const map = crossing()
    if (kind === "waterfall") map.water!.motion![3 * map.width + 7] = "waterfall"
    else map.water!.flow = {}
    seedFords(map, bridgeLayout({ ...map }).spans)
    expect(map.tiles).not.toContain("ford")
  })

  it.each(["hand", "donkey", "horse"] as const)("lets a %s cart cross the shallows, but not the adjacent deep water", puller => {
    const map = crossing()
    map.tiles = map.tiles.map(t => t === "bridge" ? "ford" : t)
    finish(map)
    const pose = alignCart({ x: tileToWorldX(map, 8), z: tileToWorldZ(map, 3) }, Math.PI / 2, -cartOffset(puller) * 1.5)
    expect(convoyClear(map, pose, puller, 1.5)).toBe(true)
    const deep = alignCart({ x: pose.hitch.x, z: tileToWorldZ(map, 1) }, Math.PI / 2, -cartOffset(puller) * 1.5)
    expect(convoyClear(map, deep, puller, 1.5)).toBe(false)
  })

  it("slows a traveler in the ford and restores their pace on the bank", () => {
    const map = crossing()
    map.tiles = map.tiles.map(t => t === "bridge" ? "ford" : t)
    finish(map)
    const traveler = generateTravelers(1, 1)[0]
    traveler.type = TRAVELER_TYPES.pilgrim; traveler.offset = 7 / 14; traveler.direction = 1; traveler.pace = 1
    traveler.attributes.hunger = traveler.attributes.thirst = traveler.attributes.stamina = 100
    const sim = createSim([traveler], map, []), s = sim.travelers.get(traveler.id)!
    stepSim(sim, [traveler], map, 1, 0.1)
    const wetSpeed = s.moveSpeed
    expect(s.progress).toBeGreaterThan(7)
    s.progress = 11; s.x = tileToWorldX(map, 11); s.z = tileToWorldZ(map, 3)
    stepSim(sim, [traveler], map, 1, 0.1)
    expect(wetSpeed / s.moveSpeed).toBeCloseTo(FORD_SPEED)
  })

  it("keeps generated river crossings connected with shallow beds", () => {
    let count = 0
    for (const seed of [1, 7919, 12345, 23758]) {
      const map = generateMap({ seed, width: 128, depth: 128, riverCount: 2, lakeCount: 0, pondCount: 0 })
      for (let i = 0; i < map.tiles.length; i++) if (map.tiles[i] === "ford") {
        count++
        expect(map.water!.flow[i]).toBeDefined()
        expect(map.water!.depth[i]).toBe(1)
        expect(map.water!.motion![i]).not.toBe("waterfall")
      }
      for (let i = 1; i < map.road!.length; i++) {
        const a = map.road![i - 1], b = map.road![i], ai = a.z * map.width + a.x, bi = b.z * map.width + b.x
        if (map.tiles[ai] === "ford" || map.tiles[bi] === "ford")
          expect(elevationStep(map.elevation, ai, bi)).toBeLessThan(Infinity)
      }
    }
    expect(count).toBeGreaterThan(0)
  }, 30000)
})
