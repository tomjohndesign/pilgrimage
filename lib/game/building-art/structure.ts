import type { BuildingDef } from "../map/types"
import { buildingParts, type BuildingPart } from "./geometry"
import { earlyBuildingParts, type SettlementBuildingType } from "./early-geometry"
import { EARLY_BUILDINGS, earlyBuildingRecipe } from "./style"

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
  if (preset) return buildingParts({ ...earlyBuildingRecipe(preset.id), width: building.w, depth: building.d, wallHeight: building.height })

  if (isSettlementType(building.buildType)) return earlyBuildingParts({
    ...earlyBuildingRecipe("shepherd-hut"),
    variant: building.buildType,
    width: building.w,
    depth: building.d,
    wallHeight: building.height,
    roofRise: SETTLEMENT_ROOFS[building.buildType],
  })

  // Untyped, older map structures also receive real construction at their footprint.
  return buildingParts({
    ...earlyBuildingRecipe("shepherd-hut"),
    width: building.w,
    depth: building.d,
    wallHeight: Math.max(0.25, Math.min(1.4, building.height)),
  })
}
