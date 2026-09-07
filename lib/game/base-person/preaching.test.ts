import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { PERSON_PRESETS, personRecipe } from "./design"
import { PERSON_CLIPS, legPose } from "./pose"
import { createBasePersonRig } from "./rig"
import { actionPlaybackRate, activityClip } from "./activity"
import { BASE_PERSON } from "./pose"

describe("roadside sermon", () => {
  it("gestures through a seamless loop with fixed bones and planted feet", () => {
    const recipe = personRecipe(PERSON_PRESETS.Monk), rig = createBasePersonRig(recipe)
    try {
      const hands: THREE.Vector3[] = []
      for (let frame = 0; frame <= PERSON_CLIPS.preaching.frames; frame++) {
        const phase = frame / PERSON_CLIPS.preaching.frames
        rig.pose(phase, "preaching")
        hands.push(rig.sockets.rightHand.getWorldPosition(new THREE.Vector3()))
        for (const side of ["left", "right"] as const) {
          const leg = legPose(side, phase, "preaching", recipe.body)
          expect(leg.planted).toBe(true)
          expect(leg.ankle).toEqual(legPose(side, 0, "idle", recipe.body).ankle)
          expect(new THREE.Vector3(...leg.hip).distanceTo(new THREE.Vector3(...leg.knee))).toBeCloseTo(recipe.body.thighLength)
          expect(new THREE.Vector3(...leg.knee).distanceTo(new THREE.Vector3(...leg.ankle))).toBeCloseTo(recipe.body.shinLength)
        }
        const joints = rig.joints()
        for (const side of ["left", "right"] as const) {
          const shoulder = new THREE.Vector3(...joints[`${side}Shoulder`]!)
          const elbow = new THREE.Vector3(...joints[`${side}Elbow`]!)
          const hand = new THREE.Vector3(...joints[`${side}Hand`]!)
          expect(shoulder.distanceTo(elbow)).toBeCloseTo(recipe.body.upperArmLength)
          expect(elbow.distanceTo(hand)).toBeCloseTo(recipe.body.forearmLength + 0.04 * recipe.design.hands)
        }
        expect(rig.root.getObjectByName("building-mallet")!.visible).toBe(false)
        expect(rig.root.getObjectByName("woodcutting-axe")!.visible).toBe(false)
      }
      expect(hands[0].distanceTo(hands.at(-1)!)).toBeLessThan(1e-8)
      expect(Math.max(...hands.map(p => p.y)) - Math.min(...hands.map(p => p.y))).toBeGreaterThan(0.2)
      rig.pose(0, "idle")
      expect(rig.root.getObjectByName("chest-pivot")!.rotation.y).toBeCloseTo(0)
    } finally { rig.dispose() }
  })

  it("preaches at four seconds per loop and walks to the roadside", () => {
    expect(activityClip("preaching", false)).toBe("preaching")
    expect(activityClip("toEvangelize", true)).toBe("walk")
    expect(PERSON_CLIPS.preaching.frames / (actionPlaybackRate("preaching") * BASE_PERSON.defaultFps)).toBe(4)
  })
})
