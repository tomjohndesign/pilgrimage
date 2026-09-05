import { create } from "zustand"

import {
  cloneSpeciesTable,
  TREE_SPECIES,
  type TreeSpeciesDef,
  type TreeSpeciesId,
} from "./species"

/**
 * Live tree tuning. The forest renders from this table rather than from the
 * compiled-in defaults so the lab on /textures can edit a species and watch
 * every tree of that kind rebuild. Outside the lab it holds the defaults,
 * so /play costs nothing extra.
 *
 * Tuned values are meant to be copied back into species.ts as the new
 * defaults, not persisted here — the lab has an export button for that.
 */

export const DEFAULT_TREE_VARIANCE = 1

interface TreeTuningState {
  species: Record<TreeSpeciesId, TreeSpeciesDef>
  /** Global scale on every species range: 1 = full range, 0 = clones. */
  variance: number

  /** Shallow patch of one species' top-level sections. */
  patchSpecies: (
    id: TreeSpeciesId,
    patch: {
      trunk?: Partial<TreeSpeciesDef["trunk"]>
      crown?: Partial<TreeSpeciesDef["crown"]>
      habitat?: Partial<TreeSpeciesDef["habitat"]>
    },
  ) => void
  setVariance: (variance: number) => void
  resetSpecies: (id: TreeSpeciesId) => void
  resetAll: () => void
}

export const useTreeTuningStore = create<TreeTuningState>((set) => ({
  species: cloneSpeciesTable(),
  variance: DEFAULT_TREE_VARIANCE,

  patchSpecies: (id, patch) =>
    set((s) => {
      const current = s.species[id]
      const next: TreeSpeciesDef = {
        ...current,
        trunk: { ...current.trunk, ...patch.trunk },
        crown: { ...current.crown, ...patch.crown },
        habitat: { ...current.habitat, ...patch.habitat },
      }
      return { species: { ...s.species, [id]: next } }
    }),

  setVariance: (variance) => set({ variance }),

  resetSpecies: (id) =>
    set((s) => ({ species: { ...s.species, [id]: cloneSpeciesTable()[id] } })),

  resetAll: () => set({ species: cloneSpeciesTable(), variance: DEFAULT_TREE_VARIANCE }),
}))

/** True when a species differs from its compiled-in default. */
export function isSpeciesTuned(def: TreeSpeciesDef): boolean {
  return JSON.stringify(def) !== JSON.stringify(TREE_SPECIES[def.id])
}
