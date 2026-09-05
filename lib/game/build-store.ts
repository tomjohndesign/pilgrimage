import { create } from "zustand"

import type { SimState } from "./sim"
import type { TreeResource, WoodPile } from "./trees/timber"
import type { Monk } from "./monks"
import type { Traveler } from "./travelers"

/**
 * Renderer/HUD snapshots of the live sim and active construction tool.
 * Purchases and placed structures belong to useSettlement and its augmented map.
 */
interface BuildState {
  tool: string | null
  /** Placement indices of trees that have been cut. */
  felled: ReadonlySet<number>
  treeResources: ReadonlyMap<number, TreeResource>
  piles: readonly WoodPile[]
  time: number
  resourceRevision: number
  simulation: SimState | null
  wood: number
  visits: number
  settlers: Monk[]
  syncResources: (sim: SimState, travelers?: readonly Traveler[]) => void
  setTool: (tool: string | null) => void
  setFelled: (felled: ReadonlySet<number>) => void
  reset: () => void
}

const emptyState = () => ({
  tool: null,
  felled: new Set<number>(),
  treeResources: new Map<number, TreeResource>(),
  piles: [] as WoodPile[],
  time: 0,
  resourceRevision: -1,
  simulation: null,
  wood: 0,
  visits: 0,
  settlers: [] as Monk[],
})

export const useBuildStore = create<BuildState>((set) => ({
  ...emptyState(),
  syncResources: (sim, travelers = []) => set((s) => {
    const settlers = travelers.flatMap((t) => {
      const live = sim.travelers.get(t.id)
      return live?.employer ? [{
        id: t.id,
        name: t.name,
        duty: "Lumber worker",
        attributes: { age: t.attributes.age, piety: live.piety, skills: t.attributes.skills },
      }] : []
    })
    return {
      simulation: sim,
      wood: sim.wood,
      visits: sim.visits,
      settlers: JSON.stringify(s.settlers) === JSON.stringify(settlers) ? s.settlers : settlers,
      time: sim.time,
      ...(s.simulation !== sim || s.resourceRevision !== sim.resourceRevision ? {
        resourceRevision: sim.resourceRevision,
        felled: s.simulation === sim && s.felled.size === sim.felled.size ? s.felled : new Set(sim.felled),
        treeResources: new Map(Array.from(sim.treeResources, ([id, tree]) => [id, { ...tree }])),
        piles: Array.from(sim.piles.values(), (pile) => ({ ...pile })),
      } : {}),
    }
  }),
  setTool: (tool) => set({ tool }),
  setFelled: (felled) => set({ felled }),
  reset: () => set(emptyState()),
}))
