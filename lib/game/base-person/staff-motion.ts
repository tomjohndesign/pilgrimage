import type { PersonRecipe } from "./design"
import { WALK_STANCE_FRACTION, walkFoot, type Point3 } from "./pose"
import { poseOffset, type PoseEdits } from "./pose-edits"

export const STAFF_STRIDES = 1
export const STAFF_PLANT_END = WALK_STANCE_FRACTION
const smooth = (t: number) => { const u = Math.max(0, Math.min(1, t)); return u * u * (3 - 2 * u) }

export function staffDimensions(b: PersonRecipe["body"]) {
  return { gripHeight: b.chestHeight - 0.08, length: b.headCenter + b.headHeight * 0.8 }
}

/** The right-hand staff plants and lifts with the opposite (left) foot. */
export function staffMotion(phase: number, b: PersonRecipe["body"], walking = true, edits?: PoseEdits) {
  const p = ((phase % 1) + 1) % 1
  const foot = walkFoot("left", p, b)
  const planted = !walking || foot.planted
  const swing = Math.max(0, (p - WALK_STANCE_FRACTION) / (1 - WALK_STANCE_FRACTION))
  const reach = (b.upperArmLength + b.forearmLength + 0.04) * 0.9
  const handZ = !walking ? 0.16 : planted ? reach + (0.10 - reach) * smooth(p / WALK_STANCE_FRACTION) : 0.10 + (reach - 0.10) * smooth(swing)
  const tip: Point3 = [-b.shoulderOffset - 0.09, 0.025 + (walking ? foot.ankle[1] - b.ankleHeight : 0), walking ? foot.ankle[2] + 0.10 : 0.16]
  const grip: Point3 = [tip[0], b.shoulderHeight - b.upperArmLength * 0.65 + (walking ? Math.sin(Math.PI * swing) ** 2 * 0.055 : -0.08), handZ]
  const clip = walking ? "walk" : "idle"
  const contactOffset = poseOffset(edits, clip, "staffTip", 0)
  const edited = poseOffset(edits, clip, "staffTip", p)
  const weight = walking && !planted ? Math.sin(swing * Math.PI) ** 2 : 0
  // A moved plant remains in one place for the whole contact interval. The
  // airborne tip can be keyed freely and blends back into that same contact.
  for (let i = 0; i < 3; i++) tip[i] += contactOffset[i] + (edited[i] - contactOffset[i]) * weight
  tip[1] = planted ? 0.025 : Math.max(0.025, tip[1])
  return { tip, grip, planted, phase: p }
}
