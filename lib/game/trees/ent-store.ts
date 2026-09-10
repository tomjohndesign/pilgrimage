"use client"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { validateEntDesign, type EntDesign } from "./ent-rig"
import { isFoliageSpecies, type FoliageSpecies } from "./foliage/design"

export const useEntStore = create<{ designs: Partial<Record<FoliageSpecies, EntDesign>>; save: (species: FoliageSpecies, design: EntDesign) => void }>()(persist(set => ({
  designs: {}, save: (species, design) => set(s => ({ designs: { ...s.designs, [species]: validateEntDesign(design) } })),
}), { name: "pilgrimage-ent-rigs-v1", merge: (persisted, current) => {
  const designs: Partial<Record<FoliageSpecies, EntDesign>> = {}
  for (const [species, design] of Object.entries((persisted as { designs?: Record<string, unknown> })?.designs ?? {})) {
    if (isFoliageSpecies(species)) { try { designs[species] = validateEntDesign(design) } catch { /* Ignore invalid drafts. */ } }
  }
  return { ...current, designs }
} }))
