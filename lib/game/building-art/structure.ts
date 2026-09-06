import type { BuildingDef } from "../map/types"
import { buildingParts, type BuildingPart } from "./geometry"
import { earlyBuildingParts, type SettlementBuildingType } from "./early-geometry"
import { DEFAULT_RECIPE, EARLY_BUILDINGS, earlyBuildingRecipe } from "./style"

export type StructureAppearance = Pick<BuildingDef, "buildType" | "w" | "d" | "height" | "color" | "roofColor">

/** Roof proportions for the original catalogue, using the shared rural kit. */
const SETTLEMENT_ROOFS = {
  shelter: 0.55,
  workshop: 0.6,
  hall: 0.75,
  garden: 0,
  cross: 0,
  lumberCamp: 0,
  market: 0.4,
  "guard-post": 0.4,
} satisfies Record<SettlementBuildingType, number>

function isSettlementType(type: string | undefined): type is SettlementBuildingType {
  return type !== undefined && Object.hasOwn(SETTLEMENT_ROOFS, type)
}

/** One source for placed structures, construction ghosts and build-menu images. */
export function structureParts(building: StructureAppearance): BuildingPart[] {
  const preset = EARLY_BUILDINGS.find((item) => item.id === building.buildType)
  if (preset) {
    const parts = buildingParts({ ...earlyBuildingRecipe(preset.id), width: building.w, depth: building.d, wallHeight: building.height })
    // Food and timber are live inventories; leave room for them in the store.
    if (building.buildType !== "storehouse") return parts
    const contents: BuildingPart[] = []
    // Empty food bins remain recognizable before the first delivery.
    const binWidth = building.w * 0.18, binDepth = building.d * 0.16
    for (let slot = 0; slot < 4; slot++) {
      const x = (slot - 1.5) * building.w * 0.21, z = -building.d * 0.33
      const box = (name: string, position: BuildingPart["position"], size: BuildingPart["size"]) =>
        contents.push({ name: `food-bin-${slot}-${name}`, layer: "interior", position, size, color: "#8c7658", outline: false })
      box("bottom", [x, 0.35, z], [binWidth, 0.04, binDepth])
      for (const side of [-1, 1]) {
        box(`side-${side}`, [x + side * binWidth / 2, 0.44, z], [0.025, 0.18, binDepth])
        box(`end-${side}`, [x, 0.44, z + side * binDepth / 2], [binWidth, 0.18, 0.025])
      }
    }
    return [...parts.filter(p => p.name !== "grain-sack"), ...contents]
  }

  if (isSettlementType(building.buildType)) return earlyBuildingParts({
    ...earlyBuildingRecipe("shepherd-hut"),
    variant: building.buildType,
    width: building.w,
    depth: building.d,
    wallHeight: building.height,
    roofRise: SETTLEMENT_ROOFS[building.buildType],
  }).filter(p => building.buildType !== "workshop" || !p.name.startsWith("firewood-"))

  // Untyped, older map structures also receive real construction at their footprint.
  return buildingParts({
    ...earlyBuildingRecipe("shepherd-hut"),
    width: building.w,
    depth: building.d,
    wallHeight: Math.max(0.25, Math.min(1.4, building.height)),
  })
}

/** Cut away the shell while retaining the floor, furnishings and live contents. */
export function visibleStructureParts(parts: BuildingPart[], cutaway: boolean): BuildingPart[] {
  return cutaway ? parts.filter(p => p.layer === "base" || p.layer === "interior") : parts
}

/** The shrine keeps four open gates beneath a canopy supported at the corners. */
export function shrineStructureParts(width: number, depth: number): BuildingPart[] {
  return [
    ...buildingParts({ ...DEFAULT_RECIPE, width, depth }),
    ...buildingParts({ ...earlyBuildingRecipe("monk-shelter"), width, depth, wallHeight: 0.9 })
      .filter(p => p.layer === "roof" || p.name.startsWith("earthfast-post-")),
  ]
}
