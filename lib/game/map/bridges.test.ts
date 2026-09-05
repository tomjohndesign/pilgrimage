import { describe, expect, it } from "vitest"

import { BRIDGE_RISE, bridgeLayout, surfaceHeight } from "./bridges"
import { generateMap } from "./generate-map"
import { parseAsciiMap } from "./prototype-map"
import { TILE_HEIGHT } from "./terrain"

describe("bridgeLayout", () => {
  it("finds a straight span with a ramp at each end, running from bank to bank", () => {
    const map = parseAsciiMap([
      ".......",
      "..~~~..",
      "==###==",
      "..~~~..",
      ".......",
    ])
    const layout = bridgeLayout(map)

    expect(layout.spans).toHaveLength(1)
    const [span] = layout.spans
    expect(span.tiles).toEqual([
      { x: 2, z: 2 },
      { x: 3, z: 2 },
      { x: 4, z: 2 },
    ])
    expect([span.dx, span.dz]).toEqual([1, 0])
    expect(span.from).toEqual({ x: 1, z: 2 })
    expect(span.to).toEqual({ x: 5, z: 2 })
    expect(span.kind).toBe("road")

    // Each ramp climbs toward the water.
    expect(layout.ramps).toEqual(
      expect.arrayContaining([
        { x: 1, z: 2, dx: 1, dz: 0, kind: "road" },
        { x: 5, z: 2, dx: -1, dz: 0, kind: "road" },
      ]),
    )
    expect(layout.ramps).toHaveLength(2)
    expect(layout.connectors).toHaveLength(0)
  })

  it("rises linearly from the road, up the ramp, onto the deck", () => {
    const map = parseAsciiMap(["=.=#=.="])
    // (this map is a single row: the span is one tile, crossing along x)
    expect(surfaceHeight(map, 0, 0)).toBe(TILE_HEIGHT)
    expect(surfaceHeight(map, 2, 0)).toBeCloseTo(TILE_HEIGHT + BRIDGE_RISE / 2)
    expect(surfaceHeight(map, 3, 0)).toBeCloseTo(TILE_HEIGHT + BRIDGE_RISE)
    expect(surfaceHeight(map, 4, 0)).toBeCloseTo(TILE_HEIGHT + BRIDGE_RISE / 2)
    expect(surfaceHeight(map, 6, 0)).toBe(TILE_HEIGHT)
    // Off the map is level ground.
    expect(surfaceHeight(map, -1, 0)).toBe(TILE_HEIGHT)
  })

  it("runs a single-tile span along the axis that has land at both ends", () => {
    const map = parseAsciiMap([
      ".~.",
      ".#.",
      ".~.",
      "...",
    ])
    const [span] = bridgeLayout(map).spans
    expect([span.dx, span.dz]).toEqual([1, 0])
    expect(span.from).toEqual({ x: 0, z: 1 })
    expect(span.to).toEqual({ x: 2, z: 1 })
  })

  it("classifies a span by the land at its ends: road, or a beaten track", () => {
    const road = parseAsciiMap(["=#-"])
    expect(bridgeLayout(road).spans[0].kind).toBe("road")
    const track = parseAsciiMap(["-#-"])
    expect(bridgeLayout(track).spans[0].kind).toBe("track")
    const bare = parseAsciiMap([".#."])
    expect(bridgeLayout(bare).spans[0].kind).toBe("track")
  })

  it("leaves a span ending at the map edge with no approach there", () => {
    const map = parseAsciiMap(["##=="])
    const [span] = bridgeLayout(map).spans
    expect(span.from).toBeNull()
    expect(span.to).toEqual({ x: 2, z: 0 })
    expect(bridgeLayout(map).ramps).toEqual([{ x: 2, z: 0, dx: -1, dz: 0, kind: "road" }])
  })

  it("continues the deck over a one-tile island without a dirt causeway", () => {
    const map = parseAsciiMap(["=#=#="])
    const layout = bridgeLayout(map)
    expect(layout.spans).toHaveLength(2)
    expect(layout.connectors).toEqual([{ x: 2, z: 0, kind: "road", open: [true, true, false, false] }])
    expect(layout.ramps.map((r) => r.x).sort()).toEqual([0, 4])
    expect(surfaceHeight(map, 2, 0)).toBeCloseTo(TILE_HEIGHT + BRIDGE_RISE)
  })

  it.each([1, 2, 3, 4])("requires three dry tiles between ramps (gap %i)", (gap) => {
    const map = parseAsciiMap(["=##" + "=".repeat(gap) + "##="])
    const original = [...map.tiles]
    const layout = bridgeLayout(map)
    expect(layout.connectors).toHaveLength(gap < 3 ? gap : 0)
    expect(layout.ramps).toHaveLength(gap < 3 ? 2 : 4)
    if (gap === 3) expect(surfaceHeight(map, 4, 0)).toBe(TILE_HEIGHT)
    expect(map.tiles).toEqual(original)
  })

  it("continues over a two-tile island when the crossing turns", () => {
    const map = parseAsciiMap([
      "..=..",
      "~~#~~",
      "~~#~~",
      "~~==~",
      "~~~#~",
      "~~~#~",
      "...=.",
    ])
    const layout = bridgeLayout(map)
    expect(layout.connectors.map(({ x, z }) => ({ x, z }))).toEqual([
      { x: 2, z: 3 }, { x: 3, z: 3 },
    ])
    expect(layout.connectors[0].open).toEqual([true, false, false, true])
    expect(layout.connectors[1].open).toEqual([false, true, true, false])
    expect(layout.ramps).toHaveLength(2)
    for (const tile of layout.connectors) {
      expect(surfaceHeight(map, tile.x, tile.z)).toBeCloseTo(TILE_HEIGHT + BRIDGE_RISE)
    }
  })

  it("keeps a track island and its approaches timber", () => {
    const layout = bridgeLayout(parseAsciiMap(["-##--##-"]))
    expect(layout.connectors).toHaveLength(2)
    expect([...layout.connectors, ...layout.ramps].every((tile) => tile.kind === "track")).toBe(true)
  })

  it("does not ramp off water: a span meeting a lake end-on has no approach there", () => {
    const map = parseAsciiMap(["~#="])
    const layout = bridgeLayout(map)
    expect(layout.spans[0].from).toEqual({ x: 0, z: 0 })
    expect(layout.ramps).toEqual([{ x: 2, z: 0, dx: -1, dz: 0, kind: "road" }])
  })

  it("preserves water and dry island terrain while adding bridge surfaces", () => {
    const map = parseAsciiMap(["=##==##="])
    map.water = {
      depth: [0, 2, 1, 0, 0, 1, 2, 0],
      flow: { 1: [0, 1], 2: [0, 1], 5: [0, 1], 6: [0, 1] },
    }
    const before = structuredClone(map)
    const layout = bridgeLayout(map)
    expect(layout.connectors).toHaveLength(2)
    expect(map).toEqual(before)
    expect(layout.connectors.every((tile) => map.water!.depth[tile.z * map.width + tile.x] === 0)).toBe(true)
  })

  it("is memoised per map", () => {
    const map = parseAsciiMap(["=#="])
    expect(bridgeLayout(map)).toBe(bridgeLayout(map))
  })

  it("accounts for every bridge tile on generated maps, each span with land at both ends", () => {
    for (const seed of [1, 7920, 15839]) {
      const map = generateMap({ seed })
      const layout = bridgeLayout(map)
      const covered = layout.spans.reduce((n, s) => n + s.tiles.length, 0)
      expect(covered).toBe(map.tiles.filter((t) => t === "bridge").length)
      for (const span of layout.spans) {
        expect(span.from, `seed ${seed}`).not.toBeNull()
        expect(span.to, `seed ${seed}`).not.toBeNull()
        for (const tile of span.tiles) {
          expect(surfaceHeight(map, tile.x, tile.z)).toBeCloseTo(TILE_HEIGHT + BRIDGE_RISE)
        }
      }
      // Island decks never also become ramps.
      const rampKeys = new Set(layout.ramps.map((r) => `${r.x},${r.z}`))
      for (const p of layout.connectors) expect(rampKeys.has(`${p.x},${p.z}`)).toBe(false)
    }
  }, 30_000)
})
