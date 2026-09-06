import { expect, it } from "vitest"
import * as THREE from "three"
import { animalClearance } from "./stall"
import { RIG_TO_WORLD } from "./assets"
import { createAnimalRig } from "./animal-rig"

it("reserves clearance for every walk and grazing silhouette", () => {
  for (const [kind, variant] of [["donkey", "common"], ["horse", "common"], ["horse", "noble"]] as const) {
    const rig = createAnimalRig(kind, variant), point = new THREE.Vector3()
    let radius = 0
    try {
      for (const grazing of [0, 1]) for (let frame = 0; frame < 20; frame++) {
        rig.pose(frame / 20, grazing === 0, grazing); rig.root.updateMatrixWorld(true)
        rig.root.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return
          const vertices = object.geometry.attributes.position
          for (let vertex = 0; vertex < vertices.count; vertex++) {
            point.fromBufferAttribute(vertices, vertex).applyMatrix4(object.matrixWorld)
            radius = Math.max(radius, Math.hypot(point.x, point.z))
          }
        })
      }
      // Include room for the runtime's sub-frame foot-plant correction.
      expect(animalClearance(kind, 1) / RIG_TO_WORLD).toBeGreaterThan(radius + 0.05)
    } finally { rig.dispose() }
  }
})
