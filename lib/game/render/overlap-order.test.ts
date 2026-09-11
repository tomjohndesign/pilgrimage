import { describe, expect, it } from "vitest"
import { overlapBiases, OVERLAP_RADIUS, OVERLAP_STEP } from "./overlap-order"

const figure = (x: number, z: number, distance: number, order = 1, size = 1) => ({ x, z, distance, size, order })

describe("overlapBiases", () => {
  it("leaves figures standing apart alone", () => {
    const biases = overlapBiases([figure(0, 0, 10), figure(OVERLAP_RADIUS * 2, 0, 10.1), figure(0, 5, 3)])
    expect([...biases]).toEqual([0, 0, 0])
  })

  it("lifts the nearer of two coincident figures by one step", () => {
    const biases = overlapBiases([figure(0, 0, 10.001, 2), figure(0.001, 0, 10, 1)])
    expect(biases[0]).toBe(0)
    expect(biases[1]).toBeCloseTo(OVERLAP_STEP)
  })

  it("breaks exact distance ties with the draw order, later drawn in front", () => {
    const biases = overlapBiases([figure(0, 0, 10, 5), figure(0, 0, 10, 9)])
    expect(biases[0]).toBe(0)
    expect(biases[1]).toBeCloseTo(OVERLAP_STEP)
  })

  it("stacks a spot of three from back to front", () => {
    const biases = overlapBiases([figure(0, 0, 12), figure(0.02, 0.01, 11), figure(-0.02, 0, 10)])
    expect([...biases].map(b => Math.round(b / OVERLAP_STEP))).toEqual([0, 1, 2])
  })

  it("scales the radius and step with the sprite size", () => {
    const small = overlapBiases([figure(0, 0, 10, 1, 0.5), figure(0.2, 0, 9, 2, 0.5)])
    expect([...small]).toEqual([0, 0])
    const large = overlapBiases([figure(0, 0, 10, 1, 2), figure(0.2, 0, 9, 2, 2)])
    expect(large[1]).toBeCloseTo(OVERLAP_STEP * 2)
  })

  it("reuses a provided output buffer across hash cells", () => {
    const out = new Float32Array(4)
    const biases = overlapBiases([figure(-0.01, -0.01, 10), figure(0.01, 0.01, 9), figure(40, 40, 1), figure(40.02, 40, 2)], out)
    expect(biases).toBe(out)
    expect([...out].map(b => Math.round(b / OVERLAP_STEP))).toEqual([0, 1, 1, 0])
  })
})
