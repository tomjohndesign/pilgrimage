import { parseSeed } from "../game/rng"

export const LAYOUTS = { scattered: "Scattered destinations", clusters: "Two settlement clusters", bottleneck: "Woodland bottlenecks", original: "Original open layout" } as const
export const SOURCES = { west: "Arrivals from the west", both: "Arrivals from both ends", local: "Journeys between buildings" } as const
export interface Permutation { seed: number; layout: keyof typeof LAYOUTS; sources: keyof typeof SOURCES; destinations: number }
export const DEFAULT_PERMUTATION: Permutation = { seed: 1, layout: "scattered", sources: "both", destinations: 5 }
export function readPermutation(params: URLSearchParams): Permutation {
  const layout = params.get("layout"), sources = params.get("sources"), count = Number(params.get("destinations"))
  return {
    seed: parseSeed(params.get("seed") ?? "") ?? DEFAULT_PERMUTATION.seed,
    layout: layout && Object.hasOwn(LAYOUTS, layout) ? layout as Permutation["layout"] : DEFAULT_PERMUTATION.layout,
    sources: sources && Object.hasOwn(SOURCES, sources) ? sources as Permutation["sources"] : DEFAULT_PERMUTATION.sources,
    destinations: params.has("destinations") && Number.isFinite(count) ? Math.min(8, Math.max(2, Math.round(count))) : DEFAULT_PERMUTATION.destinations,
  }
}
