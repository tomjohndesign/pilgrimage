import { wallSide } from "./cutaway"
import type { BuildingDef } from "../map/types"
import { buildingParts, type BuildingPart } from "./geometry"
import { earlyBuildingParts, type SettlementBuildingType } from "./early-geometry"
import { EARLY_BUILDINGS, earlyBuildingRecipe } from "./style"
import { singlePlaneRoofRise } from "./dimensions"

export type StructureAppearance = Pick<BuildingDef, "buildType" | "w" | "d" | "height" | "color" | "roofColor">

const SETTLEMENT_TYPES: readonly SettlementBuildingType[] = [
  "shelter", "workshop", "hall", "garden", "cross", "lumberCamp", "market", "guard-post", "sheep-pen",
]

function isSettlementType(type: string | undefined): type is SettlementBuildingType {
  return SETTLEMENT_TYPES.some(item => item === type)
}

/** One source for placed structures, construction ghosts and build-menu images. */
export function structureParts(building: StructureAppearance): BuildingPart[] {
  const preset = EARLY_BUILDINGS.find((item) => item.id === building.buildType)
  if (preset) {
    const parts = buildingParts({ ...earlyBuildingRecipe(preset.id), width: building.w, depth: building.d, wallHeight: building.height,
      roofRise: preset.id === "enclosure" ? 0 : singlePlaneRoofRise(building.d) })
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
    ...earlyBuildingRecipe("house"),
    variant: building.buildType,
    width: building.w,
    depth: building.d,
    wallHeight: building.height,
    roofRise: singlePlaneRoofRise(building.d),
  }).filter(p => building.buildType !== "workshop" || !p.name.startsWith("firewood-"))

  // Untyped, older map structures also receive real construction at their footprint.
  return buildingParts({
    ...earlyBuildingRecipe("house"),
    width: building.w,
    depth: building.d,
    wallHeight: Math.max(0.25, Math.min(1.4, building.height)),
    roofRise: singlePlaneRoofRise(building.d),
  })
}

/** Remove every roof and the near walls; retain the walls behind the interior. */
export function visibleStructureParts(parts: BuildingPart[], cutaway: boolean, camera: [number, number] = [1, 1]): BuildingPart[] {
  return cutaway ? parts.filter(p => {
    if (p.layer === "roof") return false
    if (p.layer !== "wall") return true
    const side = wallSide(p)
    return side[0] * camera[0] + side[1] * camera[1] < -0.001
  }) : parts
}

/** Head of the post, where the cross is stepped on above the pointing board. */
export const SIGNPOST_HEIGHT = 0.78

/** The wayside marker at the shrine's fork; its board points along local +X. */
export function signpostParts(seed = 0): BuildingPart[] {
  return earlyBuildingParts({
    ...earlyBuildingRecipe("shepherd-hut"),
    variant: "signpost", width: 1, depth: 1, wallHeight: SIGNPOST_HEIGHT, roofRise: 0, seed,
  })
}

export { shrineStructureParts } from "./shrine-geometry"
