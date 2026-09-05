"use client"

import { create } from "zustand"
import { validatePersonDesign, type PersonDesign } from "./design"
import type { BasePersonBake } from "./bake"

const STORAGE = "pilgrimage-person-design-v4"
let hydrated = false
interface DesignState {
  design: PersonDesign | null
  atlas: BasePersonBake | null
  error: string
  apply: (design: PersonDesign, atlas: BasePersonBake) => void
  reset: () => void
  hydrate: () => Promise<void>
}
export const usePersonDesignStore = create<DesignState>((set, get) => ({
  design: null, atlas: null, error: "",
  apply: (input, atlas) => {
    const design = validatePersonDesign(input)
    if (JSON.stringify(design) !== JSON.stringify(atlas.metadata.design)) throw new Error("Wait for this design to finish rendering.")
    set({ design, atlas, error: "" })
    try { localStorage.setItem(STORAGE, JSON.stringify(design)) } catch { set({ error: "Applied for this session; browser storage is unavailable." }) }
  },
  reset: () => {
    set({ design: null, atlas: null, error: "" })
    try { localStorage.removeItem(STORAGE) } catch { /* Still reset this session. */ }
  },
  hydrate: async () => {
    if (hydrated || typeof window === "undefined") return
    hydrated = true
    try {
      const saved = localStorage.getItem(STORAGE)
      if (!saved) return
      const design = validatePersonDesign(JSON.parse(saved))
      set({ design })
      const { cachedPersonBake } = await import("./bake")
      const atlas = cachedPersonBake(design)
      // Applying or resetting while the module loads takes precedence.
      if (get().design === design) set({ atlas })
    } catch { set({ design: null, atlas: null, error: "The saved design could not load. Using the project default." }) }
  },
}))
