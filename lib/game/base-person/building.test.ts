import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { buildingMotion, MALLET_CONTACT_REACH } from "./building"
import { activityClip } from "./activity"
import { PERSON_CLIPS, legPose } from "./pose"
import { personRecipe, PERSON_PRESETS } from "./design"
import { createBasePersonRig } from "./rig"
import { POPULATION_PROFILES, populationDesign } from "./population"
import { TRAVELER_TYPES } from "../travelers"

describe("wooden mallet construction", () => {
  it("selects its own animation while keeping travel on the shared walk", () => {
    expect(activityClip("building", false)).toBe("building")
    expect(activityClip("toBuild", true)).toBe("walk")
    expect(buildingMotion(0)).toEqual(buildingMotion(1))
  })
  it("swings a wooden mallet from a planted stance for every monk and population profile", () => {
    const designs = [...Object.values(PERSON_PRESETS), ...POPULATION_PROFILES.map((_, i) => populationDesign(TRAVELER_TYPES.peasant, i))]
    for (const design of designs) {
      const recipe = personRecipe(design), rig = createBasePersonRig(recipe)
      try {
        const mallet = rig.root.getObjectByName("building-mallet")!, head = rig.root.getObjectByName("mallet-head")!
        const positions: THREE.Vector3[] = []
        for (let frame = 0; frame < PERSON_CLIPS.building.frames; frame++) {
          const phase = frame / PERSON_CLIPS.building.frames
          rig.pose(phase, "building")
          expect(mallet.visible).toBe(true)
          expect(rig.root.getObjectByName("gathering-basket")!.visible).toBe(false)
          expect(rig.root.getObjectByName("woodcutting-axe")!.visible).toBe(false)
          expect(mallet.getWorldPosition(new THREE.Vector3()).distanceTo(rig.sockets.rightHand.getWorldPosition(new THREE.Vector3()))).toBeLessThan(1e-8)
          for (const side of ["left", "right"] as const) {
            const leg = legPose(side, phase, "building", recipe.body)
            expect(leg.ankle).toEqual(legPose(side, 0, "building", recipe.body).ankle)
            expect(new THREE.Vector3(...leg.hip).distanceTo(new THREE.Vector3(...leg.knee))).toBeCloseTo(recipe.body.thighLength)
            expect(new THREE.Vector3(...leg.knee).distanceTo(new THREE.Vector3(...leg.ankle))).toBeCloseTo(recipe.body.shinLength)
          }
          positions.push(head.getWorldPosition(new THREE.Vector3()))
        }
        expect(Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y))).toBeGreaterThan(0.4)
        expect(positions[20].z).toBeCloseTo(MALLET_CONTACT_REACH, 2)
        rig.pose(0, "idle")
        expect(mallet.visible).toBe(false)
      } finally { rig.dispose() }
    }
  })
})
