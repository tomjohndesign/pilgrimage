/**
 * Object-ID outline rendering. Pure helpers — no three.js, no React — so the
 * encoding and mode plumbing can be unit-tested headlessly.
 *
 * Every outline-able object (buildings, trees) renders a flat ID colour into an
 * offscreen buffer on a dedicated layer; terrain renders ID 0 there, writing
 * depth only. A screen-space pass then draws an edge where two *different,
 * non-zero* IDs meet — so an outline appears exactly where one object overlaps
 * another on screen, and never where an object just sits against grass.
 */

/** The three.js layer that ID-coloured silhouette meshes live on. */
export const OUTLINE_ID_LAYER = 1
export const OUTLINE_ID_LAYER_MASK = 1 << OUTLINE_ID_LAYER

/**
 * Rendering modes, in the order the O key cycles through them:
 *  - overlap:    outline only where an object overlaps a different object.
 *  - silhouette: outline the whole silhouette, terrain boundaries included.
 *  - off:        no outlines, lighting alone separates objects.
 */
export const OUTLINE_MODES = ["overlap", "silhouette", "off"] as const
export type OutlineMode = (typeof OUTLINE_MODES)[number]

export const DEFAULT_OUTLINE_MODE: OutlineMode = "overlap"

export const OUTLINE_MODE_LABELS: Record<OutlineMode, string> = {
  overlap: "Overlap only",
  silhouette: "Full silhouette",
  off: "Off",
}

export function nextOutlineMode(mode: OutlineMode): OutlineMode {
  return OUTLINE_MODES[(OUTLINE_MODES.indexOf(mode) + 1) % OUTLINE_MODES.length]
}

/** IDs use 8 bits in each of the R and G channels. ID 0 means "not an object". */
export const MAX_OBJECT_ID = 0xffff

/**
 * Encode an ID as linear RGB in 0–1, exact under 8-bit-per-channel quantisation.
 * The matching decode lives in the outline pass fragment shader.
 */
export function encodeObjectId(id: number): [number, number, number] {
  if (!Number.isInteger(id) || id < 0 || id > MAX_OBJECT_ID) {
    throw new Error(`Object id out of range: ${id}`)
  }
  return [(id & 0xff) / 255, ((id >> 8) & 0xff) / 255, 0]
}

/** Inverse of `encodeObjectId`, for tests and readback debugging. */
export function decodeObjectId(r: number, g: number): number {
  return Math.round(r * 255) + 256 * Math.round(g * 255)
}

/** Buildings take the first block of IDs, starting above the reserved 0. */
export function buildingObjectId(buildingIndex: number): number {
  return 1 + buildingIndex
}

/** Trees follow the buildings, one ID per tree so each reads as its own object. */
export function treeObjectId(buildingCount: number, treeIndex: number): number {
  return 1 + buildingCount + treeIndex
}

/**
 * Travelers count down from the top of the ID space, so they never collide
 * with the building/tree block growing up from the bottom.
 */
export function travelerObjectId(travelerIndex: number): number {
  return MAX_OBJECT_ID - travelerIndex
}

/**
 * Outline thickness in CSS pixels. The edge pass samples neighbours at this
 * screen-space distance, so lines render at a constant display width at every
 * zoom level and DPR.
 */
export const OUTLINE_THICKNESS_PX = 2
