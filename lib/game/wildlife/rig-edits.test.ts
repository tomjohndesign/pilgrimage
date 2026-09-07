import { describe, expect, it } from "vitest"
import { animalOffset, animalPoseKey, EMPTY_ANIMAL_EDITS, validateAnimalEdits } from "./rig-edits"
import { gaitRecipe, gaitSpeed, gaitStride } from "./gait"
import { createWildlifeRig } from "./rig"
import { createAnimalRig } from "../transport/animal-rig"

describe("editable animal rigs", () => {
  it("round trips keyed poses and timing while preserving a smooth loop seam", () => {
    const edits = animalPoseKey(EMPTY_ANIMAL_EDITS, "hop", "head", { frame: 0, radius: 4, offset: [0.1, 0.1, 0] }, 0)
    edits.clips.hop!.cadence = 1.5
    expect(validateAnimalEdits(JSON.parse(JSON.stringify(edits)))).toEqual(edits)
    expect(animalOffset(edits, "hop", "head", 0)).toEqual([0.1, 0.1, 0])
    expect(animalOffset(edits, "hop", "head", 1)).toEqual([0.1, 0.1, 0])
    expect(animalOffset(edits, "hop", "head", 0.5)).toEqual([0, 0, 0])
    expect(gaitSpeed("rabbit", "hop", 1.5, edits)).toBeCloseTo(gaitStride("rabbit", "hop", 1.5) * gaitRecipe("rabbit", "hop").cadence * 1.5)
  })
  it("rejects corrupt and out-of-range imports", () => {
    for (const value of [null, {}, { version: 1, clips: { walk: { cadence: NaN } } }, { version: 1, clips: { walk: { contacts: [0, 0, 0, 0.9] } } }, { version: 1, clips: { fly: { keys: { leftWing: [{ frame: 21, offset: [0, 0, 0], radius: 2 }] } } } }]) expect(() => validateAnimalEdits(value)).toThrow()
  })
  it("exposes editable heads and wings on the same rendered skeleton", () => {
    for (const kind of ["deer", "rabbit", "fox", "boar", "hawk", "sparrow"] as const) {
      const rig = createWildlifeRig(kind)
      rig.pose(0, false, 0, 0)
      const before = rig.joints().head!.position[1]
      const edits = animalPoseKey(EMPTY_ANIMAL_EDITS, "idle", "head", { frame: 0, radius: 4, offset: [0, 0.1, 0] }, 0)
      rig.pose(0, false, 0, 0, false, "walk", { edits, clip: "idle" })
      expect(rig.joints().head!.position[1]).toBeGreaterThan(before)
      expect(rig.joints().head!.editable).toBe(true)
      if (kind === "hawk" || kind === "sparrow") expect(rig.joints().leftWing!.editable).toBe(true)
      rig.dispose()
    }
    for (const kind of ["donkey", "horse"] as const) {
      const rig = createAnimalRig(kind)
      rig.pose(0, false); const before = rig.joints().head!.position[1]
      rig.pose(0, false, 0, animalPoseKey(EMPTY_ANIMAL_EDITS, "idle", "head", { frame: 0, radius: 4, offset: [0, 0.1, 0] }, 0))
      expect(rig.joints().head!.position[1]).toBeGreaterThan(before); rig.dispose()
    }
  })
})
