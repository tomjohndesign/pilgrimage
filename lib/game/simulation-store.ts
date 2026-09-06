import { create } from "zustand"

/** Display speeds use the former 2× pace as the new normal. Rates stay in simulation ticks. */
export const SIMULATION_SPEEDS = [
  { label: 0.5, rate: 1 },
  { label: 1, rate: 2 },
  { label: 2, rate: 4 },
  { label: 3, rate: 6 },
  { label: 5, rate: 10 },
] as const
type SimulationSpeed = typeof SIMULATION_SPEEDS[number]["rate"]

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
