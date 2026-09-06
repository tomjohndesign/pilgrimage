import * as THREE from "three"
import { legPose, WALK_STANCE_FRACTION, type BaseClip, type BodySide, type Point3 } from "./pose"
import { poseOffset, type PoseEdits } from "./pose-edits"
import type { PersonRecipe } from "./design"

/** Pose editing retains bone lengths, forward knees and planted walking feet. */
export function editedLeg(side: BodySide, phase: number, clip: BaseClip, b: PersonRecipe["body"], edits?: PoseEdits, localRotation = new THREE.Quaternion()) {
  const base = legPose(side, phase, clip, b)
  const footOffset = new THREE.Vector3(...poseOffset(edits, clip, side === "left" ? "leftFoot" : "rightFoot", phase)).applyQuaternion(localRotation).toArray()
  const kneeOffset = new THREE.Vector3(...poseOffset(edits, clip, side === "left" ? "leftKnee" : "rightKnee", phase)).applyQuaternion(localRotation).toArray()
  if ([...footOffset, ...kneeOffset].every(v => v === 0)) return base
  const walking = clip === "walk" || clip === "carrying" || clip === "procession"
  const p = ((phase + (side === "right" ? 0.5 : 0)) % 1 + 1) % 1
  const swing = (p - WALK_STANCE_FRACTION) / (1 - WALK_STANCE_FRACTION)
  const weight = walking ? base.planted ? 0 : Math.min(1, Math.max(0, Math.sin(swing * Math.PI) * 3)) : 1
  const hip = new THREE.Vector3(...base.hip)
  const ankle = new THREE.Vector3(...base.ankle).addScaledVector(new THREE.Vector3(...footOffset), weight)
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
  return { ...base, knee: knee.toArray() as Point3, ankle: ankle.toArray() as Point3 }
}
