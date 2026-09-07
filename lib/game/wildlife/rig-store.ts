"use client"
import { create } from "zustand"
import { persist } from "zustand/middleware"
import { validateAnimalEdits, type AnimalRigEdits } from "./rig-edits"

export const useAnimalRigStore = create<{ designs: Record<string, AnimalRigEdits>; save: (kind: string, edits: AnimalRigEdits) => void }>()(persist(set => ({
  designs: {}, save: (kind, edits) => set(state => ({ designs: { ...state.designs, [kind]: validateAnimalEdits(edits) } })),
}), { name: "pilgrimage-animal-rigs-v1", merge: (persisted, current) => {
  const designs: Record<string, AnimalRigEdits> = {}
  const saved = (persisted as { designs?: Record<string, unknown> })?.designs
  if (saved) for (const [kind, edits] of Object.entries(saved)) { try { designs[kind] = validateAnimalEdits(edits) } catch { /* Discard invalid local drafts. */ } }
  return { ...current, designs }
} }))
