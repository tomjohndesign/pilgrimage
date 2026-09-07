import { describe, expect, it } from "vitest"
import { DEFAULT_DESIGN, personRecipe } from "./design"
import { createBasePersonRig } from "./rig"
import { knightDesign } from "../knight/design"
import { equipKnight } from "../knight/rig"

describe("head coverings during prayer", () => {
  it.each(["Wool cap", "Cloth cap", "Coif"] as const)("removes men's %s in both prayer poses and restores it afterwards", hat => {
    for (const bodyType of ["Male", "Female"] as const) {
      const rig = createBasePersonRig(personRecipe({ ...DEFAULT_DESIGN, bodyType, hat }))
      try {
        const covering = rig.root.getObjectByName(hat === "Coif" ? "head-covering" : "road-hat")!
        for (const clip of ["praying", "seatedPrayer"] as const) {
          rig.pose(0, clip)
          expect(covering.visible).toBe(bodyType === "Female")
          if (hat === "Coif") expect(rig.root.getObjectByName("head-covering-drape")!.visible).toBe(bodyType === "Female")
          rig.pose(0, "walk")
          expect(covering.visible).toBe(true)
        }
      } finally { rig.dispose() }
    }
  })
  it("removes the knight's helmet and mail coif together", () => {
    const rig = createBasePersonRig(personRecipe(knightDesign())), gear = equipKnight(rig)
    try {
      for (const clip of ["praying", "seatedPrayer"] as const) {
        rig.pose(0, clip); gear.pose(clip)
        expect(rig.root.getObjectByName("nasal-helmet")!.visible).toBe(false)
      }
      rig.pose(0, "walk"); gear.pose("walk")
      expect(rig.root.getObjectByName("nasal-helmet")!.visible).toBe(true)
    } finally { gear.dispose(); rig.dispose() }
  })
})
