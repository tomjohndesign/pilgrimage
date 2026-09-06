import { create } from "zustand"
import type { ProcessionStage } from "./relic-procession"

interface ProcessionControls {
  available: boolean
  monkId: number | null
  stage: ProcessionStage
  returnRequested: boolean
  request: (id: number) => void
  returnRelic: () => void
}
export const useRelicProcessionStore = create<ProcessionControls>((set, get) => ({
  available: false, monkId: null, stage: "idle", returnRequested: false,
  request: monkId => { if (get().available && get().monkId === null) set({ monkId, returnRequested: false }) },
  returnRelic: () => { if (get().monkId !== null) set({ returnRequested: true }) },
}))
