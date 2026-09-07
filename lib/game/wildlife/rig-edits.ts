import { poseOffset, setPoseKey, validatePoseEdits, type PoseEdits, type PoseKey } from "../base-person/pose-edits"
import type { Point3 } from "../base-person/pose"

export const ANIMAL_FRAMES = 20
export const ANIMAL_JOINT_LABELS = {
  leftScapula: "Left scapula", rightScapula: "Right scapula", neck: "Neck base", muzzle: "Muzzle", chest: "Chest", pelvis: "Pelvis", head: "Head", tail: "Tail",
  leftShoulder: "Left front shoulder", leftElbow: "Left front elbow", leftWrist: "Left front wrist", leftHand: "Left front paw / hoof",
  rightShoulder: "Right front shoulder", rightElbow: "Right front elbow", rightWrist: "Right front wrist", rightHand: "Right front paw / hoof",
  leftHip: "Left hind hip", leftThigh: "Left stifle", leftKnee: "Left hock", leftFoot: "Left hind paw / hoof",
  rightHip: "Right hind hip", rightThigh: "Right stifle", rightKnee: "Right hock", rightFoot: "Right hind paw / hoof",
  leftWing: "Left wing tip", rightWing: "Right wing tip",
  leftWingWrist: "Left wing wrist", rightWingWrist: "Right wing wrist",
} as const
export type AnimalJoint = keyof typeof ANIMAL_JOINT_LABELS
export const ANIMAL_BONES: [AnimalJoint, AnimalJoint][] = [
  ["chest", "leftWingWrist"], ["leftWingWrist", "leftWing"], ["chest", "rightWingWrist"], ["rightWingWrist", "rightWing"],
  ["pelvis", "chest"], ["chest", "leftScapula"], ["leftScapula", "leftShoulder"], ["chest", "rightScapula"], ["rightScapula", "rightShoulder"], ["chest", "neck"], ["neck", "head"], ["head", "muzzle"], ["pelvis", "tail"],
  ...(["left", "right"] as const).flatMap(side => [["chest", `${side}Shoulder`], [`${side}Shoulder`, `${side}Elbow`], [`${side}Elbow`, `${side}Wrist`], [`${side}Wrist`, `${side}Hand`], ["pelvis", `${side}Hip`], [`${side}Hip`, `${side}Thigh`], [`${side}Thigh`, `${side}Knee`], [`${side}Knee`, `${side}Foot`]] as [AnimalJoint, AnimalJoint][]),
]
export type AnimalClip = "idle" | "graze" | "walk" | "trot" | "canter" | "gallop" | "hop" | "leap" | "lie" | "burrow" | "fly" | "glide"
export const ANIMAL_CLIPS: AnimalClip[] = ["idle", "graze", "walk", "trot", "canter", "gallop", "hop", "leap", "lie", "burrow", "fly", "glide"]
export interface AnimalClipEdits { cadence?: number; contacts?: [number, number, number, number]; keys?: Partial<Record<AnimalJoint, PoseKey[]>> }
export interface AnimalRigEdits { version: 1; clips: Partial<Record<AnimalClip, AnimalClipEdits>> }
export const EMPTY_ANIMAL_EDITS: AnimalRigEdits = { version: 1, clips: {} }

/** Reuse the person's circular, locally blended pose-key interpolation. */
export function animalOffset(edits: AnimalRigEdits | undefined, clip: AnimalClip, joint: AnimalJoint, phase: number): Point3 {
  const keys = edits?.clips[clip]?.keys?.[joint]
  return poseOffset(keys ? { walk: { head: keys } } : undefined, "walk", "head", phase)
}
export function animalPoseKey(edits: AnimalRigEdits, clip: AnimalClip, joint: AnimalJoint, key: PoseKey | null, frame: number): AnimalRigEdits {
  const keys = setPoseKey({ walk: { head: edits.clips[clip]?.keys?.[joint] ?? [] } }, "walk", "head", key, frame).walk!.head!
  return { version: 1, clips: { ...edits.clips, [clip]: { ...edits.clips[clip], keys: { ...edits.clips[clip]?.keys, [joint]: keys } } } }
}
export function validateAnimalEdits(input: unknown): AnimalRigEdits {
  if (!input || typeof input !== "object" || (input as AnimalRigEdits).version !== 1) throw new Error("Use an animal rig settings file (version 1).")
  const source = (input as AnimalRigEdits).clips
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("Missing animal clips.")
  const clips: AnimalRigEdits["clips"] = {}
  for (const [name, entry] of Object.entries(source)) {
    if (name === "roll") continue // Retired action: keep the other saved poses.
    if (!ANIMAL_CLIPS.includes(name as AnimalClip) || !entry || typeof entry !== "object") throw new Error("Unknown animal action.")
    const clip: AnimalClipEdits = {}
    if (entry.cadence !== undefined) {
      if (!Number.isFinite(entry.cadence) || entry.cadence < 0.25 || entry.cadence > 2) throw new Error("Timing must be between 0.25× and 2×.")
      clip.cadence = entry.cadence
    }
    if (entry.contacts) {
      if (!Array.isArray(entry.contacts) || entry.contacts.length !== 4 || entry.contacts.some(n => !Number.isFinite(n) || Math.abs(n) > 0.08)) throw new Error("Contact timing edits must stay within 8% of the stride.")
      clip.contacts = [...entry.contacts]
    }
    if (entry.keys) {
      clip.keys = {}
      for (const [joint, keys] of Object.entries(entry.keys)) {
        if (!Object.hasOwn(ANIMAL_JOINT_LABELS, joint)) throw new Error("Unknown animal joint.")
        const validated: PoseEdits = validatePoseEdits({ walk: { head: keys } })
        clip.keys[joint as AnimalJoint] = validated.walk!.head
      }
    }
    clips[name as AnimalClip] = clip
  }
  return { version: 1, clips }
}
