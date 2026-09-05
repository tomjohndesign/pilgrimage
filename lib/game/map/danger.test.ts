import { describe, expect, it } from "vitest"

import {
  arrivalOdds,
  computeDangerField,
  DANGER_THRESHOLDS,
  dangerLabel,
  ENCOUNTER_CHANCE,
  encounterChance,
  routeDanger,
  type ThreatSource,
} from "./danger"
import { generateMap } from "./generate-map"
import type { TerrainId } from "./terrain"
import type { GameMap } from "./types"

function flatMap(width: number, depth: number, fill: TerrainId): GameMap {
  return { width, depth, tiles: new Array<TerrainId>(width * depth).fill(fill), buildings: [] }
}

/** Maps take real time at the 128×128 floor; a dozen seeds is plenty here. */
const SEEDS = Array.from({ length: 12 }, (_, i) => i * 7919 + 1)
const SWEEP_TIMEOUT = 60_000

describe("computeDangerField", () => {
  it("reads open country as safe, ordinary woods as uneasy, and old growth as perilous", () => {
    expect(Math.max(...computeDangerField(flatMap(10, 10, "grass")))).toBe(0)

    const woods = computeDangerField(flatMap(11, 11, "forest"))
    expect(dangerLabel(woods[5 * 11 + 5])).toBe("Uneasy")

    const dark = flatMap(11, 11, "darkwood")
    dark.tiles[5 * 11 + 5] = "track"
    const field = computeDangerField(dark)
    // The carved tile itself is the only non-dark cell in its 5×5 window.
    expect(field[5 * 11 + 5]).toBeCloseTo(24 / 25, 10)
    expect(dangerLabel(field[5 * 11 + 5])).toBe("Perilous")
  })

  it("excludes off-map cells instead of treating the border as wild", () => {
    const field = computeDangerField(flatMap(11, 11, "darkwood"))
    // A corner sees only a 3×3 in-bounds window, all old growth — still 1.
    expect(field[0]).toBe(1)
  })

  it("stays within [0, 1] and is deterministic on generated maps", () => {
    const map = generateMap({ seed: 4242 })
    const a = computeDangerField(map)
    expect(a).toEqual(computeDangerField(map))
    for (const d of a) {
      expect(d).toBeGreaterThanOrEqual(0)
      expect(d).toBeLessThanOrEqual(1)
    }
  })

  it("adds threat sources with linear falloff out to their radius", () => {
    const camp: ThreatSource = {
      id: "camp-1",
      kind: "bandit-camp",
      x: 10,
      z: 10,
      radius: 4,
      intensity: 0.8,
    }
    const field = computeDangerField(flatMap(20, 20, "grass"), [camp])
    expect(field[10 * 20 + 10]).toBeCloseTo(0.8, 10)
    expect(field[10 * 20 + 12]).toBeCloseTo(0.4, 10) // half way out
    expect(field[10 * 20 + 14]).toBe(0) // at the radius, faded to nothing
    expect(field[0]).toBe(0) // far away, untouched
  })

  it("clamps overlapping threats to 1", () => {
    const den = (id: string): ThreatSource => ({
      id,
      kind: "wolf-den",
      x: 5,
      z: 5,
      radius: 3,
      intensity: 0.8,
    })
    const field = computeDangerField(flatMap(10, 10, "grass"), [den("a"), den("b")])
    expect(field[5 * 10 + 5]).toBe(1)
  })
})

describe("dangerLabel", () => {
  it("names each band of the scale", () => {
    expect(dangerLabel(0)).toBe("Safe")
    expect(dangerLabel(DANGER_THRESHOLDS.uneasy)).toBe("Uneasy")
    expect(dangerLabel(DANGER_THRESHOLDS.dangerous)).toBe("Dangerous")
    expect(dangerLabel(DANGER_THRESHOLDS.perilous)).toBe("Perilous")
    expect(dangerLabel(1)).toBe("Perilous")
  })
})

describe("encounterChance", () => {
  it("is nothing on safe ground, the full rate in old growth, and squared between", () => {
    expect(encounterChance(0)).toBe(0)
    expect(encounterChance(1)).toBe(ENCOUNTER_CHANCE)
    expect(encounterChance(0.5)).toBeCloseTo(ENCOUNTER_CHANCE / 4, 10)
  })
})

describe("arrivalOdds", () => {
  const map = flatMap(100, 1, "darkwood")
  const route = Array.from({ length: 100 }, (_, x) => ({ x, z: 0 }))

  it("is certain on a safe road or for a traveller of perfect nerve", () => {
    expect(arrivalOdds(computeDangerField(flatMap(100, 1, "grass")), map, route, 0)).toBe(1)
    expect(arrivalOdds(computeDangerField(map), map, route, 1)).toBe(1)
  })

  it("rises with nerve and matches the per-tile product", () => {
    const field = computeDangerField(map)
    const timid = arrivalOdds(field, map, route, 0.2)
    const bold = arrivalOdds(field, map, route, 0.8)
    expect(bold).toBeGreaterThan(timid)
    let expected = 1
    for (const d of routeDanger(field, map, route)) expected *= 1 - encounterChance(d) * 0.8
    expect(timid).toBeCloseTo(expected, 10)
  })

  it("forecasts the road as mostly safe and the tracks as a real risk, on generated maps", () => {
    let roadOdds = 0
    let trackOdds = 0
    let knightTrackOdds = 0
    let tracks = 0
    for (const seed of SEEDS) {
      const m = generateMap({ seed })
      const field = computeDangerField(m)
      roadOdds += arrivalOdds(field, m, m.road!, 0.35)
      for (const track of m.shortcuts ?? []) {
        trackOdds += arrivalOdds(field, m, track.tiles, 0.35)
        knightTrackOdds += arrivalOdds(field, m, track.tiles, 0.85)
        tracks++
        expect(
          Math.max(...routeDanger(field, m, track.tiles)),
          `seed ${seed} track runs through danger`,
        ).toBeGreaterThanOrEqual(DANGER_THRESHOLDS.dangerous)
      }
    }
    expect(tracks).toBeGreaterThan(0)
    expect(roadOdds / SEEDS.length).toBeGreaterThan(0.8)
    expect(trackOdds / tracks).toBeGreaterThan(0.4)
    expect(trackOdds / tracks).toBeLessThan(0.75)
    expect(knightTrackOdds / tracks).toBeGreaterThan(trackOdds / tracks + 0.15)
  }, SWEEP_TIMEOUT)
})
