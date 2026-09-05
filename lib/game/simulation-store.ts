import { create } from "zustand"

/** Shared playback controls for the traveler simulation and ambient residents. */
export const useSimulationStore = create<{
  paused: boolean
  speed: 1 | 2 | 3
  togglePaused: () => void
  setSpeed: (speed: 1 | 2 | 3) => void
}>((set) => ({
  paused: false,
  speed: 1,
  togglePaused: () => set((s) => ({ paused: !s.paused })),
  setSpeed: (speed) => set({ speed }),
}))
