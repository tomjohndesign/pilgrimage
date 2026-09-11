import { create } from "zustand"

/** Display speeds use the former 2× pace as the new normal. Rates stay in simulation ticks. */
export const SIMULATION_SPEEDS = [
  { label: 0.5, rate: 1 },
  { label: 1, rate: 2 },
  { label: 3, rate: 6 },
  { label: 6, rate: 12 },
] as const

/** Keep the retired 2× and the intermediate comparison rates available to the opt-in benchmark handle. */
export const BENCHMARK_SIMULATION_SPEEDS = [
  ...SIMULATION_SPEEDS,
  { label: 2, rate: 4 },
  { label: 4, rate: 8 },
  { label: 5, rate: 10 },
] as const
export type SimulationSpeed = typeof BENCHMARK_SIMULATION_SPEEDS[number]["rate"]

/** A crowd this size already fills a frame at 3×; 6× on top of it drops the sim
 * behind real time instead of running faster, so the HUD withholds the top speed. */
export const CROWD_SPEED_LIMIT = { rate: 12, population: 2000 } as const

/** Benchmarks measure the top speed at every crowd size; their handle clears this. */
export const simulationSpeedControl = { crowdLimit: true }

/** Whether a speed is out of reach for the current crowd. Only the top speed ever is. */
export function speedBlockedByCrowd(rate: number, population: number): boolean {
  return simulationSpeedControl.crowdLimit && rate === CROWD_SPEED_LIMIT.rate && population > CROWD_SPEED_LIMIT.population
}

/** Playback settles on the fastest speed the crowd still allows. */
export function crowdSafeSpeed(rate: SimulationSpeed, population: number): SimulationSpeed {
  if (!speedBlockedByCrowd(rate, population)) return rate
  let fallback: SimulationSpeed = SIMULATION_SPEEDS[0].rate
  for (const speed of SIMULATION_SPEEDS) if (speed.rate > fallback && !speedBlockedByCrowd(speed.rate, population)) fallback = speed.rate
  return fallback
}

export const MAX_SIMULATION_STEP = .1 * 12

/** Movement follows complete route segments and sweeps transport collisions.
 * Keep the 100 ms real-time bound at every supported speed: a slow frame must
 * not trigger extra whole-population passes and make the next frame slower.
 * The clamp also prevents background tabs catching up minutes of simulation. */
export function simulationFrameStep(delta: number, speed: number): { ticks: number; dt: number } {
  const clamped = Math.min(Math.max(0, delta), .1)
  const elapsed = clamped * speed
  const ticks = Math.max(1, Math.ceil(elapsed / MAX_SIMULATION_STEP))
  return { ticks, dt: elapsed / ticks }
}

/** Shared playback controls for the traveler simulation and ambient residents. */
export const useSimulationStore = create<{
  paused: boolean
  speed: SimulationSpeed
  togglePaused: () => void
  setSpeed: (speed: SimulationSpeed) => void
}>((set) => ({
  paused: false,
  speed: 2,
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  setSpeed: (speed) => set({ speed }),
}))
