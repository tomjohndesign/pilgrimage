import { create } from "zustand"

import type { SimState } from "./sim"
import type { TreeResource, WoodPile } from "./trees/timber"
import type { BuildingKind, PlacedBuilding } from "./buildings"

/**
 * What the player has built and which tool is in hand. Separate from the map,
 * which is generated once per seed and never mutated, so putting down a
 * building doesn't rebuild the terrain or restart the traveler sim.
 *
 * `felled` mirrors the sim's record of cut trees (see sim.ts) so the tree
 * renderer, a sibling of the sim in the scene, can drop them. The sim owns
 * the truth; the traveler component copies it here whenever it changes.
 */
interface BuildState {
  /** Building kind on the cursor, or null when not building. */
  tool: BuildingKind | null
  buildings: PlacedBuilding[]
  /** Placement indices (see trees/placement.ts) of trees that have been cut. */
  felled: ReadonlySet<number>
  /** Feeds unique building ids. */
  serial: number
  treeResources: ReadonlyMap<number, TreeResource>
  piles: readonly WoodPile[]
  time: number
  resourceRevision: number
  syncResources: (sim: SimState) => void

  setTool: (tool: BuildingKind | null) => void
  place: (building: PlacedBuilding) => void
  setFelled: (felled: ReadonlySet<number>) => void
  /** A new world: nothing built, nothing cut, tool put down. */
  reset: () => void
}

const EMPTY: ReadonlySet<number> = new Set()

export const useBuildStore = create<BuildState>((set) => ({
  tool: null,
  buildings: [],
  felled: EMPTY,
  serial: 0,
  treeResources: new Map(),
  piles: [],
  time: 0,
  resourceRevision: -1,
  syncResources: (sim) => set((s) => ({
    time: sim.time,
    ...(s.resourceRevision !== sim.resourceRevision ? {
      resourceRevision: sim.resourceRevision,
      felled: s.felled.size === sim.felled.size ? s.felled : new Set(sim.felled),
      treeResources: new Map(Array.from(sim.treeResources, ([id, tree]) => [id, { ...tree }])),
      piles: Array.from(sim.piles.values(), (pile) => ({ ...pile })),
    } : {}),
  })),

  setTool: (tool) => set({ tool }),

  place: (building) =>
    set((s) => ({ buildings: [...s.buildings, building], serial: s.serial + 1 })),

  setFelled: (felled) => set({ felled }),

  reset: () => set({ tool: null, buildings: [], felled: EMPTY, serial: 0, treeResources: new Map(), piles: [], time: 0, resourceRevision: -1 }),
}))
