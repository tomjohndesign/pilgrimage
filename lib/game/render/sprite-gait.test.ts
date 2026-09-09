import { expect, it } from "vitest"
import { DEFAULT_POPULATION } from "../base-person/population-assets"
import { personRecipe } from "../base-person/design"
import { walkContact } from "../base-person/gait"
import { spriteGait } from "./sprite-gait"

it("shares baked support poses without changing any body's contact or clip timing", () => {
  for (const design of DEFAULT_POPULATION.callings.peasant.designs) {
    const rig = spriteGait(design), body = personRecipe(design).body
    expect(spriteGait(design)).toBe(rig)
    expect(rig.body).toEqual(body)
    for (const [columns, strides] of [[12, 1], [20, 1], [40, 2], [7, 2]]) {
      for (let frame = 0; frame < columns; frame++) {
        expect(rig.contact(frame, columns, strides)).toEqual(walkContact(frame / (columns / strides), columns, body, strides))
      }
    }
    const edited = { ...design, legs: design.legs > 1 ? .9 : 1.1 }
    expect(spriteGait(edited)).not.toBe(rig)
    expect(spriteGait(edited).body).toEqual(personRecipe(edited).body)
    expect(rig.body).toEqual(body)
  }
})
