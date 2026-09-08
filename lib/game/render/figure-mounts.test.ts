import { expect, it } from "vitest"
import { figureMounts } from "./figure-mounts"

it("bounds rig creation and disposal during large pans and zooms, while admitting selection immediately", () => {
  let current = Array.from({ length: 2000 }, (_, i) => i)
  const desired = Array.from({ length: 2000 }, (_, i) => i + 2000)
  const first = figureMounts(current, desired, 3999)
  expect(first).toContain(3999)
  expect(first.filter(i => i >= 2000)).toHaveLength(17)
  expect(current.filter(i => !first.includes(i))).toHaveLength(16)
  current = first
  for (let frame = 0; frame < 130; frame++) current = figureMounts(current, desired, 3999)
  expect(current).toEqual(desired)
  expect(figureMounts(current, desired)).toBe(current)
  for (let frame = 0; frame < 130; frame++) current = figureMounts(current, [])
  expect(current).toEqual([])
})

it("retains visited figures for repeated camera movement and evicts beyond the cache limit", () => {
  const first = figureMounts([], [0, 1, 2], -1, 16, 5)
  const away = figureMounts(first, [3, 4], -1, 16, 5)
  expect(away).toEqual([0, 1, 2, 3, 4])
  expect(figureMounts(away, first, -1, 16, 5)).toBe(away)
  const further = figureMounts(away, [4, 5, 6], -1, 16, 5)
  expect(further).toHaveLength(5)
  expect(further).toEqual([2, 3, 4, 5, 6])
})
