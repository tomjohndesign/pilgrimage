import * as THREE from "three"
import type { createBasePersonRig } from "../base-person/rig"
import type { personRecipe } from "../base-person/design"

/** A planted performance layered over the existing idle rig and its lute. */
export function playingPose(rig: ReturnType<typeof createBasePersonRig>, recipe: ReturnType<typeof personRecipe>, phase: number) {
  const { root } = rig, b = recipe.body
  const lute = root.getObjectByName("road-lute")!
  root.add(lute)
  lute.position.set(-0.1, b.torsoCenter - 0.13, b.torsoTop + 0.18)
  lute.rotation.set(0, Math.PI, 0.95)
  root.updateMatrixWorld(true)
  for (const side of ["left", "right"] as const) {
    const shoulder = root.getObjectByName(`${side}-shoulder`)!, elbow = root.getObjectByName(`${side}-elbow`)!
    const target = lute.localToWorld(new THREE.Vector3(0, side === "left" ? 0.43 : 0.02 + Math.sin(phase * Math.PI * 2) * 0.1, -0.065))
    shoulder.parent!.worldToLocal(target)
    const start = shoulder.position.clone(), axis = target.clone().sub(start)
    const upper = b.upperArmLength, lower = b.forearmLength + 0.04 * recipe.design.hands
    const distance = Math.max(Math.abs(upper - lower) + 0.001, Math.min(axis.length(), upper + lower - 0.001))
    axis.normalize()
    const along = (upper * upper - lower * lower + distance * distance) / (2 * distance)
    const bend = new THREE.Vector3(side === "left" ? 1 : -1, -0.8, 0)
    bend.addScaledVector(axis, -bend.dot(axis)).normalize()
    const joint = start.clone().addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, upper * upper - along * along)))
    shoulder.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), joint.clone().sub(start).normalize())
    const forearm = start.addScaledVector(axis, distance).sub(joint).normalize().applyQuaternion(shoulder.quaternion.clone().invert())
    elbow.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), forearm)
  }
  root.getObjectByName("head-pivot")!.rotation.x += 0.06 + Math.sin(phase * Math.PI * 2) * 0.035
  root.updateMatrixWorld(true)
}
