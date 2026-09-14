import { expect, it } from "vitest"
import { CROWD_SPEED_LIMIT, MAX_SIMULATION_STEP, BENCHMARK_SIMULATION_SPEEDS, SIMULATION_SPEEDS, crowdSafeSpeed, simulationFrameStep, simulationSpeedControl, speedBlockedByCrowd } from "./simulation-store"

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
  // The player maximum is 6× (rate 12). A rounded 30 FPS frame must not
  // double population work and push the following frame further behind.
  expect(simulationFrameStep(1 / 30, 12)).toEqual({ ticks: 1, dt: .4 })
  expect(simulationFrameStep(.0334, 12).ticks).toBe(1)
  expect(simulationFrameStep(.034, 12).ticks).toBe(1)
})

it("withholds only the top speed once the crowd passes the limit", () => {
  expect(SIMULATION_SPEEDS.map(speed => speed.label)).toEqual([0.5, 1, 3, 6])
  for (const { rate } of SIMULATION_SPEEDS) {
    expect(speedBlockedByCrowd(rate, CROWD_SPEED_LIMIT.population)).toBe(false)
    expect(crowdSafeSpeed(rate, CROWD_SPEED_LIMIT.population)).toBe(rate)
  }
  const crowded = CROWD_SPEED_LIMIT.population + 1
  for (const { rate } of SIMULATION_SPEEDS) expect(speedBlockedByCrowd(rate, crowded)).toBe(rate === CROWD_SPEED_LIMIT.rate)
  expect(crowdSafeSpeed(12, crowded)).toBe(6)
  expect(crowdSafeSpeed(6, crowded)).toBe(6)
  expect(crowdSafeSpeed(1, crowded)).toBe(1)
})

it("lets the benchmark handle measure the top speed at any crowd size", () => {
  simulationSpeedControl.crowdLimit = false
  try {
    expect(speedBlockedByCrowd(12, CROWD_SPEED_LIMIT.population * 5)).toBe(false)
    expect(crowdSafeSpeed(12, CROWD_SPEED_LIMIT.population * 5)).toBe(12)
  } finally {
    simulationSpeedControl.crowdLimit = true
  }
})
