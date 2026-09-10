import { expect, it } from "vitest"
import { WILDLIFE_STEP_SECONDS, wildlifePoseDue } from "./pose-timing"

it.each([0, 13.713, 3600])("updates nearby wildlife 30 times and distant wildlife 10 times per simulated second, starting at %s", startAge => {
  for (const [viewSize, stride] of [[60, 1], [90, 1], [120, 3]]) {
    let age = startAge, posedAge = -1
    expect(wildlifePoseDue(age, posedAge, viewSize)).toBe(true)
    posedAge = age
    const updates: number[] = []
    for (let tick = 1; tick <= 30; tick++) {
      age += WILDLIFE_STEP_SECONDS
      if (wildlifePoseDue(age, posedAge, viewSize)) {
        updates.push(tick)
        posedAge = age
      }
      // Extra display frames (or pausing) must reuse the current hide.
      expect(wildlifePoseDue(age, posedAge, viewSize)).toBe(false)
    }
    expect(updates).toEqual(Array.from({ length: 30 / stride }, (_, i) => (i + 1) * stride))
  }
})

it("refreshes a stale distant pose immediately when zooming in", () => {
  const age = 12 + WILDLIFE_STEP_SECONDS
  expect(wildlifePoseDue(age, 12, 120)).toBe(false)
  expect(wildlifePoseDue(age, 12, 60)).toBe(true)
})

it("refreshes invalidated poses, reset ages, and animals returning after skipped ticks", () => {
  for (const viewSize of [60, 120]) {
    expect(wildlifePoseDue(12, -1, viewSize)).toBe(true)
    expect(wildlifePoseDue(0, 12, viewSize)).toBe(true)
    expect(wildlifePoseDue(12.2, 12, viewSize)).toBe(true)
    expect(wildlifePoseDue(12, 12, viewSize)).toBe(false)
  }
})
