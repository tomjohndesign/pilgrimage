import { describe, expect, it } from "vitest"
import { registerDepthPixels } from "./bake-depth"

describe("sprite geometry depth registration", () => {
  it("flips readback and grows ink from the same first neighbour as the color baker", () => {
    const size = 4, source = new Uint8ClampedArray(size * size * 4), raw = new Uint8Array(source.length)
    const put = (x: number, y: number, high: number, low: number) => {
      source.set([100, 100, 100, 255], (y * size + x) * 4)
      raw.set([high, low, 255, 255], ((size - 1 - y) * size + x) * 4)
    }
    put(0, 1, 12, 34); put(2, 1, 56, 78); put(1, 2, 90, 12)
    const inked = source.slice()
    inked.set([10, 10, 10, 255], (1 * size + 1) * 4)
    const result = registerDepthPixels(raw, source, inked, size)
    expect([...result.slice(20, 24)]).toEqual([12, 34, 255, 255])
    expect([...result.slice(36, 40)]).toEqual([90, 12, 255, 255])
    expect([...result.slice(0, 4)]).toEqual([128, 0, 0, 255])
  })

  it("rejects a visible pose without depth instead of silently using background", () => {
    const source = new Uint8ClampedArray([100, 100, 100, 255])
    expect(() => registerDepthPixels(new Uint8Array(4), source, source, 1)).toThrow("no baked geometry depth")
  })
})
