import { PERSON_CLIPS, type BaseClip, type Point3 } from "./pose"

export const EDITABLE_JOINTS = ["head", "leftHand", "rightHand", "leftElbow", "rightElbow", "leftKnee", "rightKnee", "leftFoot", "rightFoot", "staffTip"] as const
export type EditableJoint = typeof EDITABLE_JOINTS[number]
export interface PoseKey { frame: number; offset: Point3; radius: number }
export type PoseEdits = Partial<Record<BaseClip, Partial<Record<EditableJoint, PoseKey[]>>>>
export const MAX_POSE_OFFSET = 0.45

/** Portable, bounded pose keys; old parameter files simply have no keys. */
export function validatePoseEdits(input: unknown): PoseEdits {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid pose keys.")
  const result: PoseEdits = {}
  for (const [clip, joints] of Object.entries(input)) {
    if (!Object.hasOwn(PERSON_CLIPS, clip) || !joints || typeof joints !== "object" || Array.isArray(joints)) throw new Error("Invalid pose clip.")
    const frames = PERSON_CLIPS[clip as BaseClip].frames
    const target: Partial<Record<EditableJoint, PoseKey[]>> = {}
    for (const [joint, keys] of Object.entries(joints)) {
      if (!EDITABLE_JOINTS.includes(joint as EditableJoint) || !Array.isArray(keys) || keys.length > frames) throw new Error("Invalid joint keys.")
      const seen = new Set<number>()
      target[joint as EditableJoint] = keys.map(key => {
        if (!key || !Number.isInteger(key.frame) || key.frame < 0 || key.frame >= frames || seen.has(key.frame) ||
          !Number.isInteger(key.radius) || key.radius < 1 || key.radius > Math.max(1, Math.floor(frames / 2)) ||
          !Array.isArray(key.offset) || key.offset.length !== 3 || key.offset.some((v: unknown) => typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > MAX_POSE_OFFSET)) throw new Error("Invalid pose key.")
        seen.add(key.frame)
        return { frame: key.frame, offset: [...key.offset] as Point3, radius: key.radius }
      }).sort((a, b) => a.frame - b.frame)
    }
    result[clip as BaseClip] = target
  }
  return result
}

/** Exact keys with smooth, local falloff and a continuous last-to-first seam. */
export function poseOffset(edits: PoseEdits | undefined, clip: BaseClip, joint: EditableJoint, phase: number): Point3 {
  const keys = edits?.[clip]?.[joint]
  if (!keys?.length) return [0, 0, 0]
  const count = PERSON_CLIPS[clip].frames
  if (count === 1) return [...keys[0].offset]
  const frame = ((phase % 1 + 1) % 1) * count
  const distance = (a: number, b: number) => Math.min(Math.abs(a - b), count - Math.abs(a - b))
  const points = keys.map(key => ({ frame: key.frame, offset: key.offset }))
  for (const key of keys) for (const sign of [-1, 1]) {
    const at = (key.frame + sign * key.radius + count) % count
    if (keys.every(other => distance(at, other.frame) >= other.radius) && !points.some(p => p.frame === at)) points.push({ frame: at, offset: [0, 0, 0] })
  }
  points.sort((a, b) => a.frame - b.frame)
  const extended = [...points.map(p => ({ ...p, frame: p.frame - count })), ...points, ...points.map(p => ({ ...p, frame: p.frame + count }))]
  const index = extended.findIndex(p => p.frame > frame)
  const a = extended[index - 1], b = extended[index]
  const t = (frame - a.frame) / (b.frame - a.frame), blend = t * t * (3 - 2 * t)
  return a.offset.map((v, i) => v + (b.offset[i] - v) * blend) as Point3
}

export function setPoseKey(edits: PoseEdits | undefined, clip: BaseClip, joint: EditableJoint, key: PoseKey | null, frame: number): PoseEdits {
  const result = structuredClone(edits ?? {})
  const keys = (result[clip]?.[joint] ?? []).filter(k => k.frame !== frame)
  if (key) keys.push(key)
  result[clip] = { ...result[clip], [joint]: keys.sort((a, b) => a.frame - b.frame) }
  return validatePoseEdits(result)
}
