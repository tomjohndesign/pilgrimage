import { expect, it } from "vitest"
import { WOOD_PILE_LAYOUT, woodPileLogs } from "./wood-pile"
import { PERSON_HEIGHT } from "./world-scale"
import { WOOD_PER_LOG } from "./trees/timber"

it("spreads logs along the ground before building supported courses, bounded by person height", () => {
  const { columns, radius, spacing } = WOOD_PILE_LAYOUT
  const ground = woodPileLogs(columns * WOOD_PER_LOG)
  expect(new Set(ground.map(log => log.y)).size).toBe(1)
  expect(ground.at(-1)!.x - ground[0].x).toBeGreaterThan(.5)
  const full = woodPileLogs(10000)
  expect(Math.max(...full.map(log => log.y + radius))).toBeLessThanOrEqual(PERSON_HEIGHT)
  for (const log of full.filter(log => log.y > radius)) {
    const below = full.filter(other => Math.abs(other.y - log.y + WOOD_PILE_LAYOUT.layerHeight) < 1e-9)
    // Interior logs nest between neighbours; outer logs remain inside the row's footprint.
    expect(below.some(other => Math.abs(Math.abs(other.x - log.x) - spacing / 2) < 1e-9)).toBe(true)
  }
})

it("stops growing at full stock while preserving partial log lengths", () => {
  const full = WOOD_PILE_LAYOUT.maxLogs * WOOD_PER_LOG
  expect(woodPileLogs(0)).toEqual([])
  expect(woodPileLogs(-10)).toEqual([])
  expect(woodPileLogs(15)[1].length).toBeCloseTo(WOOD_PILE_LAYOUT.length / 2)
  expect(woodPileLogs(full)).toEqual(woodPileLogs(full * 100))
})

it("fits the narrower timber bays in older two-tile huts without growing taller", () => {
  const width = 2 / 3 - .16
  const full = woodPileLogs(10000, width)
  expect(full.length).toBeLessThan(WOOD_PILE_LAYOUT.maxLogs)
  for (const log of full) {
    expect(Math.abs(log.x) + WOOD_PILE_LAYOUT.radius).toBeLessThan(width / 2)
    expect(log.y + WOOD_PILE_LAYOUT.radius).toBeLessThanOrEqual(PERSON_HEIGHT)
  }
})
