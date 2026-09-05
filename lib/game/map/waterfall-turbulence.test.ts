import { expect, it } from "vitest"
import { waterfallTurbulence } from "./waterfall-turbulence"
import type { WaterInfo } from "./types"

it("textures the waterfall approach and landing, fading along the current without affecting other water", () => {
  const water: WaterInfo = {
    depth: [1, 1, 1, 1, 1, 1, 1, 0, 1],
    downstream: [1, 2, 3, 4, 5, 6, -1, -1, -1],
    motion: ["flow", "flow", "flow", "waterfall", "flow", "flow", "still", "still", "still"],
    flow: { 0: [1, 0], 1: [1, 0], 2: [1, 0], 3: [1, 0], 4: [1, 0], 5: [1, 0] },
  }
  const field = waterfallTurbulence(water, 9, 2)
  expect(field[0]).toBe(0)
  expect(field[3]).toBeGreaterThan(0)
  expect(field[6]).toBeGreaterThan(field[3])
  expect(field[9]).toBe(1)
  expect(field[12]).toBe(1)
  expect(field[15]).toBeLessThan(field[12])
  expect(field[18]).toBeLessThan(field[15])
  expect(Array.from(field.slice(21))).toEqual([0, 0, 0, 0, 0, 0])
  expect(Array.from(field.slice(19, 21))).toEqual([1, 0])
  expect(Array.from(waterfallTurbulence(undefined, 2, 3))).toEqual([0, 0, 0, 0, 0, 0])
})
