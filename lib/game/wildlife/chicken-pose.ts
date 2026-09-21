import { BASE_PERSON, walkFoot, type Point3 } from "../base-person/pose"
import { solveAnimalLeg } from "../transport/animal-pose"
import { gaitRecipe } from "./gait"
import { animalOffset, type AnimalRigEdits } from "./rig-edits"
import type { ChickenKind } from "./species"

export const CHICKEN_BONES = { upper: .095, middle: .11, cannon: .14 }

/** Shared contact curve and fixed-length animal IK, with the bird's hock bending back. */
export function chickenLegPose(kind: ChickenKind, phase: number, moving: boolean, edits?: AnimalRigEdits, crouch = 0) {
  const gait = gaitRecipe(kind, "walk", edits), bones = CHICKEN_BONES, angle = .95 + crouch * .6
  const targets = [0, 1].map(i => {
    const foot = walkFoot("left", phase - gait.contacts[i], { ...BASE_PERSON.body,
      stride: gait.reach, footLift: gait.lift, ankleHeight: .018, legOffset: .075 }, gait.stance)
    const ankle: Point3 = [(i ? -1 : 1) * .075, moving ? foot.ankle[1] : .018, moving ? foot.ankle[2] : 0]
    if (moving && !foot.planted) {
      const offset = animalOffset(edits, "walk", i ? "rightFoot" : "leftFoot", phase)
      ankle[0] += Math.max(-.015, Math.min(.015, offset[0]))
      ankle[1] += Math.max(-.01, Math.min(.035, offset[1]))
      ankle[2] += Math.max(-.025, Math.min(.025, offset[2]))
    }
    const hipX = (i ? -1 : 1) * .075, dx = ankle[0] - hipX
    const dz = ankle[2] - Math.sin(angle) * bones.upper
    const reach = bones.middle ** 2 + bones.cannon ** 2 + 2 * bones.middle * bones.cannon * Math.cos(.14)
    return { ankle, hipX, planted: !moving || foot.planted, height: ankle[1] + Math.cos(angle) * bones.upper + Math.sqrt(Math.max(0, reach - dz * dz - dx * dx)) }
  })
  const height = Math.min(...targets.map(t => t.height)) - crouch * .025
  return { height, legs: targets.map(({ ankle, hipX, planted }) => solveAnimalLeg([hipX, height, 0], ankle, bones, angle, true, planted)) }
}
