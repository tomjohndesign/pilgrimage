import { yawForView } from "../render/iso"
import { PERSON_WIDTH } from "../world-scale"
import type { BuildingRecipe } from "./style"

/** Scale of authored timber, stone and straw details, independent of tile size. */
export const BUILDING_DETAIL_SCALE = 0.5
/** Clear terrain z-fighting while staying below the sprite's ground clearance. */
export const BUILDING_FLOOR_TOP = 0.001
export const BUILDING_BASE_HEIGHT = 0.08
export const BUILDING_EAVE_OFFSET = 0.04
export const HOVEL_WALL_HEIGHT = 0.9
export const HOVEL_ROOF_RISE = 0.825

export function buildingDimensions(recipe: Pick<BuildingRecipe, "width" | "depth" | "wallHeight" | "roofRise" | "variant">) {
  // Width/depth are the occupied tiles. Only the small roof overhang insets walls.
  const width = recipe.width
  const depth = recipe.depth
  const early = !["gable", "hipped", "porch"].includes(recipe.variant)
  const wallWidth = width - (early ? 0.11 : 0.65 * BUILDING_DETAIL_SCALE)
  const wallDepth = depth - (early ? 0.11 : 0.65 * BUILDING_DETAIL_SCALE)
  return {
    width, depth, wallWidth, wallDepth,
    front: wallDepth / 2 - (recipe.variant === "porch" ? 0.65 * BUILDING_DETAIL_SCALE : 0),
    eaveHeight: BUILDING_BASE_HEIGHT + recipe.wallHeight + BUILDING_EAVE_OFFSET,
    ridgeHeight: recipe.variant === "enclosure" ? Math.max(0.44, recipe.wallHeight + 0.34) : (recipe.variant === "storehouse" ? 0.3 : BUILDING_BASE_HEIGHT) + recipe.wallHeight + BUILDING_EAVE_OFFSET + recipe.roofRise + (recipe.variant === "monk-shelter" ? 0.26 : 0),
  }
}

/** A normal game character beside a visible wall, retained in generation guides. */
export function referencePersonPosition(recipe: Parameters<typeof buildingDimensions>[0], view: number): [number, number, number] {
  const { wallWidth, wallDepth } = buildingDimensions(recipe)
  const yaw = yawForView(view)
  const left = (wallWidth + wallDepth) / (2 * Math.SQRT2) + PERSON_WIDTH
  return [-left * Math.cos(yaw) + 0.5 * Math.sin(yaw), 0, left * Math.sin(yaw) + 0.5 * Math.cos(yaw)]
}
