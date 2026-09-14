import { describe, expect, it } from "vitest"
import { Matrix4, Vector3 } from "three"
import { createWildlifeRig } from "./rig"
import { carcassPose } from "./carcass-pose"

describe("sheep and goat side poses", () => {
  it.each(["sheep", "goat"] as const)("grounds the %s throughout the roll without changing its rig", kind => {
    const rig = createWildlifeRig(kind)
    try {
      rig.pose(0, false, 0, 0, 0, "walk", { lying: 0, clip: "idle" })
      const matrices = rig.parts.map(part => part.matrixWorld.clone())
      for (const progress of [0, .1, .2, .3, 1]) {
        const pose = carcassPose(rig.parts, progress)
        const transform = new Matrix4().makeRotationZ(pose.roll)
        transform.setPosition(pose.x, pose.lift, 0)
        const point = new Vector3(), matrix = new Matrix4()
        let bottom = Infinity
        for (const part of rig.parts) {
          matrix.multiplyMatrices(transform, part.matrixWorld)
          const positions = part.geometry.attributes.position
          for (let i = 0; i < positions.count; i++) {
            point.fromBufferAttribute(positions, i).applyMatrix4(matrix)
            bottom = Math.min(bottom, point.y)
          }
        }
        expect(bottom).toBeCloseTo(0, 8)
        if (progress >= .3) expect(pose.roll).toBe(Math.PI / 2)
        expect(rig.parts.map(part => part.matrixWorld)).toEqual(matrices)
      }
    } finally { rig.dispose() }
  })
})
