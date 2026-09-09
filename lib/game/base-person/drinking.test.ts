import { describe, expect, it } from "vitest"
import { Vector3 } from "three"
import { drinkingMotion, DRINKING_SECONDS } from "./drinking"
import { actionPlaybackRate } from "./activity"
import { BASE_PERSON, PERSON_CLIPS, legPose } from "./pose"
import { personRecipe, PERSON_PRESETS } from "./design"
import { createBasePersonRig } from "./rig"
import { POPULATION_PROFILES, populationDesign } from "./population"
import { TRAVELER_TYPES } from "../travelers"

describe("drinking rig", () => {
  it.each(["drinking", "drinkingLow"] as const)("keeps %s feet planted, bones fixed and the cup attached", clip => {
    const designs = [...Object.values(PERSON_PRESETS), ...POPULATION_PROFILES.map((_, i) => populationDesign(TRAVELER_TYPES.peasant, i))]
    for (const design of designs) {
      const recipe = personRecipe(design), rig = createBasePersonRig(recipe)
      try {
        const cup = rig.root.getObjectByName("drinking-cup")!
        const positions: number[] = []
        for (let frame = 0; frame < PERSON_CLIPS[clip].frames; frame++) {
          const phase = frame / PERSON_CLIPS[clip].frames
          rig.pose(phase, clip)
          expect(cup.visible).toBe(true)
          expect(cup.getWorldPosition(new Vector3()).distanceTo(rig.sockets.rightHand.getWorldPosition(new Vector3()))).toBeLessThan(1e-8)
          for (const side of ["left", "right"] as const) {
            const leg = legPose(side, phase, clip, recipe.body)
            expect(leg.ankle).toEqual(legPose(side, 0, clip, recipe.body).ankle)
            expect(new Vector3(...leg.hip).distanceTo(new Vector3(...leg.knee))).toBeCloseTo(recipe.body.thighLength)
            expect(new Vector3(...leg.knee).distanceTo(new Vector3(...leg.ankle))).toBeCloseTo(recipe.body.shinLength)
          }
          positions.push(cup.getWorldPosition(new Vector3()).y)
        }
        expect(Math.max(...positions) - Math.min(...positions)).toBeGreaterThan(.1)
        expect(drinkingMotion(0, clip === "drinkingLow", recipe.body)).toEqual(drinkingMotion(1, clip === "drinkingLow", recipe.body))
        rig.pose(0, "idle"); expect(cup.visible).toBe(false)
      } finally { rig.dispose() }
    }
    expect(PERSON_CLIPS[clip].frames / (actionPlaybackRate(clip) * BASE_PERSON.defaultFps)).toBe(DRINKING_SECONDS)
  })
})
