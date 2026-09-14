import type { BuildingPart } from "./geometry"
import type { WaterSourceKind } from "../water-sources/assets"

/** Timber curb paint distinguishes owned wells; natural ponds have no markers.
 * Shared by procedural previews and overlays on the existing baked water sprites. */
export function waterMarkerParts(kind: WaterSourceKind): BuildingPart[] {
  const color = "#897656"
  if (kind === "well") return [-1, 1].flatMap(side => [
    { name: `identity-well-rim-x-${side}`, layer: "base" as const, position: [side * .588, .535, 0] as [number, number, number], size: [.018, .055, 1.18] as [number, number, number], color, playerAccent: true, outline: false },
    { name: `identity-well-rim-z-${side}`, layer: "base" as const, position: [0, .535, side * .594] as [number, number, number], size: [1.16, .055, .018] as [number, number, number], color, playerAccent: true, outline: false },
  ])
  return []
}
