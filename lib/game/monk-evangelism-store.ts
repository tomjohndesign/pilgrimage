import { create } from "zustand"

interface EvangelismControls {
  available: boolean
  assigned: ReadonlySet<number>
  request: (id: number) => void
  recall: (id: number) => void
}
export const useMonkEvangelismStore = create<EvangelismControls>((set, get) => ({
  available: false, assigned: new Set(),
  request: id => { if (get().available) set({ assigned: new Set([...get().assigned, id]) }) },
  recall: id => { const assigned = new Set(get().assigned); assigned.delete(id); set({ assigned }) },
}))
