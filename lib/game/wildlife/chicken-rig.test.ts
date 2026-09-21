import { describe, expect, it } from "vitest"
import { chickenLegPose, CHICKEN_BONES } from "./chicken-pose"
import { CHICKEN_KINDS } from "./species"
import { gaitRecipe } from "./gait"
import { createWildlifeRig } from "./rig"
import { animalPoseKey, EMPTY_ANIMAL_EDITS, type AnimalRigEdits } from "./rig-edits"

describe("chicken rigs", () => {
  for (const kind of CHICKEN_KINDS) it(`${kind} keeps fixed bones and speed-matched planted feet with edited timing`, () => {
    for (const edits of [undefined, { version: 1, clips: { walk: { cadence: 2, contacts: [.08, -.08, 0, 0] } } } as AnimalRigEdits]) {
      const gait = gaitRecipe(kind, "walk", edits)
      for (let i = 0; i < 120; i++) {
        const phase = i / 120, pose = chickenLegPose(kind, phase, true, edits), next = chickenLegPose(kind, phase + .0001, true, edits)
        pose.legs.forEach((leg, side) => {
          const points = [leg.hip, leg.upperJoint, leg.knee, leg.ankle]
          Object.values(CHICKEN_BONES).forEach((length, j) => expect(Math.hypot(...points[j].map((value, axis) => value - points[j + 1][axis]))).toBeCloseTo(length, 6))
          expect(leg.ankle[1]).toBeGreaterThanOrEqual(.018)
          const local = ((phase - gait.contacts[side]) % 1 + 1) % 1
          if (local > .01 && local < gait.stance - .01) expect(next.legs[side].ankle[2] - leg.ankle[2] + gait.stride * .0001).toBeCloseTo(0, 8)
        })
      }
    }
  })
  it("exposes editable joints through the shared rig and renders every action with finite geometry", () => {
    for (const kind of CHICKEN_KINDS) {
      const rig = createWildlifeRig(kind)
      rig.pose(0, false, 0, 0)
      const before = rig.joints().head!.position[1]
      const edits = animalPoseKey(EMPTY_ANIMAL_EDITS, "idle", "head", { frame: 0, radius: 4, offset: [0, .1, 0] }, 0)
      rig.pose(0, false, 0, 0, false, "walk", { edits, clip: "idle" })
      expect(rig.joints().head!.position[1]).toBeCloseTo(before + .1)
      expect(rig.joints().leftWing!.editable).toBe(true)
      for (const clip of ["idle", "walk", "graze"] as const) for (let frame = 0; frame < 20; frame++) {
        rig.pose(frame / 20, clip === "walk", frame / 20, clip === "graze" ? 1 : 0, false, "walk", { clip })
        expect(rig.parts.every(part => part.matrixWorld.elements.every(Number.isFinite))).toBe(true)
      }
      rig.dispose()
    }
  })
})
