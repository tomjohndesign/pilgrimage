import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { createWildlifeRig } from "./rig"
import { MAMMAL_ANATOMY } from "./anatomy"
import { validateAnimalEdits } from "./rig-edits"

describe("grazing ground contact", () => {
  for (const kind of ["deer", "buck", "sheep", "goat", "rabbit", "boar"] as const) it(`${kind} reaches grass with an anchored neck and planted feet`, () => {
    const rig = createWildlifeRig(kind)
    rig.pose(0, false, 0, 0)
    const planted = ["leftHand", "rightHand", "leftFoot", "rightFoot"] as const
    const feet = planted.map(name => [...rig.joints()[name]!.position])
    const attachment = [...rig.joints().neck!.position]
    const neck = rig.root.getObjectByName("neck")!, head = rig.root.getObjectByName("head")!
    const anatomy = MAMMAL_ANATOMY[kind]
    const expectedLength = Math.hypot(...anatomy.neck.poll.map((value, index) => value - anatomy.neck.base[index]))
    for (let frame = 0; frame < 20; frame++) {
      const phase = frame / 20
      for (const blend of [0, 0.25, 0.5, 0.75, 1]) {
        rig.pose(phase, false, phase, blend)
        expect(rig.joints().neck!.position).toEqual(attachment)
        planted.forEach((name, index) => expect(rig.joints()[name]!.position).toEqual(feet[index]))
        expect(neck.getWorldPosition(new THREE.Vector3()).distanceTo(head.getWorldPosition(new THREE.Vector3()))).toBeCloseTo(expectedLength, 8)
        const forward = head.getWorldDirection(new THREE.Vector3())
        expect(forward.z).toBeGreaterThan(0.3)
        if (blend === 1) {
          const muzzle = rig.joints().muzzle!.position
          expect(muzzle[1]).toBeGreaterThanOrEqual(0.049)
          expect(muzzle[1]).toBeLessThan(0.08)
          expect(muzzle[2]).toBeGreaterThan(rig.joints().leftHand!.position[2] + anatomy.front.foot[2] * .6 + .02)
          let lowest = Infinity
          head.traverse(part => {
            if (!(part instanceof THREE.Mesh)) return
            const position = part.geometry.attributes.position
            for (let index = 0; index < position.count; index++) lowest = Math.min(lowest, new THREE.Vector3().fromBufferAttribute(position, index).applyMatrix4(part.matrixWorld).y)
          })
          expect(lowest, `${kind} skull or muzzle below ground`).toBeGreaterThan(-0.005)
        }
      }
    }
    rig.dispose()
  })
  it("discards retired wallow settings while retaining other saved edits", () => {
    expect(validateAnimalEdits({ version: 1, clips: { roll: { cadence: 1.3 }, graze: { cadence: 0.8 } } })).toEqual({ version: 1, clips: { graze: { cadence: 0.8 } } })
  })
})
