import { expect, it } from "vitest"
import { MAX_SIMULATION_STEP, BENCHMARK_SIMULATION_SPEEDS, simulationFrameStep } from "./simulation-store"

it("preserves playback time and the background-frame clamp with bounded combined ticks", () => {
  for (const { rate } of BENCHMARK_SIMULATION_SPEEDS) for (const delta of [0, 1 / 144, 1 / 60, 1 / 30, .0334, .034, .1, 2]) {
    const { ticks, dt } = simulationFrameStep(delta, rate)
    expect(ticks * dt).toBeCloseTo(Math.min(delta, .1) * rate, 12)
    expect(dt).toBeLessThanOrEqual(MAX_SIMULATION_STEP)
    expect(ticks).toBeLessThanOrEqual(rate)
  }
  expect(simulationFrameStep(1 / 60, 2).ticks).toBe(1)
  expect(simulationFrameStep(1 / 60, 10).ticks).toBe(1)
  expect(simulationFrameStep(1 / 30, 10).ticks).toBe(1)
  expect(simulationFrameStep(.0334, 10).ticks).toBe(1)
  expect(simulationFrameStep(.034, 10).ticks).toBe(1)
})
