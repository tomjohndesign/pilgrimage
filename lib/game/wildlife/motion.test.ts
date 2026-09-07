import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { animalTwist } from "../transport/animal-pose"
import { ANIMAL_PROFILES } from "../transport/assets"
import { wingBeat } from "./motion"
import { WILDLIFE_PROFILES } from "./species"
import { createWildlifeRig } from "./rig"
import { wildlifeGeometry } from "./batch"

describe("wildlife motion surfaces", () => {
  it("eases wing reversals and the loop seam, with a lagging feather recovery", () => {
    for (const phase of [0, 0.42, 1]) {
      const before = wingBeat(phase - 0.0001), at = wingBeat(phase), after = wingBeat(phase + 0.0001)
      expect(Math.abs(after.lift - before.lift) / 0.0002).toBeLessThan(0.001)
      expect(Math.abs((after.lift - 2 * at.lift + before.lift) / 0.0001 ** 2)).toBeLessThan(0.2)
    }
    expect(wingBeat(0)).toEqual(wingBeat(1))
    expect(Math.abs(wingBeat(0.3).wrist)).toBeGreaterThan(0.1)
  })
  it("keeps walk twist optional for published equines and opposite across the spine", () => {
    expect(animalTwist(ANIMAL_PROFILES.donkey, 0.25, true)).toBe(0)
    expect(animalTwist(WILDLIFE_PROFILES.deer, 0.25, true)).toBeGreaterThan(0)
    const rig = createWildlifeRig("deer")
    rig.pose(0.25, true, 0, 0)
    const joints = rig.joints()
    const chestYaw = joints.leftShoulder!.position[2] - joints.rightShoulder!.position[2]
    const pelvisYaw = joints.leftHip!.position[2] - joints.rightHip!.position[2]
    expect(chestYaw * pelvisYaw).toBeLessThan(0)
    rig.dispose()
  })
  it("uses four connected hides and preserves separate deformed animals in a shared buffer", () => {
    const rig = createWildlifeRig("deer"), legs = rig.parts.filter(part => part.name.endsWith("limb-hide"))
    expect(legs).toHaveLength(4)
    for (const leg of legs) {
      const rings = leg.geometry.attributes.position.count / 12
      expect(rings).toBeGreaterThan(4)
      const index = Array.from(leg.geometry.index!.array)
      // Every ring is sewn to the next; no separate capped bone pieces.
      for (let ring = 0; ring < rings - 1; ring++) expect(index.some((_, i) => i % 3 === 0 && index.slice(i, i + 3).some(v => v < (ring + 1) * 12) && index.slice(i, i + 3).some(v => v >= (ring + 1) * 12))).toBe(true)
    }
    const batch = wildlifeGeometry(rig.parts, [1, 2])
    rig.pose(0, false, 0, 0); batch.write(0, new THREE.Matrix4())
    const count = batch.geometry.attributes.position.count / 2
    const first = Array.from(batch.geometry.attributes.position.array).slice(0, count * 3)
    rig.pose(0.5, true, 0, 0, false, "gallop"); batch.write(1, new THREE.Matrix4().makeTranslation(5, 0, 0)); batch.finish()
    expect(Array.from(batch.geometry.attributes.position.array).slice(0, count * 3)).toEqual(first)
    expect(batch.idGeometry.attributes.position).toBe(batch.geometry.attributes.position)
    expect(Array.from(batch.geometry.attributes.position.array).every(Number.isFinite)).toBe(true)
    batch.dispose(); rig.dispose()
  })
})
