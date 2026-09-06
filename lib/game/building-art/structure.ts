import type { BuildingDef } from "../map/types"
import { buildingParts, type BuildingPart } from "./geometry"
import { EARLY_BUILDINGS, earlyBuildingRecipe } from "./style"
import { BUILDING_FLOOR_TOP } from "./dimensions"

export type StructureAppearance = Pick<BuildingDef, "buildType" | "w" | "d" | "height" | "color" | "roofColor">

export function isProceduralStructure(buildType: string | undefined): boolean {
  return EARLY_BUILDINGS.some((preset) => preset.id === buildType)
}

/** One source for placed structures, construction ghosts and build-menu images. */
export function structureParts(building: StructureAppearance): BuildingPart[] {
  const preset = EARLY_BUILDINGS.find((item) => item.id === building.buildType)
  if (preset) return buildingParts({ ...earlyBuildingRecipe(preset.id), width: building.w, depth: building.d, wallHeight: building.height })

  const box = (name: string, layer: BuildingPart["layer"], position: BuildingPart["position"], size: BuildingPart["size"], color: string): BuildingPart =>
    ({ name, layer, position, size, color })
  if (building.buildType === "lumberCamp") return [
    box("yard", "base", [0, BUILDING_FLOOR_TOP - 0.022, 0], [building.w * 0.98, 0.044, building.d * 0.98], "#a18a60"),
    ...[-1, 1].flatMap((x) => [-1, 1].map((z) => box(`peg-${x}-${z}`, "wall",
      [x * (building.w / 2 - 0.12), 0.13, z * (building.d / 2 - 0.12)], [0.08, 0.26, 0.08], "#705135"))),
  ]
  const cross = building.buildType === "cross"
  return [
    box("body", "wall", [0, building.height / 2, 0],
      [cross ? 0.14 : building.w * 0.86, building.height, cross ? 0.14 : building.d * 0.86], building.color),
    box("cap", "roof", [0, cross ? building.height * 0.72 : building.height + 0.09, 0],
      [cross ? 0.7 : building.w * 0.98, 0.18, cross ? 0.14 : building.d * 0.98], building.roofColor),
  ]
}
