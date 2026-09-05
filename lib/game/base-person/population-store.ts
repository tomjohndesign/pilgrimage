"use client"

import { create } from "zustand"
import type { PersonDesign } from "./design"
import type { PopulationPack } from "./population"

let revision = 0
let currentKey = ""
interface PopulationState {
  pack: PopulationPack | null
  progress: number
  building: boolean
  error: string
  prepare: (design: PersonDesign | null) => Promise<void>
}
export const usePopulationStore = create<PopulationState>((set) => ({
  pack: null, progress: 0, building: false, error: "",
  prepare: async design => {
    const key = JSON.stringify(design)
    if (key === currentKey) return
    currentKey = key
    const request = ++revision
    if (!design) { set({ pack: null, progress: 0, building: false, error: "" }); return }
    // Retain the previous crowd while the new foundation is prepared.
    set({ building: true, progress: 0, error: "" })
    try {
      const { bakePopulation } = await import("./bake-population")
      if (request !== revision) return
      const pack = await bakePopulation(design,
        progress => { if (request === revision) set({ progress }) }, () => request !== revision)
      if (request === revision) set({ pack, progress: 1, building: false })
    } catch (error) {
      if (request !== revision) return
      currentKey = ""
      set({ building: false, error: error instanceof Error ? error.message : "The road characters could not update." })
    }
  },
}))
