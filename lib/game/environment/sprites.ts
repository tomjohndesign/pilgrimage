import { CHARACTER_PIXEL_SIZE } from "../render/pixel-scale"
import { BOULDER_SIZES, ENVIRONMENT_KINDS, type EnvironmentKind } from "./elements"

export interface EnvironmentSpriteFrame {
  cellSize: number
  extent: number
  anchor: readonly [number, number]
  directions: number
  variants: number
  rows: number
}

export const ENVIRONMENT_FRAME = {
  cellSize: 64, extent: 64 * CHARACTER_PIXEL_SIZE, anchor: [32, 43] as const,
  directions: 8, variants: 3, rows: ENVIRONMENT_KINDS.length * 3,
}
export const ENVIRONMENT_ATLAS = {
  color: "/textures/environment/v2/color.png",
  depth: "/textures/environment/v2/depth.png",
}
export const BOULDER_FRAME = {
  cellSize: 128, extent: 128 * CHARACTER_PIXEL_SIZE, anchor: [64, 88] as const,
  directions: 8, variants: 3, rows: BOULDER_SIZES.length * 3,
}
export const BOULDER_ATLAS = {
  color: "/textures/environment/v3/boulders-color.png",
  depth: "/textures/environment/v3/boulders-depth.png",
}
/** These plants are painted into terrain; taller shrubs and stones keep depth sprites. */
export function isGroundGrowth(kind: EnvironmentKind) {
  return kind === "grass" || kind === "groundcover" || kind === "wildflowers"
}
