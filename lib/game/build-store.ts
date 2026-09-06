import type { FoodStock } from "./storage"
import { create } from "zustand"
import { normalizeBuildingRotation, type BuildingRotation } from "./building-rotation"

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
  rotation: BuildingRotation
  rotateBuilding: (direction: number) => void
  /** Placement indices of trees that have been cut. */
  felled: ReadonlySet<number>
  treeResources: ReadonlyMap<number, TreeResource>
  foodStores: ReadonlyMap<string, FoodStock>
  piles: readonly WoodPile[]
  time: number
  resourceRevision: number
  simulation: SimState | null
  wood: number
  shrineGold: number
  visits: number
  settlers: Monk[]
  syncResources: (sim: SimState, travelers?: readonly Traveler[]) => void
  setTool: (tool: string | null) => void
  setFelled: (felled: ReadonlySet<number>) => void
  reset: () => void
}

const emptyState = () => ({
  tool: null,
  rotation: 0 as BuildingRotation,
  felled: new Set<number>(),
  treeResources: new Map<number, TreeResource>(),
  foodStores: new Map<string, FoodStock>(),
  piles: [] as WoodPile[],
  time: 0,
  resourceRevision: -1,
  simulation: null,
  wood: 0,
  shrineGold: 0,
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
      shrineGold: sim.shrineGold,
      visits: sim.visits,
      settlers: JSON.stringify(s.settlers) === JSON.stringify(settlers) ? s.settlers : settlers,
      time: sim.time,
      ...(s.foodStores.size !== sim.foodStores.size || Array.from(sim.foodStores).some(([id, stock]) => s.foodStores.get(id) !== stock)
        ? { foodStores: new Map(sim.foodStores) } : {}),
      ...(s.simulation !== sim || s.resourceRevision !== sim.resourceRevision ? {
        resourceRevision: sim.resourceRevision,
        felled: s.simulation === sim && s.felled.size === sim.felled.size ? s.felled : new Set(sim.felled),
        treeResources: new Map(Array.from(sim.treeResources, ([id, tree]) => [id, { ...tree }])),
        piles: Array.from(sim.piles.values(), (pile) => ({ ...pile })),
      } : {}),
    }
  }),
  setTool: (tool) => set((s) => ({ tool, rotation: s.tool === tool ? s.rotation : 0 })),
  rotateBuilding: (direction) => set((s) => s.tool ? { rotation: normalizeBuildingRotation(s.rotation + direction) } : {}),
  setFelled: (felled) => set({ felled }),
  reset: () => set(emptyState()),
}))
