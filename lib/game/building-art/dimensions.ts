import { BASE_CHARACTER_SCALE, PERSON_SPRITE_SCALE } from "../base-person/gait"
import { BASE_PERSON } from "../base-person/pose"
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
/** A roof changes pitch after at most two tiles of horizontal run. */
export const MAX_ROOF_RUN = 2
/** Upper inn walls project beyond the tavern; the eaves extend farther again. */
export const INN_OVERHANG = .16
export const INN_ROOF_OVERHANG = .24
export const INN_UPPER_ROOF_PITCH = .85

/** Clear the uphill edge of the chimney cap, including the roof covering. */
export function innHearthRoofRise(width: number, depth: number, upper = true): number {
  const scale = Math.min(1, width / 1.5, depth / 1.5)
  if (!upper) return .1+(.5+.195*scale)*.32
  return .1 + (INN_OVERHANG + (.36 + .195) * scale) * INN_UPPER_ROOF_PITCH
}

export function roofRun(depth: number): number {
  return depth <= MAX_ROOF_RUN ? depth : depth / (2 * Math.ceil(depth / (2 * MAX_ROOF_RUN)))
}
/** Long roofs join back-to-back slopes; short open awnings keep their high front. */
export function roofProfile(depth: number, rise: number, awning = false) {
  const run = roofRun(depth), folded = depth > MAX_ROOF_RUN
  const breaks = folded ? Array.from({length: Math.round(depth/run)+1}, (_,i)=>-depth/2+i*run) : [-depth/2,depth/2]
  const height = (z: number) => {
    if (!folded) return rise * (awning ? (z+depth/2)/depth : (depth/2-z)/depth)
    const along = Math.max(0,Math.min(depth,depth/2-z)), phase = along % (2*run)
    return rise * (phase <= run ? phase/run : 2-phase/run)
  }
  return {breaks, height, folded}
}
/** Actual default sprite stature plus headroom, in the same world units as the shell. */
export const BUILDING_DOOR_HEIGHT = (BASE_PERSON.body.headCenter + BASE_PERSON.body.headHeight)
  * PERSON_SPRITE_SCALE * BASE_CHARACTER_SCALE / BASE_PERSON.camera.viewSize + .08

/** Open fronts sit beneath the high edge of an awning that drains to the rear. */
export function hasFrontAwning(variant: string | undefined): boolean {
  return ["shelter", "monk-shelter", "workshop", "market", "guard-post", "wood-shelter"].includes(variant ?? "")
}

/** A gentle shared pitch, measured over the roof's downhill span. */
export function singlePlaneRoofRise(span: number): number {
  return roofRun(span) * .32
}

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
