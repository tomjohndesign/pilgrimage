import { describe, expect, it } from "vitest"
import { walkingSurface } from "./walking-surface"
import { DEFAULT_ELEVATION } from "./elevation"
import type { GameMap } from "./types"
import { plantFoot } from "../base-person/gait"
import { parseAsciiMap } from "./prototype-map"
import { BRIDGE_RISE } from "./bridges"

describe("slope ground contacts", () => {
  const map: GameMap = {
    width: 1, depth: 1, tiles: ["grass"], buildings: [],
    elevation: { settings: DEFAULT_ELEVATION, height: [0.2], corners: [0, 0.2, 0.3, 0.6], slope: [0], cliffs: [0] },
  }
  it("uses the exact grade of each rendered triangle", () => {
    expect(walkingSurface(map, -0.25, -0.25)).toEqual({ height: 0.325, dx: 0.2, dz: 0.3 })
    expect(walkingSurface(map, 0.25, 0.25)).toMatchObject({ dx: 0.3 })
    expect(walkingSurface(map, 0.25, 0.25).dz).toBeCloseTo(0.4)
  })
  it.each([0.3, -0.3])("plants on the ground under the foot at grade %s, not under the body", grade => {
    const height = (x: number, z: number) => 0.2 + grade * z + 0.1 * x
    const origin = { x: 0, y: height(0, 0), z: 0 }
    const foot = { x: 0.1, z: 0.2 }
    const first = plantFoot(null, "left", origin, foot, height)
    expect(origin.y + first.offset.y).toBeCloseTo(height(0.1, 0.2))
    const moved = { x: 0, y: height(0, 0.03), z: 0.03 }
    const next = plantFoot(first.plant, "left", moved, foot, height)
    expect(moved.y + next.offset.y).toBeCloseTo(height(0.1, 0.2))
    expect(moved.z + next.offset.z + foot.z).toBeCloseTo(0.2)
    const switched = plantFoot(next.plant, "right", moved, { x: -0.1, z: 0.15 }, height)
    expect(moved.y + switched.offset.y).toBeCloseTo(height(-0.1, 0.18))
  })
  it("follows both bridge ramps continuously at off-centre foot contacts", () => {
    const bridge = parseAsciiMap(["===#==="])
    for (const direction of [-1, 1]) for (const distance of [0.6, 1, 1.4]) {
      const surface = walkingSurface(bridge, distance * direction, 0)
      expect(surface.height).toBeCloseTo(0.2 + BRIDGE_RISE * (1.5 - distance))
      expect(surface.dx).toBe(-direction * BRIDGE_RISE)
      expect(surface.dz).toBe(0)
    }
    expect(walkingSurface(bridge, 0, 0).height).toBeCloseTo(0.2 + BRIDGE_RISE)
  })
})
