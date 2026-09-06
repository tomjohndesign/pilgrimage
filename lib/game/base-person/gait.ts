import { BASE_PERSON, WALK_STANCE_FRACTION, walkFoot, type BodySide } from "./pose"
import { DEFAULT_DESIGN, personRecipe, type PersonDesign } from "./design"

export const BASE_CHARACTER_SCALE = 1.5
export const PERSON_SPRITE_SCALE = 0.74 * BASE_PERSON.cellSize / 48

/**
 * A planted foot sweeps from +reach to -reach during 60% of a cycle.
 * Advance the body by exactly that sweep to keep the foot on the ground.
 * The bake camera's view size converts rig units into rendered world tiles.
 */
export function personWalkStride(design: PersonDesign, spriteScale = PERSON_SPRITE_SCALE,
  viewSize = BASE_PERSON.camera.viewSize): number {
  return 2 * personRecipe(design).body.stride / WALK_STANCE_FRACTION * spriteScale / viewSize
}

/** About 0.353 tiles per left/right cycle at the default on-road size. */
export const DEFAULT_WALK_STRIDE = personWalkStride(DEFAULT_DESIGN) * BASE_CHARACTER_SCALE
/** Brisk walking; personal pace and gentle variation modulate this baseline. */
export const DEFAULT_WALK_CADENCE = 1.15
export const DEFAULT_WALK_SPEED = DEFAULT_WALK_STRIDE * DEFAULT_WALK_CADENCE

export function walkSpeedScale(stride: number, characterScale: number): number {
  return stride * characterScale / DEFAULT_WALK_STRIDE
}

/** Ground contact of the load-bearing foot in the actual displayed rig pose. */
export function walkContact(phase: number, frames: number, body: typeof BASE_PERSON.body) {
  const framePhase = Math.floor(phase * frames) / frames
  // Transfer weight after the short double-support interval, while both soles
  // are down. Each foot then supports the body through its flat stance.
  const side: BodySide = framePhase >= WALK_STANCE_FRACTION - 0.5 && framePhase < WALK_STANCE_FRACTION ? "left" : "right"
  const { ankle } = walkFoot(side, framePhase, body)
  return { side, x: ankle[0], z: ankle[2] + body.footLength * 0.22 }
}

type GroundPoint = { x: number; y?: number; z: number }
export interface FootPlant {
  key: string
  anchor: GroundPoint
  origin: GroundPoint
}

/** Preserve the rig's support contact between atlas frames, including turns. */
export function plantFoot(previous: FootPlant | null, key: string, origin: GroundPoint, foot: GroundPoint) {
  const reset = !previous || previous.key !== key || Math.hypot(origin.x - previous.origin.x, origin.z - previous.origin.z) > 1
  const anchor = reset ? { x: origin.x + foot.x, y: (origin.y ?? 0) + (foot.y ?? 0), z: origin.z + foot.z } : previous.anchor
  return {
    plant: { key, anchor, origin: { ...origin } },
    offset: { x: anchor.x - origin.x - foot.x, y: (anchor.y ?? 0) - (origin.y ?? 0) - (foot.y ?? 0), z: anchor.z - origin.z - foot.z },
  }
}
