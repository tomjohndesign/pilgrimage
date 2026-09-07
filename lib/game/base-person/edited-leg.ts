import * as THREE from "three"
import { legPose, WALK_STANCE_FRACTION, type BaseClip, type BodySide, type Point3 } from "./pose"
import { poseOffset, type PoseEdits } from "./pose-edits"
import type { PersonRecipe } from "./design"

/** Pose editing retains bone lengths, forward knees and planted walking feet.
 * `pelvisShift` (root space) moves the hip with an authored pelvis offset; the ankle stays put and the leg re-solves. */
export function editedLeg(side: BodySide, phase: number, clip: BaseClip, b: PersonRecipe["body"], edits?: PoseEdits, localRotation = new THREE.Quaternion(), pelvisShift: Point3 = [0, 0, 0]) {
  const base = legPose(side, phase, clip, b)
  const footOffset = new THREE.Vector3(...poseOffset(edits, clip, side === "left" ? "leftFoot" : "rightFoot", phase)).applyQuaternion(localRotation).toArray()
  const kneeOffset = new THREE.Vector3(...poseOffset(edits, clip, side === "left" ? "leftKnee" : "rightKnee", phase)).applyQuaternion(localRotation).toArray()
  const hipOffset = new THREE.Vector3(...poseOffset(edits, clip, side === "left" ? "leftHip" : "rightHip", phase)).add(new THREE.Vector3(...pelvisShift)).applyQuaternion(localRotation).toArray()
  if ([...footOffset, ...kneeOffset, ...hipOffset].every(v => v === 0)) return base
  const walking = clip === "walk" || clip === "carrying" || clip === "procession"
  const p = ((phase + (side === "right" ? 0.5 : 0)) % 1 + 1) % 1
  const swing = (p - WALK_STANCE_FRACTION) / (1 - WALK_STANCE_FRACTION)
  const weight = walking ? base.planted ? 0 : Math.min(1, Math.max(0, Math.sin(swing * Math.PI) * 3)) : 1
  const shift = new THREE.Vector3(...pelvisShift).applyQuaternion(localRotation)
  const hipKey = new THREE.Vector3(...hipOffset).sub(shift)
  const ankle = new THREE.Vector3(...base.ankle).addScaledVector(new THREE.Vector3(...footOffset), weight)
  // A planted foot stays put, so a hip key that would overstretch the leg is shortened instead.
  const hip = new THREE.Vector3(...base.hip).add(shift)
  hip.addScaledVector(hipKey, base.planted ? reachScale(hip.clone().sub(ankle), hipKey, b.thighLength + b.shinLength - 1e-6) : 1)
  ankle.y = Math.max(b.ankleHeight, ankle.y)
  const axis = ankle.clone().sub(hip)
  const length = Math.max(Math.abs(b.thighLength - b.shinLength) + 1e-6, Math.min(axis.length(), b.thighLength + b.shinLength - 1e-6))
  if (axis.lengthSq() < 1e-12) axis.set(0, -1, 0)
  axis.normalize(); ankle.copy(hip).addScaledVector(axis, length)
  const along = (b.thighLength ** 2 - b.shinLength ** 2 + length ** 2) / (2 * length)
  const bend = new THREE.Vector3(...base.knee).add(new THREE.Vector3(...kneeOffset)).sub(hip)
  bend.addScaledVector(axis, -bend.dot(axis))
  const forward = new THREE.Vector3(0, 0, 1).addScaledVector(axis, -axis.z).normalize()
  if (bend.dot(forward) < 0.005) bend.addScaledVector(forward, 0.005 - bend.dot(forward))
  bend.normalize()
  const knee = hip.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, b.thighLength ** 2 - along ** 2)))
  return { ...base, hip: hip.toArray() as Point3, knee: knee.toArray() as Point3, ankle: ankle.toArray() as Point3 }
}

/** Shorten a pelvis offset (root space) until every planted foot can still reach it with straight legs. */
export function reachablePelvisShift(phase: number, clip: BaseClip, b: PersonRecipe["body"], shift: Point3, localRotation = new THREE.Quaternion()): Point3 {
  const local = new THREE.Vector3(...shift).applyQuaternion(localRotation)
  if (local.lengthSq() === 0) return shift
  const reach = b.thighLength + b.shinLength - 1e-6
  let scale = 1
  for (const side of ["left", "right"] as const) {
    const base = legPose(side, phase, clip, b)
    if (!base.planted) continue
    scale = Math.min(scale, reachScale(new THREE.Vector3(...base.hip).sub(new THREE.Vector3(...base.ankle)), local, reach))
  }
  return shift.map(v => v * scale) as Point3
}

/** Largest t in [0, 1] with |from + t·delta| ≤ reach. */
function reachScale(from: THREE.Vector3, delta: THREE.Vector3, reach: number) {
  if (delta.lengthSq() === 0 || from.clone().add(delta).length() <= reach) return 1
  const a = delta.lengthSq(), half = from.dot(delta), c = from.lengthSq() - reach * reach
  const root = half * half - a * c
  return Math.max(0, Math.min(1, root < 0 ? 0 : (-half + Math.sqrt(root)) / a))
}
