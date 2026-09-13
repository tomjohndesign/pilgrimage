import { buildingDoorOffset } from "../building-rotation"
import { layoutHand } from "../building-layout"
import { churchWallBuilder, CHURCH_PLASTER, type ChurchOpening } from "./church-wall"
import type { BuildingPart } from "./geometry"
import type { BuildingRecipe } from "./style"
import { EARLY_MATERIALS as palette } from "./materials"
import type { ChurchWing } from "../church-additions"

/** Enclose the existing beds and hearth in the same masonry as the church.
 * Attached rooms continue the church aisle; older standalone rooms have gables.
 * Coordinates are authored before the complete layout is mirrored or rotated.
 */
export function monkResidenceWalls(recipe: Pick<BuildingRecipe, "width" | "depth" | "wallHeight" | "roofRise" | "layoutSeed"> & { churchWing?: ChurchWing }): BuildingPart[] {
  const { width, depth, wallHeight: eave, roofRise: rise, layoutSeed } = recipe
  const parts: BuildingPart[] = [], wall = churchWallBuilder(parts)
  const x = width / 2 - .13, z = depth / 2 - .13
  const wing = recipe.churchWing, front = wing ? depth / 2 : z
  const doorX = buildingDoorOffset(width, "monk-shelter", layoutSeed) * layoutHand("monk-shelter", layoutSeed)
  const radius = Math.min(.22, eave * .22, x * .6)
  const shoulder = Math.min(.83, eave - radius - .04)
  const window: ChurchOpening = { centre: 0, sill: eave * .38, shoulder: eave * .66, radius: Math.min(.14, eave * .14, z * .35) }
  for (const side of [-1, 1]) {
    wall(`residence-side-${side}`, "x", side * x, -z, front, 0, eave, [window])
    parts.push({ name: `residence-side-sill-${side}`, layer: "wall", position: [side * x, .045, 0],
      size: [.12, .09, z * 2], color: palette.stone, outline: false, cutawaySide: [side, 0] })
  }
  if (!wing) wall("residence-entrance", "z", z, -x, x, 0, eave, [{ centre: doorX, sill: 0, shoulder, radius }])
  wall("residence-rear", "z", -z, -x, x, 0, eave, [{ ...window, radius: Math.min(window.radius, x * .35) }])
  for (const end of [-1, 1]) {
    if (wing) {
      parts.push({ name: `residence-roof-infill-${end}`, layer: "wall", position: [0, 0, 0],
        vertices: [end * x, eave, -z, end * x, eave, front, end * x, eave + rise, front,
          end * x, eave, -z, end * x, eave + rise, front, end * x, eave + rise * .13 / depth, -z],
        color: CHURCH_PLASTER, outline: false, cutawaySide: [end, 0] })
      continue
    }
    // Plastered gable infill follows the thatch pitch right up to the ridge.
    const top = eave + rise * (1 - x / (width / 2))
    parts.push({ name: `residence-gable-${end}`, layer: "wall", position: [0, 0, 0],
      vertices: [-x, eave, end * z, x, eave, end * z, x, top, end * z,
        -x, eave, end * z, x, top, end * z, 0, eave + rise, end * z,
        -x, eave, end * z, 0, eave + rise, end * z, -x, top, end * z],
      color: CHURCH_PLASTER, outline: false, cutawaySide: [0, end] })
  }
  return parts
}
