import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { personRecipe } from "../base-person/design"
import { createBasePersonRig } from "../base-person/rig"
import { POPULATION_PROFILES } from "../base-person/population"
import { jobDesign } from "./design"

describe("job equipment", () => {
  it.each(POPULATION_PROFILES.map((profile, variant) => ({ ...profile, variant })))("keeps both hands on the carried axe for $id", ({ variant }) => {
    const rig = createBasePersonRig(personRecipe(jobDesign("woodcutter", variant)))
    try {
      const axe = rig.root.getObjectByName("woodcutting-axe")!
      for (const clip of ["walk", "idle"] as const) for (let frame = 0; frame < 20; frame++) {
        rig.pose(frame / 20, clip)
        expect(axe.visible).toBe(true)
        for (const [side, height] of [["right", 0], ["left", .32]] as const) {
          const hand = rig.root.getObjectByName(`${side}-hand`)!.getWorldPosition(new THREE.Vector3())
          const grip = axe.localToWorld(new THREE.Vector3(0, height, 0))
          expect(hand.distanceTo(grip)).toBeLessThan(.006)
        }
      }
      rig.pose(0, "sleeping")
      expect(axe.visible).toBe(false)
      rig.pose(.2, "treeFelling")
      expect(axe.visible).toBe(true)
    } finally { rig.dispose() }
  })

  it("gives both genders a curved staff head on the shared planted staff", () => {
    for (let variant = 0; variant < 6; variant++) {
      const rig = createBasePersonRig(personRecipe(jobDesign("shepherd", variant)))
      try {
        rig.pose(0, "idle")
        const hook = rig.root.getObjectByName("shepherd-crook") as THREE.Mesh
        expect(hook).toBeDefined()
        hook.geometry.computeBoundingBox()
        const size = hook.geometry.boundingBox!.getSize(new THREE.Vector3())
        expect(size.x).toBeGreaterThan(.25)
        expect(size.y).toBeGreaterThan(.25)
        expect(hook.parent!.userData.planted).toBe(true)
      } finally { rig.dispose() }
    }
  })
})
