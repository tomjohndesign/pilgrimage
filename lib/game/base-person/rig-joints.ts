import type { Point3 } from "./pose"
export const RIG_LABELS = {
  pelvis: "Pelvis", chest: "Chest", head: "Head",
  leftShoulder: "Left shoulder", leftElbow: "Left elbow", leftHand: "Left hand",
  rightShoulder: "Right shoulder", rightElbow: "Right elbow", rightHand: "Right hand",
  leftHip: "Left hip", leftKnee: "Left knee", leftFoot: "Left foot",
  rightHip: "Right hip", rightKnee: "Right knee", rightFoot: "Right foot",
  staffTip: "Staff tip", staffTop: "Staff top",
} as const
export type RigJoint = keyof typeof RIG_LABELS
export type RigJoints = Partial<Record<RigJoint, Point3>>
export const RIG_BONES: [RigJoint, RigJoint][] = [
  ["pelvis", "chest"], ["chest", "head"],
  ["chest", "leftShoulder"], ["leftShoulder", "leftElbow"], ["leftElbow", "leftHand"],
  ["chest", "rightShoulder"], ["rightShoulder", "rightElbow"], ["rightElbow", "rightHand"],
  ["pelvis", "leftHip"], ["leftHip", "leftKnee"], ["leftKnee", "leftFoot"],
  ["pelvis", "rightHip"], ["rightHip", "rightKnee"], ["rightKnee", "rightFoot"], ["staffTip", "staffTop"],
]
