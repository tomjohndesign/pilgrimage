import { expect, it } from "vitest"
import { CrowdBudget, crowdRanks } from "./crowd-budget"

it("samples a stable nested population without favoring consecutive IDs", () => {
  const ids = Array.from({ length: 10000 }, (_, i) => i + 37)
  const ranks = crowdRanks(ids), selected = ids.filter((_, i) => ranks[i] < 1024)
  expect(new Set(ranks).size).toBe(ids.length)
  expect(selected).toHaveLength(1024)
  const reversed = crowdRanks([...ids].reverse())
  expect([...reversed].reverse()).toEqual([...ranks])
  for (let quarter = 0; quarter < 4; quarter++) {
    const count = selected.filter(id => id >= quarter * 2500 + 37 && id < (quarter + 1) * 2500 + 37).length
    expect(count).toBeGreaterThan(200); expect(count).toBeLessThan(320)
  }
  expect(ids.filter((_, i) => ranks[i] < 512).every(id => selected.includes(id))).toBe(true)
})

it("reduces visual work under sustained pressure, freezes during zoom, and restores gradually", () => {
  const budget = new CrowdBudget()
  expect(budget.update(10000, true, 0)).toBe(1024)
  for (let i = 0; i < 40; i++) budget.update(10000, true, .05)
  expect(budget.budget).toBe(576)
  for (let i = 0; i < 300; i++) budget.update(10000, true, .1, true)
  expect(budget.budget).toBe(576)
  for (let i = 0; i < 120; i++) budget.update(10000, true, 1 / 60)
  expect(budget.budget).toBe(576)
  for (let i = 0; i < 60; i++) budget.update(10000, true, 1 / 60)
  expect(budget.budget).toBe(640)
  expect(budget.update(10000, false, 0)).toBe(10000)
  expect(budget.active).toBe(false)
})

it("bounds reductions, ignores background gaps and handles a shrinking population", () => {
  const budget = new CrowdBudget()
  budget.update(1400, true, 0)
  for (let i = 0; i < 100; i++) budget.update(1400, true, 2)
  expect(budget.budget).toBe(1024)
  for (let i = 0; i < 300; i++) budget.update(1400, true, .1)
  expect(budget.budget).toBe(128)
  expect(budget.update(64, true, .1)).toBe(64)
  expect(budget.active).toBe(false)
})
