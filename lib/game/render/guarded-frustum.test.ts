import { expect, it } from "vitest"
import * as THREE from "three"
import { GuardedFrustum } from "./guarded-frustum"

it("reuses small pans while covering the complete camera frustum through zoom and rotation", () => {
  const camera = new THREE.OrthographicCamera(-16, 16, 10, -10, .1, 100)
  const cache = new GuardedFrustum(2), inverse = new THREE.Matrix4(), point = new THREE.Vector3()
  const update = () => {
    camera.updateProjectionMatrix(); camera.updateMatrixWorld(); cache.update(camera)
    inverse.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).invert()
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
      point.set(x, y, z).applyMatrix4(inverse)
      expect(cache.frustum.containsPoint(point)).toBe(true)
    }
  }
  camera.position.set(0, 20, 20); camera.lookAt(0, 0, 0); update()
  for (let frame = 1; frame <= 100; frame++) { camera.position.x = frame / 120; update() }
  expect(cache.version).toBe(1)
  camera.position.x = 8; update(); expect(cache.version).toBe(2)
  for (let frame = 0; frame < 80; frame++) {
    camera.zoom = .2 + frame / 40
    camera.position.set(Math.sin(frame / 20) * 20, 20, Math.cos(frame / 20) * 20)
    camera.lookAt(0, 0, 0); update()
  }
})
