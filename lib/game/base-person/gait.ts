import { BASE_PERSON, WALK_STANCE_FRACTION, walkFoot, type BodySide } from "./pose"
import { DEFAULT_DESIGN, personBody, type PersonDesign } from "./design"

export const BASE_CHARACTER_SCALE = 1.5
export const PERSON_SPRITE_SCALE = 0.74 * BASE_PERSON.cellSize / 48

/**
 * A planted foot sweeps from +reach to -reach during 60% of a cycle.
 * Advance the body by exactly that sweep to keep the foot on the ground.
 * The bake camera's view size converts rig units into rendered world tiles.
 */
export function personWalkStride(design: PersonDesign, spriteScale = PERSON_SPRITE_SCALE,
  viewSize = BASE_PERSON.camera.viewSize): number {
  return 2 * personBody(design).stride / WALK_STANCE_FRACTION * spriteScale / viewSize
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
export function walkContact(phase: number, frames: number, body: typeof BASE_PERSON.body, strides = 1) {
  const perStride = frames / strides
  const framePhase = (Math.floor(phase * perStride + 1e-9) % perStride) / perStride
  // Transfer weight after the short double-support interval, while both soles
  // are down. Each foot then supports the body through its flat stance.
  const side: BodySide = framePhase >= WALK_STANCE_FRACTION - 0.5 && framePhase < WALK_STANCE_FRACTION ? "left" : "right"
  const { ankle } = walkFoot(side, framePhase, body)
  return { side, x: ankle[0], z: ankle[2] + body.footLength * 0.22 }
}

const reducedPoses = new Map<number, Uint16Array>()

/** A subset of authored poses, still selected by distance. Always retain the
 * first displayed pose of each support change so both feet keep their timing.
 * Current 20-pose strides retain 10 poses at medium detail and 8 at far detail. */
export function reducedWalkFrame(frame: number, frames: number, strides: number, detail: 0 | 1 | 2): number {
  const perStride = frames / strides
  if (!detail || !Number.isInteger(perStride) || perStride < 12) return frame
  const cycle = Math.floor(frame / perStride), within = frame % perStride
  const key = perStride * 2 + detail - 1
  let poses = reducedPoses.get(key)
  if (poses && Number.isInteger(within) && within >= 0) return cycle * perStride + poses[within]
  const step = detail === 1 ? 2 : 3
  const first = Math.ceil((WALK_STANCE_FRACTION - .5) * perStride - 1e-9)
  const second = Math.ceil(WALK_STANCE_FRACTION * perStride - 1e-9)
  const select = (at: number) => Math.max(Math.floor(at / step) * step, at >= first ? first : -Infinity, at >= second ? second : -Infinity)
  // Runtime atlases have a few dozen poses. Bound editor/custom input storage;
  // unusual fractional or out-of-range inputs retain the arithmetic path.
  if (perStride <= 4096 && Number.isInteger(within) && within >= 0) {
    poses = Uint16Array.from({ length: perStride }, (_, i) => select(i))
    reducedPoses.set(key, poses)
    return cycle * perStride + poses[within]
  }
  return cycle * perStride + select(within)
}

/** Detect support transfers crossed between rendered poses, including a whole
 * stride that ends on the same foot. Wrapped atlas phase alone loses that event. */
export function crossedWalkSupport(phase: number, advance: number, frames: number, strides = 1): boolean {
  const perStride = frames / strides
  const support = (at: number) => {
    const displayed = Math.floor(at * perStride + 1e-9) / perStride
    return Math.floor((displayed - (WALK_STANCE_FRACTION - .5)) * 2 + 1e-9)
  }
  return advance > 0 && support(phase) !== support(phase + advance)
}

type GroundPoint = { x: number; y?: number; z: number }
export interface FootPlant {
  key: string
  anchor: GroundPoint
  origin: GroundPoint
}
export interface FootPlantResult {
  plant: FootPlant
  offset: { x: number; y: number; z: number }
}

/** Preserve the rig's support contact between atlas frames, including turns. */
export function plantFoot(previous: FootPlant | null, key: string, origin: GroundPoint, foot: GroundPoint,
  groundHeight?: (x: number, z: number) => number, output?: FootPlantResult): FootPlantResult {
  const reset = !previous || previous.key !== key || Math.hypot(origin.x - previous.origin.x, origin.z - previous.origin.z) > 1
  if (output) {
    // The live renderer owns this storage. Read the old contact before updating
    // it, allowing output.plant to also be the previous frame's plant.
    const x = reset ? origin.x + foot.x : previous.anchor.x
    const z = reset ? origin.z + foot.z : previous.anchor.z
    const y = reset ? groundHeight ? groundHeight(x, z) : (origin.y ?? 0) + (foot.y ?? 0) : previous.anchor.y ?? 0
    output.offset.x = x - origin.x - foot.x
    output.offset.y = y - (origin.y ?? 0) - (foot.y ?? 0)
    output.offset.z = z - origin.z - foot.z
    output.plant.key = key
    output.plant.anchor.x = x; output.plant.anchor.y = y; output.plant.anchor.z = z
    output.plant.origin.x = origin.x; output.plant.origin.y = origin.y; output.plant.origin.z = origin.z
    return output
  }
  const anchor = reset ? { x: origin.x + foot.x, y: (origin.y ?? 0) + (foot.y ?? 0), z: origin.z + foot.z } : previous.anchor
  if (reset && groundHeight) anchor.y = groundHeight(anchor.x, anchor.z)
  return {
    plant: { key, anchor, origin: { ...origin } },
    offset: { x: anchor.x - origin.x - foot.x, y: (anchor.y ?? 0) - (origin.y ?? 0) - (foot.y ?? 0), z: anchor.z - origin.z - foot.z },
  }
}
