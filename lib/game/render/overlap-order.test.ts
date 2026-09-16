import { describe, expect, it } from "vitest"
import { overlapBiases, OVERLAP_CLEARANCE, type OverlapParticipant } from "./overlap-order"

const figure = (distance: number, order = 1, change: Partial<OverlapParticipant> = {}): OverlapParticipant =>
  ({ left: -.5, right: .5, bottom: 0, top: 1, near: distance - .3, far: distance + .2, distance, order, ...change })
const separated = (p: OverlapParticipant[], biases: Float32Array, front: number, back: number) =>
  expect(p[front].far - biases[front]).toBeLessThan(p[back].near - biases[back])

describe("projected sprite ordering", () => {
  it("leaves disjoint silhouettes and already separated depths alone", () => {
    expect([...overlapBiases([figure(10), figure(10, 2, { left: .6, right: 1 }), figure(10, 3, { bottom: 2, top: 3 })])]).toEqual([0, 0, 0])
    expect([...overlapBiases([figure(10), figure(8)])]).toEqual([0, 0])
  })
  it("uses measured pose thickness and existing separation", () => {
    const p = [figure(10), figure(9.9)]
    const b = overlapBiases(p)
    expect(b[0]).toBe(0); expect(b[1]).toBeCloseTo(.4 + OVERLAP_CLEARANCE)
    separated(p, b, 1, 0)
  })
  it("orders the end of a long animal or cart crossing a walker", () => {
    const p = [figure(10, 1, { left: -2, right: 2, near: 8.5, far: 11 }), figure(9.9, 2, { left: 1.5, right: 1.8 })]
    separated(p, overlapBiases(p), 1, 0)
  })
  it("propagates corrections to a third silhouette outside the first one's bounds", () => {
    const p = [figure(10, 1, { left: -2, right: -.2 }), figure(9.9), figure(9.8, 3, { left: .2, right: 2 })]
    const b = overlapBiases(p)
    separated(p, b, 1, 0); separated(p, b, 2, 1)
  })
  it("breaks equal anchor depths by stable draw order and ignores input order", () => {
    const p = [figure(10, 3), figure(10, 1), figure(10, 2)]
    const b = overlapBiases(p)
    separated(p, b, 0, 2); separated(p, b, 2, 1)
    expect([...overlapBiases([p[2], p[0], p[1]])]).toEqual([b[2], b[0], b[1]])
  })
  it("reuses and clears output storage", () => {
    const out = new Float32Array(4).fill(99)
    expect(overlapBiases([figure(10), figure(10, 2)], out)).toBe(out)
    overlapBiases([figure(10)], out); expect(out[0]).toBe(0)
  })
})
