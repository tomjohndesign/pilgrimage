import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { foliageMaterial } from "./material"
import { FOLIAGE_FRAME } from "./design"
import { ENT_FRAME } from "../ent-rig"
import { BOULDER_FRAME, ENVIRONMENT_FRAME } from "../../environment/sprites"
import { WATER_SOURCE_FRAME } from "../../water-sources/assets"
import { cameraOffset, yawForView } from "../../render/iso"

const layouts = [
  { name: "wells and watering holes", frame: WATER_SOURCE_FRAME },
  { name: "shrubs, grass, stones, boulders, groundcover and flowers", frame: ENVIRONMENT_FRAME },
  { name: "large boulder groups", frame: BOULDER_FRAME },
  { name: "all tree species, ancient trees and snags", frame: FOLIAGE_FRAME },
  { name: "all Ent species and poses", frame: ENT_FRAME },
]

describe("scenery rotation at render time", () => {
  it.each(layouts)("updates $name for each actual render camera without an animation tick", ({ frame }) => {
    const color = new THREE.Texture(), depth = new THREE.Texture(), crop = new THREE.DataTexture()
    const scene = new THREE.Scene(), group = new THREE.Group(), mesh = new THREE.Mesh(), camera = new THREE.OrthographicCamera()
    const renderer = { getCurrentViewport: (target: THREE.Vector4) => target.set(0, 0, 640, 480) } as THREE.WebGLRenderer
    const views = [{ value: -1 }, { value: -1 }]
    const materials = views.map((view, index) => foliageMaterial(color, depth, view, { value: 0 }, index === 1, frame, crop))
    try {
      // Change direction repeatedly within a single tick, across both wrap boundaries.
      for (const index of [0, 1, 2, 3, 4, -1, -2, -3, -4, 0]) {
        camera.position.set(...cameraOffset(yawForView(index)))
        camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
        const expected = ((1 + index * 2) % 8 + 8) % 8
        for (const material of materials) material.onBeforeRender(renderer, scene, camera, mesh.geometry, mesh, group)
        expect(views.map(view => view.value)).toEqual([expected, expected])
      }
      const alternate = camera.clone()
      alternate.position.set(...cameraOffset(0)); alternate.lookAt(0, 0, 0); alternate.updateMatrixWorld()
      for (const material of materials) material.onBeforeRender(renderer, scene, alternate, mesh.geometry, mesh, group)
      expect(views.map(view => view.value)).toEqual([0, 0])
      for (const material of materials) material.onBeforeRender(renderer, scene, camera, mesh.geometry, mesh, group)
      expect(views.map(view => view.value)).toEqual([1, 1])
    } finally {
      materials.forEach(material => material.dispose())
      color.dispose(); depth.dispose(); crop.dispose(); mesh.geometry.dispose(); (mesh.material as THREE.Material).dispose()
    }
  })
})
