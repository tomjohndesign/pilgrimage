import { describe, expect, it } from "vitest"
import { personRecipe } from "../base-person/design"
import { populationDesign } from "../base-person/population"
import { createBasePersonRig } from "../base-person/rig"
import { TRAVELER_TYPES } from "../travelers"
import { playingPose } from "./pose"

describe("minstrel playing pose", () => {
  it("strums with fixed arm lengths and planted feet across all six bodies", () => {
    for (let variant = 0; variant < 6; variant++) {
      const recipe = personRecipe(populationDesign(TRAVELER_TYPES.minstrel, variant))
      const rig = createBasePersonRig(recipe)
      try {
        rig.pose(0, "idle")
        const idle = rig.joints()
        const hands: number[][] = []
        for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
          rig.pose(0, "idle"); playingPose(rig, recipe, phase)
          const joints = rig.joints()
          expect(joints.leftFoot).toEqual(idle.leftFoot)
          expect(joints.rightFoot).toEqual(idle.rightFoot)
          for (const side of ["left", "right"] as const) {
            const shoulder = joints[`${side}Shoulder`]!, elbow = joints[`${side}Elbow`]!, hand = joints[`${side}Hand`]!
            const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]))
            expect(distance(shoulder, elbow)).toBeCloseTo(recipe.body.upperArmLength)
            expect(distance(elbow, hand)).toBeCloseTo(recipe.body.forearmLength + 0.04 * recipe.design.hands)
          }
          hands.push(joints.rightHand!)
        }
        expect(hands[1]).not.toEqual(hands[3])
        hands[0].forEach((value, i) => expect(hands[4][i]).toBeCloseTo(value))
        expect(rig.root.getObjectByName("road-lute")!.visible).toBe(true)
      } finally { rig.dispose() }
    }
  })
})
