import { describe, expect, it } from "vitest"
import { advanceWalkPhase, easeProgress, easeSpeed, paceVariation, roundedCorner } from "./motion"

describe("walking motion", () => {
  it("varies smoothly and repeatably within the dial's bounds, with a different rhythm per traveler", () => {
    const a: number[] = [], b: number[] = []
    for (let i = 0; i < 1000; i++) {
      const value = paceVariation(42, i / 60, 0.4)
      expect(value).toBeGreaterThanOrEqual(0.6)
      expect(value).toBeLessThanOrEqual(1.4)
      expect(value).toBe(paceVariation(42, i / 60, 0.4))
      if (a.length) expect(Math.abs(value - a.at(-1)!)).toBeLessThan(0.01)
      a.push(value); b.push(paceVariation(43, i / 60, 0.4))
    }
    expect(a).not.toEqual(b)
    expect(Math.max(...a) - Math.min(...a)).toBeGreaterThan(0.3)
    expect(paceVariation(42, 8, 0)).toBe(1)
  })
  it("eases starts and speed changes without overshooting, independently of timestep", () => {
    let fine = 0
    for (let i = 0; i < 60; i++) fine = easeSpeed(fine, 0.5, 1 / 60, 0.35)
    expect(fine).toBeCloseTo(easeSpeed(0, 0.5, 1, 0.35), 12)
    expect(fine).toBeLessThan(0.5)
    expect(easeSpeed(0.8, 0.2, 0.1, 0.35)).toBeGreaterThan(0.2)
    expect(easeSpeed(0, 0.5, 0.1, 0)).toBe(0.5)
  })
  it("rounds a corner within the two road tiles and joins straight segments continuously", () => {
    const a = { x: 0, z: 0 }, b = { x: 1, z: 0 }, c = { x: 1, z: 1 }
    for (let i = -349; i < 350; i++) {
      const p = roundedCorner(a, b, c, i / 1000, 1)!
      expect(p.x).toBeGreaterThanOrEqual(0.65)
      expect(p.x).toBeLessThanOrEqual(1)
      expect(p.z).toBeGreaterThanOrEqual(0)
      expect(p.z).toBeLessThanOrEqual(0.35)
      // Rounding never leaves the incoming or outgoing tile footprint.
      expect(p.z <= 0.5 || p.x >= 0.5).toBe(true)
    }
    expect(roundedCorner(a, b, c, -0.35 + 1e-7, 1)!.x).toBeCloseTo(0.65, 5)
    expect(roundedCorner(a, b, c, 0.35 - 1e-7, 1)!.z).toBeCloseTo(0.35, 5)
    expect(roundedCorner(a, b, c, 0, 0)).toBeNull()
    expect(roundedCorner(a, b, { x: 2, z: 0 }, 0.1, 1)!.x).toBeCloseTo(1.1, 12)
  })
  it("eases off-road arrivals without changing endpoints or reversing", () => {
    expect(easeProgress(0, 1)).toBe(0); expect(easeProgress(1, 1)).toBe(1)
    expect(easeProgress(0.1, 1)).toBeLessThan(0.1)
    expect(easeProgress(0.9, 1)).toBeGreaterThan(0.9)
    for (let i = 1; i <= 100; i++) expect(easeProgress(i / 100, 0.65)).toBeGreaterThan(easeProgress((i - 1) / 100, 0.65))
  })
  it("matches cycles to distance regardless of speed, frame rate or FPS cap", () => {
    const phase = 0.13
    expect(advanceWalkPhase(phase, 0.44, 1, 8, 8, 0.44, true)).toBeCloseTo(phase)
    expect(advanceWalkPhase(phase, 0.22, 0.2, 8, 24, 0.44, true)).toBeCloseTo(0.63)
    expect(advanceWalkPhase(phase, 0.22, 2, 8, 2, 0.44, true)).toBeCloseTo(0.63)
    expect(advanceWalkPhase(phase, 0.22, 1, 8, 8, 0.88, true)).toBeCloseTo(0.38)
    expect(advanceWalkPhase(phase, 0, 1, 8, 8, 0.44, true)).toBe(phase)
    let subdivided = phase
    for (let i = 0; i < 60; i++) subdivided = advanceWalkPhase(subdivided, 0.22 / 60, 1 / 60, 8, 8, 0.44, true)
    expect(subdivided).toBeCloseTo(0.63, 12)
    expect(advanceWalkPhase(phase, 0.01, 0.25, 8, 4, 0.44, false)).toBeCloseTo(0.255)
    expect(advanceWalkPhase(phase, 100, 0.25, 8, 4, 0.44, false)).toBeCloseTo(0.255)
  })
})
