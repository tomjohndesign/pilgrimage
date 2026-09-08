import { create } from "zustand"

/** Display speeds use the former 2× pace as the new normal. Rates stay in simulation ticks. */
export const SIMULATION_SPEEDS = [
  { label: 0.5, rate: 1 },
  { label: 1, rate: 2 },
  { label: 2, rate: 4 },
  { label: 3, rate: 6 },
  { label: 6, rate: 12 },
] as const

/** Keep intermediate comparison rates available to the opt-in benchmark handle. */
export const BENCHMARK_SIMULATION_SPEEDS = [
  ...SIMULATION_SPEEDS,
  { label: 4, rate: 8 },
  { label: 5, rate: 10 },
] as const
type SimulationSpeed = typeof BENCHMARK_SIMULATION_SPEEDS[number]["rate"]

export const MAX_SIMULATION_STEP = .35

/** Combine playback work into bounded game-time steps. At 30–60 FPS even 5× needs
 * one population pass, including rounded 33.4 ms frames. The separate 100 ms real-time clamp still prevents a
 * background tab from trying to catch up minutes of missed simulation. */
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
