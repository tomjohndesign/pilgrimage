import { expect, it } from "vitest"
import * as THREE from "three"
import { foliageCropData } from "./crop"
import { FoliageInstances } from "./instances"

it("crops only transparent padding, preserves boundary alpha, and flips cell UVs", () => {
  const pixels = new Uint8Array(16 * 8 * 4)
  pixels[(4 * 16 + 3) * 4 + 3] = 255
  pixels[(8 + 0) * 4 + 3] = 128
  pixels[(7 * 16 + 15) * 4 + 3] = 127
  expect([...foliageCropData(pixels, 16, 8, 2, 1)]).toEqual([2 / 8, 2 / 8, 5 / 8, 5 / 8, 0, 6 / 8, 2 / 8, 1])
  expect([...foliageCropData(new Uint8Array(8 * 8 * 4), 8, 8, 1, 1)]).toEqual([.5, .5, .5, .5])
})

it("keeps every potentially visible tree through pan, rotation, zoom and parent transforms, with stable picking IDs", () => {
  const sources = Array.from({ length: 5000 }, (_, i) => ({ x: i % 100 - 50, y: i % 3, z: Math.floor(i / 100) - 25,
    column: i % 8, row: 0, id: [(i % 255) / 255, .2, .3], brightness: .75, tree: i + 50 }))
  const data = new FoliageInstances(sources, new Float32Array([4]))
  const geometry = new THREE.PlaneGeometry(1, 1), material = new THREE.MeshBasicMaterial()
  geometry.setAttribute("foliageFrame", new THREE.InstancedBufferAttribute(new Float32Array(sources.length * 2), 2))
  geometry.setAttribute("foliageId", new THREE.InstancedBufferAttribute(new Float32Array(sources.length * 3), 3))
  const mesh = new THREE.InstancedMesh(geometry, material, sources.length)
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sources.length * 3), 3)
  const camera = new THREE.OrthographicCamera(-12, 12, 12, -12, .1, 300)
  const sphere = new THREE.Sphere(), matrix = new THREE.Matrix4()
  for (const yaw of [0, .3, 1.9, 3.5]) for (const zoom of [.2, 1, 3]) for (const pan of [0, .01, 10]) {
    camera.position.set(Math.sin(yaw) * 80 + pan, 55, Math.cos(yaw) * 80)
    camera.lookAt(pan, 0, 0); camera.zoom = zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld()
    mesh.position.x = yaw; mesh.scale.setScalar(1.2); mesh.updateMatrixWorld()
    data.update(mesh, camera)
    const visible = new Set(data.visible)
    const frustum = new THREE.Frustum().setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    for (let i = 0; i < sources.length; i++) {
      const s = sources[i]
      sphere.center.set(s.x, s.y, s.z).applyMatrix4(mesh.matrixWorld); sphere.radius = 4.8
      if (frustum.intersectsSphere(sphere)) expect(visible.has(i)).toBe(true)
    }
    for (let i = 0; i < mesh.count; i++) {
      const source = sources[data.visible[i]]
      mesh.getMatrixAt(i, matrix)
      expect(matrix.elements.slice(12, 15)).toEqual([source.x, source.y, source.z])
      expect(geometry.getAttribute("foliageFrame").getX(i)).toBe(source.column)
      expect(geometry.getAttribute("foliageId").getX(i)).toBeCloseTo(source.id[0])
    }
    const version = mesh.instanceMatrix.version
    expect(data.update(mesh, camera)).toBe(false)
    expect(mesh.instanceMatrix.version).toBe(version)
  }
  // A loading boundary reconnects layout effects and clears the draw count and
  // colors. The stationary camera must still get a complete forest next frame.
  const count = mesh.count
  expect(count).toBeGreaterThan(0)
  mesh.count = 0
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(sources.length * 3), 3)
  data.invalidate()
  expect(data.update(mesh, camera)).toBe(true)
  expect(mesh.count).toBe(count)
  expect(mesh.instanceColor.getX(0)).toBe(.75)
  mesh.dispose(); geometry.dispose(); material.dispose()
})
